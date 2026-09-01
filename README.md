# FocusDeck

第三屏全屏生产力工作台 —— 专业待办、番茄钟、课程表式日程三合一。

## 当前进度

网页端是主体且功能完整，另有一个自托管同步服务端和一个安卓壳，技术栈为：

- Vite 8 + React 19 + TypeScript 6
- 手写 CSS + 设计令牌（`src/styles/index.css` 里 70 个 CSS 变量），**没有引入任何 UI 框架**，
  PostCSS 只挂 autoprefixer
- Zustand（本地状态 + persist）
- TanStack Query（为后续 Tauri IPC 预留）
- 服务端：Hono + better-sqlite3 + JWT（`server/`，可选，不开也能用）
- 安卓端：Capacitor 8 + 一个原生提醒插件（`android/`）
- Tauri 2 已初始化（待本机 Rust 编译环境就绪后构建）

## 已实现功能

- 专业深色仪表盘布局，三栏：待办 / 日程 / 番茄钟
- 待办事项：项目、优先级、标签、搜索、完成状态、进度条、快速添加
- 番茄钟：经典/深度/长专注三种配置，防漂移计时，开始/暂停/继续/跳过/重置，任务绑定
- 课程表式周视图：全天 24 小时、当前时间线、默认示例事件、周切换
- 沉浸模式：按 `F` 切换，按 `Esc` 退出
- 番茄钟快捷键：`Space` 开始/暂停/继续（输入框外）
- 数据本地持久化（localStorage），**不连服务端也是完整可用的**
- 可选的自托管云同步：`server/` 提供带 JWT 鉴权的增量同步 API，多端按时间戳合并，断网照常写、联网再对账
- 安卓端：Capacitor 8 打包，带原生提醒插件与应用内通知自检面板（APK 能出包，**真机尚未验证**）
- 中英双语，顶栏 `中 / EN` 一键切换：切换即时生效、刷新后保持，日期格式与星期名跟着走
- 番茄钟结束提醒分三层，按「人在哪儿」覆盖：窗口可见时全屏色脉冲（三次即停，遵守
  `prefers-reduced-motion`）、切到别的标签页时标题闪烁 + favicon 变色、切到别的应用时常驻系统通知

## 运行方式

```bash
git clone https://github.com/Picadoo/focusdeck.git
cd focusdeck
pnpm install
pnpm dev
```

然后打开 http://localhost:5173。**不需要跑服务端**——不登录时数据存在 localStorage 里，功能是完整的。

## 构建前端

```bash
pnpm build
```

产物在 `dist/`。

## 国际化（中 / EN）

字典在 `src/i18n/`，`zh.ts` 与 `en.ts` 键集一一对应，`MessageKey` 由 `zh.ts` 反推
（`export type MessageKey = keyof typeof zh`），所以**加键先加 `zh.ts`**，`en.ts` 少一条就是类型错误。

分两层是为了断开循环依赖，加代码时别接错：

| 层 | 文件 | 谁用 |
| --- | --- | --- |
| 内核 | `i18n/messages.ts` | `lib/utils.ts`、`lib/data.ts`、原生通知等**非 React 模块**，走模块级 `t()` |
| React 层 | `i18n/index.ts` | 组件，走 `useI18n()`；语言一变整棵树重渲染 |

内核里的 `activeLocale` 由 `uiStore` 在三个时机推送：模块初始化、`setLocale`、`onRehydrateStorage`。
非 React 模块只能依赖内核层——反过来 import `index.ts` 会绕回 `uiStore` 成环。

两条容易踩的：

- `data.ts` 里的默认项目 / 标签 / 番茄档位是**函数不是常量**。常量在模块加载期求值，那会儿语言还没定，会永远停在猜测值上。
- 组件里若在 `useMemo` 中调模块级 `t()`，必须把 `locale` 放进依赖数组。linter 看不见这层依赖会报
  `exhaustive-deps`，那是误报，加 `eslint-disable-next-line` 并写明原因，别删依赖。

查漏与验收：

```bash
node scripts/i18n-scan.mjs          # 扫剩余未翻译的中文字面量，应为 0
python testkit/verify_i18n.py       # 端到端：lang/title 跟随、两语言互斥、切换即时、刷新保持
```

## 番茄钟结束提醒

声音之外还有两条视觉通道，因为「没戴耳机就完全错过」是这类工具的常见失效。三层按**人在哪儿**分：

