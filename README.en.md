# FocusDeck

[![CI](https://github.com/Picadoo/focusdeck/actions/workflows/ci.yml/badge.svg)](https://github.com/Picadoo/focusdeck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-00a76f.svg)](LICENSE)

**English** · [简体中文](README.md)

A full-screen productivity workspace for your third monitor — tasks, a Pomodoro timer, and a
timetable-style schedule in one place. Bilingual (English / 简体中文), with optional self-hosted sync.

**▶ Try it live: https://picadoo.github.io/focusdeck/** — no sign-in, nothing to install; your data
stays in your own browser. Android builds are under [Releases](https://github.com/Picadoo/focusdeck/releases).

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

## Deploying to your own server (systemd, no Docker)

**Nothing is built on the target machine — no npm, no compiler.** The only native dependency,
`better-sqlite3`, has its Linux prebuilt binary fetched locally and packed into the tarball. That
constraint isn't fastidiousness: on a small VPS `npm install` is slow and can fail outright when it
falls back to compiling a native module.

One-time setup on the target — installing Node here means extracting the official tarball, not
compiling anything:

```bash
NODE=v22.23.2
curl -fsSL -o /tmp/node.tar.xz https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.xz
sudo mkdir -p /opt/node && sudo tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1

sudo useradd --system --no-create-home --shell /usr/sbin/nologin focusdeck
sudo mkdir -p /opt/focusdeck/data && sudo chown -R focusdeck:focusdeck /opt/focusdeck
```

Credentials go in `/opt/focusdeck/.env` (`0600 root:root` is fine — systemd reads it as root before
dropping privileges): `FOCUSDECK_USER`, `FOCUSDECK_PASSWORD_HASH`, `JWT_SECRET`. Omit the file and
the server generates a secret and an initial password on first start, printing the password once.

Then, for every release, one command locally:

```bash
node scripts/pack-server.mjs --node 22.23.2
```

It compiles the server, builds the front end, installs production dependencies only, swaps in the
linux-x64 `better_sqlite3.node`, **verifies the first four bytes really are `ELF`**, and tars the
result (~4.3 MB). That ELF check matters: `npm ci` installs the host platform's binary, and if
`prebuild-install` fails silently you get a package that looks fine and only fails on the target
with `invalid ELF header`.

Ship it and restart:

```bash
scp focusdeck-svc.tar.gz user@host:/tmp/
ssh user@host '
  sudo rm -rf /opt/focusdeck/svc && sudo mkdir -p /opt/focusdeck/svc
  sudo tar -xzf /tmp/focusdeck-svc.tar.gz -C /opt/focusdeck/svc
  sudo chown -R focusdeck:focusdeck /opt/focusdeck/svc
  sudo cp /opt/focusdeck/svc/focusdeck.service /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now focusdeck'
```

The unit is [`deploy/focusdeck.service`](deploy/focusdeck.service), already locked down with
`ProtectSystem=strict` and `/opt/focusdeck/data` as the only writable path.

Note that the front-end bundle in this package must be built **without `--base`** — the server
serves from the root, so a prefix would 404 every asset. `--base=/focusdeck/` belongs to the GitHub
Pages path only; the two cannot share one build.

Everything stateful lives in `/opt/focusdeck/data`, so `cp -a` on that directory is a complete
backup. **Changing `JWT_SECRET` signs every logged-in device out**, so reuse the same `.env` when
migrating from an older deployment.

Day-to-day:

```bash
sudo systemctl status focusdeck            # status
sudo journalctl -u focusdeck -n 50 -f      # follow logs
sudo systemctl restart focusdeck           # restart; credentials and data are unaffected
curl -s http://127.0.0.1:8788/api/health   # {"ok":true}
```

Shipping a new version is just unpacking over `svc/` and restarting — the data directory is
untouched and logged-in devices stay logged in.

If you are migrating off a container on the same host, **`docker stop` alone is not enough.**
`restart: unless-stopped` does mean "don't restart something that was stopped by hand", but resting
that safety property on the daemon remembering your manual stop is fragile: once the container
comes back after a reboot it fights the systemd service for the same port, and that conflict only
ever surfaces at boot time. Turn it off explicitly, in both places:

```bash
docker update --restart=no <container>
sed -i 's/restart: unless-stopped/restart: "no"/' docker-compose.yml
```

Changing only the container isn't enough — the next `docker compose up` would recreate it with the
old policy from the compose file.

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

## Take a pixel baseline before touching CSS

The hard part of a CSS refactor isn't the change, it's proving you didn't break anything. Eyeballing
two screenshots — or running only "nothing overflows, nothing errors" style assertions — misses a
one-pixel shift or a one-step colour difference. `testkit/pixel_baseline.py` turns "no visual
change" into a number you can print:

```bash
python testkit/pixel_baseline.py capture .baseline/before
# ...change CSS, pnpm build...
python testkit/pixel_baseline.py capture .baseline/after
python testkit/pixel_baseline.py compare .baseline/before .baseline/after
```

Four views × five viewports, 20 shots, compared pixel by pixel with **no tolerance**: one pixel off
by one step is reported, and differing shots are written out as red-tinted `diff-*.png`.

**Run the null control first.** Capture twice without changing anything and compare — it must be
zero. That step is not redundant: it verifies the premise that two runs are identical in the first
place (clock frozen at `FROZEN`, state from a fixed seed, locale pinned to `zh-CN`). If that premise
doesn't hold, the PASS you get after your change proves nothing.

## Design tokens

The `:root` block in `src/styles/index.css` is the **single** source of colour. Feature CSS files
should contain no colour literals.

The palette is transcribed from Minimals; every colour has `main / dark / darker / contrastText`.
Note that **warning's contrast colour is dark `#1c252e`, not white** (`--on-focus`) — `#ffab00` is
bright enough that white text on it is barely legible.

There are exactly three kinds of exception, and they're right to stay literal: `#000` inside
`color-mix()` and `mask-image` is an algorithm parameter rather than a colour choice; the schedule
grid lines have their own scoped variables on `.schedule-grid`; and the scrim overlays use one-off
`rgba(...)` values that appear once each.

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
