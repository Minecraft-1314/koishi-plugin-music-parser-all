# 链接匹配规则 (Link Matching Rules)

本文档列出插件内置的链接识别正则，源码位于 `src/link-rules.ts`。所有规则使用 `g` + `i` 标志（全局、忽略大小写），同时支持 HTTP / HTTPS。

> 说明：正则中的 `\s` 表示空白字符，`[^\s'"]*` 用于「吃到」链接尾部但排除引号，避免把消息里的引号、中文引号等一并吞入。短链域名后允许任意子路径。

---

## 1. 网易云音乐（`netease`）

### 1.1 单曲链接（`kind: song`）

```
https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?song\?id=(\d{3,})(?:[^\s'"]*)?
https?:\/\/y\.music\.163\.com\/m\/song\?id=(\d{3,})(?:[^\s'"]*)?
https?:\/\/163cn\.tv\/[A-Za-z0-9]+(?:[^\s'"]*)?
```

示例：

- `https://music.163.com/song?id=186016`
- `https://music.163.com/#/song?id=186016`
- `https://y.music.163.com/m/song?id=186016`
- `https://163cn.tv/xxxxxx`

### 1.2 歌单链接（`kind: playlist`）

```
https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?playlist\?id=(\d{3,})(?:[^\s'"]*)?
https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?(?:my\/m\/music\/list|discover\/playlist)\?[^\s'"]*[?&]id=(\d{3,})(?:[^\s'"]*)?
https?:\/\/music\.163\.com\/st\/(?:song|my\/m\/music\/list)\?[^\s'"]*
```

示例：

- `https://music.163.com/playlist?id=3778678`
- `https://music.163.com/#/discover/playlist?id=3778678`
- `https://music.163.com/st/my/m/music/list?id=3778678`

### 1.3 专辑链接（`kind: playlist`）

```
https?:\/\/(?:www\.|m\.)?music\.163\.com\/(?:#\/)?album\?id=(\d{3,})(?:[^\s'"]*)?
```

示例：

- `https://music.163.com/album?id=16993`

### 1.4 兜底规则（`kind: song`）

```
https?:\/\/(?:[a-z0-9-]+\.)*music\.163\.com\/[^\s'"]*
```

匹配 `music.163.com` 及其任意子域上的其余链接（如新版分享页），排在精确规则之后，避免抢占歌单 / 专辑规则。

---

## 2. 汽水音乐（`qishui`）

### 2.1 分享 / 作品链接（`kind: song`）

```
https?:\/\/qishui\.douyin\.com\/s\/([A-Za-z0-9]+)(?:[^\s'"]*)?
https?:\/\/qishui\.douyin\.com\/(?:album|song)\/[A-Za-z0-9]+(?:[^\s'"]*)?
```

示例：

- `https://qishui.douyin.com/s/xxxxxx`
- `https://qishui.douyin.com/song/7512772704484722704`

### 2.2 兜底规则（`kind: song`）

```
https?:\/\/(?:[a-z0-9-]+\.)*qishui\.douyin\.com\/[^\s'"]*
```

---

## 3. 规则顺序（重要）

`BUILTIN_LINK_RULES` 的排列顺序决定了匹配优先级，精确规则在前、兜底规则在后：

1. 网易云单曲（3 条）
2. 汽水音乐分享 / 作品（2 条）
3. 网易云歌单（3 条）
4. 网易云专辑（1 条）
5. 网易云兜底（1 条）
6. 汽水音乐兜底（1 条）

`linkTypeParser` 会遍历所有规则并用 `seen` 按完整 URL 去重，同一链接不会重复解析。歌单 / 专辑链接若被兜底规则抢先命中会误判为单曲，因此兜底规则必须放在末尾。

---

## 4. 自定义平台规则（`custom_` 前缀）

通过 `customPlatforms[].keywords`（逗号分隔）自动生成，源码位于 `buildCustomLinkRules`：

```
https?://[^/\s]*(?:关键词1|关键词2)[^\s]*
```

- 关键词中的正则特殊字符会被转义（`[.*+?^${}()|[\]\\]`）。
- 匹配到的链接 `type` 为 `custom_<平台名称>`，`kind` 固定为 `song`。
- 自定义平台只请求其配置的 `apiUrl`，不做内置平台降级。

示例：配置 `keywords = "mymusic,music.example.com"` 可匹配 `https://music.example.com/song/123`。

---

## 5. 链接类型与 ID 抽取

### 5.1 类型判定（`detectKind`）

对内置平台命中后的 URL 用如下正则判定是单曲还是歌单 / 专辑：

```
/\/playlist\b|\/discover\/playlist\b|\/my\/m\/music\/list\b|\/st\/|\/album\b/i
```

命中 → `playlist`（歌单 / 专辑），否则 → `song`（单曲）。自定义平台保留规则自带的 `kind`。

### 5.2 ID 抽取（`extractId`）

按以下顺序返回第一个命中的值：

1. `[?&](?:id|songid)=(\d+)` —— 查询参数中的数字 ID，如 `?id=186016`。
2. `\/(?:album|playlist|song)\/(\d+)` —— 路径中的数字 ID。
3. `\/([A-Za-z0-9]{6,})\/?(?:[?#]|$)` —— 路径末段的字母数字串（短链 token / 汽水 track_id）。
4. 都没有则回退为整条 URL。

`linkTypeParser` 会优先采用正则捕获组 `match[1]`（当其为纯数字或 6 位以上字母数字时），否则调用 `extractId(url)`。

---

## 6. 消息来源与卡片解析（`extractAllUrlsFromMessage`）

除了 `session.content` 纯文本，插件还会从消息元素里提取链接，兼容群卡片分享：

- `xml` 元素：读取 `elem.data`（或 `elem.attrs.data`）字符串并解析链接。
- `json` 元素：读取 `elem.data`（或 `elem.attrs.data`），先 `safeJsonParse`，再递归遍历对象（深度上限 6）收集所有字符串值，逐一解析链接；解析失败则把原始串纳入解析。
- 所有来源的结果按 URL 去重。
- 跳过以 `parse` / `music-parse` 开头的指令消息、`file_upload` 子类型、含 `file` / `folder` 元素的消息，以及机器人自己发送的消息。

---

## 7. URL 清洗（`cleanUrl`）

解析前 / 解析中会对链接做规范化：

- 去掉转义：`\\/` → `/`（卡片字符串里常见）。
- 解码 HTML 实体：`&amp;` → `&`。
- 协议升级：`http:` 自动改为 `https:`。
- 网易云域名（`music.163.com` / `163cn.tv`）删除 `userid`、`app_version`、`hdsuffix` 三个跟踪参数，其余查询参数保留。
- 用 `URL` 解析后以 `origin + pathname + search` 重组，避免重复拼接 `?` 导致出现 `??id=` 之类的坏 URL。

---

## 8. 注意事项

- 所有内置规则都带 `g` 标志，`linkTypeParser` 在遍历每条规则前重置 `lastIndex = 0`，并用 `guard`（上限 200）防止零宽匹配死循环。
- 短链 token 用 `[A-Za-z0-9]+`，路径尾部用 `[^\s'"]*` 兼容带中文 / 标点结尾的消息。
- 支持作品类型：网易云单曲、歌单、专辑；汽水音乐单曲。**歌单 / 专辑默认只展示曲目列表**，需开启 `expandPlaylistTracks` 才逐首获取直链。
- 已移除旧版支持的酷我音乐、QQ音乐链接规则（对应接口在新站已下线）。

---

本文档随插件版本更新而更新；当前适用于 v0.1.4。
