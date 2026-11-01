# 项目目标与范围

- FocusDeck 是待办、课程表式日程、番茄钟和概览组成的生产力工作台，支持中英双语与可选自托管同步。

# 模块结构与职责

- `src/`：现有 React + Vite 前端；`server/`：Hono + SQLite 同步服务；`android/`：Capacitor 外壳；`src-tauri/`：Tauri 外壳。
- `native/`：独立 Rust + GPUI 桌面程序，改造分支为 `codex/rust-gpui`。

# 已确认的设计决策

- 原生桌面程序以现有 `src/styles/` 与 `src/features/` 的界面、配色和交互为基准，独立构建，不依赖 Node.js 或 WebView 运行时。
- 原生版本固定 GPUI 0.2.2；字体、图标和中英文字典内置。以第三屏全屏使用为主要设计与验收场景；默认全屏，`--windowed` 可窗口启动，`F11` 切换全屏。
- 原生程序使用 `--display <n>` 选择第 n 块连接屏幕（从 1 编号）；必须同时传入 GPUI `display_id` 与对应屏幕的窗口边界，以匹配多屏 DPI。窗口尺寸限制在目标屏幕内。屏幕枚举序号不等同于 Windows `DISPLAY` 名称后缀。
- 原生待办优先保证小屏可读性：标题 30–40 px，项目、日期和时间 20–24 px，长标题完整换行，行高随内容变化；较矮窗口将项目筛选合并为下拉菜单。
- 待办页默认隐藏本周日程，让列表占满可用空间；`ui.showTaskAgenda` 记住显示开关。宽屏展开侧栏，窄屏用浮层避免挤压任务正文。
- 本项目禁止 Computer Use、截图识屏操作及模拟鼠标、键盘的本机自动化。

# 关键输入输出格式与接口约定

- 现有数据集合为 `tasks`、`projects`、`tags`、`scheduleEvents`、`timerProfiles`，记录使用 `createdAt`、`updatedAt`、`deletedAt` 毫秒时间戳。
- 日程 `dayIndex` 以周一为 0；日期为 `YYYY-MM-DD`；时间与时长以分钟计。
- 原生存档为 `%LOCALAPPDATA%/FocusDeck/data.json`，不直接读写浏览器存储；支持导入集合、Zustand `state` 对象和原生存档，按 `updatedAt` 合并并保留删除标记。
- 原生同步复用现有登录、时间校准和增量同步接口；网络请求在后台执行，密码与令牌不落盘。

# 已知问题与排查结论

- README 说明 Android 提醒尚未经真机验证。
- 原生 Windows 提醒已实现提示音、任务栏提示与应用内完成覆盖层，未接入通知中心 Toast；Linux/macOS 尚未验证。
- GPUI 的 Windows 隐藏窗口可能没有系统重绘回调。原生冒烟检查必须在可见窗口等待正常系统回调并检查渲染计数；强制 `Window::draw` 只能验证布局，无法证明真实窗口没有卡住。
- GPUI 0.2.2 在混合 DPI 多屏环境中可能按创建时屏幕的 DPI 计算初始位置，目标屏幕正确但窗口越界。Windows 窗口模式启动后使用实际工作区物理坐标再次居中并限制边界。

# 重要待办事项

- 原生界面的逐像素一致性需要实际验收；不得把编译通过视为视觉完全一致。
- 原生 `--smoke-test` 使用内存数据并禁止持久化，覆盖中英文、三种窗口宽度和主要弹层；遵守不截图识屏、不模拟鼠标键盘的约束。
