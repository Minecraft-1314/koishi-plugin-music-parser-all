import type { ApiClient } from './api'
import type { ParsedMusic, PlatformConfig } from '../types'
import { parseApiResponse } from '../parser'
import { isSuccessResponse, getResponseMessage } from '../parser'
import { getErrorMessage } from '../utils'

export interface SingleResult {
  success: boolean
  url: string
  data?: { text: string; parsed: ParsedMusic }
  msg?: string
}

export async function processSingleUrl(
  http: any,
  apiClient: ApiClient,
  url: string,
  type: string,
  matchId: string,
  platformConf: PlatformConfig,
  buildText: (parsed: ParsedMusic, index: number, total: number) => string,
): Promise<SingleResult> {
  try {
    const parsed = await apiClient.fetch(url, type, matchId, platformConf)
    const text = buildText(parsed, 0, 1)
    return { success: true, url, data: { text, parsed } }
  } catch (error: any) {
    const msg = getErrorMessage(error)
    return { success: false, url, msg }
  }
}

export async function processTracks(
  apiClient: ApiClient,
  type: string,
  platformConf: PlatformConfig,
  ids: string[],
): Promise<{ results: ParsedMusic[]; failedIds: string[] }> {
  const results = await apiClient.fetchTracksBatch(type, platformConf, ids)
  const okIds = new Set(results.map(r => String(r?.id || '')))
  const failedIds = ids.filter(id => !okIds.has(id))
  return { results, failedIds }
}

export { isSuccessResponse, getResponseMessage, parseApiResponse }
