import { Context, Schema, h, Logger } from 'koishi'
import axios, { AxiosRequestConfig } from 'axios'
import { SimpleLRUCache, ConcurrencyLimiter } from './cache'
import { DebugLogger, buildForwardNode, delay, generateFormattedText, getErrorMessage } from './utils'
import { buildCustomLinkRules, extractAllUrlsFromMessage, linkTypeParser } from './parser'
import { normalizeCustomPlatforms, PlatformResolver } from './platform'
import { ApiClient } from './api'
import type { LinkMatch, ParsedItem, ParsedMusic } from './types'

export const name = 'music-parser-all'

export interface ProxySettings {
  enabled: boolean
  protocol?: 'http' | 'https'
  host?: string
  port?: number
  auth?: { username?: string; password?: string }
}

export interface Config {
  enable: boolean
  botName: string
  showWaitingTip: boolean
  debug: boolean
  platformEnabled: Record<string, boolean>
  unifiedMessageFormat: string
  showMusicText: boolean
  showCoverImage: boolean
  showMusicVoice: boolean
  showMusicVoiceFile: boolean
  maxConcurrent: number
  timeout: number
  videoSendTimeout: number
  userAgent: string
  proxy: ProxySettings
  customHeaders: { name: string; value: string }[]
  ignoreSendError: boolean
  retryTimes: number
  retryInterval: number
  enableForward: boolean
  enableDeduplication: boolean
  deduplicationInterval: number
  cacheTTL: number
  primaryApiUrl: string
  backupApiUrl: string
  platformDedicatedFirst: Record<string, boolean>
  customApis: any[]
  customPlatforms: any[]
  globalFieldMapping: string
  waitingTipText: string
  unsupportedPlatformText: string
  invalidLinkText: string
  parseErrorPrefix: string
  parseErrorItemFormat: string
}

