# koishi-plugin-music-parser-all

## 项目介绍 (Project Introduction)

### 中文
这是一个为 Koishi 机器人框架开发的**全平台音乐解析插件**，使用统一API接口，支持自动识别并解析网易云音乐、酷我音乐、QQ音乐、汽水音乐等主流平台的音乐链接，并支持通过自定义规则扩展更多平台。

### English
This is a **multi-platform music parsing plugin** developed for the Koishi bot framework. It uses a unified API interface to automatically recognize and parse music links from mainstream platforms such as Netease Cloud Music, Kuwo, QQ Music, Qishui, and supports extending more platforms through custom rules.

## 项目仓库 (Repository)
- GitHub: `https://github.com/Minecraft-1314/koishi-plugin-music-parser-all`
- Issues: `https://github.com/Minecraft-1314/koishi-plugin-music-parser-all/issues`

## 核心指令 (Core Commands)

| 指令 (Command) | 说明 (Description) | 示例 (Example) |
|----------------|--------------------|----------------|
| `music <url>` | 手动解析指定的音乐链接 (Manually parse the given music URL) | `music https://music.163.com/song?id=123456` |

## 配置项说明 (Configuration)

### 基本设置 (Basic Settings)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `enable` | boolean | true | 启用插件 (Enable the plugin) |
| `botName` | string | 音乐解析机器人 | 合并转发中的昵称 (Nickname shown in combined forwards) |
| `showWaitingTip` | boolean | true | 显示等待提示 (Show a waiting tip) |
| `debug` | boolean | false | Debug 日志 (Enable debug logging) |
| `platformEnabled` | object | 全开 (All enabled) | 各平台开关（netease, kuwo, qqmusic, qishui）(Toggle each platform) |

### 消息格式 (Message Format)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `unifiedMessageFormat` | string | 见预设 (See default) | 文字格式，支持变量，空行自动隐藏 (Text format, supports variables, empty lines auto hidden) |

### 媒体发送与音乐语音 (Media & Voice)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `showMusicText` | boolean | true | 发送文字内容 (Send text content) |
| `showCoverImage` | boolean | true | 发送封面图片 (Send cover image) |
| `showMusicVoice` | boolean | false | 音乐链接以语音形式发送 (Send music URL as a voice message) |
| `showMusicVoiceFile` | boolean | true | 音乐链接是否以语音形式发送，关闭则只发送链接 (Whether to send as voice; if disabled, only the link is sent) |

### 性能 (Performance)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `maxConcurrent` | number | 3 | 解析最大并发数 (Maximum concurrent parsing) |

### 网络与请求 (Network & Request)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `timeout` | number | 180000 | API 超时 (ms) (API timeout in ms) |
| `videoSendTimeout` | number | 180000 | 发送超时 (ms) (Send timeout in ms) |
| `userAgent` | string | 见预设 (See default) | User-Agent |
| `proxy` | object | ... | HTTP/HTTPS 代理 (HTTP/HTTPS proxy) |
| `customHeaders` | array | [] | 自定义请求头 (Custom request headers) |

### 发送与重试 (Send & Retry)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `ignoreSendError` | boolean | true | 忽略发送失败 (Ignore send failures) |
| `retryTimes` | number | 3 | 重试次数 (Retry count) |
| `retryInterval` | number | 1000 | 重试间隔 (ms) (Retry interval in ms) |
| `enableForward` | boolean | false | 合并转发（OneBot/Satori）(Enable combined forward) |

### 缓存与去重 (Cache & Deduplication)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `enableDeduplication` | boolean | true | 启用重复解析检测与提示 (Enable duplicate detection and warning) |
| `deduplicationInterval` | number | 180 | 去重间隔 (s) (Deduplication interval in seconds) |
| `cacheTTL` | number | 600 | 缓存时间 (s) (Cache TTL in seconds) |

### API 与平台 (API & Platforms)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `platformDedicatedFirst` | object | 全关 (All disabled) | 优先使用专属 API (Prioritize dedicated API) |
| `customApis` | array | [] | 覆盖内置平台 API (Override built‑in platform APIs) |
| `customPlatforms` | array | [] | 自定义新平台 (Add custom platforms) |
| `globalFieldMapping` | string | 预设 (See default) | 全局字段映射 JSON (Global field mapping JSON) |

### 界面文本 (UI Text)
| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|--------------|-------------|------------------|---------------------|
| `waitingTipText` | string | 正在解析音乐，请稍候... | 等待提示 (Waiting tip text) |
| `unsupportedPlatformText` | string | 暂不支持该平台音乐链接 | 不支持提示 (Unsupported platform text) |
| `invalidLinkText` | string | 无效的音乐链接 | 无效链接提示 (Invalid link text) |
| `parseErrorPrefix` | string | ❌ 解析失败： | 错误前缀 (Error prefix) |
| `parseErrorItemFormat` | string | 【${url}】: ${msg} | 错误格式 (Error format) |

## 支持的变量 (Supported Variables)
在 `unifiedMessageFormat` 中可使用以下变量，空行自动隐藏。  
The following variables can be used in `unifiedMessageFormat`, empty lines are automatically hidden.

| 变量名 (Variable) | 说明 (Description) |
|-------------------|---------------------|
| `${name}` | 歌曲名 (Song name) |
| `${artist}` | 歌手 (Artist) |
| `${album}` | 专辑 (Album) |
| `${level}` | 音质 (Quality) |
| `${size}` | 文件大小 (File size) |

## 支持的平台 (Supported Platforms)

| 平台名称 (Platform) | 示例链接 (Example URL) | 解析能力 (Capability) |
|---------------------|-------------------------|-----------------------|
| 网易云音乐 | `https://music.163.com/song?id=...` | 歌曲、歌单（单曲）(Songs, playlists) |
| 酷我音乐 | `https://www.kuwo.cn/play_detail/...` | 歌曲 (Songs) |
| QQ音乐 | `https://y.qq.com/n/ryqq/songDetail/...` | 歌曲 (Songs) |
| 汽水音乐 | `https://qishui.douyin.com/s/...` | 歌曲 (Songs) |
| 自定义平台 (Custom) | 通过 `customPlatforms` 配置添加 | 取决于提供的 API (Depends on the provided API) |

## 项目贡献者 (Contributors)

| 贡献者 (Contributor) | 贡献内容 (Contribution) |
|----------------------|-------------------------|
| Minecraft-1314 | 插件完整开发 (Complete plugin development) |
| BugPk-Api | API 支持 (API support) |

（欢迎通过 Issues 或 PR 加入贡献者列表）  
(Contributions via Issues or PRs are welcome)

## 许可协议 (License)

本项目采用 MIT 许可证，详情参见 [LICENSE](LICENSE) 文件。  
This project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.

## 支持我们 (Support Us)

如果这个项目对您有帮助，欢迎点亮右上角的 Star ⭐ 支持我们！  
If this project is helpful to you, please feel free to star it in the upper right corner ⭐ to support us!