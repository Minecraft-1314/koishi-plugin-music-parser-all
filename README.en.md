# koishi-plugin-music-parser-all

> Default documentation is in Chinese: [中文文档](README.md)

## 📌 Important Notices (Read First)

- **Since v0.1.4 the resolution service has migrated to `https://api-new.ifphp.com`**. Fill in `apiKey` in the plugin config, otherwise all resolution requests will fail. See [API_ADDRESSES.md](docs/API_ADDRESSES.md) for details.

## Documentation Index

| Document | Description |
|------|------|
| [CHANGELOG-v0.1.4.md](docs/CHANGELOG-v0.1.4.md) | v0.1.4 changelog |
| [API_ADDRESSES.md](docs/API_ADDRESSES.md) | API resolution addresses (authentication, dedicated endpoints, parameters, rate limits) |
| [COMPATIBILITY.md](docs/COMPATIBILITY.md) | API field compatibility (status codes, field aliases, field mapping) |
| [LINK_RULES.md](docs/LINK_RULES.md) | Link matching rules for all platforms (regular expressions) |

## Introduction

A **music resolution plugin** for the Koishi bot framework. It automatically detects music links in group / private messages (including card shares) and resolves song info, cover art and direct audio URLs; manual resolution via command is also supported. Built-in support covers NetEase Cloud Music (song / playlist / album) and Qishui Music (song), and more platforms can be added through `customPlatforms`.

Resolution behavior is based on live tests of the `api-new.ifphp.com` free music endpoints: every request goes through the platform's dedicated endpoint, built-in field aliases are compatible with both new and legacy response structures, business errors are never retried, and network errors are retried with exponential backoff.

## Repository

- GitHub: https://github.com/Minecraft-1314/koishi-plugin-music-parser-all
- Issues: https://github.com/Minecraft-1314/koishi-plugin-music-parser-all/issues

## Quick Start

```bash
# 1. Install the plugin from the Koishi console or your project workspace
# 2. Fill in apiKey (api-new.ifphp.com) in the plugin config
# 3. After enabling, simply send a music link — the plugin resolves it automatically
#    Or use the command: music-parse <url>
```

## Core Command

| Command | Description | Example |
|------|------|------|
| `music-parse <url>` | Manually resolve a music link | `music-parse https://music.163.com/song?id=186016` |

> Sending a bare link (not a command) also triggers automatic resolution; messages starting with `parse` / `music-parse` are skipped by the auto-parser to avoid duplicates.

## Configuration

### Basic

| Option | Type | Default | Description |
|------|------|------|------|
| `enable` | boolean | `true` | Enable the plugin |
| `botName` | string | `音乐解析机器人` | Nickname used in merged forwards |
| `showWaitingTip` | boolean | `true` | Show the waiting tip |
| `debug` | boolean | `false` | Enable debug logging |
| `platformEnabled` | object | all on | Per-platform switches (`netease`, `qishui`) |

### Message Format

| Option | Type | Default | Description |
|------|------|------|------|
| `unifiedMessageFormat` | string | see preset | Text format. Variables: `${name}` `${artist}` `${album}` `${cover}` `${music_url}` `${level}` `${size}` `${duration}`; empty lines are hidden automatically |

Default preset:

```
歌名：${name}
歌手：${artist}
专辑：${album}
音质：${level}
大小：${size}
```

### Media Sending

| Option | Type | Default | Description |
|------|------|------|------|
| `showMusicText` | boolean | `true` | Send the text content |
| `showCoverImage` | boolean | `true` | Send cover image (falls back to sending the cover URL on failure) |
| `showMusicVoice` | boolean | `false` | Send audio as a voice message |
| `showMusicVoiceFile` | boolean | `true` | Send audio as a voice file (when off, only the link is sent) |

> Audio / cover send failures automatically fall back to sending the corresponding link. When `enableForward` is on (OneBot / Satori only), text, cover and audio are packed into a merged forward with a 100-node cap, split into chunks when exceeded, and fall back to sending one-by-one on failure.

### Playlist Expansion

| Option | Type | Default | Description |
|------|------|------|------|
| `expandPlaylistTracks` | boolean | `false` | Fetch direct URLs track-by-track for playlists / albums (mind the rate limit) |
| `maxPlaylistTracks` | number | `10` | Maximum tracks to fetch (1–50) |
| `trackRequestInterval` | number | `5000` | Interval between track requests (ms) |

> Playlist / album endpoints return tracks **without direct URLs**; by default only the track list is shown. When expansion is enabled, each track ID is re-queried through the song endpoint serially with an interval to avoid the 15-requests-per-minute free quota.

### Performance

| Option | Type | Default | Description |
|------|------|------|------|
| `maxConcurrent` | number | `3` | Maximum concurrency for resolution |

### Network & Requests

| Option | Type | Default | Description |
|------|------|------|------|
| `timeout` | number | `180000` | API request timeout (ms) |
| `videoSendTimeout` | number | `180000` | Message send timeout (ms) |
| `userAgent` | string | see preset | User-Agent |
| `proxy` | object | see note | HTTP/HTTPS proxy |
| `customHeaders` | array | `[]` | Custom request headers (`name` / `value`) |

> `proxy` structure: `enabled`, `protocol`, `host`, `port`, `auth.username`, `auth.password`. Custom platforms can override the global proxy via `customPlatforms[].proxy`.

