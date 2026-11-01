# FocusDeck Native

`codex/rust-gpui` 分支中的 Rust + GPUI 桌面版本。独立于 `src/` 和 `src-tauri/`，运行时无需 Node.js、浏览器或 WebView。

## 构建与运行

Windows 需要 Rust stable（至少 1.88）和 Visual Studio C++ Build Tools / Windows SDK。

```powershell
cargo build --release --locked --manifest-path native/Cargo.toml
.\native\target\release\focusdeck-native.exe
```

默认全屏启动，与原 Tauri 配置一致。按 `F11` 切换全屏；也可以窗口模式启动：

第三屏全屏启动使用 `.\native\target\release\focusdeck-native.exe --display 3`。界面以全屏使用为主要设计场景，待办内容优先占据可用空间。

```powershell
.\native\target\release\focusdeck-native.exe --windowed
.\native\target\release\focusdeck-native.exe --windowed --view timer
.\native\target\release\focusdeck-native.exe --windowed --display 3
```

`--display` 按当前连接屏幕的枚举顺序从 1 编号（不等同于 Windows 的 `DISPLAY` 名称后缀）；窗口会在指定屏幕内居中并按该屏尺寸缩小。全屏启动也使用同一目标屏幕。

`--view` 支持 `tasks`、`schedule`、`timer`、`overview`。`Space` 开始 / 暂停 / 继续计时；`F` 进入番茄页；`Esc` 先关闭弹层，再返回待办。输入框内的正常文字输入不会触发番茄快捷键。

## 界面与功能

- 待办：项目筛选、完成 / 恢复、删除、快速添加、截止时间、优先级、预估番茄、拖拽排序、关联专注。
- 日程：周 / 日视图、日期切换、周末开关、项目图例筛选、自适应时间范围 / 全天、当前时间线、编辑弹层、每周重复、重叠分栏；编辑模式下支持拖拽创建、移动、缩放；从任务抽屉拖入日程。
- 番茄钟：经典 / 深度 / 长专注、自定义时长、绑定任务、暂停 / 恢复 / 重置 / 跳过、专注归账、长休间隔；按结束时间计算剩余时间，避免逐秒递减产生漂移。
- 概览：四项指标、今日时间线、任务完成度、即将到期、专注投入、累计时长。
- 界面沿用原版 `src/styles/` 与 `src/features/` 中的配色和布局数值，内置原版 Lucide 图标以及 Public Sans / Barlow 字体；中英文字典取自现有前端。

任务列表只布局可见项目，支持长标题换行；圆环直接使用 GPUI GPU 路径。静止界面按分钟更新时钟，计时运行时每秒更新；不会每秒写文件。

待办页默认隐藏「本周日程」，让任务列表占满可用宽高；顶栏可以显示 / 隐藏日程，设置会记住。宽窗口展开右侧日程栏，窄窗口使用浮层，不压缩待办列表。任务标题为 30–40 px，项目、日期与时间为 20–24 px；长标题完整换行，卡片行高随内容变化。较矮窗口将项目筛选收进下拉菜单，为任务正文让出空间。

## 数据与同步

Windows 存档为 `%LOCALAPPDATA%\FocusDeck\data.json`，与网页 `localStorage` 分开。修改时先写临时文件并同步，再替换存档；无法解析的旧文件会报错并保留。可用 `--data <path>` 指定单独存档。

菜单内可以导入、导出 JSON。导入支持集合对象、原版 Zustand `{ "state": ..., "version": 6 }` 对象，以及本程序存档；按记录 `updatedAt` 合并，保留更新的本地修改和删除标记。

从原网页迁移：在原网页开发者工具 Console 执行下面的表达式，把返回的 JSON 保存成文件，再从原生菜单导入：

```javascript
JSON.stringify(JSON.parse(localStorage.getItem('focusdeck-app-storage')), null, 2)
```

也可以在菜单中的「私人账号同步」填写现有 FocusDeck 服务器地址、用户名和密码。使用原版 `/api/auth/login`、`/api/time`、`/api/sync` 协议；联网操作在后台执行，登录后每 30 秒同步，可点击顶栏状态手动同步。密码和令牌只在内存中保存，重启后需重新登录。

## 提醒与验证边界

Windows 使用系统提示音、任务栏闪烁和应用内完成提醒；全屏色脉冲限定为 3 次、每次 600ms，并尊重 Windows 的动画辅助功能设置。浏览器标题 / favicon 通道由原生任务栏提示替代；尚未接入 Windows 系统通知中心 Toast。

Windows 已进行实际编译与 GPUI 渲染验证。其他系统尚未验证，平台提醒暂仅实现 Windows。未使用截图识屏或模拟鼠标、键盘的自动化；像素级一致性与实际使用中的性能增益仍需人工验收，不能从编译通过推断。

```powershell
cargo test --release --locked --manifest-path native/Cargo.toml
cargo clippy --locked --manifest-path native/Cargo.toml -- -D warnings
cargo fmt --manifest-path native/Cargo.toml -- --check
.\native\target\release\focusdeck-native.exe --smoke-test
```

`--smoke-test` 使用内存示例数据，禁止持久化，在可见窗口中验证两种语言、三种窗口尺寸、弹层和日程显示开关后自行退出。它等待系统正常触发重绘，不调用强制绘制，不操作现有网页或用户存档；可配合 `--display 3` 指定验收屏幕。

## 源码

| 模块 | 职责 |
| --- | --- |
| `src/app.rs` | 窗口布局、导航、快捷键、更新调度 |
| `src/model.rs` | 原版兼容的数据结构、计时、日程与持久化 |
| `src/tasks.rs` / `schedule.rs` | 任务与日程界面及操作 |
| `src/timer_view.rs` / `overview.rs` | 番茄钟与概览界面 |
| `src/sync.rs` / `sync_view.rs` | 原服务端协议与登录同步入口 |
| `src/input.rs` | 支持中文输入法、选择和剪贴板的 GPUI 原生文本输入 |
| `src/alerts.rs` / `platform.rs` | 完成提醒与 Windows 平台能力 |
| `src/ui.rs` / `i18n.rs` | 原版样式、图标与文案 |

应用代码沿用仓库 MIT 许可证。文本输入实现改编自 GPUI 的 Apache-2.0 示例，许可证见 `LICENSES/`；Lucide 和字体许可随对应素材保存在 `assets/`。
