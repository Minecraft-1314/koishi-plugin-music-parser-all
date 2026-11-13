import type { AxiosInstance } from 'axios'

export interface ParsedMusic {
  type: string
  name: string
  artist: string
  album: string
  cover: string
  musicUrl: string
  level?: string
  size?: string
  duration?: number
  lyric?: string
  tlyric?: string
  platform?: string
  id?: string
}

export interface PlaylistTrack {
  id: string
  name: string
  artist: string
  album: string
  cover: string
  duration: number
}

export interface PlaylistInfo {
  id: string
  name: string
  cover: string
  creator: string
  trackCount: number
  description: string
  tracks: PlaylistTrack[]
}

export interface ParsedPlaylist {
  type: string
  playlist: PlaylistInfo
}

export interface LinkMatch {
  type: string
  url: string
  id: string
  kind?: 'song' | 'playlist'
}

export interface LinkRule {
  pattern: RegExp
  type: string
  kind?: 'song' | 'playlist'
}

export interface ApiItem {
  url: string
  label: string
  apiKey?: string
  authMode?: 'header' | 'query'
  authHeaderType?: string
  customHeaderName?: string
  fieldMapping?: Record<string, string>
}

export interface CustomPlatformConfig {
  name: string
  apiUrl: string
  apiKey: string
  authMode: string
  authHeaderType: string
  customHeaderName: string
  fieldMapping?: Record<string, string>
  proxy?: any
}

export interface PlatformConfig {
  apiUrl: string | null
  dedicatedFirst: boolean
  apiKey: string
  authMode: string
  authHeaderType: string
  customHeaderName: string
  fieldMapping?: Record<string, string>
  customProxy?: any
}

export interface ParsedItem {
  text: string
  parsed: ParsedMusic
  order?: number
}

export interface ParseResult {
  success: boolean
  msg?: string
  url: string
  kind: 'song' | 'playlist'
  data?: { text: string; parsed: ParsedMusic }
  playlist?: ParsedPlaylist
}

export type { AxiosInstance }
