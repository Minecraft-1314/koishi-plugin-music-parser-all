import type { CustomPlatformConfig, PlatformConfig } from './types'
import { parseFieldMapping } from './utils'

const DEFAULT_DEDICATED_APIS: Record<string, string> = {
  netease: 'https://api.bugpk.com/api/163_music',
  kuwo: 'https://api.bugpk.com/api/kuwo',
  qqmusic: 'https://api.bugpk.com/api/qqmusic',
  qishui: 'https://api.bugpk.com/api/qsmusic',
}

export function normalizeCustomPlatforms(list: any[]): CustomPlatformConfig[] {
  if (!Array.isArray(list)) return []
  return list.map(p => ({
    name: p.name,
    apiUrl: p.apiUrl,
    apiKey: p.apiKey || '',
    authHeaderType: p.authHeaderType || 'Bearer',
    customHeaderName: p.customHeaderName || 'X-API-Key',
    fieldMapping: parseFieldMapping(p.fieldMapping),
    proxy: p.proxy || null,
  }))
}

export class PlatformResolver {
  constructor(private config: any, private customPlatforms: CustomPlatformConfig[]) {}

  resolve(type: string): PlatformConfig {
    if (type.startsWith('custom_')) {
      const name = type.slice(7)
      const custom = this.customPlatforms.find(p => p.name === name)
      if (custom) {
        return {
          apiUrl: custom.apiUrl,
          dedicatedFirst: true,
          apiKey: custom.apiKey || '',
          authHeaderType: custom.authHeaderType,
          customHeaderName: custom.customHeaderName,
          fieldMapping: custom.fieldMapping,
          customProxy: custom.proxy,
        }
      }
      return { apiUrl: null, dedicatedFirst: false, apiKey: '', authHeaderType: 'Bearer', customHeaderName: 'X-API-Key' }
    }

    const custom = this.config.customApis?.find((item: any) => item.platform === type)
    let apiUrl: string | null = DEFAULT_DEDICATED_APIS[type] || null
    let apiKey = ''
    let authHeaderType = 'Bearer'
    let customHeaderName = 'X-API-Key'
    let fieldMapping: Record<string, string> | undefined
    if (custom && custom.apiUrl) {
      apiUrl = custom.apiUrl
      apiKey = custom.apiKey || ''
      authHeaderType = custom.authHeaderType || 'Bearer'
      customHeaderName = custom.customHeaderName || 'X-API-Key'
      fieldMapping = parseFieldMapping(custom.fieldMapping)
    }
    const dedicatedFirst = this.config.platformDedicatedFirst?.[type] ?? false
    if (!fieldMapping) fieldMapping = parseFieldMapping(this.config.globalFieldMapping)
    return { apiUrl, dedicatedFirst, apiKey, authHeaderType, customHeaderName, fieldMapping }
  }
}