### Sending & Retries

| Option | Type | Default | Description |
|------|------|------|------|
| `ignoreSendError` | boolean | `true` | Ignore send failures |
| `retryTimes` | number | `3` | API request retry count |
| `retryInterval` | number | `1000` | Retry / send interval (ms) |
| `enableForward` | boolean | `false` | Merged forward (OneBot / Satori) |

> Business error codes (e.g. "song not found", "invalid parameters") are never retried; only network errors and HTTP `403 / 408 / 429 / 500 / 502 / 503 / 504` are retried, with a 6× exponential backoff for `429 / 403` (capped at 60 s).

### Debug Logging

With `debug` on, the full pipeline is logged for troubleshooting: startup info, matched links and platform-switch filtering, API address and elapsed time per link, business codes, parsed-result summaries, and send success / failure status.

`WARN` and `ERROR` always output regardless of `debug`; `DEBUG` and `INFO` only output when `debug` is on. A single log line over 2000 characters is truncated, and sensitive data such as the API Key is masked.

### Cache & Deduplication

| Option | Type | Default | Description |
|------|------|------|------|
| `enableDeduplication` | boolean | `true` | Enable duplicate-resolution detection |
| `deduplicationInterval` | number | `180` | Deduplication interval (s) |
| `cacheTTL` | number | `600` | Resolved-result cache TTL (s) |

> Song results and playlist results use separate LRU caches. Within a single message batch, URL and content fingerprints are also deduplicated so the same song is not sent twice.

### API & Platforms

| Option | Type | Default | Description |
|------|------|------|------|
| `apiKey` | string | empty | `api-new.ifphp.com` API Key (required) |
| `authMode` | string | `header` | How the Key is passed: `header` (`X-API-Key` header) or `query` (`?key=xxx`) |
| `authHeaderType` | string | `X-API-Key` | Auth header type: `Bearer` / `X-API-Key` / `Custom` |
| `customHeaderName` | string | `X-API-Key` | Custom header name in `Custom` mode |
| `platformDedicatedFirst` | object | all on | Prefer the dedicated API (`netease`, `qishui`) |
| `customApis` | array | `[]` | Override built-in platform APIs (`platform` only `netease` / `qishui`) |
| `customPlatforms` | array | `[]` | Add custom platforms |
| `globalFieldMapping` | string | preset | Global field-mapping JSON |

> Built-in dedicated APIs: `netease` → `https://api-new.ifphp.com/api/163_music`, `qishui` → `https://api-new.ifphp.com/api/qishui`.
>
> `customApis` / `customPlatforms` can set `apiKey`, `authMode`, `authHeaderType`, `customHeaderName` and `fieldMapping` individually, falling back to the global `apiKey` when unset. `Bearer` / `Custom` auth types are only for self-hosted or third-party custom APIs — keep `X-API-Key` for this site. See [COMPATIBILITY.md](docs/COMPATIBILITY.md) for field-mapping syntax.

### UI Text

| Option | Type | Default | Description |
|------|------|------|------|
| `waitingTipText` | string | `正在解析音乐，请稍候...` | Waiting tip |
| `unsupportedPlatformText` | string | `暂不支持该平台音乐链接` | Unsupported-platform tip |
| `invalidLinkText` | string | `无效的音乐链接` | Invalid-link tip |
| `parseErrorPrefix` | string | `❌ 解析失败：` | Error prefix |
| `parseErrorItemFormat` | string | `【${url}】: ${msg}` | Error format. Variables: `${url}` `${msg}` |

## Supported Variables

Usable in `unifiedMessageFormat`; empty lines are hidden automatically.

| Variable | Description |
|------|------|
| `${name}` | Song name |
| `${artist}` | Artist |
| `${album}` | Album |
| `${cover}` | Cover URL |
| `${music_url}` | Direct audio URL |
| `${level}` | Quality (e.g. `标准音质` "Standard") |
| `${size}` | File size (e.g. `0B`) |
| `${duration}` | Duration (formatted as `m:ss`) |

> When expanding tracks or resolving a batch (total > 1), a `【i/total】` index prefix is added to the text.

## Supported Platforms

Built-in link matching rules are listed below. All rules support both HTTP and HTTPS and handle short links and multi-level paths; see [LINK_RULES.md](docs/LINK_RULES.md) for the full regular expressions.

| Platform | Keyword recognition (domain / path patterns) | Capability |
|------|------|------|
| NetEase Cloud Music | `music.163.com/song?id=`, `y.music.163.com/m/song`, `163cn.tv`, `music.163.com/playlist?id=`, `music.163.com/album?id=` | Song, playlist, album |
| Qishui Music | `qishui.douyin.com/s/`, `qishui.douyin.com/song/`, `qishui.douyin.com/album/` | Song |
| Custom platforms | Added via `customPlatforms` | Depends on the provided API |

> Playlists / albums show only the track list by default; enable `expandPlaylistTracks` for per-track direct URLs. Kuwo Music and QQ Music links are no longer recognized.

## Contributors

| Contributor | Contribution |
|------|------|
| Minecraft-1314 | Full plugin development |
| BugPk-Api | API support |

> Contributions via Issues or PR are welcome — feel free to add yourself to the list.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support Us

If this project helps you, please give it a Star in the top-right corner!
