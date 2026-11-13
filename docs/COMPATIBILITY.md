# koishi-plugin-music-parser-all API 兼容性说明

本文档描述插件在解析第三方 API 返回数据时支持的状态码判断、字段别名、数据结构及默认提取逻辑。  
如您的自定义 API 返回格式与默认不同，可通过 `globalFieldMapping`、`customApis[].fieldMapping` 或 `customPlatforms[].fieldMapping` 覆盖，或参考本文档调整返回结构。

本文档随插件版本更新而更新，字段别名以 `src/parser.ts`、`src/utils.ts` 源码为准。

---

## 1. 顶层响应字段

插件会从 HTTP 响应 JSON 的顶层字段中识别状态码、错误信息，并从 `data` 中提取音乐数据。

### 1.1 状态码字段与成功值

插件读取顶层 `code` 字段判断业务是否成功（`isSuccessResponse`）：

- `code === undefined`：仅当顶层存在 `data` 且为真值时视为成功（兼容无状态码、直接返回 `data` 的接口）。
- 以下任一值视为成功：`200`、`0`、`"200"`、`"0"`、`"success"`、`"ok"`（字符串比较时忽略大小写与首尾空格）。
- 其余值（如 `404`、`-1`、`"fail"`）视为失败，取错误信息作为提示发送给用户。

> 顶层状态码字段只识别 `code` 一个名字（与视频解析插件的多字段优先级不同）；若自定义 API 用 `status` / `errcode` 等作状态码且不带 `code`，由于 `code === undefined` 时会回退判断 `data` 是否存在，仍可正常解析成功响应。

### 1.2 错误信息字段（优先级从高到低）

失败时，`getResponseMessage` 依次取第一个非空字段作为错误提示：

- `error`
- `message`
- `msg`
- `errmsg`
- `err_msg`
- `error_msg`
- `description`
- `detail`

`api-new.ifphp.com` 的实测失败响应示例：`{"code":-1,"error":"API Key不能为空"}`、`{"code":404,"msg":"查无此歌曲/歌单/专辑-iga"}`、`{"code":-1,"error":"请求参数不正确-iga"}`。

### 1.3 数据对象解包（`data`）

`parseApiResponse` / `parsePlaylistResponse` 对响应做多层兼容解包（`safeJsonParse`）：

1. 若整个响应是字符串，先尝试 `JSON.parse`（失败则保留原串）。
2. 取 `payload.data`，若不存在则回退到顶层 `payload` 本身。
3. 若 `data` 是数组，取第一个元素 `[0]`。
4. 若 `data` 是字符串，再尝试 `JSON.parse`；解析后非对象则置为空对象 `{}`。
5. `fieldMapping` 的路径取值基于**整个响应 `payload`**（不是仅 `data`），因此映射路径习惯写 `data.name` 这种完整路径。

> `safeJsonParse` 语义：输入是字符串时尝试 `JSON.parse`，解析失败返回原字符串；输入非字符串时原样返回。这保证了「响应体本身就是 JSON 字符串」和「`data` 字段是 JSON 字符串」两种情况都能兼容。

---

## 2. 核心数据字段别名

插件通过 `mapField` 提取单曲字段。优先级为：

**`fieldMapping` 自定义映射 > 基于 `data` 的默认别名列表（按路径顺序取首个非空值） > 特殊加工函数 > 回退空值。**

`fieldMapping` 未命中（路径不存在 / 值为空）时自动回落到默认别名。

