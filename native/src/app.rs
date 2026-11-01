use crate::{
    i18n::{fmt, tr},
    input::{InputEvent, TextInput},
    model::{self, Document},
    ui::*,
};
use chrono::{Datelike, Local};
use gpui::{prelude::*, *};
use std::path::PathBuf;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum View {
    Tasks,
    Schedule,
    Timer,
    Overview,
}
impl View {
    pub fn key(self) -> &'static str {
        match self {
            Self::Tasks => "nav.tasks",
            Self::Schedule => "nav.schedule",
            Self::Timer => "nav.timer",
            Self::Overview => "nav.overview",
        }
    }
    pub fn glyph(self) -> &'static str {
        match self {
            Self::Tasks => "ListTodo",
            Self::Schedule => "Calendar",
            Self::Timer => "Clock",
            Self::Overview => "LayoutDashboard",
        }
    }
}

pub struct EventEditor {
    pub id: Option<String>,
    pub project: String,
    pub date: Entity<TextInput>,
    pub start: Entity<TextInput>,
    pub end: Entity<TextInput>,
    pub title: Entity<TextInput>,
    pub repeat: bool,
    pub create_task: bool,
}

pub struct FocusDeck {
    pub doc: Document,
    pub path: PathBuf,
    pub view: View,
    pub focus: FocusHandle,
    pub nav_open: bool,
    pub message: Option<String>,
    pub menu: Option<String>,
    pub project_filter: String,
    pub draft: Entity<TextInput>,
    pub composer: bool,
    pub draft_project: String,
    pub draft_priority: String,
    pub draft_due: Entity<TextInput>,
    pub draft_estimate: i64,
    pub week_offset: i64,
    pub day_offset: i64,
    pub day_view: bool,
    pub edit_schedule: bool,
    pub tasks_open: bool,
    pub hidden_projects: std::collections::HashSet<String>,
    pub editor: Option<EventEditor>,
    pub editor_error: Option<String>,
    pub settings: bool,
    pub tick: Option<gpui::Task<()>>,
    pub _subscriptions: Vec<Subscription>,
    pub profile_inputs: Vec<Entity<TextInput>>,
    pub alert_since: Option<std::time::Instant>,
    pub schedule_bounds: Option<Bounds<Pixels>>,
    pub schedule_hours: (i32, i32),
    pub drag: Option<crate::schedule::ScheduleDrag>,
    pub server_input: Entity<TextInput>,
    pub username_input: Entity<TextInput>,
    pub password_input: Entity<TextInput>,
    pub session: Option<crate::sync::Session>,
    pub sync_busy: bool,
    pub sync_error: Option<String>,
    pub sync_generation: u64,
    pub network_task: Option<gpui::Task<()>>,
    pub reduced_motion: bool,
    pub task_list: ListState,
    pub viewport_width: f32,
    pub draw_count: usize,
    pub persistence_enabled: bool,
}

