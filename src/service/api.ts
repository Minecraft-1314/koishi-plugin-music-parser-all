import type { AxiosRequestConfig } from 'axios'
import type { ParsedMusic, PlatformConfig } from '../types'
import type { SimpleLRUCache } from '../cache'
import type { DebugLogger } from '../utils'
import { buildAuthHeaders, delay, getErrorMessage } from '../utils'
import { getResponseMessage, isSuccessResponse, parseApiResponse, parsePlaylistResponse } from '../parser'
import type { ParsedPlaylist } from '../types'

export interface ApiClientOptions {
  http: any
  config: any
  dedupEnabled: boolean
  cacheTTL: number
  urlCache: SimpleLRUCache<ParsedMusic>
  playlistCache?: SimpleLRUCache<ParsedPlaylist>
  debug: DebugLogger
}

interface ApiRequest {
  url: string
  label: string
  apiKey: string
  authMode: string
  authHeaderType: string
  customHeaderName: string
  fieldMapping?: Record<string, string>
  type?: string
}

const RETRYABLE_STATUS = new Set([403, 408, 429, 500, 502, 503, 504])

function isRetryableError(error: any): boolean {
  if (!error) return false
  if (error.__noRetry) return false
  const status = error?.response?.status
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status)
  if (!error.response) return true
  return false
}

