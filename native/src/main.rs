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
                    "FocusDeck native\n  --windowed     Start in a normal window (F11 toggles fullscreen)\n  --data <file>\n  --view <tasks|schedule|timer|overview>\n  --smoke-test   Render every page, then exit; does not write data."
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
        let bounds = Bounds::centered(None, size(px(1440.), px(900.)), cx);
        let window = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(if smoke || windowed {
                        WindowBounds::Windowed(bounds)
                    } else {
                        WindowBounds::Fullscreen(bounds)
                    }),
                    focus: !smoke,
                    titlebar: Some(TitlebarOptions {
                        title: Some("FocusDeck".into()),
                        ..Default::default()
                    }),
                    window_min_size: if smoke {
                        None
                    } else {
                        Some(size(px(800.), px(600.)))
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
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
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
                ] {
                    let before = window
                        .update(cx, |app, window, cx| {
                            app.nav_open = false;
                            app.editor = None;
                            app.menu = None;
                            app.tasks_open = false;
                            app.composer = false;
                            app.settings = false;
                            app.alert_since = None;
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
        } else {
            cx.activate(true);
        }
    });
    Ok(())
}

async fn await_frame(window: WindowHandle<FocusDeck>, before: usize, cx: &mut AsyncApp) {
    for _ in 0..30 {
        Timer::after(std::time::Duration::from_millis(100)).await;
        // A hidden Windows window can be occluded and receive no frame requests.
        // Draw through GPUI itself, without capturing the screen or injecting input.
        AnyWindowHandle::from(window)
            .update(cx, |_, window, cx| {
                window.refresh();
                window.draw(cx).clear();
            })
            .expect("smoke GPUI drawing");
        let rendered = window
            .update(cx, |app, _, _| app.draw_count > before)
            .expect("smoke window should stay open");
        if rendered {
            return;
        }
    }
    panic!("GPUI did not render the requested page");
}
