# FocusDeck

第三屏全屏生产力工作台 —— 专业待办、番茄钟、课程表式日程三合一。

## 当前进度

这是一个早期网页版实现，技术栈为：

- Vite 8 + React 19 + TypeScript 6
- Tailwind CSS 4（PostCSS 模式）
- Zustand（本地状态 + persist）
- TanStack Query（为后续 Tauri IPC 预留）
- Tauri 2 已初始化（待本机 Rust 编译环境就绪后构建）

## 已实现功能

- 专业深色仪表盘布局，三栏：待办 / 日程 / 番茄钟
- 待办事项：项目、优先级、标签、搜索、完成状态、进度条、快速添加
- 番茄钟：经典/深度/长专注三种配置，防漂移计时，开始/暂停/继续/跳过/重置，任务绑定
- 课程表式周视图：全天 24 小时、当前时间线、默认示例事件、周切换
- 沉浸模式：按 `F` 切换，按 `Esc` 退出
- 番茄钟快捷键：`Space` 开始/暂停/继续（输入框外）
- 数据本地持久化（localStorage）

## 运行方式

```bash
cd focusdeck
pnpm install
pnpm dev
```

然后打开 http://localhost:5173。

## 构建前端

```bash
pnpm build
```

产物在 `dist/`。

## Tauri 构建说明

当前 Tauri 2 已初始化，但由于本机 Git Bash 自带的 MinGW 缺少 `dlltool.exe`，`x86_64-pc-windows-gnu` target 无法完成链接。需要以下任一方案后才能构建 Windows 安装包：

1. 安装完整 MSYS2 / MinGW-w64 工具链（推荐），补充 `dlltool.exe`；
2. 或安装 Visual Studio Build Tools 并添加 `x86_64-pc-windows-msvc` target，改用 MSVC 构建。

安装完成后运行：

```bash
pnpm tauri-build
```

## 目录结构

```
focusdeck/
├── src/                    # React 前端
│   ├── features/           # 功能模块
│   │   ├── tasks/          # 待办事项
│   │   ├── timer/          # 番茄钟
│   │   └── schedule/       # 课程表式日程
│   ├── stores/             # Zustand 状态
│   ├── styles/             # 全局样式与设计令牌
│   ├── lib/                # 工具函数与默认数据
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Tauri 2 Rust 后端
├── index.html
├── vite.config.ts
├── postcss.config.js
└── package.json
```

## 下一步计划

- [ ] 配置完整 Windows 构建工具链，成功编译 Tauri 安装包
- [ ] 实现 Rust 端番茄钟引擎与 SQLite 持久化
- [ ] 实现显示器检测与第三屏全屏启动
- [ ] 任务拖拽排序与拖入日程表
- [ ] 课程重复规则（单双周、指定周）
- [ ] 原生通知、音效与托盘图标