export const Config = Schema.intersect([
  Schema.object({
    enable: Schema.boolean().default(true).description('是否启用音乐解析插件'),
    botName: Schema.string().default('音乐解析机器人').description('合并转发中显示的昵称'),
    showWaitingTip: Schema.boolean().default(true).description('解析时显示等待提示'),
    debug: Schema.boolean().default(false).description('开启调试日志'),
    platformEnabled: Schema.object({
      netease: Schema.boolean().default(true).description('网易云音乐'),
      kuwo: Schema.boolean().default(true).description('酷我音乐'),
      qqmusic: Schema.boolean().default(true).description('QQ音乐'),
      qishui: Schema.boolean().default(true).description('汽水音乐'),
    }).description('各平台解析开关'),
  }).description('基本设置'),

  Schema.object({
    unifiedMessageFormat: Schema.string().role('textarea').default(
      '歌名：${name}\n歌手：${artist}\n专辑：${album}\n音质：${level}\n大小：${size}'
    ).description('文字格式，支持变量，空行自动隐藏'),
  }).description('消息格式'),

  Schema.object({
    showMusicText: Schema.boolean().default(true).description('发送文字内容'),
    showCoverImage: Schema.boolean().default(true).description('发送封面图片'),
    showMusicVoice: Schema.boolean().default(false).description('音乐链接以语音形式发送'),
    showMusicVoiceFile: Schema.boolean().default(true).description('音乐链接是否以语音形式发送（关闭则只发送链接）'),
  }).description('媒体发送'),

  Schema.object({
    maxConcurrent: Schema.number().min(1).step(1).default(3).description('解析最大并发数'),
  }).description('性能'),

  Schema.object({
    timeout: Schema.number().min(0).step(1).default(180000).description('API 请求超时 (ms)'),
    videoSendTimeout: Schema.number().min(0).step(1).default(180000).description('消息发送超时 (ms)'),
    userAgent: Schema.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36').description('User-Agent'),
    proxy: Schema.object({
      enabled: Schema.boolean().default(false).description('启用代理'),
      protocol: Schema.union([
        Schema.const('http').description('HTTP'),
        Schema.const('https').description('HTTPS'),
      ]).default('http').description('协议'),
      host: Schema.string().default('127.0.0.1').description('地址'),
      port: Schema.number().default(7890).description('端口'),
      auth: Schema.object({
        username: Schema.string().default('').description('用户名'),
        password: Schema.string().default('').description('密码'),
      }).description('认证'),
    }).description('HTTP/HTTPS 代理'),
    customHeaders: Schema.array(
      Schema.object({
        name: Schema.string().required().description('头名称'),
        value: Schema.string().required().description('头值'),
      })
    ).default([]).description('自定义请求头'),
  }).description('网络与请求'),

  Schema.object({
    ignoreSendError: Schema.boolean().default(true).description('忽略发送失败'),
    retryTimes: Schema.number().min(0).step(1).default(3).description('重试次数'),
    retryInterval: Schema.number().min(0).step(1).default(1000).description('重试间隔 (ms)'),
    enableForward: Schema.boolean().default(false).description('合并转发（OneBot/Satori）'),
  }).description('发送与重试'),

  Schema.object({
    enableDeduplication: Schema.boolean().default(true).description('启用重复解析检测与提示'),
    deduplicationInterval: Schema.number().min(0).step(1).default(180).description('去重间隔 (s)'),
    cacheTTL: Schema.number().min(0).step(1).default(600).description('缓存时间 (s)'),
  }).description('缓存与去重'),

  Schema.object({
    primaryApiUrl: Schema.string().default('https://api.bugpk.com/api/163_music').hidden(),
    backupApiUrl: Schema.string().default('https://api.bugpk.com/api/music').hidden(),
    platformDedicatedFirst: Schema.object({
      netease: Schema.boolean().default(false).description('网易云音乐'),
      kuwo: Schema.boolean().default(false).description('酷我音乐'),
      qqmusic: Schema.boolean().default(false).description('QQ音乐'),
      qishui: Schema.boolean().default(false).description('汽水音乐'),
    }).description('优先使用专属 API'),
    customApis: Schema.array(
      Schema.object({
        platform: Schema.union([
          Schema.const('netease').description('网易云音乐'),
          Schema.const('kuwo').description('酷我音乐'),
          Schema.const('qqmusic').description('QQ音乐'),
          Schema.const('qishui').description('汽水音乐'),
        ]).description('平台'),
        apiUrl: Schema.string().description('API 地址'),
        apiKey: Schema.string().description('API Key').default(''),
        authHeaderType: Schema.union([
          Schema.const('Bearer').description('Bearer'),
          Schema.const('X-API-Key').description('X-API-Key'),
          Schema.const('Custom').description('自定义'),
        ]).default('Bearer').description('认证头类型'),
        customHeaderName: Schema.string().default('X-API-Key').description('自定义头名称'),
        fieldMapping: Schema.string().role('textarea').default('{}').description('字段映射 JSON'),
      })
    ).default([]).description('覆盖内置平台 API'),
    customPlatforms: Schema.array(
      Schema.object({
        name: Schema.string().required().description('平台名称'),
        exampleUrl: Schema.string().description('示例链接'),
        keywords: Schema.string().required().description('关键词（逗号分隔）'),
        apiUrl: Schema.string().required().description('解析 API'),
        apiKey: Schema.string().default('').description('API Key'),
        authHeaderType: Schema.union([
          Schema.const('Bearer').description('Bearer'),
          Schema.const('X-API-Key').description('X-API-Key'),
          Schema.const('Custom').description('自定义'),
        ]).default('Bearer').description('认证头类型'),
        customHeaderName: Schema.string().default('X-API-Key').description('自定义头名称'),
        fieldMapping: Schema.string().role('textarea').default('{}').description('字段映射 JSON'),
        proxy: Schema.object({
          enabled: Schema.boolean().default(false).description('启用独立代理'),
          protocol: Schema.union([
            Schema.const('http').description('HTTP'),
            Schema.const('https').description('HTTPS'),
          ]).default('http').description('协议'),
          host: Schema.string().default('127.0.0.1').description('地址'),
          port: Schema.number().default(7890).description('端口'),
          auth: Schema.object({
            username: Schema.string().default('').description('用户名'),
            password: Schema.string().default('').description('密码'),
          }).description('认证'),
        }).description('独立代理（覆盖全局代理）'),
      })
    ).default([]).description('自定义新平台'),
    globalFieldMapping: Schema.string().role('textarea').default(
      '{\n' +
      '  "name": "data.name",\n' +
      '  "artist": "data.ar_name",\n' +
      '  "album": "data.al_name",\n' +
      '  "cover": "data.pic",\n' +
      '  "musicUrl": "data.url",\n' +
      '  "level": "data.level",\n' +
      '  "size": "data.size"\n' +
      '}'
    ).description('全局字段映射 JSON'),
  }).description('API 与平台'),

  Schema.object({
    waitingTipText: Schema.string().default('正在解析音乐，请稍候...').description('等待提示'),
    unsupportedPlatformText: Schema.string().default('暂不支持该平台音乐链接').description('不支持提示'),
    invalidLinkText: Schema.string().default('无效的音乐链接').description('无效链接提示'),
    parseErrorPrefix: Schema.string().default('❌ 解析失败：').description('错误前缀'),
    parseErrorItemFormat: Schema.string().default('【${url}】: ${msg}').description('错误格式'),
  }).description('界面文本'),
])

