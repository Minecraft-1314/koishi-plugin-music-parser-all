export interface ParsedMusic {
  type: string
  name: string
  artist: string
  album: string
  cover: string
  musicUrl: string
  level?: string
  size?: string
}

export interface LinkMatch {
  type: string
  url: string
  id: string
}

export interface LinkRule {
  pattern: RegExp
  type: string
}

export interface ApiItem {
  url: string
  label: string
  apiKey?: string
  authHeaderType?: string
  customHeaderName?: string
  fieldMapping?: Record<string, string>
}

export interface CustomPlatformConfig {
  name: string
  apiUrl: string
  apiKey: string
  authHeaderType: string
  customHeaderName: string
  fieldMapping?: Record<string, string>
  proxy?: any
}

export interface PlatformConfig {
  apiUrl: string | null
  dedicatedFirst: boolean
  apiKey: string
  authHeaderType: string
  customHeaderName: string
  fieldMapping?: Record<string, string>
  customProxy?: any
}

export interface ParsedItem {
  text: string
  parsed: ParsedMusic
}