impl FocusDeck {
    pub fn new(doc: Document, path: PathBuf, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let draft =
            cx.new(|cx| TextInput::new(tr(&doc.ui.locale, "tasks.composer.placeholder"), cx));
        let draft_due = cx.new(|cx| TextInput::new("YYYY-MM-DD HH:MM", cx));
        let mut subscriptions = Vec::new();
        subscriptions.push(cx.subscribe(&draft, |this, _, event, cx| match event {
            InputEvent::Submit => this.submit_task(cx),
            InputEvent::Changed => {
                this.composer = true;
                cx.notify();
            }
        }));
        let profile = doc.data.profile(&doc.timer.profile_id);
        let mut profile_inputs = Vec::new();
        for value in [
            profile.focus_seconds / 60,
            profile.short_break_seconds / 60,
            profile.long_break_seconds / 60,
            profile.sessions_before_long_break,
        ] {
            profile_inputs.push(cx.new(|cx| {
                let mut input = TextInput::new("", cx);
                input.set(value.to_string(), cx);
                input
            }));
        }
        let focus = cx.focus_handle();
        window.focus(&focus);
        let server_input = cx.new(|cx| {
            let mut input = TextInput::new("http://127.0.0.1:8787", cx);
            input.set(doc.sync.server.clone(), cx);
            input
        });
        let username_input = cx.new(|cx| {
            let mut input = TextInput::new("focus", cx);
            input.set(
                if doc.sync.username.is_empty() {
                    "focus".into()
                } else {
                    doc.sync.username.clone()
                },
                cx,
            );
            input
        });
        let password_input = cx.new(|cx| {
            let mut input = TextInput::new("", cx);
            input.secret = true;
            input
        });
        subscriptions.push(cx.subscribe_in(
            &password_input,
            window,
            |this, input, event, window, cx| {
                if matches!(event, InputEvent::Submit) {
                    let password = input.read(cx).content.to_string();
                    this.begin_sync(Some(password), window, cx);
                }
            },
        ));
        let mut app = Self {
            doc,
            path,
            view: View::Tasks,
            focus,
            nav_open: false,
            message: None,
            menu: None,
            project_filter: String::new(),
            draft,
            composer: false,
            draft_project: "work".into(),
            draft_priority: "p2".into(),
            draft_due,
            draft_estimate: 1,
            week_offset: 0,
            day_offset: 0,
            day_view: false,
            edit_schedule: false,
            tasks_open: false,
            hidden_projects: Default::default(),
            editor: None,
            editor_error: None,
            settings: false,
            tick: None,
            _subscriptions: subscriptions,
            profile_inputs,
            alert_since: None,
            schedule_bounds: None,
            schedule_hours: (8, 22),
            drag: None,
            server_input,
            username_input,
            password_input,
            session: None,
            sync_busy: false,
            sync_error: None,
            sync_generation: 0,
            network_task: None,
            reduced_motion: crate::platform::reduced_motion(),
            task_list: ListState::new(0, ListAlignment::Top, px(200.)),
            viewport_width: 0.,
            draw_count: 0,
            persistence_enabled: true,
        };
        app.tick = Some(cx.spawn_in(window, async move |this, cx| {
            let mut previous_minute = Local::now().timestamp() / 60;
            let mut last_sync = std::time::Instant::now();
            loop {
                Timer::after(std::time::Duration::from_secs(1)).await;
                if this
                    .update_in(cx, |this, window, cx| {
                        let changed = this
                            .doc
                            .timer
                            .tick(&mut this.doc.data, Local::now().timestamp());
                        if changed {
                            this.alert_since = Some(std::time::Instant::now());
                            this.save();
                            crate::platform::alert(
                                window,
                                this.doc.ui.sound_enabled,
                                this.doc.ui.notify_enabled,
                            );
                        }
                        let minute = Local::now().timestamp() / 60;
                        if this.session.is_some()
                            && !this.sync_busy
                            && last_sync.elapsed().as_secs() >= 30
                        {
                            last_sync = std::time::Instant::now();
                            this.begin_sync(None, window, cx);
                        }
                        if this.doc.timer.running()
                            || changed
                            || minute != previous_minute
                            || this.alert_since.is_some()
                        {
                            previous_minute = minute;
                            cx.notify();
                        }
                    })
                    .is_err()
                {
                    break;
                }
            }
        }));
        app
    }
    pub fn t(&self, key: &str) -> String {
        tr(&self.doc.ui.locale, key)
    }
    pub fn tf(&self, key: &str, values: &[(&str, String)]) -> String {
        fmt(&self.doc.ui.locale, key, values)
    }
    pub fn save(&mut self) {
        if !self.persistence_enabled {
            return;
        }
        self.task_list.reset(self.task_list.item_count());
        if let Err(error) = self.doc.save(&self.path) {
            self.message = Some(format!("{}: {error:#}", self.t("common.save")));
        }
    }
    pub fn navigate(&mut self, view: View, cx: &mut Context<Self>) {
        self.view = view;
        self.nav_open = false;
        self.menu = None;
        self.tasks_open = false;
        cx.notify();
    }
    pub fn input_focused(&self, window: &Window, cx: &App) -> bool {
        let focused = |input: &Entity<TextInput>| input.read(cx).focused(window);
        (self.composer
            && (self.view == View::Tasks || self.tasks_open)
            && [&self.draft, &self.draft_due].into_iter().any(focused))
            || (self.nav_open
                && [
                    &self.server_input,
                    &self.username_input,
                    &self.password_input,
                ]
                .into_iter()
                .any(focused))
            || (self.view == View::Timer
                && self.settings
                && self.profile_inputs.iter().any(focused))
            || self.editor.as_ref().is_some_and(|e| {
                [&e.title, &e.date, &e.start, &e.end]
                    .into_iter()
                    .any(focused)
            })
    }
    pub fn timer_toggle(&mut self, cx: &mut Context<Self>) {
        self.doc
            .timer
            .toggle(&mut self.doc.data, Local::now().timestamp());
        self.save();
        cx.notify();
    }
    pub fn start_task(&mut self, id: String, cx: &mut Context<Self>) {
        self.doc
            .timer
            .reset(&mut self.doc.data, Local::now().timestamp());
        self.doc.timer.task_id = Some(id);
        self.doc
            .timer
            .start(&self.doc.data, Local::now().timestamp());
        self.view = View::Timer;
        self.save();
        cx.notify();
    }
    fn set_locale(&mut self, locale: &str, cx: &mut Context<Self>) {
        self.doc.ui.locale = locale.into();
        let placeholder = self.t("tasks.composer.placeholder");
        self.draft.update(cx, |input, cx| {
            input.placeholder = placeholder.into();
            cx.notify();
        });
        self.save();
        cx.notify();
    }
    pub fn select(
        &self,
        id: impl Into<SharedString>,
        label: String,
        items: Vec<(String, String)>,
        cx: &mut Context<Self>,
        on_select: impl Fn(&mut Self, String, &mut Window, &mut Context<Self>) + 'static,
    ) -> Div {
        let id: SharedString = id.into();
        let opened = self.menu.as_deref() == Some(id.as_ref());
        let button_id = id.clone();
        let callback = std::rc::Rc::new(on_select);
        column()
            .relative()
            .child(
                button(id.clone(), label, Some("ChevronDown"), false).on_click(cx.listener(
                    move |this, _, _, cx| {
                        this.menu = if opened {
                            None
                        } else {
                            Some(button_id.to_string())
                        };
                        cx.notify();
                    },
                )),
            )
            .when(opened, |el| {
                el.child(
                    deferred(
                        column()
                            .id(SharedString::from(format!("menu-{id}")))
                            .absolute()
                            .top(px(40.))
                            .left_0()
                            .min_w(px(160.))
                            .max_h(px(280.))
                            .overflow_y_scroll()
                            .p(px(4.))
                            .bg(rgb(0xffffff))
                            .rounded(px(8.))
                            .shadow_lg()
                            .border_1()
                            .border_color(rgba(BORDER))
                            .occlude()
                            .children(items.into_iter().enumerate().map(|(i, (value, label))| {
                                let callback = callback.clone();
                                button((id.clone(), i), label, None, false)
                                    .w_full()
                                    .justify_start()
                                    .bg(rgb(0xffffff))
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.menu = None;
                                        callback(this, value.clone(), window, cx);
                                        cx.notify();
                                    }))
                            })),
                    )
                    .with_priority(10),
                )
            })
    }
    fn header(&self, width: f32, cx: &mut Context<Self>) -> Div {
        let now = Local::now();
        let compact = width <= 900.;
        let mobile = width <= 760.;
        let date = now
            .format(if self.doc.ui.locale == "en" {
                "%b %-d"
            } else {
                "%-m月%-d日"
            })
            .to_string();
        let weekday = if self.doc.ui.locale == "en" {
            now.format("%A").to_string()
        } else {
            format!(
                "星期{}",
                ["一", "二", "三", "四", "五", "六", "日"]
                    [now.weekday().num_days_from_monday() as usize]
            )
        };
        let left = row()
            .flex_1()
            .min_w_0()
            .gap(px(12.))
            .child(
                icon_button("menu", if self.nav_open { "X" } else { "Menu" }).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.nav_open = !this.nav_open;
                        cx.notify();
                    }),
                ),
            )
            .child(
                column()
                    .gap(px(2.))
                    .child(
                        display(
                            format!("{weekday} · {date}"),
                            if mobile { 18. } else { 24. },
                            TEXT,
                        )
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .line_height(relative(1.2)),
                    )
                    .child(
                        display(
                            now.format("%H:%M").to_string(),
                            if mobile {
                                36.
                            } else if compact {
                                40.
                            } else {
                                48.
                            },
                            TEXT,
                        )
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .line_height(relative(0.92)),
                    ),
            );
        let mut tabs = row()
            .p(px(4.))
            .gap(px(4.))
            .bg(rgb(SURFACE))
            .rounded(px(12.));
        for (i, view) in [View::Tasks, View::Schedule, View::Timer, View::Overview]
            .into_iter()
            .enumerate()
        {
            let active = self.view == view;
            tabs = tabs.child(
                row()
                    .id(("tab", i))
                    .h(px(44.))
                    .px(px(14.))
                    .rounded(px(8.))
                    .when(active, |el| el.bg(rgb(0xffffff)).shadow_sm())
                    .cursor_pointer()
                    .hover(|s| s.bg(rgb(0xffffff)))
                    .child(icon(
                        view.glyph(),
                        16.,
                        if active { DARK_GREEN } else { MUTED },
                    ))
                    .child(
                        text(
                            self.t(view.key()),
                            16.,
                            if active { DARK_GREEN } else { MUTED },
                        )
                        .font_weight(FontWeight::BOLD),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| this.navigate(view, cx))),
            );
        }
        let sync_status = if self.sync_busy {
            "sync.status.syncing"
        } else if self.sync_error.is_some() {
            "sync.status.error"
        } else if self.session.is_some() {
            "sync.status.idle"
        } else {
            "sync.status.local"
        };
        let right =
            row()
                .justify_end()
                .gap(px(12.))
                .child(
                    row()
                        .gap_0()
                        .p(px(3.))
                        .rounded(px(8.))
                        .bg(rgb(SURFACE))
                        .children([("zh", "中"), ("en", "EN")].into_iter().map(
                            |(locale, label)| {
                                button(locale, label, None, false)
                                    .px(px(9.))
                                    .h(px(30.))
                                    .when(self.doc.ui.locale == locale, |el| {
                                        el.bg(rgb(0xffffff)).text_color(rgb(DARK_GREEN))
                                    })
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.set_locale(locale, cx)
                                    }))
                            },
                        )),
                )
                .child(
                    row()
                        .id("sync-status")
                        .gap(px(6.))
                        .cursor_pointer()
                        .child(dot(if self.sync_error.is_some() {
                            RED
                        } else if self.session.is_some() {
                            GREEN
                        } else {
                            DIM
                        }))
                        .child(text(self.t(sync_status), 12., MUTED))
                        .on_click(cx.listener(|this, _, window, cx| {
                            if this.session.is_some() {
                                this.begin_sync(None, window, cx);
                            } else {
                                this.nav_open = true;
                                cx.notify();
                            }
                        })),
                )
                .when(self.doc.timer.phase != "idle", |el| {
                    el.child(
                        button(
                            "header-timer",
                            model::duration_label(self.doc.timer.remaining(now.timestamp())),
                            Some("Clock"),
                            false,
                        )
                        .bg(rgba(0xffab0029))
                        .text_color(rgb(0x7a4100))
                        .on_click(cx.listener(|this, _, _, cx| this.navigate(View::Timer, cx))),
                    )
                });
        let header = row()
            .min_h(px(if width < 1200. { 88. } else { 96. }))
            .flex_shrink_0()
            .px(px(if width < 1200. { 16. } else { 20. }))
            .py(px(10.))
            .gap(px(16.))
            .bg(rgba(0xffffffcc));
        if compact {
            header.child(left).child(
                column()
                    .items_end()
                    .gap(px(8.))
                    .when(!mobile, |el| el.child(tabs))
                    .child(right),
            )
        } else {
            header.child(left).child(tabs).child(right.flex_1())
        }
    }
    fn bottom_nav(&self, cx: &mut Context<Self>) -> Div {
        row()
            .h(px(64.))
            .flex_shrink_0()
            .bg(rgb(0xffffff))
            .border_t_1()
            .border_color(rgba(BORDER))
            .children(
                [View::Tasks, View::Schedule, View::Timer, View::Overview]
                    .into_iter()
                    .enumerate()
                    .map(|(i, view)| {
                        let tone = if self.view == view { GREEN } else { MUTED };
                        column()
                            .id(("bottom-tab", i))
                            .flex_1()
                            .items_center()
                            .gap(px(4.))
                            .cursor_pointer()
                            .child(icon(view.glyph(), 22., tone))
                            .child(text(self.t(view.key()), 12., tone))
                            .on_click(cx.listener(move |this, _, _, cx| this.navigate(view, cx)))
                    }),
            )
    }
    fn drawer(&self, cx: &mut Context<Self>) -> Div {
        div()
            .absolute()
            .inset_0()
            .child(
                div()
                    .id("nav-backdrop")
                    .absolute()
                    .inset_0()
                    .bg(rgba(0x161c2448))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.nav_open = false;
                        cx.notify();
                    })),
            )
            .child(
                column()
                    .id("drawer")
                    .absolute()
                    .left_0()
                    .top_0()
                    .bottom_0()
                    .w(px(300.))
                    .p(px(20.))
                    .gap(px(16.))
                    .bg(rgb(0xffffff))
                    .shadow_lg()
                    .overflow_y_scroll()
                    .occlude()
                    .child(
                        row()
                            .gap(px(12.))
                            .py(px(8.))
                            .child(
                                row()
                                    .size(px(40.))
                                    .justify_center()
                                    .rounded(px(12.))
                                    .bg(rgb(GREEN))
                                    .child(icon("Flame", 22., 0xffffff)),
                            )
                            .child(
                                column()
                                    .child(
                                        text("FocusDeck", 20., TEXT)
                                            .font_weight(FontWeight::EXTRA_BOLD),
                                    )
                                    .child(text(self.t("brand.tag"), 12., DIM)),
                            ),
                    )
                    .child(
                        text(self.t("nav.section.workspace"), 11., DIM)
                            .mt(px(16.))
                            .font_weight(FontWeight::BOLD),
                    )
                    .children(
                        [View::Tasks, View::Schedule, View::Timer, View::Overview]
                            .into_iter()
                            .enumerate()
                            .map(|(i, view)| {
                                button(
                                    ("drawer-tab", i),
                                    self.t(view.key()),
                                    Some(view.glyph()),
                                    false,
                                )
                                .h(px(44.))
                                .bg(if self.view == view {
                                    Hsla::from(rgba(0x00a76f14))
                                } else {
                                    Hsla::from(rgb(0xffffff))
                                })
                                .on_click(
                                    cx.listener(move |this, _, _, cx| this.navigate(view, cx)),
                                )
                            }),
                    )
                    .child(
                        column()
                            .mt(px(24.))
                            .p(px(20.))
                            .gap(px(12.))
                            .rounded(px(16.))
                            .bg(rgb(0xc8fad6))
                            .child(
                                text(self.t("nav.promo.title"), 18., DARK_GREEN)
                                    .font_weight(FontWeight::BOLD),
                            )
                            .child(text(self.t("nav.promo.body"), 14., DARK_GREEN))
                            .child(
                                button("drawer-focus", self.t("nav.promo.cta"), None, true)
                                    .on_click(
                                        cx.listener(|this, _, _, cx| {
                                            this.navigate(View::Timer, cx)
                                        }),
                                    ),
                            ),
                    )
                    .child(
                        button(
                            "import",
                            self.label("导入原版数据", "Import data"),
                            Some("Download"),
                            false,
                        )
                        .on_click(cx.listener(Self::import_data)),
                    )
                    .child(self.sync_card(cx))
                    .child(
                        button(
                            "export",
                            self.label("导出数据", "Export data"),
                            Some("Upload"),
                            false,
                        )
                        .on_click(cx.listener(Self::export_data)),
                    )
                    .child(text(
                        self.label("数据保存在本机", "Data saved locally"),
                        12.,
                        DIM,
                    )),
            )
    }
    pub fn label(&self, zh: &str, en: &str) -> String {
        if self.doc.ui.locale == "en" { en } else { zh }.into()
    }
    fn import_data(&mut self, _: &ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        let prompt = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some(
                self.label("导入 FocusDeck JSON", "Import FocusDeck JSON")
                    .into(),
            ),
        });
        cx.spawn_in(window, async move |this, cx| match prompt.await {
            Ok(Ok(Some(paths))) => {
                if let Some(path) = paths.first() {
                    let _ = this.update_in(cx, |this, _, cx| {
                        match this.doc.import(path) {
                            Ok(()) => {
                                this.save();
                                this.message = Some(this.label("数据已合并", "Data merged"));
                            }
                            Err(error) => this.message = Some(format!("{error:#}")),
                        }
                        cx.notify();
                    });
                }
            }
            Ok(Ok(None)) => {}
            error => {
                let _ = this.update_in(cx, |this, _, cx| {
                    this.message = Some(format!("{error:?}"));
                    cx.notify();
                });
            }
        })
        .detach();
    }
    fn export_data(&mut self, _: &ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        let directory = self.path.parent().unwrap_or(std::path::Path::new("."));
        let prompt = cx.prompt_for_new_path(directory, Some("focusdeck-export.json"));
        cx.spawn_in(window, async move |this, cx| match prompt.await {
            Ok(Ok(Some(path))) => {
                let _ = this.update_in(cx, |this, _, cx| {
                    let result = serde_json::to_vec_pretty(&this.doc.data)
                        .map_err(anyhow::Error::from)
                        .and_then(|bytes| {
                            std::fs::write(&path, bytes)?;
                            Ok(())
                        });
                    this.message = Some(match result {
                        Ok(()) => this.label("数据已导出", "Data exported"),
                        Err(error) => format!("{error:#}"),
                    });
                    cx.notify();
                });
            }
            Ok(Ok(None)) => {}
            error => {
                let _ = this.update_in(cx, |this, _, cx| {
                    this.message = Some(format!("{error:?}"));
                    cx.notify();
                });
            }
        })
        .detach();
    }
}