| 目标字段 | 默认别名路径（按优先级） | 特殊加工 |
|---------|--------------------------|----------|
| `name` 歌曲名 | `name`、`title`、`songName`、`musicName` | `toText` 归一化 |
| `artist` 歌手 | `singer`、`artist`、`ar_name`、`artistsname`、`author` | 先尝试 `artists[]` / `ar[]` 取 `name` 并用 ` / ` 连接 |
| `album` 专辑 | `album`、`al_name`、`albumname`、`al.name` | `toText` |
| `cover` 封面 | `pic`、`cover`、`album_pic`、`artistsmedium_avatar_url`、`al.pic` | `normalizeUrl` |
| `musicUrl` 直链 | `url`、`music_url`、`play_url`、`audio_url`、`src` | `normalizeUrl` |
| `level` 音质 | `label` > `level` > `quality_type` | `pickLevel`：优先展示中文标签（如「标准音质」） |
| `size` 文件大小 | `size_label` / `sizeLabel` | `pickSizeLabel`：字符串直出，纯数字补 `B`，否则回落 `size` 里的非纯数字文本 |
| `duration` 时长 | `duration_ms`、`full_duration_ms`、`duration`、`interval` | `toNumber`（毫秒数值） |
| `lyric` 歌词 | `lyric`、`lrc`、`lyrics` | `toText` |
| `tlyric` 翻译歌词 | `tlyric`、`translation`、`tlyric_lrc` | `toText` |
| `platform` 平台标识 | `platform`、`via` | `toText` |
| `id` 曲目 ID | `id` | `toText` |

> 汽水音乐接口实测字段为 `name / singer / album / cover / level / label / size_label / duration_ms / url`；网易云接口为 `name / singer / album / pic / level / label / size_label / url`。均落在默认别名内，无需额外映射即可解析。旧版 `api.bugpk.com` 返回的 `ar_name / al_name` 等扁平字段也在别名表中，便于平滑迁移。

### 2.1 文本值归一化（`toText`）

- `undefined` / `null` → 空串。
- 字符串 → `trim()`。
- 数字 → 转字符串。
- 数组 → 取每项的 `name` / `title`（对象）或元素本身，过滤空值后用 ` / ` 连接。
- 对象 → 取 `name` / `title` / `nickname`。

### 2.2 URL 规范化（`normalizeUrl`）

用于 `cover` 与 `musicUrl`：

- 字符串：以 `//` 开头补 `https:`；已是 `http(s)://` 原样保留；形如 `example.com/xxx` 的裸域名补 `https://`；其余原样返回。
- 数组：取第一个规范化后非空的 URL。
- 对象：依次尝试 `.url`、`.src`。

---

## 3. 歌单 / 专辑字段

歌单、专辑链接由 `detectKind` 判定为 `playlist`，走 `parsePlaylistResponse`。

### 3.1 歌单信息（`PlaylistInfo`）

| 目标字段 | 默认别名路径 |
|---------|--------------|
| `id` | `id` |
| `name` | `name`、`title` |
| `cover` | `cover`、`pic`、`coverImgUrl`（经 `normalizeUrl`） |
| `creator` | `creator`、`creator.nickname`、`userName`（对象走 `toText` 取 `nickname`） |
| `trackCount` | `track_count`、`trackCount`、`total`、`size`；取不到时用 `tracks.length` |
| `description` | `description`、`desc` |
| `tracks` | `data.tracks`、`data.songs`、`data.list` 中第一个数组 |

歌单信息为空且曲目列表为空时返回 `null`（视为解析失败）。

### 3.2 曲目条目（`PlaylistTrack`）

| 目标字段 | 默认别名路径 |
|---------|--------------|
| `id` | `id`（无 ID 的条目会被丢弃） |
| `name` | `name`、`title` |
| `artist` | 先 `artists[]` / `ar[]`，否则 `singer`、`artist`、`ar_name` |
| `album` | `album`、`al_name`、`albumname` |
| `cover` | `pic`、`cover`、`album_pic`、`al.pic`（经 `normalizeUrl`） |
| `duration` | `duration_ms`、`duration`、`interval`（毫秒） |

> 网易云 `type=playlist` / `type=album` 的曲目实测只含 `id/name/singer/album/pic/duration_ms`，不含直链。需要逐首直链时开启 `expandPlaylistTracks`，插件会用曲目 `id` 调 `type=json` 回灌并按 `trackRequestInterval` 间隔请求。

---

## 4. `fieldMapping` 字段映射

