import type { ParsedMusic, ParsedPlaylist, PlaylistInfo, PlaylistTrack } from './types'
import { getFirst, getNestedValue, normalizeUrl, safeJsonParse } from './utils'

const NUMERIC_OR_ZERO = (value: any): boolean => value === undefined || value === null || value === '' || value === 0 || value === '0'

function toText(value: any): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const names = value
      .map(item => (item && typeof item === 'object' ? item.name || item.title || '' : item))
      .filter(Boolean)
      .map(String)
    return names.join(' / ')
  }
  if (typeof value === 'object') return String(value.name || value.title || value.nickname || '')
  return String(value)
}

function toNumber(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function extractArtists(raw: any): string {
  const artists = raw?.artists
  if (Array.isArray(artists) && artists.length) {
    const names = artists.map(a => (a && typeof a === 'object' ? a.name : a)).filter(Boolean).map(String)
    if (names.length) return names.join(' / ')
  }
  const ar = raw?.ar
  if (Array.isArray(ar) && ar.length) {
    const names = ar.map(a => (a && typeof a === 'object' ? a.name : a)).filter(Boolean).map(String)
    if (names.length) return names.join(' / ')
  }
  return ''
}

function pickSizeLabel(value: any, size: any): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && value > 0) return `${value}B`
  if (typeof size === 'string' && size.trim() && !/^\d+$/.test(size.trim())) return size.trim()
  return ''
}

function pickLevel(raw: any): string {
  const label = toText(raw?.label)
  if (label) return label
  const level = toText(raw?.level)
  if (level) return level
  const quality = toText(raw?.quality_type)
  if (quality) return quality
  return ''
}

export function parseApiResponse(raw: any, type: string, fieldMapping?: Record<string, string>): ParsedMusic {
  let payload = safeJsonParse(raw)
  if (typeof payload === 'string') payload = safeJsonParse(payload)
  let data: any = payload?.data ?? payload ?? {}
  if (Array.isArray(data)) data = data[0] ?? {}
  if (typeof data === 'string') data = safeJsonParse(data)
  if (!data || typeof data !== 'object') data = {}

  const mapField = (name: string, fallback: () => any): any => {
    if (fieldMapping && typeof fieldMapping[name] === 'string') {
      const value = getNestedValue(payload, fieldMapping[name])
      if (value !== undefined && value !== null && value !== '') return value
    }
    return fallback()
  }

  const name = toText(mapField('name', () => getFirst(data, ['name', 'title', 'songName', 'musicName'], '')))
  const artist = toText(mapField('artist', () => extractArtists(data) || getFirst(data, ['singer', 'artist', 'ar_name', 'artistsname', 'author'], '')))
  const album = toText(mapField('album', () => getFirst(data, ['album', 'al_name', 'albumname', 'al.name'], '')))
  const cover = normalizeUrl(mapField('cover', () => getFirst(data, ['pic', 'cover', 'album_pic', 'artistsmedium_avatar_url', 'al.pic'], '')))
  const musicUrl = normalizeUrl(mapField('musicUrl', () => getFirst(data, ['url', 'music_url', 'play_url', 'audio_url', 'src'], '')))
  const level = toText(mapField('level', () => pickLevel(data)))
  const size = toText(mapField('size', () => pickSizeLabel(data?.size_label ?? data?.sizeLabel, data?.size)))
  const duration = toNumber(mapField('duration', () => getFirst(data, ['duration_ms', 'full_duration_ms', 'duration', 'interval'], 0)))
  const lyric = toText(mapField('lyric', () => getFirst(data, ['lyric', 'lrc', 'lyrics'], '')))
  const tlyric = toText(mapField('tlyric', () => getFirst(data, ['tlyric', 'translation', 'tlyric_lrc'], '')))
  const platform = toText(getFirst(data, ['platform', 'via'], ''))

  return {
    type,
    name,
    artist,
    album,
    cover,
    musicUrl,
    level,
    size,
    duration,
    lyric,
    tlyric,
    platform,
    id: toText(getFirst(data, ['id'], '')),
  }
}

export function hasPlayableMusic(parsed: ParsedMusic): boolean {
  return Boolean(parsed.musicUrl)
}

function parseTracks(list: any[]): PlaylistTrack[] {
  if (!Array.isArray(list)) return []
  const tracks: PlaylistTrack[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const id = toText(item.id)
    if (!id) continue
    tracks.push({
      id,
      name: toText(getFirst(item, ['name', 'title'], '')),
      artist: toText(extractArtists(item) || getFirst(item, ['singer', 'artist', 'ar_name'], '')),
      album: toText(getFirst(item, ['album', 'al_name', 'albumname'], '')),
      cover: normalizeUrl(getFirst(item, ['pic', 'cover', 'album_pic', 'al.pic'], '')),
      duration: toNumber(getFirst(item, ['duration_ms', 'duration', 'interval'], 0)),
    })
  }
  return tracks
}

export function parsePlaylistResponse(raw: any, type: string): ParsedPlaylist | null {
  let payload = safeJsonParse(raw)
  if (typeof payload === 'string') payload = safeJsonParse(payload)
  let data: any = payload?.data ?? payload ?? {}
  if (Array.isArray(data)) data = data[0] ?? {}
  if (typeof data === 'string') data = safeJsonParse(data)
  if (!data || typeof data !== 'object') data = {}

  const tracks = parseTracks(data?.tracks || data?.songs || data?.list || [])
  const info: PlaylistInfo = {
    id: toText(getFirst(data, ['id'], '')),
    name: toText(getFirst(data, ['name', 'title'], '')),
    cover: normalizeUrl(getFirst(data, ['cover', 'pic', 'coverImgUrl'], '')),
    creator: toText(getFirst(data, ['creator', 'creator.nickname', 'userName'], '')),
    trackCount: toNumber(getFirst(data, ['track_count', 'trackCount', 'total', 'size'], 0)) || tracks.length,
    description: toText(getFirst(data, ['description', 'desc'], '')),
    tracks,
  }
  if (!info.id && !info.name && tracks.length === 0) return null
  return { type, playlist: info }
}

export function isSuccessResponse(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false
  const code = raw.code
  if (code === undefined) return Boolean(raw.data)
  if (code === 200 || code === 0) return true
  if (typeof code === 'string') {
    const normalized = code.trim().toLowerCase()
    if (normalized === '200' || normalized === '0' || normalized === 'success' || normalized === 'ok') return true
  }
  return false
}

export function getResponseMessage(raw: any): string {
  if (!raw || typeof raw !== 'object') return ''
  return toText(getFirst(raw, ['error', 'message', 'msg', 'errmsg', 'err_msg', 'error_msg', 'description', 'detail'], ''))
}

export function describeParsed(parsed: ParsedMusic): string {
  return `${parsed.name || '未知歌曲'} - ${parsed.artist || '未知歌手'}${parsed.level ? ` [${parsed.level}]` : ''}`
}

export { NUMERIC_OR_ZERO }
