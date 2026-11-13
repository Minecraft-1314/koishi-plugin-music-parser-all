import { Context, Schema, h, Logger } from 'koishi'
import axios, { AxiosRequestConfig } from 'axios'
import { SimpleLRUCache, ConcurrencyLimiter } from './cache'
import { DebugLogger, buildForwardNode, delay, formatDuration, generateFormattedText, getErrorMessage } from './utils'
import { PLATFORM_LABELS, SUPPORTED_PLATFORMS, buildCustomLinkRules, extractAllUrlsFromMessage, linkTypeParser } from './link-rules'
import { normalizeCustomPlatforms, PlatformResolver } from './platform'
import { ApiClient } from './service/api'
import type { LinkMatch, ParsedItem, ParsedMusic, ParsedPlaylist } from './types'

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
  expandPlaylistTracks: boolean
  maxPlaylistTracks: number
  trackRequestInterval: number
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
  apiKey: string
  authMode: string
  authHeaderType: string
  customHeaderName: string
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

const DEFAULT_FIELD_MAPPING = JSON.stringify({
  name: 'data.name',
  artist: 'data.singer',
  album: 'data.album',
  cover: 'data.pic',
  musicUrl: 'data.url',
  level: 'data.label',
  size: 'data.size_label',
}, null, 2)

const MAX_FORWARD_NODES = 100

