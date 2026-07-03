# koishi-plugin-music-parser-all

## 项目介绍 (Project Introduction)

### 中文
这是一个为 Koishi 机器人框架开发的**全平台音乐解析插件**，使用统一API接口，支持自动识别并解析网易云音乐、酷我音乐、QQ音乐、汽水音乐等主流音乐平台的歌曲链接，获取歌名、歌手、专辑、封面及高音质直链，并支持以语音消息发送音乐。内置独立接口优先、聚合接口备用的解析策略，同时支持自定义 API、平台扩展与字段映射。

### English
This is a **multi-platform music parsing plugin** developed for the Koishi bot framework, using a unified API interface to automatically recognize and parse music links from major platforms such as NetEase Cloud Music, Kuwo Music, QQ Music, Qishui Music and more, obtaining track info, cover, and high-quality direct links, with optional voice message playback. It features dedicated API priority with aggregate API fallback, and supports custom APIs, platform extensions, and field mapping.

## 项目仓库 (Repository)
- GitHub: https://github.com/Minecraft-1314/koishi-plugin-music-parser-all
- Issues: https://github.com/Minecraft-1314/koishi-plugin-music-parser-all/issues

## 核心指令 (Core Commands)

| 指令 | 说明 | 示例 |
|------|------|------|
| `music <url>` | 手动解析指定的音乐链接 | `music https://music.163.com/song?id=865632948` |

## 配置项说明 (Configuration)

### 基本设置
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enable` | boolean | true | 启用插件 |
| `botName` | string | 音乐解析机器人 | 合并转发中的昵称 |
| `showWaitingTip` | boolean | true | 显示等待提示 |
| `debug` | boolean | false | Debug 日志 |
| `platformEnabled` | object | 全开 | 各平台开关（netease/kuwo/qqmusic/qishui） |

### 消息格式
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `unifiedMessageFormat` | string | 见预设 | 文字格式，支持变量，空行自动隐藏 |

### 媒体发送与音乐语音
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `showMusicText` | boolean | true | 发送文字内容 |
| `showCoverImage` | boolean | true | 发送封面图片 |
| `showMusicVoice` | boolean | false | 音乐链接以语音形式发送 |
| `showMusicVoiceFile` | boolean | true | 音乐链接是否以语音形式发送（关闭则只发送链接） |
| `forceDownloadMusicVoice` | boolean | true | 强制下载音乐语音（推荐开启，避免直链失效） |
| `forceDownloadImage` | boolean | false | 强制下载封面图片 |

### 性能与限制
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `maxConcurrent` | number | 3 | 解析最大并发数 |
| `downloadConcurrency` | number | 3 | 下载线程数 |
| `mediaDownloadTimeout` | number | 120000 | 统一下载超时 (ms) |
| `maxMediaSize` | number | 0 | 最大下载文件大小 (MB)，0 为不限制 |
| `downloadEngine` | string | internal | 下载引擎（internal / aria2 / downloads） |
| `aria2Host` | string | 127.0.0.1 | aria2 RPC 地址 |
| `aria2Port` | number | 6800 | aria2 RPC 端口 |
| `aria2Secret` | string | | aria2 RPC 密钥 |
| `resumeDownload` | boolean | true | 启用断点续传（仅 aria2） |

### 网络与请求
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `timeout` | number | 180000 | API 超时 (ms) |
| `videoSendTimeout` | number | 180000 | 消息发送超时 (ms) |
| `userAgent` | string | 见预设 | User-Agent |
| `proxy` | object | … | HTTP/HTTPS 代理 |
| `customHeaders` | array | [] | 自定义请求头 |

### 发送与重试
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ignoreSendError` | boolean | true | 忽略发送失败 |
| `retryTimes` | number | 3 | 重试次数 |
| `retryInterval` | number | 1000 | 重试间隔 (ms) |
| `enableForward` | boolean | false | 合并转发（OneBot/Satori） |

### 缓存与临时文件
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `deduplicationInterval` | number | 180 | 去重间隔 (s) |
| `cacheTTL` | number | 600 | 缓存时间 (s) |
| `cacheDir` | string | ./temp_cache_music | 统一临时目录 |

