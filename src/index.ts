import { Context, Schema, h, Logger } from 'koishi'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomBytes } from 'crypto'

declare module 'koishi' {
  interface Context {
    downloads?: {
      download(url: string, dest: string, options?: Record<string, unknown>): Promise<string>
    }
  }
}

class SimpleLRUCache<V> {
  private map = new Map<string, { value: V; expireAt: number }>()
  constructor(private max: number, private ttlMs: number) {}
  get(key: string): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expireAt) {
      this.map.delete(key)
      return undefined
    }
    return entry.value
  }
  set(key: string, value: V): void {
    this.map.delete(key)
    while (this.map.size >= this.max) {
      const k = this.map.keys().next().value
      if (k === undefined) break
      this.map.delete(k)
    }
    this.map.set(key, { value, expireAt: Date.now() + this.ttlMs })
  }
  clear(): void {
    this.map.clear()
  }
}

class ConcurrencyLimiter {
  private running = 0
  private queue: (() => void)[] = []
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    return new Promise(resolve => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }
  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}

export const name = 'music-parser-all'

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
    forceDownloadMusicVoice: Schema.boolean().default(true).description('强制下载音乐语音（推荐开启，避免链接失效）'),
    forceDownloadImage: Schema.boolean().default(false).description('强制下载封面图片'),
  }).description('媒体发送与音乐语音'),

  Schema.object({
    maxConcurrent: Schema.number().min(1).step(1).default(3).description('解析最大并发数'),
    downloadConcurrency: Schema.number().min(1).step(1).default(3).description('下载线程数'),
    mediaDownloadTimeout: Schema.number().min(0).step(1).default(120000).description('统一下载超时 (ms)'),
    maxMediaSize: Schema.number().min(0).step(1).default(0).description('最大下载文件大小 (MB)，0 为不限制'),
    downloadEngine: Schema.union([
      Schema.const('internal').description('内置下载'),
      Schema.const('aria2').description('aria2 下载'),
      Schema.const('downloads').description('downloads 服务下载'),
    ]).default('internal').description('下载引擎'),
    aria2Host: Schema.string().default('127.0.0.1').description('aria2 RPC 地址'),
    aria2Port: Schema.number().default(6800).description('aria2 RPC 端口'),
    aria2Secret: Schema.string().default('').description('aria2 RPC 密钥'),
    resumeDownload: Schema.boolean().default(true).description('启用断点续传（仅 aria2 模式）'),
  }).description('性能与限制'),

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
    deduplicationInterval: Schema.number().min(0).step(1).default(180).description('去重间隔 (s)'),
    cacheTTL: Schema.number().min(0).step(1).default(600).description('缓存时间 (s)'),
    cacheDir: Schema.string().default('./temp_cache_music').description('统一临时目录'),
  }).description('缓存与临时文件'),

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

interface ParsedMusic {
  type: string
  name: string
  artist: string
  album: string
  cover: string
  musicUrl: string
  level?: string
  size?: string
}

interface LinkMatch {
  type: string
  url: string
  id: string
}

interface ApiItem {
  url: string
  label: string
  apiKey?: string
  authHeaderType?: string
  customHeaderName?: string
  fieldMapping?: Record<string, string>
}

interface CustomPlatformConfig {
  name: string
  apiUrl: string
  apiKey: string
  authHeaderType: string
  customHeaderName: string
  fieldMapping?: Record<string, string>
  proxy?: any
}

const logger = new Logger(name)
let debugEnabled = false
function debugLog(level: string, ...args: any[]) {
  if (!debugEnabled) return
  logger.info(`[${new Date().toISOString()}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`)
}