function backoffDelay(base: number, attempt: number, error: any): number {
  const status = error?.response?.status
  const factor = status === 429 || status === 403 ? 6 : 1
  return Math.min(base * factor * Math.pow(2, attempt), 60000)
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  private buildRequests(type: string, kind: 'song' | 'playlist', platformConf: PlatformConfig): ApiRequest[] {
    const { apiUrl, dedicatedFirst, apiKey, authMode, authHeaderType, customHeaderName, fieldMapping } = platformConf
    const list: ApiRequest[] = []
    const push = (url: string | null, label: string, apiType?: string) => {
      if (!url) return
      if (list.some(item => item.url === url)) return
      list.push({
        url,
        label,
        apiKey: apiKey || '',
        authMode: authMode || 'header',
        authHeaderType: authHeaderType || 'X-API-Key',
        customHeaderName: customHeaderName || 'X-API-Key',
        fieldMapping,
        type: apiType,
      })
    }
    if (apiUrl) {
      push(apiUrl, dedicatedFirst ? `专属API(${type})` : `默认API(${type})`, type)
    }
    return list
  }

  private buildParams(api: ApiRequest, url: string, id: string, kind: 'song' | 'playlist'): Record<string, string> {
    const params: Record<string, string> = {}
    const apiType = api.type || 'netease'
    if (apiType === 'qishui') {
      params.type = 'music'
      if (id) params.id = id
      else if (url) params.url = url
    } else {
      const isAlbum = /\/album\b|\/album\?/i.test(url)
      params.type = kind === 'playlist' ? (isAlbum ? 'album' : 'playlist') : 'json'
      const numericId = /^\d+$/.test(id) ? id : ''
      if (numericId) params.id = numericId
      else if (url) params.url = url
      else if (id) params.id = id
    }
    if (api.authMode === 'query' && api.apiKey) params.key = api.apiKey
    return params
  }

  private async request(api: ApiRequest, params: Record<string, string>): Promise<any> {
    const { config, http, debug } = this.opts
    const headers: Record<string, string> = {
      'User-Agent': config.userAgent,
      'Referer': 'https://www.baidu.com/',
    }
    if (api.apiKey && api.authMode !== 'query') {
      Object.assign(headers, buildAuthHeaders(api.apiKey, api.authHeaderType, api.customHeaderName))
    }
    const proxy = config.proxy
    const requestConfig: AxiosRequestConfig = {
      params,
      timeout: config.timeout,
      headers,
      proxy: proxy?.enabled && proxy.host ? {
        protocol: proxy.protocol || 'http',
        host: proxy.host,
        port: proxy.port || 7890,
        auth: proxy.auth?.username ? { username: proxy.auth.username, password: proxy.auth.password || '' } : undefined,
      } : undefined,
    }
    try {
      const res = await http.get(api.url, requestConfig)
      return res?.data
    } catch (error: any) {
      const data = error?.response?.data
      if (data && typeof data === 'object') {
        const wrapped: any = new Error(getResponseMessage(data) || `HTTP ${error.response?.status ?? 'error'}`)
        wrapped.response = error.response
        wrapped.__apiData = data
        throw wrapped
      }
      const wrapped: any = new Error(getErrorMessage(error))
      wrapped.response = error?.response
      throw wrapped
    }
  }

  async fetch(url: string, type: string, matchId: string, platformConf: PlatformConfig): Promise<ParsedMusic> {
    const { config, dedupEnabled, urlCache, debug } = this.opts
    const cacheKey = `${type}::${url}::${matchId}`
    if (dedupEnabled) {
      const cached = urlCache.get(cacheKey)
      if (cached) return cached
    }

    const apiList = this.buildRequests(type, 'song', platformConf)
    let lastError: Error | null = null

    for (const api of apiList) {
      const params = this.buildParams(api, url, matchId, 'song')
      const retryTimes = Math.max(0, config.retryTimes ?? 3)
      for (let attempt = 0; attempt <= retryTimes; attempt++) {
        try {
          const rawData = await this.request(api, params)
          if (isSuccessResponse(rawData)) {
            const parsed = parseApiResponse(rawData, type, api.fieldMapping)
            if (dedupEnabled) urlCache.set(cacheKey, parsed)
            return parsed
          }
          const message = getResponseMessage(rawData) || `API返回错误码: ${rawData?.code}`
          const error: any = new Error(message)
          error.__apiData = rawData
          error.__noRetry = true
          throw error
        } catch (error: any) {
          lastError = error instanceof Error ? error : new Error(String(error))
          const apiData = error?.__apiData
          const detail = apiData ? ` (${getResponseMessage(apiData) || JSON.stringify(apiData).slice(0, 120)})` : ''
          debug.log('ERROR', `${api.label} attempt ${attempt + 1} failed: ${lastError.message}${detail}`)
          const canRetry = attempt < retryTimes && !error?.__noRetry && isRetryableError(error)
          if (canRetry) {
            await delay(backoffDelay(config.retryInterval ?? 1000, attempt, error))
            continue
          }
          break
        }
      }
      debug.log('WARN', `${api.label} all attempts failed`)
    }
    throw lastError || new Error('所有API请求全部失败')
  }

  async fetchPlaylist(url: string, type: string, matchId: string, platformConf: PlatformConfig): Promise<ParsedPlaylist | null> {
    const { config, dedupEnabled, playlistCache, debug } = this.opts
    const cacheKey = `playlist::${type}::${url}::${matchId}`
    if (dedupEnabled && playlistCache) {
      const cached = playlistCache.get(cacheKey)
      if (cached) return cached
    }
    const apiList = this.buildRequests(type, 'playlist', platformConf)
    let lastError: Error | null = null

    for (const api of apiList) {
      const params = this.buildParams(api, url, matchId, 'playlist')
      const retryTimes = Math.max(0, config.retryTimes ?? 3)
      for (let attempt = 0; attempt <= retryTimes; attempt++) {
        try {
          const rawData = await this.request(api, params)
          if (isSuccessResponse(rawData)) {
            const playlist = parsePlaylistResponse(rawData, type)
            if (!playlist) throw new Error('歌单数据为空')
            if (dedupEnabled && playlistCache) playlistCache.set(cacheKey, playlist)
            return playlist
          }
          const message = getResponseMessage(rawData) || `API返回错误码: ${rawData?.code}`
          const error: any = new Error(message)
          error.__apiData = rawData
          error.__noRetry = true
          throw error
        } catch (error: any) {
          lastError = error instanceof Error ? error : new Error(String(error))
          debug.log('ERROR', `${api.label} playlist attempt ${attempt + 1} failed: ${lastError.message}`)
          const canRetry = attempt < retryTimes && !error?.__noRetry && isRetryableError(error)
          if (canRetry) {
            await delay(backoffDelay(config.retryInterval ?? 1000, attempt, error))
            continue
          }
          break
        }
      }
    }
    debug.log('WARN', `playlist all attempts failed: ${lastError?.message}`)
    return null
  }

  async fetchTracksBatch(type: string, platformConf: PlatformConfig, ids: string[]): Promise<ParsedMusic[]> {
    const { config, debug } = this.opts
    const apiList = this.buildRequests(type, 'song', platformConf)
    const results: ParsedMusic[] = []
    const interval = Math.max(0, config.trackRequestInterval ?? 5000)
    let first = true
    for (const id of ids) {
      if (!first && interval > 0) await delay(interval)
      first = false
      let done = false
      for (const api of apiList) {
        const params = this.buildParams(api, '', id, 'song')
        const retryTimes = Math.max(0, config.retryTimes ?? 3)
        for (let attempt = 0; attempt <= retryTimes; attempt++) {
          try {
            const rawData = await this.request(api, params)
            if (isSuccessResponse(rawData)) {
              const parsed = parseApiResponse(rawData, type, api.fieldMapping)
              results.push(parsed)
              done = true
              break
            }
            const error: any = new Error(getResponseMessage(rawData) || `API返回错误码: ${rawData?.code}`)
            error.__apiData = rawData
            error.__noRetry = true
            throw error
          } catch (error: any) {
            debug.log('ERROR', `${api.label} batch ${id} attempt ${attempt + 1} failed: ${getErrorMessage(error)}`)
            const canRetry = attempt < retryTimes && !error?.__noRetry && isRetryableError(error)
            if (canRetry) {
              await delay(backoffDelay(config.retryInterval ?? 1000, attempt, error))
              continue
            }
            break
          }
        }
        if (done) break
      }
    }
    return results
  }
}