| 人在哪儿 | 通道 | 实现 |
| --- | --- | --- |
| 正看着 FocusDeck | 全屏色脉冲 + 卡片入场 | `timer-alerts.css`，3 × 600ms 后停在淡色 |
| 浏览器的别的标签页 | 标题闪烁 + favicon 变色 | `TabAttention` + `lib/favicon.ts` |
| 别的应用里 | 常驻系统通知 | `alerts.ts`，`requireInteraction` 且失焦即发 |

改这块时注意两条：

- **脉冲频率不能随便调快。** 600ms 一次约 1.67 Hz，是照 WCAG「每秒不超过三次闪光」的光敏性癫痫上限定的，
  且必须保留 `prefers-reduced-motion` 的退化分支——这东西会在用户毫无防备时突然全屏亮起。
- **`document.title` 只能有一个所有者。** 专注结束后休息立刻开跑、计时文案每秒重写一次，
  另起一个组件写标题必然与之互相冲掉，所以提醒态与计时态在 `TabAttention` 的同一个 effect 里分支。

```bash
python testkit/verify_timer_alert.py   # 三层各一组断言，量真实 DOM
python testkit/shot_timer_alert.py     # 出截图：脉冲波峰与常驻态各一张
```

## 服务端一键部署（Docker）—— 已停用

> **这一节不再是推荐路径。** 项目已明确不走 Docker、也不在任何服务器上构建，前端一律本机
> `pnpm build` 出 `dist/` 再分发。下面的内容原样保留，是因为这套 compose 曾在真服务器上跑通过
> 八条端到端断言（含「容器重建不掉线、不改密」），删掉就找不回来了——留作历史参考，别照着部署。

前端 `dist` 和同步 API 打进同一个镜像、同源提供服务，所以不需要额外的 nginx，也不用给前端配 `VITE_API_BASE`。

```bash
docker compose up -d --build
docker compose logs focusdeck        # 首次启动会在这里打印初始密码
```

打开 http://127.0.0.1:8787 即可。默认只绑回环，要直连改 `BIND=0.0.0.0`。

不写任何配置也能起来：JWT 密钥和初始密码在首次启动时生成，写进 `focusdeck-data` 卷，**容器重建后 token 不失效、密码不变**。想固定配置就 `cp .env.example .env` 再改，`.env` 里的值优先级高于自举出来的。

改密码有三条路：

```bash
# 1) 明文交给容器自己算哈希
echo "FOCUSDECK_PASSWORD=你的密码" >> .env && docker compose up -d

# 2) 只把哈希写进 .env，明文不落盘
docker compose run --rm --entrypoint node focusdeck dist/hash-password.js 你的密码

# 3) 删掉持久化的哈希，下次启动重新生成并打印
docker compose exec focusdeck rm /data/password-hash && docker compose restart
```

数据在命名卷 `focusdeck-data`（`focusdeck.db` + `jwt-secret` + `password-hash`），备份直接导出这个卷。

`deploy/focusdeck.compose.yml` 是现网那套「宿主 nginx 发前端 + 容器只跑 API」的部署，保持原样不受影响：`STATIC_DIR` 指向的目录不存在时服务端会跳过内置静态站点，行为与改造前一致。

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
│   │   ├── nav/            # 侧栏 / 底栏导航、语言切换器
│   │   ├── overview/       # 概览页
│   │   ├── tasks/          # 待办事项
│   │   ├── timer/          # 番茄钟（含结束提醒 TimerAlerts）
│   │   ├── schedule/       # 课程表式日程
│   │   ├── sync/           # 登录、同步状态、通知自检
│   │   └── workspace/      # 页面容器
│   ├── i18n/               # 中英字典与翻译内核（见「国际化」一节）
│   ├── stores/             # Zustand 状态
│   ├── styles/             # 全局样式与设计令牌
│   ├── lib/                # 工具函数、默认数据、提醒、同步
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Tauri 2 Rust 后端
├── android/                # Capacitor 8 安卓工程
├── server/                 # Hono + better-sqlite3 同步 API
├── testkit/                # Playwright 验收（冻结时钟 + 种子 + 量几何）
├── scripts/                # 开发辅助：i18n 扫描、内存守护、显示器探测
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
- [ ] 安卓真机验证（APK 已能出包，但至今没在真机上跑过）

## 许可证

[MIT](LICENSE)。