impl Render for FocusDeck {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let width: f32 = window.viewport_size().width.into();
        self.draw_count += 1;
        if self.viewport_width != width {
            self.viewport_width = width;
            self.task_list.reset(self.task_list.item_count());
        }
        let mut body_font = gpui::font("Public Sans");
        body_font.fallbacks = Some(FontFallbacks::from_fonts(vec![
            "Segoe UI Variable".into(),
            "Segoe UI".into(),
            "Microsoft YaHei UI".into(),
            "PingFang SC".into(),
        ]));
        let content = match self.view {
            View::Tasks => self.tasks_view(width, cx).into_any_element(),
            View::Schedule => self.schedule_view(width, window, cx).into_any_element(),
            View::Timer => self.timer_view(width, cx).into_any_element(),
            View::Overview => self.overview_view(width, cx).into_any_element(),
        };
        column()
            .key_context("FocusDeck")
            .track_focus(&self.focus)
            .relative()
            .size_full()
            .overflow_hidden()
            .bg(rgb(BG))
            .text_color(rgb(TEXT))
            .font(body_font)
            .text_size(px(16.))
            .line_height(relative(1.5))
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    if this.alert_since.take().is_some()
                        || this.menu.take().is_some()
                        || this.editor.take().is_some()
                    {
                    } else if this.nav_open {
                        this.nav_open = false;
                    } else if this.tasks_open {
                        this.tasks_open = false;
                    } else if this.composer {
                        this.composer = false;
                        this.draft.update(cx, |input, cx| input.set("", cx));
                    } else if this.view == View::Timer {
                        this.view = View::Tasks;
                    }
                    window.focus(&this.focus);
                    cx.notify();
                    return;
                }
                if event.keystroke.key == "f11" {
                    window.toggle_fullscreen();
                    return;
                }
                if this.input_focused(window, cx) {
                    return;
                }
                match event.keystroke.key.as_str() {
                    "space" => this.timer_toggle(cx),
                    "f" => {
                        this.view = View::Timer;
                        cx.notify();
                    }
                    "f11" => window.toggle_fullscreen(),
                    _ => {}
                }
            }))
            .child(self.header(width, cx))
            .child(
                column()
                    .flex_1()
                    .min_h_0()
                    .px(px(if self.view == View::Schedule {
                        12.
                    } else {
                        if width < 1200. { 12. } else { 20. }
                    }))
                    .pt(px(if self.view == View::Schedule { 8. } else { 12. }))
                    .pb(px(16.))
                    .child(content),
            )
            .when(width <= 760., |el| el.child(self.bottom_nav(cx)))
            .when_some(self.message.clone(), |el, message| {
                el.child(
                    row()
                        .absolute()
                        .bottom(px(20.))
                        .left(px(32.))
                        .right(px(32.))
                        .p(px(14.))
                        .rounded(px(10.))
                        .bg(rgb(TEXT))
                        .text_color(rgb(0xffffff))
                        .justify_between()
                        .child(message)
                        .child(icon_button("dismiss-message", "X").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.message = None;
                                cx.notify();
                            },
                        ))),
                )
            })
            .when(self.menu.is_some(), |el| {
                el.child(
                    div()
                        .id("select-backdrop")
                        .absolute()
                        .inset_0()
                        .occlude()
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(|this, _, _, cx| {
                                this.menu = None;
                                cx.notify();
                            }),
                        ),
                )
            })
            .when(self.nav_open, |el| el.child(self.drawer(cx)))
            .when(self.editor.is_some(), |el| el.child(self.event_editor(cx)))
            .when(
                self.alert_since.is_some() && self.doc.ui.overlay_enabled,
                |el| el.child(self.completion_overlay(cx)),
            )
    }
}
