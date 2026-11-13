# koishi-plugin-music-parser-all

> 默认中文文档：[English version](README.en.md)

## 📌 重要公告（必读）

- **v0.1.4 起解析服务已迁移至 `https://api-new.ifphp.com`**，请在插件配置中填写 `apiKey`，否则所有解析请求都会失败。获取与调用方式见 [API_ADDRESSES.md](docs/API_ADDRESSES.md)。

## 文档目录

| 文档 | 说明 |
|------|------|
| [CHANGELOG-v0.1.4.md](docs/CHANGELOG-v0.1.4.md) | v0.1.4 版本更新日志 |
| [API_ADDRESSES.md](docs/API_ADDRESSES.md) | 插件 API 解析地址一览（认证方式、专属接口、参数与限流） |
| [COMPATIBILITY.md](docs/COMPATIBILITY.md) | API 字段兼容性说明（状态码、字段别名、字段映射） |
| [LINK_RULES.md](docs/LINK_RULES.md) | 所有平台的链接匹配规则（正则表达式） |

## 项目介绍

这是一个为 Koishi 机器人框架开发的**音乐解析插件**，支持自动识别群聊 / 私聊消息（含卡片分享）中的音乐链接并解析出歌曲信息、封面与音频直链，也支持手动指令解析。当前内置支持网易云音乐（单曲 / 歌单 / 专辑）与汽水音乐（单曲），并可通过 `customPlatforms` 自定义规则扩展更多平台。

解析能力以 `api-new.ifphp.com` 免费音乐接口实测结果为准：所有请求统一走各平台专属接口，内置字段别名兼容新旧返回结构，业务错误不重试、网络错误按指数退避重试。

## 项目仓库

- GitHub：https://github.com/Minecraft-1314/koishi-plugin-music-parser-all
- Issues：https://github.com/Minecraft-1314/koishi-plugin-music-parser-all/issues

## 快速开始

```bash
# 1. 在 Koishi 控制台或项目工作区安装插件
# 2. 在插件配置中填写 apiKey（api-new.ifphp.com）
# 3. 启用插件后直接发送音乐链接，插件会自动解析
#    也可使用指令：music-parse <url>
```

## 核心指令

| 指令 | 说明 | 示例 |
|------|------|------|
| `music-parse <url>` | 手动解析指定的音乐链接 | `music-parse https://music.163.com/song?id=186016` |

> 发送纯链接（非指令）时插件也会自动解析；以 `parse` / `music-parse` 开头的消息不会再触发自动解析，避免重复。

## 配置项说明

### 基本设置

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `enable` | boolean | `true` | 启用插件 |
| `botName` | string | `音乐解析机器人` | 合并转发中的昵称 |
| `showWaitingTip` | boolean | `true` | 显示等待提示 |
| `debug` | boolean | `false` | 开启调试日志 |
| `platformEnabled` | object | 全开 | 各平台解析开关（`netease`、`qishui`） |

### 消息格式

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `unifiedMessageFormat` | string | 见预设 | 文字格式，支持变量：`${name}` `${artist}` `${album}` `${cover}` `${music_url}` `${level}` `${size}` `${duration}`，空行自动隐藏 |

默认预设：

```
歌名：${name}
歌手：${artist}
专辑：${album}
音质：${level}
大小：${size}
```

### 媒体发送

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `showMusicText` | boolean | `true` | 发送文字内容 |
| `showCoverImage` | boolean | `true` | 发送封面图片（失败自动降级为发送封面链接） |
| `showMusicVoice` | boolean | `false` | 发送音频语音 |
| `showMusicVoiceFile` | boolean | `true` | 音频是否以语音形式发送（关闭则只发送链接） |

> 音频 / 封面发送失败时会自动降级为发送对应链接；开启 `enableForward` 时（仅 OneBot / Satori）文字、封面、音频会打包为合并转发，节点上限 100，超限自动分块，失败降级逐条发送。

### 歌单展开

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `expandPlaylistTracks` | boolean | `false` | 解析歌单 / 专辑时逐首获取直链（注意接口限流） |
| `maxPlaylistTracks` | number | `10` | 逐首获取的最大曲目数（1–50） |
| `trackRequestInterval` | number | `5000` | 逐首获取的请求间隔（ms） |

> 歌单 / 专辑接口返回的曲目**不含直链**，默认只展示曲目列表；开启逐首展开后按曲目 ID 回灌单曲接口，并按间隔串行请求以避开每分钟 15 次的免费限流。

### 性能

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `maxConcurrent` | number | `3` | 解析最大并发数 |

### 网络与请求

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `timeout` | number | `180000` | API 请求超时（ms） |
| `videoSendTimeout` | number | `180000` | 消息发送超时（ms） |
| `userAgent` | string | 见预设 | User-Agent |
| `proxy` | object | 见说明 | HTTP/HTTPS 代理 |
| `customHeaders` | array | `[]` | 自定义请求头（`name` / `value`） |

> `proxy` 结构：`enabled`、`protocol`、`host`、`port`、`auth.username`、`auth.password`。自定义平台可用 `customPlatforms[].proxy` 独立覆盖全局代理。

### 发送与重试

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `ignoreSendError` | boolean | `true` | 忽略发送失败 |
| `retryTimes` | number | `3` | API 请求重试次数 |
| `retryInterval` | number | `1000` | 重试 / 发送间隔（ms） |
| `enableForward` | boolean | `false` | 合并转发（OneBot / Satori） |

