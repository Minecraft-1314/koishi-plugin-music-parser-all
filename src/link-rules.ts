import type { LinkMatch, LinkRule } from './types'
import { safeJsonParse } from './utils'

export const PLATFORM_NETEASE = 'netease'
export const PLATFORM_QISHUI = 'qishui'

export const SUPPORTED_PLATFORMS = [PLATFORM_NETEASE, PLATFORM_QISHUI] as const

export const PLATFORM_LABELS: Record<string, string> = {
  netease: '网易云音乐',
  qishui: '汽水音乐',
}

const NETEASE_SONG_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?song\?id=(\d{3,})(?:[^\s'"]*)?/gi,
  /https?:\/\/y\.music\.163\.com\/m\/song\?id=(\d{3,})(?:[^\s'"]*)?/gi,
  /https?:\/\/163cn\.tv\/[A-Za-z0-9]+(?:[^\s'"]*)?/gi,
]

const NETEASE_PLAYLIST_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?playlist\?id=(\d{3,})(?:[^\s'"]*)?/gi,
  /https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?(?:my\/m\/music\/list|discover\/playlist)\?[^\s'"]*[?&]id=(\d{3,})(?:[^\s'"]*)?/gi,
  /https?:\/\/music\.163\.com\/st\/(?:song|my\/m\/music\/list)\?[^\s'"]*/gi,
]

const NETEASE_ALBUM_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?album\?id=(\d{3,})(?:[^\s'"]*)?/gi,
]

const QISHUI_PATTERNS = [
  /https?:\/\/qishui\.douyin\.com\/s\/([A-Za-z0-9]+)(?:[^\s'"]*)?/gi,
  /https?:\/\/qishui\.douyin\.com\/(?:album|song)\/[A-Za-z0-9]+(?:[^\s'"]*)?/gi,
]

const NETEASE_FALLBACK_PATTERNS = [
  /https?:\/\/(?:[a-z0-9-]+\.)*music\.163\.com\/[^\s'"]*/gi,
]

const QISHUI_FALLBACK_PATTERNS = [
  /https?:\/\/(?:[a-z0-9-]+\.)*qishui\.douyin\.com\/[^\s'"]*/gi,
]

export const BUILTIN_LINK_RULES: LinkRule[] = [
  ...NETEASE_SONG_PATTERNS.map(pattern => ({ pattern, type: PLATFORM_NETEASE, kind: 'song' as const })),
  ...QISHUI_PATTERNS.map(pattern => ({ pattern, type: PLATFORM_QISHUI, kind: 'song' as const })),
  ...NETEASE_PLAYLIST_PATTERNS.map(pattern => ({ pattern, type: PLATFORM_NETEASE, kind: 'playlist' as const })),
  ...NETEASE_ALBUM_PATTERNS.map(pattern => ({ pattern, type: PLATFORM_NETEASE, kind: 'playlist' as const })),
  ...NETEASE_FALLBACK_PATTERNS.map(pattern => ({ pattern, type: PLATFORM_NETEASE, kind: 'song' as const })),
  ...QISHUI_FALLBACK_PATTERNS.map(pattern => ({ pattern, type: PLATFORM_QISHUI, kind: 'song' as const })),
]

export function buildCustomLinkRules(customPlatforms: any[]): LinkRule[] {
  if (!Array.isArray(customPlatforms) || customPlatforms.length === 0) return []
  return customPlatforms
    .filter(p => p && p.keywords)
    .map(p => {
      const keywords = String(p.keywords).split(',').map((s: string) => s.trim()).filter(Boolean)
      if (keywords.length === 0) return null
      const escaped = keywords.map((k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const pattern = new RegExp(`https?://[^/\\s]*(?:${escaped.join('|')})[^\\s]*`, 'gi')
      return { pattern, type: `custom_${p.name}`, kind: 'song' as const }
    })
    .filter(Boolean) as LinkRule[]
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, '&')
}

export function detectKind(url: string): 'song' | 'playlist' {
  if (/\/playlist\b|\/discover\/playlist\b|\/my\/m\/music\/list\b|\/st\/|\/album\b/i.test(url)) return 'playlist'
  return 'song'
}

export function extractId(url: string): string {
  const query = url.match(/[?&](?:id|songid)=(\d+)/i)
  if (query) return query[1]
  const path = url.match(/\/(?:album|playlist|song)\/(\d+)/i)
  if (path) return path[1]
  const tail = url.match(/\/([A-Za-z0-9]{6,})\/?(?:[?#]|$)/)
  if (tail) return tail[1]
  return url
}

export function linkTypeParser(content: string, customRules: LinkRule[]): LinkMatch[] {
  const normalized = content ? String(content).replace(/\\\//g, '/') : ''
  if (!normalized) return []
  const allRules = [...BUILTIN_LINK_RULES, ...customRules]
  const matches: LinkMatch[] = []
  const seen = new Set<string>()
  for (const rule of allRules) {
    rule.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    let guard = 0
    while ((match = rule.pattern.exec(normalized)) !== null && guard++ < 200) {
      const url = decodeHtml(match[0])
      if (!url) {
        rule.pattern.lastIndex++
        continue
      }
      if (seen.has(url)) {
        if (match[0] === '') rule.pattern.lastIndex++
        continue
      }
      seen.add(url)
      const isCustom = rule.type.startsWith('custom_')
      const kind = isCustom ? (rule.kind || 'song') : detectKind(url)
      const id = match[1] && /^\d+$|^[A-Za-z0-9]{6,}$/.test(match[1]) ? match[1] : extractId(url)
      matches.push({ type: rule.type, url, id, kind })
    }
  }
  return matches
}

export function extractAllUrlsFromMessage(session: any, customRules: LinkRule[]): LinkMatch[] {
  const content = typeof session?.content === 'string' ? session.content.trim() : ''
  const result = linkTypeParser(content, customRules)
  const seen = new Set<string>(result.map(r => r.url))
  const cardsContent: string[] = []

  const readElementData = (elem: any): string => {
    if (!elem || typeof elem !== 'object') return ''
    if (typeof elem.data === 'string') return elem.data
    if (elem.attrs && typeof elem.attrs.data === 'string') return elem.attrs.data
    return ''
  }

  const elements = session?.elements
  if (Array.isArray(elements)) {
    for (const elem of elements) {
      if (!elem || typeof elem !== 'object') continue
      const data = readElementData(elem)
      if (!data) continue
      if (elem.type === 'xml') {
        cardsContent.push(data)
        continue
      }
      if (elem.type === 'json') {
        const parsed = safeJsonParse(data)
        const extract = (obj: any, depth: number) => {
          if (!obj || typeof obj !== 'object' || depth > 6) return
          for (const val of Object.values(obj)) {
            if (typeof val === 'string') cardsContent.push(val)
            else if (val && typeof val === 'object') extract(val, depth + 1)
          }
        }
        if (parsed && typeof parsed === 'object') extract(parsed, 0)
        else cardsContent.push(data)
      }
    }
  }

  for (const cardContent of cardsContent) {
    for (const link of linkTypeParser(cardContent, customRules)) {
      if (seen.has(link.url)) continue
      seen.add(link.url)
      result.push(link)
    }
  }
  return result
}

export function buildLinkRules(customPlatforms: any[]): LinkRule[] {
  return [...BUILTIN_LINK_RULES, ...buildCustomLinkRules(customPlatforms)]
}