const BUILTIN_LINK_RULES: { pattern: RegExp; type: string }[] = [
  { pattern: /https?:\/\/(?:music\.163\.com\/(?:#\/)?song\?id=(\d{3,})|163cn\.tv\/[A-Za-z0-9]+|y\.music\.163\.com\/m\/song\?id=(\d{3,}))/gi, type: 'netease' },
  { pattern: /https?:\/\/www\.kuwo\.cn\/play_detail\/(\d+)/gi, type: 'kuwo' },
  { pattern: /https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\/([A-Za-z0-9]+)/gi, type: 'qqmusic' },
  { pattern: /https?:\/\/i\.y\.qq\.com\/v8\/playsong\.html\?songid=(\d+)/gi, type: 'qqmusic' },
  { pattern: /https?:\/\/qishui\.douyin\.com\/s\/([A-Za-z0-9]+)/gi, type: 'qishui' },
]

function buildCustomLinkRules(customPlatforms: any[]): { pattern: RegExp; type: string }[] {
  if (!Array.isArray(customPlatforms) || customPlatforms.length === 0) return []
  return customPlatforms
    .filter(p => p.keywords)
    .map(p => {
      const keywords = p.keywords.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (keywords.length === 0) return null
      const escaped = keywords.map((k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const pattern = new RegExp('https?://[^/\\s]*(' + escaped.join('|') + ')[^\\s]*', 'gi')
      return { pattern, type: `custom_${p.name}` }
    })
    .filter(Boolean) as { pattern: RegExp; type: string }[]
}

function linkTypeParser(content: string, customRules: { pattern: RegExp; type: string }[]): LinkMatch[] {
  content = content.replace(/\\\//g, '/')
  const allRules = [...BUILTIN_LINK_RULES, ...customRules]
  const matches: LinkMatch[] = []
  const seen = new Set<string>()
  for (const rule of allRules) {
    let match: RegExpExecArray | null
    rule.pattern.lastIndex = 0
    while ((match = rule.pattern.exec(content)) !== null) {
      const url = match[0]
      if (seen.has(url)) continue
      seen.add(url)
      const id = match[1] || match[2] || url
      matches.push({ type: rule.type, url, id })
    }
  }
  return matches
}

function extractAllUrlsFromMessage(session: any, customRules: { pattern: RegExp; type: string }[]): LinkMatch[] {
  const content = session.content?.trim() || ''
  const matchedLinks = linkTypeParser(content, customRules)
  const cardsContent: string[] = []
  if (session.elements) {
    for (const elem of session.elements) {
      if (elem.type === 'xml' && elem.data) cardsContent.push(elem.data)
      else if (elem.type === 'json' && elem.data) {
        try {
          const json = JSON.parse(elem.data)
          const extract = (obj: any) => {
            if (!obj || typeof obj !== 'object') return
            for (const val of Object.values(obj)) {
              if (typeof val === 'string') cardsContent.push(val)
              else if (typeof val === 'object') extract(val)
            }
          }
          extract(json)
        } catch {}
      }
    }
  }
  for (const cardContent of cardsContent) {
    matchedLinks.push(...linkTypeParser(cardContent, customRules))
  }
  const seen = new Set<string>()
  const result: LinkMatch[] = []
  for (const link of matchedLinks) {
    if (!seen.has(link.url)) {
      seen.add(link.url)
      result.push(link)
    }
  }
  return result
}

function cleanUrl(url: string): string {
  try {
    url = url.replace(/&amp;/g, '&')
    const urlObj = new URL(url)
    if (urlObj.protocol === 'http:') urlObj.protocol = 'https:'
    if (urlObj.hostname.includes('music.163.com') || urlObj.hostname.includes('163cn.tv')) {
      ['userid', 'app_version', 'hdsuffix'].forEach(p => urlObj.searchParams.delete(p))
      return urlObj.origin + urlObj.pathname + (urlObj.search ? '?' + urlObj.search : '')
    }
    return urlObj.toString()
  } catch {
    return url.replace(/&amp;/g, '&').replace(/\?.*/, '')
  }
}

function parseFieldMapping(mappingStr: string): Record<string, string> | undefined {
  if (!mappingStr || mappingStr.trim() === '{}' || mappingStr.trim() === '') return undefined
  try {
    const obj = JSON.parse(mappingStr)
    if (typeof obj === 'object' && !Array.isArray(obj)) return obj
    return undefined
  } catch {
    return undefined
  }
}

function getNestedValue(obj: any, path: string): any {
  if (!path) return obj
  const keys = path.split('.')
  let current = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

function parseApiResponse(raw: any, type: string, fieldMapping?: Record<string, string>): ParsedMusic {
  debugLog('DEBUG', 'API raw response', raw)
  const data = raw?.data || raw

  const mapField = (name: string, fallback: () => any) => {
    if (fieldMapping && fieldMapping[name]) {
      const value = getNestedValue(raw, fieldMapping[name])
      if (value !== undefined) return value
    }
    return fallback()
  }

  const name = mapField('name', () => {
    switch (type) {
      case 'netease': return data.name || data.ar_name || ''
      case 'kuwo': return data.title || ''
      case 'qqmusic': return data.name || ''
      case 'qishui': return data.albumname || ''
      default: return data.name || data.title || data.albumname || ''
    }
  })

  const artist = mapField('artist', () => {
    switch (type) {
      case 'netease': return data.ar_name || ''
      case 'kuwo': return data.artist || ''
      case 'qqmusic': return data.author || ''
      case 'qishui': return data.artistsname || ''
      default: return data.ar_name || data.artist || data.author || data.artistsname || ''
    }
  })

  const album = mapField('album', () => {
    switch (type) {
      case 'netease': return data.al_name || ''
      case 'kuwo': return data.album || ''
      case 'qqmusic': return data.album || ''
      case 'qishui': return data.albumname || ''
      default: return data.al_name || data.album || data.albumname || ''
    }
  })

  const cover = mapField('cover', () => {
    switch (type) {
      case 'netease': return data.pic || ''
      case 'kuwo': return data.pic || data.albumpic || ''
      case 'qqmusic': return data.cover || ''
      case 'qishui': {
        const avatars = data.artistsmedium_avatar_url
        return Array.isArray(avatars) ? avatars[0] || '' : ''
      }
      default: return data.pic || data.cover || ''
    }
  })

  const musicUrl = mapField('musicUrl', () => {
    switch (type) {
      case 'netease': return data.url || ''
      case 'kuwo': return data.music_url || ''
      case 'qqmusic': return data.url || ''
      case 'qishui': return data.url || ''
      default: return data.url || data.music_url || ''
    }
  })

  const level = mapField('level', () => {
    switch (type) {
      case 'netease': return data.level || ''
      case 'qishui': return data.Format || ''
      default: return data.level || data.Format || ''
    }
  })

  const size = mapField('size', () => {
    switch (type) {
      case 'netease': return data.size || ''
      case 'qishui': return data.Size || ''
      default: return data.size || data.Size || ''
    }
  })

  return { type, name, artist, album, cover, musicUrl, level, size }
}

function generateFormattedText(p: ParsedMusic, format: string): string {
  const vars: Record<string, string> = {
    name: p.name,
    artist: p.artist,
    album: p.album,
    cover: p.cover,
    music_url: p.musicUrl,
    level: p.level || '未知',
    size: p.size || '未知',
  }
  const formatVarRegex = /\$\{([^}]+)\}/g
  const lines = format.split('\n')
  const resultLines: string[] = []
  for (const line of lines) {
    const varMatches = line.match(formatVarRegex)
    if (varMatches && varMatches.length > 0) {
      let allEmpty = true
      for (const match of varMatches) {
        const varName = match.slice(2, -1)
        const val = vars[varName]
        if (val !== undefined && val !== '' && val !== '0') {
          allEmpty = false
          break
        }
      }
      if (allEmpty) continue
    }
    let newLine = line
    for (const [key, value] of Object.entries(vars)) {
      newLine = newLine.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value)
    }
    resultLines.push(newLine)
  }
  return resultLines.join('\n').trim()
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function buildForwardNode(session: any, content: any, botName: string) {
  let messageContent: any[]
  if (Array.isArray(content)) messageContent = content
  else if (content && typeof content === 'object' && content.type) messageContent = [content]
  else messageContent = [h.text(String(content))]
  return h('node', { user: { nickname: botName.substring(0, 15), user_id: session.selfId } }, messageContent)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as Record<string, unknown>).message)
  return String(error)
}

function buildAuthHeaders(apiKey: string, authHeaderType: string, customHeaderName: string): Record<string, string> {
  if (!apiKey) return {}
  if (authHeaderType === 'Bearer') return { 'Authorization': `Bearer ${apiKey}` }
  if (authHeaderType === 'X-API-Key') return { 'X-API-Key': apiKey }
  if (authHeaderType === 'Custom' && customHeaderName) return { [customHeaderName]: apiKey }
  return {}
}

export function apply(ctx: Context, config: any) {
  debugEnabled = config.debug || false
  debugLog('INFO', '音乐解析插件启动')

  const dedupCache = new SimpleLRUCache<number>(1000, config.deduplicationInterval * 1000)
  const cacheTTL = (config.cacheTTL || 600) * 1000
  const urlCacheLocal = new SimpleLRUCache<{ data: ParsedMusic; expire: number }>(500, cacheTTL)
  const contentDedupCache = new SimpleLRUCache<number>(1000, config.deduplicationInterval * 1000)

  function contentFingerprint(p: ParsedMusic): string {
    return [p.type, p.name, p.artist, p.album, p.musicUrl].map(v => String(v ?? '')).join('::')
  }

  const texts = {
    waitingTipText: config.waitingTipText || '正在解析音乐，请稍候...',
    unsupportedPlatformText: config.unsupportedPlatformText || '暂不支持该平台音乐链接',
    invalidLinkText: config.invalidLinkText || '无效的音乐链接',
    parseErrorPrefix: config.parseErrorPrefix || '❌ 解析失败：',
    parseErrorItemFormat: config.parseErrorItemFormat || '【${url}】: ${msg}',
  }

  const proxyConfig = config.proxy || {}
  const cacheDir = config.cacheDir || './temp_cache_music'
  const downloadLimiter = new ConcurrencyLimiter(config.downloadConcurrency || 3)
  const mediaDownloadTimeout = config.mediaDownloadTimeout ?? 120000
  const maxMediaSize = config.maxMediaSize ?? 0
  const downloadEngine = config.downloadEngine || 'internal'
  let aria2: any = null
  if (downloadEngine === 'aria2') {
    try {
      const Aria2 = require('aria2')
      aria2 = new Aria2({
        host: config.aria2Host || '127.0.0.1',
        port: config.aria2Port || 6800,
        secure: false,
        secret: config.aria2Secret || '',
        path: '/jsonrpc'
      })
      aria2.open()
      logger.info('aria2 连接成功')
    } catch (e) {
      logger.warn('aria2 连接失败，回退到内置下载')
    }
  }

  const customPlatforms: CustomPlatformConfig[] = (config.customPlatforms || []).map((p: any) => ({
    name: p.name,
    apiUrl: p.apiUrl,
    apiKey: p.apiKey || '',
    authHeaderType: p.authHeaderType || 'Bearer',
    customHeaderName: p.customHeaderName || 'X-API-Key',
    fieldMapping: parseFieldMapping(p.fieldMapping),
    proxy: p.proxy || null
  }))

  function getPlatformConfig(type: string): {
    apiUrl: string | null
    dedicatedFirst: boolean
    apiKey: string
    authHeaderType: string
    customHeaderName: string
    fieldMapping?: Record<string, string>
    customProxy?: any
  } {
    if (type.startsWith('custom_')) {
      const name = type.slice(7)
      const custom = customPlatforms.find(p => p.name === name)
      if (custom) {
        return {
          apiUrl: custom.apiUrl,
          dedicatedFirst: true,
          apiKey: custom.apiKey || '',
          authHeaderType: custom.authHeaderType,
          customHeaderName: custom.customHeaderName,
          fieldMapping: custom.fieldMapping,
          customProxy: custom.proxy
        }
      }
      return { apiUrl: null, dedicatedFirst: false, apiKey: '', authHeaderType: 'Bearer', customHeaderName: 'X-API-Key' }
    }

    const custom = config.customApis?.find((item: any) => item.platform === type)
    const defaultDedicatedApis: Record<string, string> = {
      netease: 'https://api.bugpk.com/api/163_music',
      kuwo: 'https://api.bugpk.com/api/kuwo',
      qqmusic: 'https://api.bugpk.com/api/qqmusic',
      qishui: 'https://api.bugpk.com/api/qsmusic',
    }
    let apiUrl = defaultDedicatedApis[type] || null
    let apiKey = ''
    let authHeaderType = 'Bearer'
    let customHeaderName = 'X-API-Key'
    let fieldMapping: Record<string, string> | undefined = undefined
    if (custom && custom.apiUrl) {
      apiUrl = custom.apiUrl
      apiKey = custom.apiKey || ''
      authHeaderType = custom.authHeaderType || 'Bearer'
      customHeaderName = custom.customHeaderName || 'X-API-Key'
      fieldMapping = parseFieldMapping(custom.fieldMapping)
    }
    const dedicatedFirst = config.platformDedicatedFirst?.[type] ?? false
    if (!fieldMapping) {
      fieldMapping = parseFieldMapping(config.globalFieldMapping)
    }
    return { apiUrl, dedicatedFirst, apiKey, authHeaderType, customHeaderName, fieldMapping }
  }

  const BACKUP_AGGREGATE_API = config.backupApiUrl || 'https://api.bugpk.com/api/music'

  async function downloadFile(url: string, timeout: number, maxSize: number, filePrefix: string, fileExts: string[]): Promise<string> {
    if (!url) throw new Error('链接为空')
    await fs.mkdir(cacheDir, { recursive: true })

    let ext = fileExts.find(e => new RegExp('\\.' + e + '(\\?|$)', 'i').test(url))
    if (!ext) {
      try {
        const urlObj = new URL(url)
        const mimeType = urlObj.searchParams.get('mime_type')
        if (mimeType) {
          const mimeMap: Record<string, string> = {
            'audio_mp4': 'm4a',
            'audio/mp4': 'm4a',
            'audio_mpeg': 'mp3',
            'audio/mpeg': 'mp3',
            'audio_mp3': 'mp3',
            'audio/mp3': 'mp3',
            'audio_flac': 'flac',
            'audio/flac': 'flac',
            'audio_wav': 'wav',
            'audio/wav': 'wav',
            'audio_ogg': 'ogg',
            'audio/ogg': 'ogg',
            'audio_aac': 'aac',
            'audio/aac': 'aac',
          }
          const mappedExt = mimeMap[mimeType]
          if (mappedExt && fileExts.includes(mappedExt)) {
            ext = mappedExt
          }
        }
      } catch {}
    }
    ext = ext || fileExts[0]

    const fileName = `${filePrefix}_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`
    const filePath = path.resolve(cacheDir, fileName)

    if (downloadEngine === 'downloads' && ctx.downloads) {
      try {
        const dest = await ctx.downloads.download(url, path.join(cacheDir, fileName), {
          headers: { 'User-Agent': config.userAgent },
          timeout
        })
        const stat = await fs.stat(dest)
        if (maxSize > 0 && stat.size > maxSize * 1024 * 1024) {
          await fs.unlink(dest).catch(() => {})
          throw new Error(`文件过大(${Math.round(stat.size/1024/1024)}MB)，超过限制(${maxSize}MB)`)
        }
        return dest
      } catch (e) {
        debugLog('ERROR', `downloads 下载失败，回退内置下载: ${getErrorMessage(e)}`)
      }
    } else if (downloadEngine === 'aria2' && aria2 && config.resumeDownload) {
      try {
        const gid = await aria2.call('aria2.addUri', [url], {
          dir: cacheDir,
          out: fileName,
          split: 4,
          continue: true,
          maxConnectionPerServer: 5,
          timeout: timeout / 1000,
          maxFileNotFound: 5,
          maxTries: 5,
          retryWait: 2,
          header: [`User-Agent: ${config.userAgent}`, `Referer: https://www.baidu.com/`]
        })
        let completed = false
        const ariaStartTime = Date.now()
        while (!completed) {
          if (Date.now() - ariaStartTime > timeout) {
            await aria2.call('aria2.remove', gid).catch(() => {})
            throw new Error('aria2下载超时')
          }
          const status = await aria2.call('aria2.tellStatus', gid)
          if (status.status === 'complete') {
            completed = true
          } else if (status.status === 'error' || status.status === 'removed') {
            throw new Error('aria2下载失败')
          } else {
            await delay(1000)
          }
        }
        const stat = await fs.stat(filePath)
        if (maxSize > 0 && stat.size > maxSize * 1024 * 1024) {
          await fs.unlink(filePath).catch(() => {})
          throw new Error(`文件过大(${Math.round(stat.size/1024/1024)}MB)，超过限制(${maxSize}MB)`)
        }
        return filePath
      } catch (e) {
        debugLog('ERROR', `aria2下载失败，回退内置下载: ${getErrorMessage(e)}`)
      }
    }

    const writer = createWriteStream(filePath)
    let response
    try {
      response = await http({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout,
        headers: { 'User-Agent': config.userAgent, 'Referer': 'https://www.baidu.com/' },
        maxRedirects: 5,
        validateStatus: (status: number) => status >= 200 && status < 300,
      })
    } catch (e) {
      writer.destroy()
      await fs.unlink(filePath).catch(() => {})
      throw new Error(`下载失败: ${getErrorMessage(e)}`)
    }
    const maxSizeBytes = maxSize * 1024 * 1024
    const contentLength = Number(response.headers['content-length'] || 0)
    if (maxSizeBytes > 0 && contentLength > maxSizeBytes) {
      writer.destroy()
      await fs.unlink(filePath).catch(() => {})
      throw new Error(`文件过大(${Math.round(contentLength/1024/1024)}MB)，超过限制(${maxSize}MB)`)
    }
    try {
      await pipeline(response.data, writer)
      return filePath
    } catch (e) {
      await fs.unlink(filePath).catch(() => {})
      throw new Error(`写入文件失败: ${getErrorMessage(e)}`)
    }
  }

  async function sendMedia(session: any, url: string, type: 'image' | 'audio', forceDownload: boolean, showFile: boolean) {
    if (!url) return
    await downloadLimiter.acquire()
    try {
      const sendLink = async () => { await sendWithTimeout(session, `${type === 'audio' ? '音乐' : '封面'}链接：${url}`).catch(() => {}) }
      const extMap: Record<string, string[]> = {
        image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        audio: ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma', 'ape', 'wv', 'alac']
      }
      const prefixMap = { image: 'img', audio: 'music' }
      const sendFunc = type === 'audio' ? h.audio : h.image

      if (forceDownload) {
        try {
          const localPath = await downloadFile(url, mediaDownloadTimeout, maxMediaSize, prefixMap[type], extMap[type])
          try {
            await sendWithTimeout(session, sendFunc(`file://${localPath}`))
          } finally {
            await fs.unlink(localPath).catch(() => {})
          }
          return
        } catch (e) {
          debugLog('ERROR', `强制下载${type}失败，尝试URL发送:`, getErrorMessage(e))
          try {
            await sendWithTimeout(session, sendFunc(url))
          } catch { await sendLink() }
        }
        return
      }
      if (!showFile) {
        await sendLink()
        return
      }
      try {
        await sendWithTimeout(session, sendFunc(url))
      } catch {
        try {
          const localPath = await downloadFile(url, mediaDownloadTimeout, maxMediaSize, prefixMap[type], extMap[type])
          try {
            await sendWithTimeout(session, sendFunc(`file://${localPath}`))
          } finally {
            await fs.unlink(localPath).catch(() => {})
          }
        } catch { await sendLink() }
      }
    } finally {
      downloadLimiter.release()
    }
  }

  async function fetchApi(url: string, type: string, matchId: string, fieldMapping?: Record<string, string>, platformConf?: any): Promise<ParsedMusic> {
    const cacheKey = url
    const cached = urlCacheLocal.get(cacheKey)
    if (cached && cached.expire > Date.now()) return cached.data

    const { apiUrl: dedicatedUrl, dedicatedFirst, apiKey, authHeaderType, customHeaderName, customProxy } = platformConf || getPlatformConfig(type)
    const primaryApi = dedicatedUrl
    const backupApis: ApiItem[] = []
    if (type === 'netease' || type === 'qqmusic') {
      backupApis.push({ url: BACKUP_AGGREGATE_API, label: '聚合备用API', fieldMapping })
    }

    const apiList: ApiItem[] = []
    if (dedicatedFirst && primaryApi) {
      apiList.push({ url: primaryApi, label: `专属API(${type})`, apiKey, authHeaderType, customHeaderName, fieldMapping })
      apiList.push(...backupApis)
    } else {
      if (primaryApi) apiList.push({ url: primaryApi, label: `默认API(${type})`, apiKey, authHeaderType, customHeaderName, fieldMapping })
      apiList.push(...backupApis)
    }

    const customHeaders = config.customHeaders || []
    let lastError: Error | null = null
    for (const api of apiList) {
      for (let attempt = 0; attempt <= config.retryTimes; attempt++) {
        try {
          const headers: any = {
            'User-Agent': config.userAgent,
            'Referer': 'https://www.baidu.com/',
          }
          for (const h of customHeaders) {
            if (h.name && h.value) headers[h.name] = h.value
          }
          if (api.apiKey) {
            const authHeaders = buildAuthHeaders(api.apiKey, api.authHeaderType || 'Bearer', api.customHeaderName || 'X-API-Key')
            Object.assign(headers, authHeaders)
          }

          let apiUrl = api.url
          let params: any = {}
          if (apiUrl === BACKUP_AGGREGATE_API) {
            const media = type === 'netease' ? 'netease' : 'tencent'
            params = { id: matchId, media, type: 'song' }
          } else {
            params = { url: cleanUrl(url) }
            if (type === 'netease' && apiUrl.includes('163_music')) params.type = 'json'
          }

          const proxyToUse = customProxy && customProxy.enabled ? customProxy : (proxyConfig.enabled ? proxyConfig : undefined)
          const axiosConfigLocal: AxiosRequestConfig = {
            params,
            timeout: config.timeout,
            headers,
            proxy: proxyToUse && proxyToUse.host ? {
              protocol: proxyToUse.protocol || 'http',
              host: proxyToUse.host,
              port: proxyToUse.port || 7890,
              auth: proxyToUse.auth?.username ? { username: proxyToUse.auth.username, password: proxyToUse.auth.password || '' } : undefined
            } : undefined
          }
          const res = await http.get(apiUrl, axiosConfigLocal)
          const rawData = res.data
          if (rawData && (rawData.code === 200 || rawData.code === 0 || (apiUrl === BACKUP_AGGREGATE_API && rawData.url))) {
            const parsed = parseApiResponse(rawData, type, api.fieldMapping)
            urlCacheLocal.set(cacheKey, { data: parsed, expire: Date.now() + cacheTTL })
            return parsed
          }
          throw new Error(rawData?.msg || `API返回错误码: ${rawData?.code}`)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          debugLog('ERROR', `${api.label} attempt ${attempt+1} failed: ${lastError.message}`)
          if (attempt < config.retryTimes) { await delay(config.retryInterval); continue }
          break
        }
      }
      debugLog('WARN', `${api.label} all retries failed`)
    }
    throw lastError || new Error('所有API请求全部失败')
  }

  async function processSingleUrl(url: string, type: string, matchId: string, fieldMapping?: Record<string, string>, platformConf?: any): Promise<{ success: true; data: { text: string; parsed: ParsedMusic } } | { success: false; msg: string; url: string }> {
    try {
      const parsed = await fetchApi(url, type, matchId, fieldMapping, platformConf)
      const text = generateFormattedText(parsed, config.unifiedMessageFormat)
      return { success: true, data: { text, parsed } }
    } catch (error) {
      return { success: false, msg: getErrorMessage(error), url }
    }
  }

  async function flush(session: any, matches: LinkMatch[]) {
    debugLog('INFO', `开始解析 ${matches.length} 个链接`)
    const items: { text: string; parsed: ParsedMusic }[] = []
    const errors: string[] = []
    const limiter = new ConcurrencyLimiter(config.maxConcurrent || 3)
    const promises = matches.map(async (match) => {
      await limiter.acquire()
      try {
        const platformEnabled = config.platformEnabled?.[match.type] ?? true
        if (!platformEnabled && !match.type.startsWith('custom_')) {
          debugLog('INFO', `平台 ${match.type} 已禁用，跳过链接: ${match.url}`)
          return
        }
        if (config.deduplicationInterval > 0) {
          const lastTime = dedupCache.get(match.url)
          if (lastTime && (Date.now() - lastTime < config.deduplicationInterval * 1000)) {
            debugLog('INFO', `跳过重复链接: ${match.url}`)
            return
          }
        }
        debugLog('INFO', `解析链接: ${match.url} (${match.type})`)
        const platformConf = getPlatformConfig(match.type)
        const result = await processSingleUrl(match.url, match.type, match.id, platformConf.fieldMapping, platformConf)
        if (result.success) {
          if (config.deduplicationInterval > 0) {
            const fp = contentFingerprint(result.data.parsed)
            const lastDedup = contentDedupCache.get(fp)
            if (lastDedup && (Date.now() - lastDedup < config.deduplicationInterval * 1000)) {
              debugLog('INFO', `跳过重复内容: ${match.url}`)
              return
            }
            contentDedupCache.set(fp, Date.now())
            dedupCache.set(match.url, Date.now())
          }
          items.push(result.data)
        } else {
          const item = texts.parseErrorItemFormat.replace(/\$\{url\}/g, match.url.length > 50 ? match.url.slice(0,50)+'...' : match.url).replace(/\$\{msg\}/g, result.msg)
          errors.push(item)
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
        const text = item.text
        if (text && config.showMusicText) forwardMessages.push(buildForwardNode(session, text, botName))
        if (p.cover && config.showCoverImage) forwardMessages.push(buildForwardNode(session, h.image(p.cover), botName))
        if (p.musicUrl && config.showMusicVoice) forwardMessages.push(buildForwardNode(session, h.audio(p.musicUrl), botName))
      }
      if (forwardMessages.length) {
        try {
          await sendWithTimeout(session, h('message', { forward: true }, forwardMessages.slice(0, 100)), config.retryTimes)
        } catch (err) {
          debugLog('ERROR', '合并转发失败，降级逐条发送:', err)
          for (const node of forwardMessages) {
            await sendWithTimeout(session, node.data.content).catch(() => {})
            await delay(300)
          }
        }
      }
    } else {
      for (const item of items) {
        const p = item.parsed
        const text = item.text
        if (text && config.showMusicText) { await sendWithTimeout(session, text); await delay(300) }
        if (p.cover && config.showCoverImage) {
          await sendMedia(session, p.cover, 'image', config.forceDownloadImage, true).catch(() => {})
          await delay(300)
        }
        if (p.musicUrl && config.showMusicVoice) {
          await sendMedia(session, p.musicUrl, 'audio', config.forceDownloadMusicVoice, config.showMusicVoiceFile).catch(() => {})
          await delay(500)
        }
      }
    }
    debugLog('INFO', '处理完成')
  }

  async function sendWithTimeout(session: any, content: any, customRetries?: number): Promise<any> {
    const maxRetries = customRetries ?? config.retryTimes ?? 3
    const retryDelay = config.retryInterval || 1000
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let sendPromise = session.send(content)
        if (config.videoSendTimeout > 0) {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('发送超时')), config.videoSendTimeout))
          return await Promise.race([sendPromise, timeoutPromise])
        } else {
          return await sendPromise
        }
      } catch (err) {
        const errMsg = getErrorMessage(err)
        debugLog('ERROR', `发送失败尝试 ${attempt+1}: ${errMsg}`)
        if (attempt < maxRetries) await delay(retryDelay)
        else if (!config.ignoreSendError) throw err
      }
    }
    return null
  }

  const customRules = buildCustomLinkRules(config.customPlatforms || [])

  const axiosConfig: AxiosRequestConfig = {
    timeout: config.timeout,
    headers: {
      'User-Agent': config.userAgent,
      'Referer': 'https://www.baidu.com/',
    }
  }
  if (proxyConfig.enabled && proxyConfig.host) {
    axiosConfig.proxy = {
      protocol: proxyConfig.protocol || 'http',
      host: proxyConfig.host,
      port: proxyConfig.port || 7890,
      auth: proxyConfig.auth?.username ? {
        username: proxyConfig.auth.username,
        password: proxyConfig.auth.password || ''
      } : undefined
    }
  }
  const customHeaders = config.customHeaders || []
  const http: AxiosInstance = axios.create(axiosConfig)
  http.interceptors.request.use((config) => {
    for (const h of customHeaders) {
      if (h.name && h.value) config.headers[h.name] = h.value
    }
    return config
  })

  ctx.on('message', async (session) => {
    if (!config.enable) return
    if (/^\s*parse\b/i.test(session.content || '')) return
    if (session.subtype === 'file_upload') return
    if (session.elements?.some(elem => elem.type === 'file' || elem.type === 'folder')) return
    if (session.selfId === session.userId) return
    const matches = extractAllUrlsFromMessage(session, customRules)
    if (!matches.length) return
    debugLog('INFO', `检测到 ${matches.length} 个音乐链接`)
    if (config.showWaitingTip) { try { await sendWithTimeout(session, texts.waitingTipText) } catch(e) { debugLog('WARN', '等待提示发送失败:', e) } }
    await flush(session, matches)
  })

  ctx.command('music <url>', '手动解析音乐').action(async ({ session }, url) => {
    if (!url) { await sendWithTimeout(session, texts.invalidLinkText); return }
    const matches = linkTypeParser(url, customRules)
    if (!matches.length) { await sendWithTimeout(session, texts.invalidLinkText); return }
    if (config.showWaitingTip) { try { await sendWithTimeout(session, texts.waitingTipText) } catch {} }
    await flush(session, matches)
  })

  const tempCleanupInterval = setInterval(async () => {
    try {
      const files = await fs.readdir(cacheDir)
      const now = Date.now()
      for (const file of files) {
        if ((file.startsWith('music_') || file.startsWith('img_')) &&
            (file.match(/\.(mp3|m4a|flac|wav|ogg|aac|opus|wma|ape|wv|alac|png|jpg|jpeg|gif|webp)$/i))) {
          const filePath = path.join(cacheDir, file)
          const stats = await fs.stat(filePath)
          if (now - stats.mtimeMs > 3600000) { await fs.unlink(filePath).catch(() => {}) }
        }
      }
    } catch (e) {
      if ((e as any)?.code !== 'ENOENT') debugLog('WARN', '清理临时文件失败:', e)
    }
  }, 3600000)

  ctx.on('dispose', () => {
    clearInterval(tempCleanupInterval)
    if (aria2) aria2.close()
    urlCacheLocal.clear()
    dedupCache.clear()
    debugLog('INFO', '音乐解析插件已卸载')
  })

  process.on('beforeExit', async () => {
    try {
      const files = await fs.readdir(cacheDir)
      for (const file of files) {
        if ((file.startsWith('music_') || file.startsWith('img_')) &&
            (file.match(/\.(mp3|m4a|flac|wav|ogg|aac|opus|wma|ape|wv|alac|png|jpg|jpeg|gif|webp)$/i))) {
          await fs.unlink(path.join(cacheDir, file)).catch(() => {})
        }
      }
    } catch (e) {
      if ((e as any)?.code !== 'ENOENT') debugLog('WARN', '退出清理临时文件失败:', e)
    }
  })

  debugLog('INFO', '音乐解析插件初始化完成')
}