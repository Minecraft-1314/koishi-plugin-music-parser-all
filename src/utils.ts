import { Logger, h } from 'koishi'
import type { ParsedMusic } from './types'

type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'

let debugEnabled = false

export function setDebugEnabled(value: boolean): void {
  debugEnabled = value
}

export function isDebugEnabled(): boolean {
  return debugEnabled
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 10) return '*'.repeat(value.length)
  return `${value.slice(0, 6)}${'*'.repeat(4)}${value.slice(-4)}`
}

function stringify(value: any): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    try {
      const seen = new WeakSet()
      const json = JSON.stringify(value, (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        if (typeof v === 'bigint') return v.toString()
        return v
      })
      return json && json.length > 2000 ? `${json.slice(0, 2000)}...` : (json || String(value))
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
  return String(value)
}

export class DebugLogger {
  constructor(private logger: Logger, enabled = false) {
    debugEnabled = enabled
  }

  setEnabled(value: boolean): void {
    debugEnabled = value
  }

  log(level: LogLevel, ...args: any[]): void {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(stringify).join(' ')}`
    if (level === 'WARN' || level === 'ERROR') {
      this.logger.warn(line)
      return
    }
    if (!debugEnabled) return
    if (level === 'DEBUG') this.logger.debug(line)
    else this.logger.info(line)
  }
}

export const logger = new Logger('music-parser-all')

export function elapsedSince(start: number): string {
  return `${Date.now() - start}ms`
}

export function describeContent(content: any): string {
  if (typeof content === 'string') return content.length > 60 ? `${content.slice(0, 60)}...` : content
  if (Array.isArray(content)) return `[array len=${content.length}]`
  if (content && typeof content === 'object') {
    const type = (content as any).type || 'object'
    const text = (content as any).attrs?.content || (content as any).attrs?.url || (content as any).children?.[0]?.attrs?.content
    if (typeof text === 'string') return `${type}:${text.length > 40 ? `${text.slice(0, 40)}...` : text}`
    return type
  }
  return String(content)
}

export function cleanUrl(url: string): string {
  if (!url) return url
  const trimmed = url.trim()
  try {
    const urlObj = new URL(trimmed.replace(/&amp;/g, '&'))
    if (urlObj.protocol === 'http:') urlObj.protocol = 'https:'
    if (urlObj.hostname.includes('music.163.com') || urlObj.hostname.includes('163cn.tv')) {
      for (const p of ['userid', 'app_version', 'hdsuffix']) urlObj.searchParams.delete(p)
      return urlObj.origin + urlObj.pathname + urlObj.search
    }
    return urlObj.toString()
  } catch {
    return trimmed
  }
}

export function parseFieldMapping(mappingStr: any): Record<string, string> | undefined {
  if (typeof mappingStr === 'object' && mappingStr !== null && !Array.isArray(mappingStr)) {
    const entries = Object.entries(mappingStr)
    if (entries.length && entries.every(([, v]) => typeof v === 'string')) {
      return mappingStr as Record<string, string>
    }
    return undefined
  }
  if (typeof mappingStr !== 'string') return undefined
  const trimmed = mappingStr.trim()
  if (!trimmed || trimmed === '{}') return undefined
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const entries = Object.entries(obj)
      if (entries.length && entries.every(([, v]) => typeof v === 'string')) return obj as Record<string, string>
    }
    return undefined
  } catch {
    return undefined
  }
}

export function getNestedValue(obj: any, path: string): any {
  if (!path) return obj
  const keys = path.split('.')
  let current = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

export function getFirst(obj: any, paths: string[], fallback: any = ''): any {
  if (!obj) return fallback
  for (const path of paths) {
    if (!path) continue
    const value = getNestedValue(obj, path)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

export function safeJsonParse(input: any): any {
  if (typeof input !== 'string') return input
  const trimmed = input.trim()
  if (!trimmed) return input
  try {
    return JSON.parse(trimmed)
  } catch {
    return input
  }
}

export function normalizeUrl(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('//')) return `https:${trimmed}`
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(trimmed)) return `https://${trimmed}`
    return trimmed
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = normalizeUrl(item)
      if (resolved) return resolved
    }
    return ''
  }
  if (typeof value === 'object') {
    const url = normalizeUrl((value as any).url)
    if (url) return url
    const src = normalizeUrl((value as any).src)
    if (src) return src
  }
  return ''
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as Record<string, unknown>).message)
  return String(error)
}

export function buildAuthHeaders(apiKey: string, authHeaderType: string, customHeaderName: string): Record<string, string> {
  if (!apiKey) return {}
  switch (authHeaderType) {
    case 'Bearer': return { Authorization: `Bearer ${apiKey}` }
    case 'X-API-Key': return { 'X-API-Key': apiKey }
    case 'Custom': return customHeaderName ? { [customHeaderName]: apiKey } : {}
    default: return { 'X-API-Key': apiKey }
  }
}

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return ''
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function generateFormattedText(p: ParsedMusic, format: string, index?: number, total?: number): string {
  const vars: Record<string, string> = {
    name: p.name || '',
    artist: p.artist || '',
    album: p.album || '',
    cover: p.cover || '',
    music_url: p.musicUrl || '',
    level: p.level || '',
    size: p.size || '',
    duration: p.duration ? formatDuration(p.duration) : '',
  }
  const prefix = total && total > 1 && index !== undefined ? `【${index + 1}/${total}】` : ''
  const resultLines: string[] = []
  for (const line of format.split('\n')) {
    let hasVar = false
    let allEmpty = true
    const newLine = line.replace(/\$\{([^}]+)\}/g, (match, raw) => {
      hasVar = true
      const val = vars[raw]
      if (val !== undefined && val !== '' && val !== '0') allEmpty = false
      return val !== undefined ? val : match
    })
    if (hasVar && allEmpty) continue
    resultLines.push(newLine)
  }
  const body = resultLines.join('\n').trim()
  return prefix ? `${prefix}${body}` : body
}

export function buildForwardNode(session: any, content: any, botName: string): any {
  let messageContent: any[]
  if (Array.isArray(content)) {
    messageContent = content
  } else if (content && typeof content === 'object' && content.type) {
    messageContent = [content]
  } else {
    messageContent = [h.text(String(content))]
  }
  return h('node', {
    user: { nickname: (botName || '音乐解析').substring(0, 15), user_id: session.selfId },
  }, messageContent)
}
