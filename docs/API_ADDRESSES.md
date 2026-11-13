# 插件 API 解析地址 (Plugin API Endpoints)

本插件所有解析请求默认发送至 ifphp 提供的解析服务，请求域名固定为 `https://api-new.ifphp.com`，并需在插件配置中填写 `apiKey`。经免费接口清单逐项实测，音乐类接口只有两个：`163_music`（网易云音乐）与 `qishui`（汽水音乐），其余均为视频 / 图片 / 域名类接口，不在本插件解析范围内。

## 认证方式 (Authentication)

`api-new.ifphp.com` 实测支持两种等价的 Key 传递方式，在插件配置中通过 `authMode` 选择：

### Header 模式（默认，`authMode: "header"`）

推荐服务端调用使用，请求地址更干净，也不容易在日志或分享链接中暴露 Key。

```
X-API-Key: <apiKey>
```

- 缺少 Key：返回 `{"code":-1,"error":"API Key不能为空"}`。
- 错误 Key：返回 `{"code":-1,"error":"API Key无效"}`。
- 可通过 `authHeaderType` 把请求头切换为 `Authorization: Bearer <apiKey>`（`Bearer`）或任意自定义头名称（`Custom` + `customHeaderName`）。注意：`api-new.ifphp.com` 本站对 `Authorization: Bearer` 返回「API Key不能为空」，因此 `Bearer` / `Custom` 仅适用于自建或第三方自定义 API，本站请保持默认的 `X-API-Key`。

### Query 模式（`authMode: "query"`）

适合快速验证或无法自定义请求头的客户端，Key 以 `key` 查询参数追加到每次请求：

```
https://api-new.ifphp.com/api/163_music?type=json&id=186016&key=<apiKey>
```

> 自定义 API（`customApis` / `customPlatforms`）可单独配置 `apiKey`、`authMode`、`authHeaderType`、`customHeaderName`，未填写时回落全局 `apiKey`。

## 请求方式 (Request Method)

- 方法：GET
- 请求头：`User-Agent`、`Referer: https://www.baidu.com/`，并合并 `customHeaders` 中配置的自定义头。
- 代理：支持全局 `proxy`，自定义平台可用 `customPlatforms[].proxy` 覆盖。
- 超时：`timeout`（默认 180000 ms）。
- 业务错误码（如「查无此歌曲」「参数错误」）不会重试；网络错误与 HTTP `403 / 408 / 429 / 500 / 502 / 503 / 504` 会按 `retryTimes` 重试，`429 / 403` 使用 6 倍因子指数退避（上限 60 秒）。

## 平台专属 API (Platform Dedicated APIs)

插件按平台内置专属 API，内置平台默认直接请求各自专属地址（`platformDedicatedFirst` 默认全开），不做跨接口降级。

| 平台标识 | 平台 | API 地址 | 主要参数 |
|---------|------|----------|----------|
| `netease` | 网易云音乐 | `https://api-new.ifphp.com/api/163_music` | `type=json` / `playlist` / `album` + `id` 或 `url` |
| `qishui` | 汽水音乐 | `https://api-new.ifphp.com/api/qishui` | `type=music` + `id` 或 `url` |

### 参数构造规则（与源码 `buildParams` 一致）

| 场景 | `type` | 定位参数 | 说明 |
|------|--------|----------|------|
| 网易云歌曲 | `json` | `id`（数字优先）否则 `url` | 链接中的数字 ID 会优先抽取，避免短链解析失败 |
| 网易云歌单 | `playlist` | `id` 否则 `url` | 歌单链接按 `detectKind` 判定为 `playlist` |
| 网易云专辑 | `album` | `id` 否则 `url` | 链接命中 `/album` 时改用 `type=album` |
| 汽水歌曲 | `music` | `id` 否则 `url` | **两者绝不并存**：实测同时传 `id` 与 `url` 会返回「请求参数不正确-iga」 |

### 接口原生支持的能力（实测，供参考）

- `163_music`：`json`（单曲）、`search`（关键词 `s` / `keywords`，`limit` / `offset`）、`song`、`url`、`lyric`、`playlist`、`album`、`text`。响应 `data` 含 `id, via, name, singer, album, pic, url, br, level, label, size, size_label, md5, lyric, tlyric`。`level` 支持 `standard/exhigh/lossless/hires/jyeffect/sky/jymaster`，但免费额度下实测仍降档为 `standard(128000)`。
- `qishui`：`music`（单曲，按 `id` 或分享链接）、`search`（关键词 `s`）、`text`。响应 `data` 含 `id, name, singer, artists[], album, cover, duration_ms, vid, lyric, tlyric, url, level, label, quality_type, br, size, size_label, format, codec, md5, qualities[]`。`type=mv` 实测不可用。

> 歌单 / 专辑接口返回的曲目仅含 `id/name/singer/album/pic/duration_ms`，**不含直链**。开启 `expandPlaylistTracks` 后，插件会按曲目 ID 逐首回灌 `type=json` 获取直链，并用 `trackRequestInterval`（默认 5000 ms）间隔请求以避开限流。

## 请求示例 (Examples)

网易云单曲（Header 模式）：

```
GET https://api-new.ifphp.com/api/163_music?type=json&id=186016
X-API-Key: <你的 API Key>
```

网易云歌单：

```
GET https://api-new.ifphp.com/api/163_music?type=playlist&id=3778678
X-API-Key: <你的 API Key>
```

汽水音乐单曲：

```
GET https://api-new.ifphp.com/api/qishui?type=music&id=7512772704484722704
X-API-Key: <你的 API Key>
```

## 免费额度与限流 (Rate Limit)

免费额度为**每分钟最多 15 次**调用，超限返回：

```
{"code":-1,"error":"免费额度已用尽：当前用户组每分钟最多 15 次，可购买套餐获得额外额度或升级用户组后继续调用"}
```

插件的应对：业务错误码不重试；`429 / 403` 走 6 倍指数退避；歌单逐首展开用 `trackRequestInterval` 拉长间隔。如仍频繁触发，请调大 `trackRequestInterval`、降低 `maxPlaylistTracks` 或升级套餐。

## 调用顺序 (Call Order)

1. 内置平台默认只请求各自的专属 API（`netease` → `163_music`，`qishui` → `qishui`），按 URL 去重后只发一个请求。
2. 自定义平台（`custom_` 前缀）只请求其 `customPlatforms[].apiUrl` 配置的地址。
3. `customApis[].apiUrl` 可覆盖内置平台的专属地址；仍只请求覆盖后的那一个地址。
4. 请求失败时按「网络错误 / 可重试 HTTP 状态」重试，业务码失败直接结束并汇总错误提示。

## 配置覆盖 (Configuration Overrides)

| 配置项 | 说明 |
|--------|------|
| `customApis[].apiUrl` | 按平台覆盖内置专属 API（`platform` 可选值仅 `netease` / `qishui`） |
| `customPlatforms[].apiUrl` | 新增自定义平台及其解析 API |
| `apiKey` / `authMode` / `authHeaderType` / `customHeaderName` | 全局认证密钥与认证方式（Header / Query + 头类型），可被每个平台 / 自定义平台覆盖 |
| `globalFieldMapping` / `customApis[].fieldMapping` / `customPlatforms[].fieldMapping` | 字段映射 JSON，用于适配返回结构不同的自定义 API |
| `platformDedicatedFirst` | 内置平台是否优先使用专属 API（默认全开，关闭仅影响日志标记） |

---

本文档随插件版本更新而更新；当前适用于 v0.1.4。
