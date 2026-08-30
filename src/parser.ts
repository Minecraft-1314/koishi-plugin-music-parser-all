import type { ParsedMusic, LinkMatch, LinkRule } from './types'
import { getNestedValue } from './utils'

export const BUILTIN_LINK_RULES: LinkRule[] = [
  { pattern: /https?:\/\/(?:music\.163\.com\/(?:#\/)?song\?id=(\d{3,})|163cn\.tv\/[A-Za-z0-9]+|y\.music\.163\.com\/m\/song\?id=(\d{3,}))/gi, type: 'netease' },
  { pattern: /https?:\/\/www\.kuwo\.cn\/play_detail\/(\d+)/gi, type: 'kuwo' },
  { pattern: /https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\/([A-Za-z0-9]+)/gi, type: 'qqmusic' },
  { pattern: /https?:\/\/i\.y\.qq\.com\/v8\/playsong\.html\?songid=(\d+)/gi, type: 'qqmusic' },
  { pattern: /https?:\/\/qishui\.douyin\.com\/s\/([A-Za-z0-9]+)/gi, type: 'qishui' },
]

export function buildCustomLinkRules(customPlatforms: any[]): LinkRule[] {
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
    .filter(Boolean) as LinkRule[]
}

export function linkTypeParser(content: string, customRules: LinkRule[]): LinkMatch[] {
  content = content.replace(/\\\//g, '/')
  const allRules = [...BUILTIN_LINK_RULES, ...customRules]
  const matches: LinkMatch[] = []
  const seen = new Set<string>()
  for (const rule of allRules) {
    rule.pattern.lastIndex = 0
    let match: RegExpExecArray | null
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

export function extractAllUrlsFromMessage(session: any, customRules: LinkRule[]): LinkMatch[] {
  const content = session.content?.trim() || ''
  const matchedLinks = linkTypeParser(content, customRules)
  const cardsContent: string[] = []
  if (session.elements) {
    for (const elem of session.elements) {
      if (elem.type === 'xml' && elem.data) {
        cardsContent.push(elem.data)
      } else if (elem.type === 'json' && elem.data) {
        try {
          const json = JSON.parse(elem.data)
          const extract = (obj: any, depth: number) => {
            if (!obj || typeof obj !== 'object' || depth > 6) return
            for (const val of Object.values(obj)) {
              if (typeof val === 'string') cardsContent.push(val)
              else if (typeof val === 'object') extract(val, depth + 1)
            }
          }
          extract(json, 0)
        } catch {}
      }
    }
  }
  const seen = new Set<string>()
  const result: LinkMatch[] = []
  for (const link of matchedLinks) {
    if (!seen.has(link.url)) {
      seen.add(link.url)
      result.push(link)
    }
  }
  for (const cardContent of cardsContent) {
    for (const link of linkTypeParser(cardContent, customRules)) {
      if (!seen.has(link.url)) {
        seen.add(link.url)
        result.push(link)
      }
    }
  }
  return result
}

export function parseApiResponse(raw: any, type: string, fieldMapping?: Record<string, string>): ParsedMusic {
  const data = raw?.data ?? raw

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