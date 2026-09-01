# FocusDeck

[![CI](https://github.com/Picadoo/focusdeck/actions/workflows/ci.yml/badge.svg)](https://github.com/Picadoo/focusdeck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-00a76f.svg)](LICENSE)

**English** · [简体中文](README.md)

A full-screen productivity workspace for your third monitor — tasks, a Pomodoro timer, and a
timetable-style schedule in one place. Bilingual (English / 简体中文), with optional self-hosted sync.

## Screenshots

Overview: four daily metrics, a merged timeline, a completion ring, and what's due next.

![Overview](docs/screenshots/overview-zh.png)

Tasks (shown in English — the `中 / EN` switch in the header applies instantly, no reload).
Tasks on the left, this week's schedule on the right; schedule events fold into that day's task view.

![Tasks](docs/screenshots/tasks-en.png)

<table>
<tr>
<td width="50%"><img src="docs/screenshots/timer-zh.png" alt="Pomodoro timer"></td>
<td width="50%"><img src="docs/screenshots/schedule-zh.png" alt="Timetable-style schedule"></td>
</tr>
<tr>
<td>Pomodoro: three presets, optionally bound to a task</td>
<td>Weekly timetable: live time line, recurring events</td>
</tr>
</table>

The full-screen colour pulse when a Pomodoro ends (captured at the peak; one pulse every 600 ms,
three pulses then it settles — deliberately below the WCAG photosensitivity threshold):

![Pomodoro end alert](docs/screenshots/timer-alert-pulse.png)

## Quick start

```bash
git clone https://github.com/Picadoo/focusdeck.git
cd focusdeck
pnpm install
pnpm dev
```

Open http://localhost:5173. **You do not need the server.** When you are not signed in, everything
lives in `localStorage` and the app is fully functional.

To produce a production build:

```bash
pnpm build      # tsc -b && vite build, output in dist/
```

## What's built

- Light dashboard with four views — Overview / Tasks / Schedule / Timer. Top bar on desktop,
  bottom bar on phones.
- **Tasks**: projects, priorities, tags, search, completion state, progress bars, quick add.
- **Pomodoro**: Classic / Deep / Long presets, drift-free timing, start / pause / resume / skip /
  reset, optional task binding.
- **Timetable-style week view**: full 24 hours, live current-time line, recurring events, week
  navigation.
- **Immersive mode**: `F` to toggle, `Esc` to leave. `Space` starts/pauses the timer when focus is
  outside an input.
- **Local-first persistence** via `localStorage`.
- **Optional self-hosted sync**: `server/` exposes a JWT-authenticated incremental sync API.
  Multiple devices merge by timestamp — keep writing offline, reconcile when you reconnect.
- **Android**: packaged with Capacitor 8, including a native reminder plugin and an in-app
  notification self-check panel. The APK builds, but **it has not been verified on a real device yet.**
- **Bilingual**: one click in the header. The switch is instant and survives a reload; date formats
  and weekday names follow the locale.
- **A three-layer end-of-Pomodoro alert**, covered in detail [below](#the-end-of-pomodoro-alert).

## Tech stack

The web app is the main artefact; a self-hosted sync server and an Android shell sit alongside it.

- Vite 8 + React 19 + TypeScript 6
- **Hand-written CSS with design tokens** (70 CSS custom properties in `src/styles/index.css`) —
  **no UI framework of any kind**. PostCSS runs autoprefixer and nothing else.
- Zustand for state (with `persist`)
- TanStack Query (reserved for the planned Tauri IPC layer)
- Server: Hono + better-sqlite3 + JWT (`server/`, optional)
- Android: Capacitor 8 plus one native reminder plugin (`android/`)
- Tauri 2 is scaffolded but not yet buildable on this machine (see [Tauri](#tauri))

## Internationalisation

Dictionaries live in `src/i18n/`. `zh.ts` and `en.ts` have identical key sets, and `MessageKey` is
derived from the Chinese one (`export type MessageKey = keyof typeof zh`). **So add the key to
`zh.ts` first** — if `en.ts` is missing an entry, that is a type error, not a silent gap.

There are two layers, and wiring them the wrong way round creates an import cycle:

| Layer | File | Consumers |
| --- | --- | --- |
| Core | `i18n/messages.ts` | Non-React modules — `lib/utils.ts`, `lib/data.ts`, native notifications — via a module-level `t()` |
| React | `i18n/index.ts` | Components, via `useI18n()`; changing locale re-renders the tree |

`activeLocale` in the core layer is pushed by `uiStore` at three moments: module init, `setLocale`,
and `onRehydrateStorage`. **Non-React modules may only depend on the core layer** — importing
`index.ts` from one of them loops back through `uiStore` and forms a cycle.

Two traps worth knowing about:

- The default projects / tags / timer presets in `data.ts` are **functions, not constants**.
  A constant is evaluated at module load, before the locale is known, so it would be frozen at
  whatever the initial guess was.
- If a component calls the module-level `t()` inside a `useMemo`, `locale` **must** be in the
  dependency array. The linter cannot see that dependency and will report `exhaustive-deps`;
  that warning is wrong — suppress it with a comment explaining why, don't drop the dependency.

Checking for gaps:

```bash
node scripts/i18n-scan.mjs                # finds untranslated CJK literals; exits 1 if any (this is the CI gate)
node scripts/i18n-scan.mjs --report-only  # report without the failure exit code
python testkit/verify_i18n.py             # end-to-end: lang/title follow, no cross-locale leakage, instant switch, survives reload
```

## The end-of-Pomodoro alert

Sound alone fails in the most common case: you took your headphones off. So there are two visual
channels as well, split by **where the person actually is**:

| Where you are | Channel | Implementation |
| --- | --- | --- |
| Looking at FocusDeck | Full-screen colour pulse + card entrance | `timer-alerts.css`, 3 × 600 ms then settles to a faint tint |
| Another browser tab | Title flashing + recoloured favicon | `TabAttention` + `lib/favicon.ts` |
| A different application | Persistent system notification | `alerts.ts`, `requireInteraction`, fires when the window loses focus |

Two constraints to respect if you touch this code:

- **Do not speed the pulse up.** One pulse per 600 ms is roughly 1.67 Hz, chosen against the WCAG
  "no more than three flashes per second" photosensitive-epilepsy limit. The
  `prefers-reduced-motion` fallback must stay too — this thing lights up the whole screen with no
  warning.
- **`document.title` can only have one owner.** The break starts the instant focus ends, and the
  countdown rewrites the title every second, so a second component writing the title would fight
  with it. The alert state and the countdown state therefore branch inside a single effect in
  `TabAttention`.

```bash
python testkit/verify_timer_alert.py   # one assertion group per layer, measured against real DOM
python testkit/shot_timer_alert.py     # screenshots: one at the pulse peak, one after it settles
```

## Self-hosted sync server (optional)

`server/` is a standalone sub-project: Hono + better-sqlite3 + JWT, with its own
`package-lock.json`. The front end only talks to it over HTTP and never imports its source.

```bash
cd server
npm install
npm run build
node dist/index.js
```

On first start it generates a JWT secret and an initial password into the data directory and
**prints the password once**. Nothing needs to be configured up front; `server/.env.example` shows
the variables if you'd rather pin them.

The server can also serve the front end itself: if `STATIC_DIR` (default `./public`) exists it
mounts static hosting with SPA fallback and tiered cache headers, so one process serves both the
app and the API — no nginx required. CORS already allows `capacitor://localhost` and
`tauri://localhost`, so the Android build can connect without further changes.

> There is also a Docker setup in the repository (`Dockerfile`, `docker-compose.yml`,
> `deploy/`). **It is retained for reference only and is no longer the recommended path.** It did
> once pass eight end-to-end assertions on a real server — including "credentials survive a
> container rebuild" — which is why it wasn't deleted outright. Don't deploy from it.

## Tauri

Tauri 2 is scaffolded, but the MinGW that ships with Git Bash on this machine has no
`dlltool.exe`, so the `x86_64-pc-windows-gnu` target cannot link. Either install a full
MSYS2 / MinGW-w64 toolchain, or install the Visual Studio Build Tools and switch to
`x86_64-pc-windows-msvc`. Then:

```bash
pnpm tauri-build
```

## Repository layout

```
focusdeck/
├── src/                    # React front end
│   ├── features/
│   │   ├── nav/            # sidebar / bottom nav, language switch
│   │   ├── overview/
│   │   ├── tasks/
│   │   ├── timer/          # Pomodoro, including TimerAlerts
│   │   ├── schedule/
│   │   ├── sync/           # sign-in, sync status, notification self-check
│   │   └── workspace/      # view container
│   ├── i18n/               # dictionaries + translation core
│   ├── stores/             # Zustand
│   ├── styles/             # globals and design tokens
│   ├── lib/                # utilities, seed data, alerts, sync
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Tauri 2 Rust backend
├── android/                # Capacitor 8 project
├── server/                 # Hono + better-sqlite3 sync API
├── testkit/                # Playwright acceptance (frozen clock, seeded state, measured geometry)
├── scripts/                # i18n scan, memory guard, monitor probing
├── docs/screenshots/
└── package.json
```

## Roadmap

- [ ] Set up a complete Windows toolchain and ship a Tauri installer
- [ ] Move the Pomodoro engine and persistence into Rust
- [ ] Monitor detection and auto full-screen on the third display
- [ ] Drag to reorder tasks, and drag tasks onto the schedule
- [ ] Recurrence rules (alternating weeks, specific weeks)
- [ ] Native notifications, sound effects, tray icon
- [ ] Verify the Android build on a real device (the APK builds; it has never been installed)

## Licence

[MIT](LICENSE).
