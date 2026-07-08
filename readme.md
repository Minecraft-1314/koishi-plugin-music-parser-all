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
| `music <url>` | 手动解析指定的音乐链接 | `music https://music.163.com/song?id=123456` |

## 配置项说明 (Configuration)

### 基本设置
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enable` | boolean | true | 启用插件 |
| `botName` | string | 音乐解析机器人 | 合并转发中的昵称 |
| `showWaitingTip` | boolean | true | 显示等待提示 |
| `debug` | boolean | false | Debug 日志 |
| `platformEnabled` | object | 全开 | 各平台开关（netease, kuwo, qqmusic, qishui） |

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

### 性能
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `maxConcurrent` | number | 3 | 解析最大并发数 |

### 网络与请求
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `timeout` | number | 180000 | API 超时 (ms) |
| `videoSendTimeout` | number | 180000 | 发送超时 (ms) |
| `userAgent` | string | 见预设 | User-Agent |
| `proxy` | object | ... | HTTP/HTTPS 代理 |
| `customHeaders` | array | [] | 自定义请求头 |

### 发送与重试
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ignoreSendError` | boolean | true | 忽略发送失败 |
| `retryTimes` | number | 3 | 重试次数 |
| `retryInterval` | number | 1000 | 重试间隔 (ms) |
| `enableForward` | boolean | false | 合并转发（OneBot/Satori） |

### 缓存与去重
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableDeduplication` | boolean | true | 启用重复解析检测与提示 |
| `deduplicationInterval` | number | 180 | 去重间隔 (s) |
| `cacheTTL` | number | 600 | 缓存时间 (s) |

### API 与平台
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `platformDedicatedFirst` | object | 全关 | 优先使用专属 API |
| `customApis` | array | [] | 覆盖内置平台 API |
| `customPlatforms` | array | [] | 自定义新平台 |
| `globalFieldMapping` | string | 预设 | 全局字段映射 JSON |

### 界面文本
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `waitingTipText` | string | 正在解析音乐，请稍候... | 等待提示 |
| `unsupportedPlatformText` | string | 暂不支持该平台音乐链接 | 不支持提示 |
| `invalidLinkText` | string | 无效的音乐链接 | 无效链接提示 |
| `parseErrorPrefix` | string | ❌ 解析失败： | 错误前缀 |
| `parseErrorItemFormat` | string | 【${url}】: ${msg} | 错误格式 |

## 支持的变量 (Supported Variables)
在 `unifiedMessageFormat` 中可使用以下变量，空行自动隐藏：

| 变量名 | 说明 |
|--------|------|
| `${name}` | 歌曲名 |
| `${artist}` | 歌手 |
| `${album}` | 专辑 |
| `${level}` | 音质 |
| `${size}` | 文件大小 |

## 支持的平台 (Supported Platforms)

| 平台名称 | 示例链接 | 解析能力 |
|----------|----------|----------|
| 网易云音乐 | `https://music.163.com/song?id=...` | 歌曲、歌单（单曲） |
| 酷我音乐 | `https://www.kuwo.cn/play_detail/...` | 歌曲 |
| QQ音乐 | `https://y.qq.com/n/ryqq/songDetail/...` | 歌曲 |
| 汽水音乐 | `https://qishui.douyin.com/s/...` | 歌曲 |
| 自定义平台 | 通过 `customPlatforms` 配置添加 | 取决于提供的 API |

## 项目贡献者 (Contributors)

| 贡献者 (Contributor) | 贡献内容 (Contribution) |
|----------------------|-------------------------|
| Minecraft-1314 | 插件完整开发 (Complete plugin development) |
| BugPk-Api | API 支持 |

（欢迎通过 Issues 或 PR 加入贡献者列表）

## 许可协议 (License)

本项目采用 MIT 许可证，详情参见 [LICENSE](LICENSE) 文件。

This project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.

## 支持我们 (Support Us)

如果这个项目对您有帮助，欢迎点亮右上角的 Star ⭐ 支持我们！

If this project is helpful to you, please feel free to star it in the upper right corner ⭐ to support us!