export function apply(ctx: Context, config: Config) {
  const logger = new Logger(name)
  const debug = new DebugLogger(logger, config.debug || false)
  debug.log('INFO', '音乐解析插件启动')

  const dedupEnabled = config.enableDeduplication !== false
  const dedupInterval = (config.deduplicationInterval || 180) * 1000
  const cacheTTL = (config.cacheTTL || 600) * 1000
  const dedupCache = new SimpleLRUCache<number>(1000, dedupInterval)
  const contentDedupCache = new SimpleLRUCache<number>(1000, dedupInterval)
  const urlCacheLocal = new SimpleLRUCache<ParsedMusic>(500, cacheTTL)

  const texts = {
    waitingTipText: config.waitingTipText || '正在解析音乐，请稍候...',
    unsupportedPlatformText: config.unsupportedPlatformText || '暂不支持该平台音乐链接',
    invalidLinkText: config.invalidLinkText || '无效的音乐链接',
    parseErrorPrefix: config.parseErrorPrefix || '❌ 解析失败：',
    parseErrorItemFormat: config.parseErrorItemFormat || '【${url}】: ${msg}',
  }

  const customPlatforms = normalizeCustomPlatforms(config.customPlatforms || [])
  const resolver = new PlatformResolver(config, customPlatforms)

  const proxyConfig = config.proxy || {}
  const axiosConfig: AxiosRequestConfig = {
    timeout: config.timeout,
    headers: {
      'User-Agent': config.userAgent,
      'Referer': 'https://www.baidu.com/',
    },
  }
  if (proxyConfig.enabled && proxyConfig.host) {
    axiosConfig.proxy = {
      protocol: proxyConfig.protocol || 'http',
      host: proxyConfig.host,
      port: proxyConfig.port || 7890,
      auth: proxyConfig.auth?.username ? {
        username: proxyConfig.auth.username,
        password: proxyConfig.auth.password || '',
      } : undefined,
    }
  }
  const http = axios.create(axiosConfig)
  const customHeaders = config.customHeaders || []
  http.interceptors.request.use(cfg => {
    for (const header of customHeaders) {
      if (header.name && header.value) cfg.headers[header.name] = header.value
    }
    return cfg
  })

  const apiClient = new ApiClient({ http, config, dedupEnabled, cacheTTL, urlCache: urlCacheLocal, debug })

  function contentFingerprint(p: ParsedMusic): string {
    return [p.type, p.name, p.artist, p.album, p.musicUrl].map(v => String(v ?? '')).join('::')
  }

  async function sendWithTimeout(session: any, content: any, customRetries?: number): Promise<any> {
    const maxRetries = customRetries ?? config.retryTimes ?? 3
    const retryDelay = config.retryInterval || 1000
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timer: NodeJS.Timeout | undefined
      try {
        const sendPromise = session.send(content)
        if (config.videoSendTimeout > 0) {
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('发送超时')), config.videoSendTimeout)
          })
          return await Promise.race([sendPromise, timeoutPromise])
        }
        return await sendPromise
      } catch (err) {
        const errMsg = getErrorMessage(err)
        debug.log('ERROR', `发送失败尝试 ${attempt + 1}: ${errMsg}`)
        if (attempt < maxRetries) {
          await delay(retryDelay)
        } else if (!config.ignoreSendError) {
          throw err
        }
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
    return null
  }

  async function flush(session: any, matches: LinkMatch[]) {
    debug.log('INFO', `开始解析 ${matches.length} 个链接`)
    const items: ParsedItem[] = []
    const errors: string[] = []
    const limiter = new ConcurrencyLimiter(config.maxConcurrent || 3)

    const promises = matches.map(async match => {
      await limiter.acquire()
      try {
        const platformEnabled = config.platformEnabled?.[match.type] ?? true
        if (!platformEnabled && !match.type.startsWith('custom_')) {
          debug.log('INFO', `平台 ${match.type} 已禁用，跳过链接: ${match.url}`)
          return
        }
        if (dedupEnabled && config.deduplicationInterval > 0) {
          const lastTime = dedupCache.get(match.url)
          if (lastTime && (Date.now() - lastTime < config.deduplicationInterval * 1000)) {
            debug.log('INFO', `跳过重复链接: ${match.url}`)
            return
          }
        }
        debug.log('INFO', `解析链接: ${match.url} (${match.type})`)
        const platformConf = resolver.resolve(match.type)
        try {
          const parsed = await apiClient.fetch(match.url, match.type, match.id, platformConf)
          if (dedupEnabled && config.deduplicationInterval > 0) {
            const fp = contentFingerprint(parsed)
            const lastDedup = contentDedupCache.get(fp)
            if (lastDedup && (Date.now() - lastDedup < config.deduplicationInterval * 1000)) {
              debug.log('INFO', `跳过重复内容: ${match.url}`)
              return
            }
            contentDedupCache.set(fp, Date.now())
            dedupCache.set(match.url, Date.now())
          }
          items.push({ text: generateFormattedText(parsed, config.unifiedMessageFormat), parsed })
        } catch (error) {
          const msg = getErrorMessage(error)
          const displayUrl = match.url.length > 50 ? match.url.slice(0, 50) + '...' : match.url
          errors.push(texts.parseErrorItemFormat.replace(/\$\{url\}/g, displayUrl).replace(/\$\{msg\}/g, msg))
        }
      } finally {
        limiter.release()
      }
    })
    await Promise.all(promises)

    if (errors.length) await sendWithTimeout(session, `${texts.parseErrorPrefix}\n${errors.join('\n')}`)
    if (!items.length) return

    const enableForward = config.enableForward && (session.platform === 'onebot' || session.platform === 'satori')
    const botName = config.botName || '音乐解析机器人'

    if (enableForward) {
      const forwardMessages: any[] = []
      for (const item of items) {
        const p = item.parsed
        if (item.text && config.showMusicText) forwardMessages.push(buildForwardNode(session, item.text, botName))
        if (p.cover && config.showCoverImage) forwardMessages.push(buildForwardNode(session, h.image(p.cover), botName))
        if (p.musicUrl && config.showMusicVoice) forwardMessages.push(buildForwardNode(session, h.audio(p.musicUrl), botName))
      }
      if (forwardMessages.length) {
        try {
          await sendWithTimeout(session, h('message', { forward: true }, forwardMessages.slice(0, 100)), config.retryTimes)
        } catch (err) {
          debug.log('ERROR', '合并转发失败，降级逐条发送:', err)
          for (const node of forwardMessages) {
            await sendWithTimeout(session, node.data.content).catch(() => {})
            await delay(300)
          }
        }
      }
    } else {
      for (const item of items) {
        const p = item.parsed
        if (item.text && config.showMusicText) {
          await sendWithTimeout(session, item.text)
          await delay(300)
        }
        if (p.cover && config.showCoverImage) {
          try {
            await sendWithTimeout(session, h.image(p.cover))
          } catch {
            await sendWithTimeout(session, `封面链接：${p.cover}`).catch(() => {})
          }
          await delay(300)
        }
        if (p.musicUrl && config.showMusicVoice) {
          if (config.showMusicVoiceFile) {
            try {
              await sendWithTimeout(session, h.audio(p.musicUrl))
            } catch {
              await sendWithTimeout(session, `音乐链接：${p.musicUrl}`).catch(() => {})
            }
          } else {
            await sendWithTimeout(session, `音乐链接：${p.musicUrl}`).catch(() => {})
          }
          await delay(500)
        }
      }
    }
    debug.log('INFO', '处理完成')
  }

  const customRules = buildCustomLinkRules(config.customPlatforms || [])

  ctx.on('message', async session => {
    if (!config.enable) return
    if (/^\s*(?:parse|music-parse)\b/i.test(session.content || '')) return
    if (session.subtype === 'file_upload') return
    if (session.elements?.some(elem => elem.type === 'file' || elem.type === 'folder')) return
    if (session.selfId === session.userId) return
    const matches = extractAllUrlsFromMessage(session, customRules)
    if (!matches.length) return
    debug.log('INFO', `检测到 ${matches.length} 个音乐链接`)
    if (config.showWaitingTip) {
      try {
        await sendWithTimeout(session, texts.waitingTipText)
      } catch (e) {
        debug.log('WARN', '等待提示发送失败:', e)
      }
    }
    await flush(session, matches)
  })

  ctx.command('music-parse <url>', '手动解析音乐').action(async ({ session }, url) => {
    if (!url) {
      await sendWithTimeout(session, texts.invalidLinkText)
      return
    }
    const matches = linkTypeParser(url, customRules)
    if (!matches.length) {
      await sendWithTimeout(session, texts.invalidLinkText)
      return
    }
    if (config.showWaitingTip) {
      try {
        await sendWithTimeout(session, texts.waitingTipText)
      } catch {}
    }
    await flush(session, matches)
  })

  ctx.on('dispose', () => {
    urlCacheLocal.clear()
    dedupCache.clear()
    debug.log('INFO', '音乐解析插件已卸载')
  })

  debug.log('INFO', '音乐解析插件初始化完成')
}