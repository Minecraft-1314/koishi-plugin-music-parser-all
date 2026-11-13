import type { CustomPlatformConfig, PlatformConfig } from './types'
import { parseFieldMapping } from './utils'

const API_BASE = 'https://api-new.ifphp.com'

export const DEFAULT_DEDICATED_APIS: Record<string, string> = {
  netease: `${API_BASE}/api/163_music`,
  qishui: `${API_BASE}/api/qishui`,
}

export const DEFAULT_GLOBAL_API_URL = `${API_BASE}/api/163_music`

export function normalizeCustomPlatforms(list: any[]): CustomPlatformConfig[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(p => p && p.name && p.apiUrl)
    .map(p => ({
      name: p.name,
      apiUrl: p.apiUrl,
      apiKey: p.apiKey || '',
      authMode: p.authMode === 'query' ? 'query' : 'header',
      authHeaderType: p.authHeaderType || 'X-API-Key',
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
          apiKey: custom.apiKey || this.config?.apiKey || '',
          authMode: custom.authMode || 'header',
          authHeaderType: custom.authHeaderType || 'X-API-Key',
          customHeaderName: custom.customHeaderName || 'X-API-Key',
          fieldMapping: custom.fieldMapping,
          customProxy: custom.proxy,
        }
      }
      return {
        apiUrl: null,
        dedicatedFirst: false,
        apiKey: this.config?.apiKey || '',
        authMode: this.config?.authMode === 'query' ? 'query' : 'header',
        authHeaderType: this.config?.authHeaderType || 'X-API-Key',
        customHeaderName: this.config?.customHeaderName || 'X-API-Key',
      }
    }

    const custom = this.config?.customApis?.find((item: any) => item && item.platform === type)
    let apiUrl: string | null = DEFAULT_DEDICATED_APIS[type] || null
    let apiKey = this.config?.apiKey || ''
    let authMode = this.config?.authMode === 'query' ? 'query' : 'header'
    let authHeaderType = this.config?.authHeaderType || 'X-API-Key'
    let customHeaderName = this.config?.customHeaderName || 'X-API-Key'
    let fieldMapping = parseFieldMapping(this.config?.globalFieldMapping)

    if (custom && custom.apiUrl) {
      apiUrl = custom.apiUrl
      if (custom.apiKey) apiKey = custom.apiKey
      if (custom.authMode) authMode = custom.authMode === 'query' ? 'query' : 'header'
      if (custom.authHeaderType) authHeaderType = custom.authHeaderType
      if (custom.customHeaderName) customHeaderName = custom.customHeaderName
      const parsed = parseFieldMapping(custom.fieldMapping)
      if (parsed) fieldMapping = parsed
    }

    const dedicatedFirst = this.config?.platformDedicatedFirst?.[type] ?? true
    return { apiUrl, dedicatedFirst, apiKey, authMode, authHeaderType, customHeaderName, fieldMapping }
  }
}
