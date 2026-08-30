import { Logger, h } from 'koishi'
import type { ParsedMusic } from './types'

export class DebugLogger {
  private enabled: boolean

  constructor(private logger: Logger, enabled: boolean) {
    this.enabled = enabled
  }

  setEnabled(value: boolean): void {
    this.enabled = value
  }

  log(level: string, ...args: any[]): void {
    if (!this.enabled) return
    this.logger.info(`[${new Date().toISOString()}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`)
  }
}

export function cleanUrl(url: string): string {
  try {
    url = url.replace(/&amp;/g, '&')
    const urlObj = new URL(url)
    if (urlObj.protocol === 'http:') urlObj.protocol = 'https:'
    if (urlObj.hostname.includes('music.163.com') || urlObj.hostname.includes('163cn.tv')) {
      for (const p of ['userid', 'app_version', 'hdsuffix']) urlObj.searchParams.delete(p)
      return urlObj.origin + urlObj.pathname + (urlObj.search ? '?' + urlObj.search : '')
    }
    return urlObj.toString()
  } catch {
    return url.replace(/&amp;/g, '&').replace(/\?.*/, '')
  }
}

export function parseFieldMapping(mappingStr: string): Record<string, string> | undefined {
  if (!mappingStr) return undefined
  const trimmed = mappingStr.trim()
  if (!trimmed || trimmed === '{}') return undefined
  try {
    const obj = JSON.parse(trimmed)
    if (typeof obj === 'object' && !Array.isArray(obj)) return obj
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
    default: return {}
  }
}

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export function generateFormattedText(p: ParsedMusic, format: string): string {
  const vars: Record<string, string> = {
    name: p.name,
    artist: p.artist,
    album: p.album,
    cover: p.cover,
    music_url: p.musicUrl,
    level: p.level || '',
    size: p.size || '',
  }
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
  return resultLines.join('\n').trim()
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
    user: { nickname: botName.substring(0, 15), user_id: session.selfId },
  }, messageContent)
}