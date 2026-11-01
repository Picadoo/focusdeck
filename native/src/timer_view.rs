use crate::{
    app::{FocusDeck, View},
    model,
    ui::*,
};
use chrono::Local;
use gpui::{prelude::*, *};

impl FocusDeck {
    fn set_profile(&mut self, id: String, cx: &mut Context<Self>) {
        self.doc
            .timer
            .reset(&mut self.doc.data, Local::now().timestamp());
        self.doc.timer.profile_id = id;
        self.doc.timer.session_count = 0;
        self.doc.timer.task_id = None;
        self.doc.timer.remaining_seconds = self
            .doc
            .data
            .profile(&self.doc.timer.profile_id)
            .focus_seconds;
        let profile = self.doc.data.profile(&self.doc.timer.profile_id);
        for (input, value) in self.profile_inputs.iter().zip([
            profile.focus_seconds / 60,
            profile.short_break_seconds / 60,
            profile.long_break_seconds / 60,
            profile.sessions_before_long_break,
        ]) {
            input.update(cx, |input, cx| input.set(value.to_string(), cx));
        }
        self.save();
        cx.notify();
    }
    fn save_profile(&mut self, cx: &mut Context<Self>) {
        let values: Vec<_> = self
            .profile_inputs
            .iter()
            .map(|input| input.read(cx).content.parse::<i64>())
            .collect();
        if values.iter().any(|v| v.is_err()) {
            self.message = Some(self.label("请输入整数时长", "Enter whole minutes"));
            cx.notify();
            return;
        }
        let values: Vec<_> = values.into_iter().map(Result::unwrap).collect();
        if values[..3].iter().any(|v| !(1..=180).contains(v)) || !(1..=8).contains(&values[3]) {
            self.message = Some(self.label(
                "时长范围 1–180 分钟，长休间隔 1–8 个番茄。",
                "Durations: 1–180 minutes; long break interval: 1–8.",
            ));
            cx.notify();
            return;
        }
        let id = self.doc.timer.profile_id.clone();
        if let Some(profile) = self
            .doc
            .data
            .timer_profiles
            .iter_mut()
            .find(|p| p.meta.id == id)
        {
            profile.focus_seconds = values[0] * 60;
            profile.short_break_seconds = values[1] * 60;
            profile.long_break_seconds = values[2] * 60;
            profile.sessions_before_long_break = values[3];
            profile.meta.touch();
            if self.doc.timer.phase == "idle" {
                self.doc.timer.remaining_seconds = profile.focus_seconds;
            }
        }
        self.settings = false;
        self.save();
        cx.notify();
    }
    pub fn timer_view(&self, width: f32, cx: &mut Context<Self>) -> Stateful<Div> {
        let timer = &self.doc.timer;
        let profile = self.doc.data.profile(&timer.profile_id);
        let remaining = timer.remaining(Local::now().timestamp());
        let is_focus = timer.phase == "idle" || timer.phase.starts_with("focus");
        let tone = if is_focus { AMBER } else { GREEN };
        let diameter = (width * 0.28).clamp(240., 380.);
        let duration = timer.phase_duration(&self.doc.data);
        let fraction = (remaining as f32 / duration as f32).clamp(0., 1.);
        let phase = self.t(if timer.phase == "idle" {
            "timer.phase.idle"
        } else if is_focus {
            "timer.step.focus"
        } else if timer.phase.starts_with("long") {
            "timer.step.longBreak"
        } else {
            "timer.step.shortBreak"
        });
        let paused = timer.phase.ends_with("paused");
        let task = timer
            .task_id
            .as_ref()
            .and_then(|id| self.doc.data.tasks.iter().find(|t| &t.meta.id == id));
        let topbar = row()
            .justify_between()
            .items_start()
            .flex_wrap()
            .gap(px(16.))
            .child(
                column()
                    .child(title(self.t("timer.title")))
                    .child(subtitle(self.tf(
                        "timer.subheader",
                        &[
                            ("name", profile.name.clone()),
                            ("minutes", (profile.focus_seconds / 60).to_string()),
                        ],
                    ))),
            )
            .child(
                row()
                    .flex_wrap()
                    .child(
                        self.select(
                            "timer-profile",
                            profile.name.clone(),
                            self.doc
                                .data
                                .timer_profiles
                                .iter()
                                .filter(|p| p.meta.deleted_at.is_none())
                                .map(|p| (p.meta.id.clone(), p.name.clone()))
                                .collect(),
                            cx,
                            |this, id, _, cx| this.set_profile(id, cx),
                        ),
                    )
                    .child(
                        button(
                            "timer-settings",
                            self.t(if self.settings {
                                "timer.settings.collapse"
                            } else {
                                "timer.settings.open"
                            }),
                            Some("Settings"),
                            false,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.settings = !this.settings;
                            cx.notify();
                        })),
                    )
                    .child(
                        button(
                            "timer-back",
                            self.label("返回待办", "Back to tasks"),
                            Some("ArrowLeft"),
                            true,
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.navigate(View::Tasks, cx))),
                    ),
            );
        let phase_index = if is_focus {
            0
        } else if timer.phase.starts_with("long") {
            2
        } else {
            1
        };
        let stage = card()
            .flex_1()
            .min_w_0()
            .p(px(32.))
            .justify_center()
            .items_center()
            .child(
                column()
                    .w_full()
                    .items_center()
                    .child(
                        div()
                            .relative()
                            .size(px(diameter))
                            .child(ring(diameter, diameter * 5. / 120., vec![(fraction, tone)]))
                            .child(
                                column()
                                    .absolute()
                                    .inset_0()
                                    .justify_center()
                                    .items_center()
                                    .gap(px(10.))
                                    .child(
                                        display(
                                            model::duration_label(remaining),
                                            (width * 0.08).clamp(64., 112.),
                                            tone,
                                        )
                                        .font_weight(FontWeight::EXTRA_BOLD)
                                        .line_height(relative(0.95)),
                                    )
                                    .child(
                                        text(
                                            format!(
                                                "{phase}{}",
                                                if paused {
                                                    self.label(" · 已暂停", " · Paused")
                                                } else {
                                                    String::new()
                                                }
                                            ),
                                            16.,
                                            MUTED,
                                        )
                                        .font_weight(FontWeight::BOLD),
                                    )
                                    .child(
                                        row().children(
                                            [
                                                "timer.step.focus",
                                                "timer.step.shortBreak",
                                                "timer.step.longBreak",
                                            ]
                                            .into_iter()
                                            .enumerate()
                                            .map(
                                                |(i, key)| {
                                                    div()
                                                        .px(px(10.))
                                                        .py(px(5.))
                                                        .rounded(px(8.))
                                                        .text_size(px(12.))
                                                        .font_weight(FontWeight::BOLD)
                                                        .bg(if i == phase_index {
                                                            Hsla::from(rgba(0x00a76f29))
                                                        } else {
                                                            Hsla::from(rgb(SURFACE))
                                                        })
                                                        .text_color(rgb(if i == phase_index {
                                                            DARK_GREEN
                                                        } else {
                                                            DIM
                                                        }))
                                                        .child(self.t(key))
                                                },
                                            ),
                                        ),
                                    ),
                            ),
                    )
                    .child(
                        text(
                            task.map(|t| {
                                self.tf("timer.focusNote.task", &[("title", t.title.clone())])
                            })
                            .unwrap_or_else(|| {
                                self.label(
                                    "一次只做一件事，把注意力留给此刻。",
                                    "One thing at a time. Stay with this moment.",
                                )
                            }),
                            14.,
                            MUTED,
                        )
                        .mt(px(18.))
                        .text_center(),
                    )
                    .child(
                        row()
                            .mt(px(24.))
                            .gap(px(12.))
                            .flex_wrap()
                            .justify_center()
                            .child(
                                button(
                                    "timer-toggle",
                                    self.label(
                                        if timer.phase == "idle" {
                                            "开始专注"
                                        } else if timer.running() {
                                            "暂停"
                                        } else {
                                            "继续"
                                        },
                                        if timer.phase == "idle" {
                                            "Start focus"
                                        } else if timer.running() {
                                            "Pause"
                                        } else {
                                            "Resume"
                                        },
                                    ),
                                    Some(if timer.running() { "Pause" } else { "Play" }),
                                    true,
                                )
                                .h(px(48.))
                                .px(px(24.))
                                .bg(rgb(tone))
                                .text_color(rgb(if is_focus { TEXT } else { 0xffffff }))
                                .on_click(cx.listener(|this, _, _, cx| this.timer_toggle(cx))),
                            )
                            .child(
                                button(
                                    "timer-reset",
                                    self.label("重置", "Reset"),
                                    Some("RotateCcw"),
                                    false,
                                )
                                .h(px(48.))
                                .on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.doc
                                            .timer
                                            .reset(&mut this.doc.data, Local::now().timestamp());
                                        this.save();
                                        cx.notify();
                                    },
                                )),
                            )
                            .child(
                                button(
                                    "timer-skip",
                                    self.label("跳过", "Skip"),
                                    Some("SkipForward"),
                                    false,
                                )
                                .h(px(48.))
                                .on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.doc.timer.advance(
                                            &mut this.doc.data,
                                            Local::now().timestamp(),
                                            true,
                                        );
                                        this.save();
                                        cx.notify();
                                    },
                                )),
                            ),
                    )
                    .child(
                        text(
                            self.label(
                                "Space 开始 / 暂停 · F 进入专注 · Esc 返回",
                                "Space start / pause · F focus · Esc back",
                            ),
                            12.,
                            DIM,
                        )
                        .mt(px(18.)),
                    ),
            );
        let mut task_picker = column()
            .id("timer-task-picker")
            .max_h(px(320.))
            .overflow_y_scroll()
            .gap(px(4.));
        task_picker = task_picker.child(
            button(
                "timer-no-task",
                self.t("timer.picker.noTask"),
                Some(if timer.task_id.is_none() {
                    "CircleCheck"
                } else {
                    "Circle"
                }),
                false,
            )
            .bg(rgb(if timer.task_id.is_none() {
                0xebf8f3
            } else {
                0xffffff
            }))
            .on_click(cx.listener(|this, _, _, cx| {
                if this.doc.timer.phase == "idle" {
                    this.doc.timer.task_id = None;
                    this.save();
                    cx.notify();
                }
            })),
        );
        for task in self.doc.data.tasks.iter().filter(|t| t.active()) {
            let id = task.meta.id.clone();
            let selected = timer.task_id.as_ref() == Some(&id);
            let project = self.doc.data.project(&task.project_id);
            task_picker = task_picker.child(
                row()
                    .id(SharedString::from(format!("pick-{id}")))
                    .p(px(10.))
                    .rounded(px(10.))
                    .gap(px(10.))
                    .cursor_pointer()
                    .when(selected, |el| el.bg(rgba(0x00a76f14)))
                    .hover(|s| s.bg(rgb(SURFACE)))
                    .child(icon(
                        if selected { "CircleCheck" } else { "Circle" },
                        16.,
                        if selected { GREEN } else { DIM },
                    ))
                    .child(
                        column()
                            .flex_1()
                            .gap(px(2.))
                            .child(
                                text(task.title.clone(), 14., TEXT)
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .truncate(),
                            )
                            .child(
                                row()
                                    .gap(px(5.))
                                    .child(dot(project.map(|p| color(&p.color)).unwrap_or(GREEN)))
                                    .child(text(
                                        project.map(|p| p.name.clone()).unwrap_or_default(),
                                        12.,
                                        DIM,
                                    )),
                            ),
                    )
                    .child(text(
                        format!(
                            "{}/{}",
                            task.actual_focus_seconds / profile.focus_seconds,
                            task.estimate_pomodoros
                        ),
                        12.,
                        DIM,
                    ))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.doc.timer.phase == "idle" {
                            this.doc.timer.task_id = Some(id.clone());
                            this.save();
                            cx.notify();
                        }
                    })),
            );
        }
        let side = column()
            .w(px(if width > 900. { 320. } else { width - 40. }))
            .flex_shrink_0()
            .gap(px(16.))
            .child(
                card()
                    .p(px(20.))
                    .gap(px(12.))
                    .child(
                        text(self.t("timer.context.currentTask"), 12., DIM)
                            .font_weight(FontWeight::BOLD),
                    )
                    .child(task_picker)
                    .when(timer.phase != "idle", |el| {
                        el.child(text(self.t("timer.picker.locked"), 13., DIM))
                    }),
            )
            .child(
                card()
                    .p(px(20.))
                    .gap(px(16.))
                    .child(
                        text(self.t("timer.stats.title"), 12., DIM).font_weight(FontWeight::BOLD),
                    )
                    .child(
                        row().children(
                            [
                                (
                                    timer.session_count.to_string(),
                                    self.t("timer.stats.pomodoros"),
                                ),
                                (
                                    (timer.session_count * profile.focus_seconds / 60).to_string(),
                                    self.t("timer.stats.minutes"),
                                ),
                                (
                                    profile.sessions_before_long_break.to_string(),
                                    self.t("timer.settings.interval"),
                                ),
                            ]
                            .into_iter()
                            .map(|(value, label)| {
                                column()
                                    .flex_1()
                                    .py(px(12.))
                                    .px(px(6.))
                                    .rounded(px(12.))
                                    .bg(rgb(SURFACE))
                                    .items_center()
                                    .child(
                                        text(value, 26., TEXT).font_weight(FontWeight::EXTRA_BOLD),
                                    )
                                    .child(text(label, 12., DIM).text_center())
                            }),
                        ),
                    ),
            );
        let mut page = column()
            .id("timer-page")
            .size_full()
            .overflow_y_scroll()
            .gap(px(16.))
            .child(topbar);
        if self.settings {
            let labels = [
                "timer.settings.focus",
                "timer.settings.shortBreak",
                "timer.settings.longBreak",
                "timer.settings.interval",
            ];
            let fields = row().flex_wrap().gap(px(12.)).children(
                self.profile_inputs.iter().enumerate().map(|(i, input)| {
                    column()
                        .flex_1()
                        .min_w(px(100.))
                        .gap(px(8.))
                        .child(text(self.t(labels[i]), 14., MUTED))
                        .child(
                            row()
                                .h(px(54.))
                                .px(px(10.))
                                .rounded(px(8.))
                                .border_1()
                                .border_color(rgba(BORDER))
                                .bg(rgb(SURFACE))
                                .child(input.clone())
                                .child(text(
                                    self.t(if i == 3 {
                                        "timer.settings.pomodoroUnit"
                                    } else {
                                        "unit.minutes"
                                    }),
                                    12.,
                                    DIM,
                                )),
                        )
                }),
            );
            page = page.child(
                card()
                    .p(px(24.))
                    .gap(px(16.))
                    .child(title(self.tf(
                        "timer.settings.editing",
                        &[("name", profile.name.clone())],
                    )))
                    .child(fields)
                    .child(
                        row().flex_wrap().children(
                            [
                                (
                                    "sound",
                                    "Volume2",
                                    self.doc.ui.sound_enabled,
                                    self.label("声音", "Sound"),
                                ),
                                (
                                    "overlay",
                                    "Maximize2",
                                    self.doc.ui.overlay_enabled,
                                    self.label("屏幕提醒", "Screen alert"),
                                ),
                                (
                                    "notify",
                                    "Bell",
                                    self.doc.ui.notify_enabled,
                                    self.label("任务栏提醒", "Taskbar alert"),
                                ),
                            ]
                            .into_iter()
                            .map(|(id, glyph, enabled, label)| {
                                button(
                                    id,
                                    format!("{} {label}", if enabled { "✓" } else { "○" }),
                                    Some(glyph),
                                    false,
                                )
                                .on_click(cx.listener(
                                    move |this, _, _, cx| {
                                        match id {
                                            "sound" => {
                                                this.doc.ui.sound_enabled =
                                                    !this.doc.ui.sound_enabled
                                            }
                                            "overlay" => {
                                                this.doc.ui.overlay_enabled =
                                                    !this.doc.ui.overlay_enabled
                                            }
                                            _ => {
                                                this.doc.ui.notify_enabled =
                                                    !this.doc.ui.notify_enabled
                                            }
                                        }
                                        this.save();
                                        cx.notify();
                                    },
                                ))
                            }),
                        ),
                    )
                    .child(
                        row().justify_end().child(
                            button("profile-save", self.t("common.save"), None, true)
                                .on_click(cx.listener(|this, _, _, cx| this.save_profile(cx))),
                        ),
                    ),
            );
        }
        if let Some(transition) = &timer.last_transition {
            page = page.child(
                row()
                    .p(px(14.))
                    .rounded(px(12.))
                    .bg(rgba(0x00a76f14))
                    .justify_between()
                    .child(text(
                        self.t(&format!(
                            "timer.notice.{}.title",
                            Self::transition_key(transition)
                        )),
                        14.,
                        DARK_GREEN,
                    ))
                    .child(icon_button("dismiss-transition", "X").on_click(cx.listener(
                        |this, _, _, cx| {
                            this.doc.timer.last_transition = None;
                            this.alert_since = None;
                            cx.notify();
                        },
                    ))),
            );
        }
        page.child(
            div()
                .flex()
                .when(width <= 900., |el| el.flex_col())
                .gap(px(16.))
                .child(stage)
                .child(side),
        )
    }
}
