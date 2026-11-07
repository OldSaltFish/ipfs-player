# IPFS 云端播放器

纯静态页面，歌单、音频、封面、歌词都从 IPFS 公共网关读取。部署到 Cloudflare Pages 时构建命令留空，发布目录设为 `ipfs-player`。

线上：`https://ipfs-player-6jt.pages.dev`，自定义域 `https://music.dsmoe.cn`。重新部署用 `CLOUDFLARE_API_TOKEN=<token> bun x wrangler pages deploy ipfs-player --project-name=ipfs-player --branch=main`；项目首次需 `wrangler pages project create ipfs-player --production-branch main`。

数据源
- 默认歌单 CID 在 `config.js` 的 `playlistCid`，当前指向已 pin 的完整 20 首歌单；重建用 `node ../ipfs-pin/batch-pin.mjs`。
- 单曲下载提供「仅 MP3」与「MP3 + 封面 + 歌词」两种；批量下载在曲目抽屉内，勾选曲目后点「下载所选」。
- 用 `?p=<CID>` 可临时切换歌单，页面顶部输入框也支持 CID、`ipfs://` 链接或 URL。
- 歌单格式见 `../ipfs-pin/sample/playlist.example.json`：`tracks[].cid`、`coverCid`、`lyricsCid`、`filename`、`title`、`artist`、`album`、`size`、`duration`，顶层 `previous` 指向上一版歌单 CID。
- 这几个 CID 字段也可以直接写 http(s) URL 或站点内绝对路径，用于本地预览。

网关
- `config.js` 的 `gateways` 按优先级列出。歌单与歌词并发请求所有网关、取最先成功的一个；封面与音频加载失败时自动切换下一个网关。
- 状态栏常驻显示当前网关与错误，错误不会自动消失。

窄屏
- 主界面常驻当前曲目与歌词，曲目列表是悬浮抽屉（窄屏从底部升起）；播放条固定在底部，控件居中。

桌面歌词
- 播放条右侧的「桌面歌词」按钮：桌面 Chrome/Edge 走 Document PiP（真实 HTML 浮窗）；其余平台把歌词画到 canvas，经 `captureStream` 交给 `video` 进系统画中画。
- 画布固定 2:1（640×320），且 `video` 元素必须设成同样的 CSS 尺寸。Android 内核用元素布局尺寸决定 PiP 窗口比例，只给 `videoWidth` 会得到 1:1 方窗；比例超出 1:2.39~2.39:1 会被系统裁切变形。

本地预览
- 运行 `node ipfs-player/serve.mjs`，打开 `http://localhost:8787/ipfs-player/?p=/ipfs-player/demo/playlist.json`。
- `demo/playlist.json` 指向工作区里的 20 首本地素材，仅用于离线验收；部署时可不包含 `demo` 目录与 `serve.mjs`。

更新歌单
- 把新的 `playlist.json` pin 到 IPFS，把 CID 填进 `config.js`，或分享 `?p=<新CID>` 链接即可。