当自定义 API 的返回结构与默认别名不同时，用 JSON 指定每个目标字段的取值路径。路径基于**整个响应对象**，用点号访问嵌套（`getNestedValue`），例如 `data.song.name`。

### 4.1 可映射的目标字段

`name`、`artist`、`album`、`cover`、`musicUrl`、`level`、`size`、`duration`、`lyric`、`tlyric`。

### 4.2 内置默认映射（`globalFieldMapping`）

新版 `api-new.ifphp.com` 的默认响应即可直接解析，插件仍保留如下默认映射以兼容同结构数据：

```json
{
  "name": "data.name",
  "artist": "data.singer",
  "album": "data.album",
  "cover": "data.pic",
  "musicUrl": "data.url",
  "level": "data.label",
  "size": "data.size_label"
}
```

### 4.3 自定义示例

假设第三方 API 返回：

```json
{
  "code": 200,
  "result": {
    "song": { "title": "晴天", "singerName": "周杰伦", "coverUrl": "//p1.music.com/a.jpg" },
    "audio": "https://cdn.example.com/a.mp3",
    "quality": "无损"
  }
}
```

可配置：

```json
{
  "name": "result.song.title",
  "artist": "result.song.singerName",
  "cover": "result.song.coverUrl",
  "musicUrl": "result.audio",
  "level": "result.quality"
}
```

`cover` 取出的 `//p1.music.com/a.jpg` 会经 `normalizeUrl` 补成 `https://p1.music.com/a.jpg`。

### 4.4 解析与校验规则（`parseFieldMapping`）

- 接受对象或 JSON 字符串；字符串会先 `JSON.parse`，失败返回 `undefined`。
- 必须是「非空对象」且**所有值都是字符串**，否则整体返回 `undefined`（回落到默认别名）。
- 字符串 `'{}'` 或空串视为「未配置」。
- 映射路径未命中 / 值为空时，单个字段自动回落到该字段的默认别名列表。

---

## 5. 错误处理与重试兼容

`src/service/api.ts` 把 axios 异常统一包装为 `Error`：

- 若 `error.response.data` 是对象，从中用 `getResponseMessage` 提取错误文案作为 `Error.message`，并挂 `__apiData`。
- 业务码失败（`isSuccessResponse` 为 false）会挂 `__noRetry = true`，**不重试**。
- 可重试条件（`isRetryableError`）：无 `__noRetry` 且「无 response（网络错误）」或 HTTP 状态属于 `403 / 408 / 429 / 500 / 502 / 503 / 504`。
- 退避（`backoffDelay`）：`base × factor × 2^attempt`，`429 / 403` 时 `factor = 6`，其余为 `1`，上限 `60000` ms。
- 所有接口 / 重试都失败后抛出最后一次错误，`flush` 汇总后按 `parseErrorPrefix` + `parseErrorItemFormat` 发送错误提示。

---

## 6. 消息格式变量

`unifiedMessageFormat` 支持以下变量（`generateFormattedText`）：`${name}`、`${artist}`、`${album}`、`${cover}`、`${music_url}`、`${level}`、`${size}`、`${duration}`。

- 某一行中所有变量都为空或为 `0` 时，整行自动隐藏。
- `duration` 由毫秒经 `formatDuration` 格式化为 `m:ss`。
- 逐首展开或批量解析（`total > 1`）时自动加 `【i/total】` 前缀。
- 未定义的变量原样保留。

---

## 7. 兼容性优先级总览

```
fieldMapping 自定义映射
        ↓ 未命中则回落
data 内默认别名路径（按列表顺序取首个非空）
        ↓ 特殊加工
toText / extractArtists / normalizeUrl / pickLevel / pickSizeLabel / toNumber
        ↓
回退空值（消息格式中对应行自动隐藏）
```

此设计让插件既能开箱即用解析 `api-new.ifphp.com` 的 `163_music` / `qishui` 接口，也能通过 `fieldMapping` 兼容旧 `api.bugpk.com` 扁平结构及任意自定义 API。

本文档随插件版本更新而更新；当前适用于 v0.1.4。
