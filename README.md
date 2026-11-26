# MemoTrail

[Memos](https://github.com/usememos/memos) 的桌面客户端：常驻托盘、全局快捷键随手记、时间线浏览。基于 Electron + React + TypeScript，打包方式与 [Vicu](https://github.com/rendyhd/Vicu) 同源（electron-vite + electron-builder）。

> MemoTrail is an unofficial desktop client for [Memos](https://github.com/usememos/memos). It talks to the Memos HTTP API, so you need your own Memos server.

## 功能

- **时间线**：按页加载笔记，支持「全部 / 置顶」筛选，`#标签` 高亮。
- **快速记录**：全局快捷键（默认 `⌘⇧M` / `Ctrl+Shift+M`）唤出悬浮输入框，回车即存，`Esc` 收起。
- **托盘常驻**：托盘菜单可直接打开主窗口、唤起快速记录或退出。
- **登录态持久化**：access token 与 refresh cookie 由主进程持有，401 时自动刷新。

## 开发

```bash
npm install
npm run dev        # 启动开发模式
npm run typecheck  # 类型检查
npm run build      # 编译到 out/
```

## 打包

```bash
npm run dist:mac   # dmg，当前机器架构
npm run dist:win   # nsis 安装包
npm run dist:linux # AppImage
```

产物在 `dist/`。CI（`.github/workflows/build.yml`）会在 macOS arm64、macOS x64、Windows x64 上分别构建并上传 artifact；未签名，macOS 首次打开需右键「打开」，或：

```bash
xattr -dr com.apple.quarantine /Applications/MemoTrail.app
```

## 连接服务器

首次启动填入 Memos 服务器地址（如 `https://memos.example.com`，本地部署则是 `http://192.168.1.10:5230`）与账号密码。

> macOS 15 起有「本地网络」隐私门禁：应用首次访问局域网地址会失败（`ERR_ADDRESS_UNREACHABLE`），需要到 **系统设置 → 隐私与安全性 → 本地网络** 里勾选 MemoTrail。仓库已在 `electron-builder.yml` 的 `mac.extendInfo` 中声明 `NSLocalNetworkUsageDescription`。

## 许可证

MIT。Memos 本身亦为 MIT。