> 业务错误码（如「查无此歌曲」「参数错误」）不重试；网络错误与 HTTP `403 / 408 / 429 / 500 / 502 / 503 / 504` 才会重试，`429 / 403` 使用 6 倍因子指数退避（上限 60 秒）。

### 调试日志

打开 `debug` 后日志会记录完整链路，便于定位解析与发送异常：启动信息、命中的链接与平台开关过滤、每个链接的 API 地址与耗时、业务码、解析结果摘要、发送成功 / 失败状态。

`WARN` 和 `ERROR` 不受 `debug` 开关影响始终输出，`DEBUG` 和 `INFO` 只在开启 `debug` 时输出；单条日志超过 2000 字符会截断，API Key 等敏感信息会打码。

### 缓存与去重

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `enableDeduplication` | boolean | `true` | 启用重复解析检测 |
| `deduplicationInterval` | number | `180` | 去重间隔（s） |
| `cacheTTL` | number | `600` | 解析结果缓存时间（s） |

> 单曲结果与歌单结果分别使用独立的 LRU 缓存；同一批消息内还会按 URL 与内容指纹去重，避免同一首歌重复发送。

### API 与平台

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `apiKey` | string | 空 | `api-new.ifphp.com` API Key（必填） |
| `authMode` | string | `header` | Key 传递方式：`header`（`X-API-Key` 头）或 `query`（URL 参数 `?key=xxx`） |
| `authHeaderType` | string | `X-API-Key` | 认证头类型：`Bearer` / `X-API-Key` / `Custom` |
| `customHeaderName` | string | `X-API-Key` | `Custom` 模式下的自定义头名称 |
| `platformDedicatedFirst` | object | 全开 | 优先使用专属 API（`netease`、`qishui`） |
| `customApis` | array | `[]` | 覆盖内置平台 API（`platform` 仅 `netease` / `qishui`） |
| `customPlatforms` | array | `[]` | 自定义新平台 |
| `globalFieldMapping` | string | 预设 | 全局字段映射 JSON |

> 内置专属 API：`netease` → `https://api-new.ifphp.com/api/163_music`，`qishui` → `https://api-new.ifphp.com/api/qishui`。
>
> `customApis` / `customPlatforms` 可单独配置 `apiKey`、`authMode`、`authHeaderType`、`customHeaderName`、`fieldMapping`，未填时回落全局 `apiKey`。`authHeaderType` 的 `Bearer` / `Custom` 仅适用于自建或第三方自定义 API，本站请保持 `X-API-Key`。字段映射语法见 [COMPATIBILITY.md](docs/COMPATIBILITY.md)。

### 界面文本

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `waitingTipText` | string | `正在解析音乐，请稍候...` | 等待提示 |
| `unsupportedPlatformText` | string | `暂不支持该平台音乐链接` | 不支持提示 |
| `invalidLinkText` | string | `无效的音乐链接` | 无效链接提示 |
| `parseErrorPrefix` | string | `❌ 解析失败：` | 错误前缀 |
| `parseErrorItemFormat` | string | `【${url}】: ${msg}` | 错误格式，支持变量 `${url}` `${msg}` |

## 支持的变量

可在 `unifiedMessageFormat` 中使用以下变量，空行自动隐藏。

| 变量 | 说明 |
|------|------|
| `${name}` | 歌曲名 |
| `${artist}` | 歌手 |
| `${album}` | 专辑 |
| `${cover}` | 封面链接 |
| `${music_url}` | 音频直链 |
| `${level}` | 音质（如「标准音质」） |
| `${size}` | 文件大小（如 `0B`） |
| `${duration}` | 时长（格式化为 `m:ss`） |

> 逐首展开或批量解析（总数大于 1）时，文字前会自动加 `【i/total】` 序号前缀。

## 支持的平台

以下为插件内置链接匹配规则，可根据用户发送的链接自动识别。所有规则同时支持 HTTP / HTTPS，并兼容短链与多级路径；完整正则见 [LINK_RULES.md](docs/LINK_RULES.md)。

| 平台 | 关键词识别（域名 / 路径模式） | 解析能力 |
|------|------|------|
| 网易云音乐 | `music.163.com/song?id=`、`y.music.163.com/m/song`、`163cn.tv`、`music.163.com/playlist?id=`、`music.163.com/album?id=` | 单曲、歌单、专辑 |
| 汽水音乐 | `qishui.douyin.com/s/`、`qishui.douyin.com/song/`、`qishui.douyin.com/album/` | 单曲 |
| 自定义平台 | 通过 `customPlatforms` 配置添加 | 取决于提供的 API |

> 歌单 / 专辑默认仅展示曲目列表；需逐首直链请开启 `expandPlaylistTracks`。已移除的酷我音乐、QQ 音乐链接不再识别。

## 项目贡献者

| 贡献者 | 贡献内容 |
|------|------|
| Minecraft-1314 | 插件完整开发 |
| BugPk-Api | API 支持 |

> 欢迎通过 Issues 或 PR 加入贡献者列表。

## 许可协议

本项目采用 MIT 许可证，详情参见 [LICENSE](LICENSE) 文件。

## 支持我们

如果这个项目对您有帮助，欢迎点亮右上角的 Star 支持我们！
