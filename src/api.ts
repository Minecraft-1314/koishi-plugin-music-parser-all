import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { ApiItem, ParsedMusic, PlatformConfig } from './types'
import type { SimpleLRUCache } from './cache'
import type { DebugLogger } from './utils'
import { buildAuthHeaders, cleanUrl, delay, getErrorMessage } from './utils'
import { parseApiResponse } from './parser'

export interface ApiClientOptions {
  http: AxiosInstance
  config: any
  dedupEnabled: boolean
  cacheTTL: number
  urlCache: SimpleLRUCache<ParsedMusic>
  debug: DebugLogger
}

export class ApiClient {
  private backupAggregateUrl: string

  constructor(private opts: ApiClientOptions) {
    this.backupAggregateUrl = opts.config.backupApiUrl || 'https://api.bugpk.com/api/music'
  }

  async fetch(url: string, type: string, matchId: string, platformConf: PlatformConfig): Promise<ParsedMusic> {
    const { config, http, dedupEnabled, cacheTTL, urlCache, debug } = this.opts
    const cacheKey = url
    if (dedupEnabled) {
      const cached = urlCache.get(cacheKey)
      if (cached) return cached
    }

    const { apiUrl, dedicatedFirst, apiKey, authHeaderType, customHeaderName, customProxy, fieldMapping } = platformConf

    const backupApis: ApiItem[] = []
    if (type === 'netease' || type === 'qqmusic') {
      backupApis.push({ url: this.backupAggregateUrl, label: '聚合备用API', fieldMapping })
    }

    const apiList: ApiItem[] = []
    if (apiUrl) {
      apiList.push({
        url: apiUrl,
        label: dedicatedFirst ? `专属API(${type})` : `默认API(${type})`,
        apiKey,
        authHeaderType,
        customHeaderName,
        fieldMapping,
      })
    }
    apiList.push(...backupApis)

    let lastError: Error | null = null
    for (const api of apiList) {
      for (let attempt = 0; attempt <= config.retryTimes; attempt++) {
        try {
          const headers: Record<string, string> = {
            'User-Agent': config.userAgent,
            'Referer': 'https://www.baidu.com/',
          }
          if (api.apiKey) {
            Object.assign(headers, buildAuthHeaders(api.apiKey, api.authHeaderType || 'Bearer', api.customHeaderName || 'X-API-Key'))
          }

          const isAggregate = api.url === this.backupAggregateUrl
          const params: Record<string, string> = isAggregate
            ? { id: matchId, media: type === 'netease' ? 'netease' : 'tencent', type: 'song' }
            : { url: cleanUrl(url) }
          if (!isAggregate && type === 'netease' && api.url.includes('163_music')) {
            params.type = 'json'
          }

          const proxyToUse = customProxy && customProxy.enabled ? customProxy : (config.proxy?.enabled ? config.proxy : undefined)
          const requestConfig: AxiosRequestConfig = {
            params,
            timeout: config.timeout,
            headers,
            proxy: proxyToUse && proxyToUse.host ? {
              protocol: proxyToUse.protocol || 'http',
              host: proxyToUse.host,
              port: proxyToUse.port || 7890,
              auth: proxyToUse.auth?.username ? { username: proxyToUse.auth.username, password: proxyToUse.auth.password || '' } : undefined,
            } : undefined,
          }

          const res = await http.get(api.url, requestConfig)
          const rawData = res.data
          if (rawData && (rawData.code === 200 || rawData.code === 0 || (isAggregate && rawData.url))) {
            const parsed = parseApiResponse(rawData, type, api.fieldMapping)
            if (dedupEnabled) urlCache.set(cacheKey, parsed)
            return parsed
          }
          throw new Error(rawData?.msg || `API返回错误码: ${rawData?.code}`)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          debug.log('ERROR', `${api.label} attempt ${attempt + 1} failed: ${lastError.message}`)
          if (attempt < config.retryTimes) {
            await delay(config.retryInterval)
            continue
          }
          break
        }
      }
      debug.log('WARN', `${api.label} all retries failed`)
    }
    throw lastError || new Error('所有API请求全部失败')
  }
}