export const Config = Schema.intersect([
  Schema.object({
    enable: Schema.boolean().default(true).description('是否启用音乐解析插件'),
    botName: Schema.string().default('音乐解析机器人').description('合并转发中显示的昵称'),
    showWaitingTip: Schema.boolean().default(true).description('解析时显示等待提示'),
    debug: Schema.boolean().default(false).description('开启调试日志'),
    platformEnabled: Schema.object({
      netease: Schema.boolean().default(true).description('网易云音乐'),
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
    expandPlaylistTracks: Schema.boolean().default(false).description('解析歌单时逐首获取直链（注意接口限流）'),
    maxPlaylistTracks: Schema.number().min(1).max(50).step(1).default(10).description('逐首获取的最大曲目数'),
    trackRequestInterval: Schema.number().min(0).step(100).default(5000).description('逐首获取的请求间隔 (ms)'),
  }).description('歌单展开'),

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
    apiKey: Schema.string().default('').role('secret').description('api-new.ifphp.com API Key'),
    authMode: Schema.union([
      Schema.const('header').description('请求头'),
      Schema.const('query').description('URL 参数'),
    ]).default('header').description('认证方式'),
    authHeaderType: Schema.union([
      Schema.const('Bearer').description('Bearer'),
      Schema.const('X-API-Key').description('X-API-Key'),
      Schema.const('Custom').description('自定义'),
    ]).default('X-API-Key').description('认证头类型'),
    customHeaderName: Schema.string().default('X-API-Key').description('自定义头名称'),
    platformDedicatedFirst: Schema.object({
      netease: Schema.boolean().default(true).description('网易云音乐'),
      qishui: Schema.boolean().default(true).description('汽水音乐'),
    }).description('优先使用专属 API'),
    customApis: Schema.array(
      Schema.object({
        platform: Schema.union([
          Schema.const('netease').description('网易云音乐'),
          Schema.const('qishui').description('汽水音乐'),
        ]).description('平台'),
        apiUrl: Schema.string().description('API 地址'),
        apiKey: Schema.string().description('API Key').default(''),
        authMode: Schema.union([
          Schema.const('header').description('请求头'),
          Schema.const('query').description('URL 参数'),
        ]).default('header').description('认证方式'),
        authHeaderType: Schema.union([
          Schema.const('Bearer').description('Bearer'),
          Schema.const('X-API-Key').description('X-API-Key'),
          Schema.const('Custom').description('自定义'),
        ]).default('X-API-Key').description('认证头类型'),
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
        authMode: Schema.union([
          Schema.const('header').description('请求头'),
          Schema.const('query').description('URL 参数'),
        ]).default('header').description('认证方式'),
        authHeaderType: Schema.union([
          Schema.const('Bearer').description('Bearer'),
          Schema.const('X-API-Key').description('X-API-Key'),
          Schema.const('Custom').description('自定义'),
        ]).default('X-API-Key').description('认证头类型'),
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
    globalFieldMapping: Schema.string().role('textarea').default(DEFAULT_FIELD_MAPPING).description('全局字段映射 JSON'),
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

  if (!config.apiKey && !(config.customApis || []).some((item: any) => item?.apiKey)) {
    logger.warn('未配置 api-new.ifphp.com API Key，所有解析请求可能失败。请在插件配置中填写 apiKey。')
  }

  const dedupEnabled = config.enableDeduplication !== false
  const dedupInterval = (config.deduplicationInterval || 180) * 1000
  const cacheTTL = (config.cacheTTL || 600) * 1000
  const dedupCache = new SimpleLRUCache<number>(1000, dedupInterval)
  const contentDedupCache = new SimpleLRUCache<number>(1000, dedupInterval)
  const urlCacheLocal = new SimpleLRUCache<ParsedMusic>(500, cacheTTL)
  const playlistCacheLocal = new SimpleLRUCache<ParsedPlaylist>(100, cacheTTL)

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

  const apiClient = new ApiClient({ http, config, dedupEnabled, cacheTTL, urlCache: urlCacheLocal, playlistCache: playlistCacheLocal, debug })

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
        debug.log('ERROR', `发送失败尝试 ${attempt + 1}: ${getErrorMessage(err)}`)
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

  async function sendCover(session: any, cover: string) {
    try {
      await sendWithTimeout(session, h.image(cover))
    } catch {
      await sendWithTimeout(session, `封面链接：${cover}`).catch(() => {})
    }
  }

  async function sendMusicVoice(session: any, musicUrl: string) {
    if (config.showMusicVoiceFile) {
      try {
        await sendWithTimeout(session, h.audio(musicUrl))
        return
      } catch {
        debug.log('WARN', `语音发送失败，降级发送链接: ${musicUrl}`)
      }
    }
    await sendWithTimeout(session, `音乐链接：${musicUrl}`).catch(() => {})
  }

  async function emitItems(session: any, items: ParsedItem[]) {
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
      if (!forwardMessages.length) return
      for (let i = 0; i < forwardMessages.length; i += MAX_FORWARD_NODES) {
        const chunk = forwardMessages.slice(i, i + MAX_FORWARD_NODES)
        try {
          await sendWithTimeout(session, h('message', { forward: true }, chunk), config.retryTimes)
        } catch (err) {
          debug.log('ERROR', `合并转发失败，降级逐条发送: ${getErrorMessage(err)}`)
          for (const node of chunk) {
            await sendWithTimeout(session, node.data.content).catch(() => {})
            await delay(300)
          }
        }
      }
      return
    }

    for (const item of items) {
      const p = item.parsed
      if (item.text && config.showMusicText) {
        await sendWithTimeout(session, item.text)
        await delay(300)
      }
      if (p.cover && config.showCoverImage) {
        await sendCover(session, p.cover)
        await delay(300)
      }
      if (p.musicUrl && config.showMusicVoice) {
        await sendMusicVoice(session, p.musicUrl)
        await delay(500)
      }
    }
  }

  function buildPlaylistText(playlist: ParsedPlaylist): string {
    const info = playlist.playlist
    const lines: string[] = []
    lines.push(`歌单：${info.name || '未知歌单'}`)
    if (info.creator) lines.push(`创建者：${info.creator}`)
    if (info.trackCount) lines.push(`曲目数：${info.trackCount}`)
    if (info.description) lines.push(`简介：${info.description.slice(0, 200)}`)
    const tracks = info.tracks.slice(0, 100)
    if (tracks.length) {
      lines.push('曲目列表：')
      tracks.forEach((track, index) => {
        const duration = track.duration ? ` (${formatDuration(track.duration)})` : ''
        lines.push(`${index + 1}. ${track.name} - ${track.artist || '未知歌手'}${duration}`)
      })
      if (info.tracks.length > tracks.length) lines.push(`……共 ${info.tracks.length} 首，仅显示前 ${tracks.length} 首`)
    }
    return lines.join('\n')
  }

  async function handlePlaylist(session: any, match: LinkMatch) {
    const platformConf = resolver.resolve(match.type)
    let playlist: ParsedPlaylist | null = null
    try {
      playlist = await apiClient.fetchPlaylist(match.url, match.type, match.id, platformConf)
    } catch (error) {
      debug.log('ERROR', `歌单解析失败: ${getErrorMessage(error)}`)
    }
    if (!playlist) {
      const displayUrl = match.url.length > 50 ? match.url.slice(0, 50) + '...' : match.url
      await sendWithTimeout(session, `${texts.parseErrorPrefix}\n${texts.parseErrorItemFormat.replace(/\$\{url\}/g, displayUrl).replace(/\$\{msg\}/g, '歌单解析失败')}`)
      return
    }

    const items: ParsedItem[] = []
    items.push({
      text: buildPlaylistText(playlist),
      parsed: {
        type: match.type,
        name: playlist.playlist.name || '未知歌单',
        artist: playlist.playlist.creator,
        album: '',
        cover: playlist.playlist.cover,
        musicUrl: '',
      },
    })

    if (config.expandPlaylistTracks && playlist.playlist.tracks.length) {
      const limit = Math.min(Math.max(1, config.maxPlaylistTracks || 10), playlist.playlist.tracks.length)
      const ids = playlist.playlist.tracks.slice(0, limit).map(t => t.id)
      const tracks = await apiClient.fetchTracksBatch(match.type, platformConf, ids)
      tracks.forEach((parsed, index) => {
        items.push({ text: generateFormattedText(parsed, config.unifiedMessageFormat, index, tracks.length), parsed })
      })
    }

    await emitItems(session, items)
  }

  async function flush(session: any, matches: LinkMatch[]) {
    debug.log('INFO', `开始解析 ${matches.length} 个链接`)
    const pending: Array<{ order: number; fn: () => Promise<void> }> = []
    const limiter = new ConcurrencyLimiter(config.maxConcurrent || 3)
    const processedUrls = new Set<string>()
    const processedContents = new Set<string>()
    let seq = 0

    const tasks = matches.map(async match => {
      await limiter.acquire()
      try {
        const isCustom = match.type.startsWith('custom_')
        if (!isCustom && !SUPPORTED_PLATFORMS.includes(match.type as any)) {
          debug.log('INFO', `平台 ${match.type} 不受支持，跳过链接: ${match.url}`)
          return
        }
        if (!isCustom) {
          const platformEnabled = config.platformEnabled?.[match.type] ?? true
          if (!platformEnabled) {
            debug.log('INFO', `平台 ${match.type} 已禁用，跳过链接: ${match.url}`)
            return
          }
        }
        if (dedupEnabled && config.deduplicationInterval > 0) {
          const lastTime = dedupCache.get(match.url)
          if (lastTime && (Date.now() - lastTime < config.deduplicationInterval * 1000)) {
            debug.log('INFO', `跳过重复链接: ${match.url}`)
            return
          }
        }
        if (processedUrls.has(match.url)) {
          debug.log('INFO', `跳过本批重复链接: ${match.url}`)
          return
        }
        processedUrls.add(match.url)

        const order = ++seq
        if (match.kind === 'playlist') {
          pending.push({ order, fn: () => handlePlaylist(session, match) })
          return
        }

        pending.push({
          order,
          fn: async () => {
            const platformConf = resolver.resolve(match.type)
            try {
              const parsed = await apiClient.fetch(match.url, match.type, match.id, platformConf)
              if (dedupEnabled && config.deduplicationInterval > 0) {
                const fp = contentFingerprint(parsed)
                if (processedContents.has(fp)) {
                  debug.log('INFO', `跳过重复内容: ${match.url}`)
                  return
                }
                const lastDedup = contentDedupCache.get(fp)
                if (lastDedup && (Date.now() - lastDedup < config.deduplicationInterval * 1000)) {
                  debug.log('INFO', `跳过历史重复内容: ${match.url}`)
                  return
                }
                processedContents.add(fp)
                contentDedupCache.set(fp, Date.now())
                dedupCache.set(match.url, Date.now())
              }
              const items: ParsedItem[] = [{ text: generateFormattedText(parsed, config.unifiedMessageFormat), parsed, order }]
              await emitItems(session, items)
            } catch (error) {
              const msg = getErrorMessage(error)
              debug.log('ERROR', `解析失败 ${match.url}: ${msg}`)
              const displayUrl = match.url.length > 50 ? match.url.slice(0, 50) + '...' : match.url
              await sendWithTimeout(session, `${texts.parseErrorPrefix}\n${texts.parseErrorItemFormat.replace(/\$\{url\}/g, displayUrl).replace(/\$\{msg\}/g, msg)}`)
            }
          },
        })
      } finally {
        limiter.release()
      }
    })
    await Promise.all(tasks)

    pending.sort((a, b) => a.order - b.order)
    for (const task of pending) {
      try {
        await task.fn()
      } catch (error) {
        debug.log('ERROR', `任务执行失败: ${getErrorMessage(error)}`)
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
    const supported = matches.filter(m => m.type.startsWith('custom_') || SUPPORTED_PLATFORMS.includes(m.type as any))
    if (!supported.length) {
      debug.log('INFO', '检测到的链接均不受支持')
      return
    }
    debug.log('INFO', `检测到 ${supported.length} 个音乐链接`)
    if (config.showWaitingTip) {
      try {
        await sendWithTimeout(session, texts.waitingTipText)
      } catch (e) {
        debug.log('WARN', '等待提示发送失败')
      }
    }
    await flush(session, supported)
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
    const supported = matches.filter(m => m.type.startsWith('custom_') || SUPPORTED_PLATFORMS.includes(m.type as any))
    if (!supported.length) {
      await sendWithTimeout(session, texts.unsupportedPlatformText)
      return
    }
    if (config.showWaitingTip) {
      try {
        await sendWithTimeout(session, texts.waitingTipText)
      } catch {}
    }
    await flush(session, supported)
  })

  ctx.on('dispose', () => {
    urlCacheLocal.clear()
    playlistCacheLocal.clear()
    dedupCache.clear()
    debug.log('INFO', '音乐解析插件已卸载')
  })

  debug.log('INFO', '音乐解析插件初始化完成')
}

export { PLATFORM_LABELS, SUPPORTED_PLATFORMS }
