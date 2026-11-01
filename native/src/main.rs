#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]
mod alerts;
mod app;
mod i18n;
mod input;
mod model;
mod overview;
mod platform;
mod schedule;
mod sync;
mod sync_view;
mod tasks;
mod timer_view;
mod ui;
use app::{FocusDeck, View};
use gpui::*;

fn main() -> anyhow::Result<()> {
    let mut path = model::data_path();
    let mut smoke = false;
    let mut windowed = false;
    let mut display_number = None;
    let mut view = View::Tasks;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--data" => {
                path = std::path::PathBuf::from(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--data requires a file path"))?,
                )
            }
            "--smoke-test" => smoke = true,
            "--windowed" => windowed = true,
            "--display" => {
                let number = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--display requires a screen number"))?
                    .parse::<usize>()?;
                anyhow::ensure!(number > 0, "--display numbering starts at 1");
                display_number = Some(number);
            }
            "--view" => {
                view = match args.next().as_deref() {
                    Some("tasks") => View::Tasks,
                    Some("schedule") => View::Schedule,
                    Some("timer") => View::Timer,
                    Some("overview") => View::Overview,
                    _ => anyhow::bail!("--view must be tasks, schedule, timer or overview"),
                }
            }
            "--help" | "-h" => {
                println!(
                    "FocusDeck native\n  --windowed     Start in a normal window (F11 toggles fullscreen)\n  --display <n>  Select a connected screen, starting at 1\n  --data <file>\n  --view <tasks|schedule|timer|overview>\n  --smoke-test   Render every page, then exit; does not write data."
                );
                return Ok(());
            }
            _ => anyhow::bail!("Unknown option: {arg}"),
        }
    }
    let doc = if smoke {
        model::Document::default()
    } else {
        model::Document::load(&path)?
    };
    Application::new().with_assets(ui::Assets).run(move |cx| {
        input::bind(cx);
        cx.text_system()
            .add_fonts(vec![
                std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/PublicSans.ttf")),
                std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Barlow-Bold.ttf")),
                std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Barlow-ExtraBold.ttf")),
            ])
            .expect("Could not load the bundled FocusDeck fonts");
        let displays = cx.displays();
        let display = if let Some(number) = display_number {
            let Some(display) = displays.get(number - 1) else {
                eprintln!(
                    "Screen {number} is unavailable; {} screens are connected.",
                    displays.len()
                );
                cx.quit();
                return;
            };
            Some(display.clone())
        } else {
            cx.primary_display()
        };
        let display_id = display.as_ref().map(|display| display.id());
        let window_size = display
            .as_ref()
            .map(|display| {
                let available = display.bounds().size;
                size(
                    px(1440.).min((available.width - px(48.)).max(px(640.))),
                    px(900.).min((available.height - px(80.)).max(px(480.))),
                )
            })
            .unwrap_or_else(|| size(px(1440.), px(900.)));
        let bounds = Bounds::centered(display_id, window_size, cx);
        let window = cx
            .open_window(
                WindowOptions {
                    display_id,
                    window_bounds: Some(if smoke || windowed {
                        WindowBounds::Windowed(bounds)
                    } else {
                        WindowBounds::Fullscreen(bounds)
                    }),
                    focus: true,
                    titlebar: Some(TitlebarOptions {
                        title: Some("FocusDeck".into()),
                        ..Default::default()
                    }),
                    window_min_size: if smoke {
                        None
                    } else {
                        Some(size(px(640.), px(480.)))
                    },
                    app_id: Some("com.focusdeck.native".into()),
                    ..Default::default()
                },
                move |window, cx| {
                    cx.new(|cx| {
                        let mut app = FocusDeck::new(doc, path, window, cx);
                        app.view = view;
                        app.persistence_enabled = !smoke;
                        app
                    })
                },
            )
            .expect("Could not open the FocusDeck native window");
        #[cfg(target_os = "windows")]
        if smoke || windowed {
            let handle = window
                .update(cx, |_, window, _| {
                    raw_window_handle::HasWindowHandle::window_handle(window)
                        .map(|handle| handle.as_raw())
                })
                .expect("FocusDeck window is alive")
                .expect("Could not obtain the FocusDeck window handle");
            platform::fit_window(handle).expect("Could not fit FocusDeck on its screen");
        }
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.activate(true);
        if smoke {
            cx.spawn(async move |cx| {
                for (w, h) in [(1440., 900.), (1024., 768.), (760., 768.)] {
                    window
                        .update(cx, |_, window, _| window.resize(size(px(w), px(h))))
                        .expect("smoke resize");
                    for locale in ["zh", "en"] {
                        for view in [View::Tasks, View::Schedule, View::Timer, View::Overview] {
                            let before = window
                                .update(cx, |app, _, cx| {
                                    app.doc.ui.locale = locale.into();
                                    app.view = view;
                                    app.nav_open = false;
                                    app.editor = None;
                                    app.menu = None;
                                    let before = app.draw_count;
                                    cx.notify();
                                    before
                                })
                                .expect("smoke window is alive");
                            await_frame(window, before, cx).await;
                            println!("Rendered {view:?}, {locale}, {w}x{h}");
                        }
                    }
                }
                window
                    .update(cx, |_, window, _| window.resize(size(px(1440.), px(900.))))
                    .expect("smoke resize");
                for variant in [
                    "composer",
                    "select",
                    "drawer",
                    "schedule-drawer",
                    "event-editor",
                    "timer-settings",
                    "completion",
                    "agenda",
                    "agenda-overlay",
                ] {
                    if variant == "agenda-overlay" {
                        window
                            .update(cx, |_, window, _| window.resize(size(px(760.), px(768.))))
                            .expect("smoke agenda resize");
                    }
                    let before = window
                        .update(cx, |app, window, cx| {
                            app.nav_open = false;
                            app.editor = None;
                            app.menu = None;
                            app.tasks_open = false;
                            app.composer = false;
                            app.settings = false;
                            app.alert_since = None;
                            app.doc.ui.show_task_agenda = false;
                            match variant {
                                "composer" => {
                                    app.view = View::Tasks;
                                    app.composer = true;
                                }
                                "select" => {
                                    app.view = View::Tasks;
                                    app.composer = true;
                                    app.menu = Some("draft-project".into());
                                }
                                "drawer" => {
                                    app.view = View::Tasks;
                                    app.nav_open = true;
                                }
                                "schedule-drawer" => {
                                    app.view = View::Schedule;
                                    app.tasks_open = true;
                                }
                                "event-editor" => {
                                    app.view = View::Schedule;
                                    app.open_event(Some("e1"), None, window, cx);
                                }
                                "timer-settings" => {
                                    app.view = View::Timer;
                                    app.settings = true;
                                }
                                "agenda" | "agenda-overlay" => {
                                    app.view = View::Tasks;
                                    app.doc.ui.show_task_agenda = true;
                                }
                                _ => {
                                    app.view = View::Timer;
                                    app.doc.timer.last_transition = Some("focus_completed".into());
                                    app.alert_since = Some(std::time::Instant::now());
                                }
                            }
                            let before = app.draw_count;
                            cx.notify();
                            before
                        })
                        .expect("smoke window is alive");
                    await_frame(window, before, cx).await;
                    println!("Rendered {variant}");
                }
                cx.update(|cx| cx.quit()).expect("smoke clean exit");
            })
            .detach();
        }
    });
    Ok(())
}

async fn await_frame(window: WindowHandle<FocusDeck>, before: usize, cx: &mut AsyncApp) {
    for _ in 0..30 {
        Timer::after(std::time::Duration::from_millis(100)).await;
        // Wait for the visible window's normal OS frame callbacks. Forcing draw()
        // would hide a broken redraw loop and could report success for a frozen UI.
        let rendered = window
            .update(cx, |app, _, _| app.draw_count > before)
            .expect("smoke window should stay open");
        if rendered {
            return;
        }
    }
    panic!("GPUI did not repaint the visible window through its normal frame callbacks");
}