### API 与平台（新增）
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `platformDedicatedFirst` | object | 全关 | 优先使用专属 API（每个平台可单独设定） |
| `customApis` | array | [] | 覆盖内置平台 API（支持自定义 URL、API Key 认证、字段映射） |
| `customPlatforms` | array | [] | 自定义新平台（可设定关键词匹配、独立代理、字段映射） |
| `globalFieldMapping` | string | 预设 | 全局字段映射 JSON，适配不同 API 返回结构 |

### 界面文本
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `waitingTipText` | string | 正在解析音乐，请稍候... | 等待提示 |
| `unsupportedPlatformText` | string | 暂不支持该平台音乐链接 | 不支持提示 |
| `invalidLinkText` | string | 无效的音乐链接 | 无效链接提示 |
| `parseErrorPrefix` | string | ❌ 解析失败： | 错误前缀 |
| `parseErrorItemFormat` | string | 见预设 | 错误格式 |

## 支持的变量 (Supported Variables)
在 `unifiedMessageFormat` 中可使用以下变量，空行自动隐藏：

| 变量名 | 说明 |
|--------|------|
| `${name}` | 歌曲名称 |
| `${artist}` | 歌手名称 |
| `${album}` | 专辑名称 |
| `${cover}` | 封面图片链接 |
| `${music_url}` | 音乐直链 |
| `${level}` | 音质等级 |
| `${size}` | 文件大小 |

## 解析策略 (Parsing Strategy)
1. **独立接口优先**：每个平台默认使用专属接口（网易云、酷我、QQ、汽水）
2. **聚合接口备用**：当解析网易云或 QQ 音乐失败时，自动调用统一聚合接口 `https://api.bugpk.com/api/music` 进行补提
3. **自定义优先**：若配置了自定义 API 并开启“优先使用专属 API”，则会优先尝试自定义地址
4. **智能扩展名识别**：下载音频时，会优先从链接的 `mime_type` 参数（如汽水音乐）识别真实格式，支持 mp3/m4a/flac/wav/ogg/aac/opus/wma/ape/wv/alac 等常见格式

## 依赖说明 (Dependencies)
### 音乐语音（可选）
若启用 `showMusicVoice`，推荐安装以下可选插件以获得更好的语音格式支持：
- `koishi-plugin-silk`：silk 编解码
- `koishi-plugin-ffmpeg`：音频重采样
未安装时仍可尝试直接发送音频链接，但可能受平台限制。

### aria2 下载引擎（可选）
若启用 `downloadEngine: 'aria2'`，请安装并启动 aria2 服务，并安装 npm 包 `aria2`：
- 安装 aria2 服务端：https://github.com/aria2/aria2
- 安装 npm 客户端：`npm install aria2`
- 启动 RPC：`aria2c --enable-rpc --rpc-listen-all=true --rpc-allow-origin-all`
未满足条件时自动降级为内置下载，不影响正常使用。

### downloads 服务（可选）
若启用 `downloadEngine: 'downloads'`，请安装可选依赖 `koishi-plugin-downloads`，失败时回退到内置下载。

## 支持的平台 (Supported Platforms)
| 平台名称 | 关键词识别 | 解析能力 |
|----------|------------|----------|
| 网易云音乐 | music.163.com, 163cn.tv | 歌曲信息、SVIP高音质直链、封面 |
| 酷我音乐 | kuwo.cn | 歌曲信息、直链、封面 |
| QQ音乐 | y.qq.com, i.y.qq.com | 歌曲信息、直链、封面 |
| 汽水音乐 | qishui.douyin.com | 歌曲信息、高音质直链、封面 |
| 🧩 自定义平台 | 通过 `customPlatforms` 添加 | 取决于 API |

## 项目贡献者 (Contributors)
| 贡献者 | 贡献内容 |
|--------|----------|
| Minecraft-1314 | 插件完整开发 |
| 梦安大佬 | 赞助恢复网易云SVIP接口 |
| JH-Ahua | BugPk-Api 支持 |

（欢迎通过 Issues 或 PR 加入贡献者列表）

## 许可协议 (License)
本项目采用 MIT 许可证，详情参见 [LICENSE](LICENSE) 文件。
This project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.

## 支持我们 (Support Us)
如果这个项目对您有帮助，欢迎点亮右上角的 Star ⭐ 支持我们！
If this project is helpful to you, please feel free to star it in the upper right corner ⭐ to support us!
