# koishi-plugin-music-parser-all v0.1.4

## 更新日志

### 平台迁移（破坏性变更）

- 解析服务由旧域名 `api.bugpk.com` 全面迁移至 `https://api-new.ifphp.com`，新增全局 `apiKey` 配置项（未配置时启动会打印 `WARN`）。
- 按新站免费接口清单逐项实测，音乐类接口仅保留两个：**网易云音乐**（`netease` → `/api/163_music`）与**汽水音乐**（`qishui` → `/api/qishui`）。
- **移除**酷我音乐（`kuwo`）与 QQ 音乐（`qqmusic`）：新站无对应接口，旧 `/api/kuwo`、`/api/qqmusic` 已下线或返回非 JSON 数据；相关平台开关、专属 API 映射、链接规则与 `package.json` 关键词一并移除。
- 修复旧版汽水音乐专属 API 地址错误（`api.bugpk.com/api/qsmusic`），并清理失效的聚合备用地址 `api.bugpk.com/api/music`。

### 认证与配置

- 新增 `authMode`（`header` 默认 / `query`）：Header 模式用 `X-API-Key` 请求头，Query 模式追加 `?key=<apiKey>`。实测 `api-new.ifphp.com` 两种方式均可用，`Authorization: Bearer` 本站不生效。
- 新增 `authHeaderType`（`Bearer` / `X-API-Key` / `Custom`）与 `customHeaderName`，供自建 / 第三方自定义 API 使用；`customApis`、`customPlatforms` 均可单独覆盖认证参数，未填时回落全局 `apiKey`。
- 新增「歌单展开」配置组：`expandPlaylistTracks`、`maxPlaylistTracks`（默认 10，上限 50）、`trackRequestInterval`（默认 5000 ms）。

### 解析逻辑修复（核心）

- **重写字段映射**：旧版 `parseApiResponse` 使用的 `albumname` / `artistsname` / `artistsmedium_avatar_url` / `Format` / `Size` 等字段与新 API 完全不匹配，导致歌名、歌手、封面、音质、大小全部取不到。现改为按默认别名表提取 `name / singer / album / pic / cover / url / label / level / size_label` 等，并兼容旧扁平字段（`ar_name` / `al_name`）。
- 新增多层数据解包：`safeJsonParse` 双层解析、数组取 `[0]`、字符串自动 `JSON.parse`、`data` 缺失回退顶层；`fieldMapping` 基于完整响应按点号路径取值，未命中自动回落默认别名。
- 新增 `isSuccessResponse`（兼容 `200 / 0 / "200" / "0" / "success" / "ok"` 及无 `code` 时按 `data` 判断）与 `getResponseMessage`（`error / message / msg / errmsg / err_msg / error_msg / description / detail`）。
- 修复请求参数构造：网易云优先用数字 `id` 调 `type=json` / `playlist` / `album`；汽水音乐 `type=music` 时 `id` 与 `url` **绝不并存**（同时传会返回「请求参数不正确-iga」）。

### 歌单 / 专辑

- 新增歌单、专辑链接识别与解析（`detectKind` / `parsePlaylistResponse`）：展示歌单名、创建者、曲目数、简介及曲目列表（最多显示前 100 首）。
- 由于接口返回的曲目不含直链，开启 `expandPlaylistTracks` 后按曲目 ID 逐首回灌 `type=json` 获取直链，并按 `trackRequestInterval` 间隔请求避开每分钟 15 次的免费限流。
- 歌单结果使用独立 `playlistCache` 缓存，与单曲 `urlCache` 分离。

### 稳定性与工程

- 业务错误码不重试；网络错误与 HTTP `403 / 408 / 429 / 500 / 502 / 503 / 504` 按 `retryTimes` 重试，`429 / 403` 使用 6 倍因子指数退避（上限 60 秒）。
- 修复 `cleanUrl` 重复拼接 `?` 导致 `??id=` 坏 URL 的问题；`cleanUrl` 异常分支不再误删查询参数。
- 修复缓存键碰撞：单曲缓存键加入 `matchId`，空 `url` 靠不同 ID 解析时不再互相命中。
- `DebugLogger` 升级为 INFO / DEBUG / WARN / ERROR 四级，`WARN` / `ERROR` 不受 `debug` 开关限制，支持密钥打码与超长日志截断。
- 链接规则按「网易云单曲 → 汽水 → 网易云歌单 → 网易云专辑 → 兜底」排序，避免兜底规则抢占歌单 / 专辑；新增卡片消息 `xml` / `json` 元素解析（兼容 `elem.data` 与 `elem.attrs.data`，递归深度上限 6）。
- 模块结构对齐参考插件：新增 `src/link-rules.ts`、`src/service/api.ts`、`src/service/parser.ts`，移除旧 `src/api.ts`。

### 文档

- 新增 `docs/API_ADDRESSES.md`、`docs/COMPATIBILITY.md`、`docs/LINK_RULES.md`、`docs/CHANGELOG-v0.1.4.md`。
- 拆分中文 `README.md` 与英文 `README.en.md`，新增 `LICENSE`（MIT）。

### 测试

- 覆盖链接规则、纯函数单元、`api-new.ifphp.com` LIVE 实测（网易云单曲 / 汽水单曲 / 歌单 / 批量 / 错误路径）、缓存与歌单展开，共 93 项检查全部通过；`npx tsc` 编译通过（EXIT 0）。测试目录用后即删，未纳入发布。

> 版本号仅由 0.1.3 递增至 0.1.4。升级后请务必在插件配置中填写 `apiKey`，否则所有解析请求都会失败。

---

本文档记录 v0.1.4 的变更。
