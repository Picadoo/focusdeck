use crate::{
    app::{FocusDeck, View},
    model,
    ui::*,
};
use chrono::{Duration, Local, TimeZone, Timelike};
use gpui::{prelude::*, *};

impl FocusDeck {
    pub fn overview_view(&self, width: f32, cx: &mut Context<Self>) -> Stateful<Div> {
        let tasks: Vec<_> = self.doc.data.tasks.iter().filter(|t| t.visible()).collect();
        let active = tasks.iter().filter(|t| t.active()).count();
        let completed = tasks.len() - active;
        let overdue = tasks.iter().filter(|t| t.overdue()).count();
        let events: Vec<_> = self
            .doc
            .data
            .schedule_events
            .iter()
            .filter(|e| e.occurs(model::today()))
            .collect();
        let event_minutes: i32 = events.iter().map(|e| e.duration_minutes).sum();
        let focus: i64 = tasks.iter().map(|t| t.actual_focus_seconds).sum();
        let rate = if tasks.is_empty() {
            0
        } else {
            completed * 100 / tasks.len()
        };
        let summary = if active == 0 && events.is_empty() {
            "overview.summary.empty"
        } else if events.is_empty() {
            if overdue > 0 {
                "overview.summary.tasksOverdue"
            } else {
                "overview.summary.tasks"
            }
        } else if active == 0 {
            "overview.summary.events"
        } else if overdue > 0 {
            "overview.summary.bothOverdue"
        } else {
            "overview.summary.both"
        };
        let mut metrics = row().flex_wrap().gap(px(16.));
        for (i, (value, key, caption, glyph, tone)) in [
            (
                active.to_string(),
                "overview.metric.tasks.title",
                self.tf(
                    "overview.metric.tasks.total",
                    &[("count", tasks.len().to_string())],
                ),
                "ListChecks",
                GREEN,
            ),
            (
                events.len().to_string(),
                "overview.metric.events.title",
                self.tf(
                    "overview.metric.events.total",
                    &[("minutes", event_minutes.to_string())],
                ),
                "CalendarClock",
                BLUE,
            ),
            (
                self.doc.timer.session_count.to_string(),
                "overview.metric.pomodoro.title",
                self.t("overview.metric.pomodoro.caption"),
                "Timer",
                AMBER,
            ),
            (
                overdue.to_string(),
                "overview.metric.overdue.title",
                self.t(if overdue > 0 {
                    "overview.metric.overdue.some"
                } else {
                    "overview.metric.overdue.none"
                }),
                "TriangleAlert",
                RED,
            ),
        ]
        .into_iter()
        .enumerate()
        {
            metrics = metrics.child(
                card()
                    .id(("metric", i))
                    .flex_1()
                    .min_w(px(150.))
                    .p(px(20.))
                    .relative()
                    .overflow_hidden()
                    .child(
                        row()
                            .justify_between()
                            .items_start()
                            .child(
                                column()
                                    .child(display(value, 32., TEXT).font_weight(FontWeight::BOLD))
                                    .child(
                                        text(self.t(key), 14., TEXT)
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .mt(px(6.)),
                                    )
                                    .child(text(caption, 12., MUTED)),
                            )
                            .child(
                                row()
                                    .size(px(40.))
                                    .justify_center()
                                    .rounded(px(10.))
                                    .bg(rgb(tone))
                                    .child(icon(glyph, 22., 0xffffff)),
                            ),
                    ),
            );
        }
        let header = row()
            .justify_between()
            .items_end()
            .flex_wrap()
            .gap(px(24.))
            .child(
                column()
                    .child(
                        text(self.t("overview.welcome"), 28., TEXT).font_weight(FontWeight::BOLD),
                    )
                    .child(
                        text(
                            self.tf(
                                summary,
                                &[
                                    ("tasks", active.to_string()),
                                    ("events", events.len().to_string()),
                                    ("overdue", overdue.to_string()),
                                ],
                            ),
                            14.,
                            MUTED,
                        )
                        .mt(px(6.)),
                    ),
            )
            .child(
                row()
                    .gap(px(10.))
                    .child(
                        button(
                            "overview-focus",
                            self.t("overview.action.startFocus"),
                            Some("Play"),
                            true,
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.navigate(View::Timer, cx))),
                    )
                    .child(
                        button(
                            "overview-tasks",
                            self.t("overview.action.goTasks"),
                            Some("ListTodo"),
                            false,
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.navigate(View::Tasks, cx))),
                    ),
            );
        let mut timeline: Vec<(i32, String, String, u32, &'static str)> = events
            .iter()
            .map(|e| {
                (
                    e.start_minutes,
                    e.title.clone(),
                    self.tf(
                        "overview.timeline.detail.event",
                        &[("minutes", e.duration_minutes.to_string())],
                    ),
                    self.doc
                        .data
                        .project(&e.project_id)
                        .map(|p| color(&p.color))
                        .unwrap_or(GREEN),
                    "CalendarDays",
                )
            })
            .collect();
        for task in &tasks {
            if task.active() && task.due_date() == Some(model::today()) {
                let date = Local
                    .timestamp_millis_opt(task.due_at.unwrap())
                    .single()
                    .unwrap();
                timeline.push((
                    date.hour() as i32 * 60 + date.minute() as i32,
                    task.title.clone(),
                    self.t("overview.timeline.detail.taskDue"),
                    if task.overdue() { RED } else { GREEN },
                    "CircleCheck",
                ));
            }
        }
        timeline.sort_by_key(|item| item.0);
        let mut timeline_body = column().p(px(24.)).gap(px(20.));
        if timeline.is_empty() {
            timeline_body = timeline_body.child(text(self.t("overview.timeline.empty"), 14., DIM));
        }
        for (minutes, label, detail, tone, glyph) in timeline {
            timeline_body = timeline_body.child(
                row()
                    .gap(px(16.))
                    .items_start()
                    .child(text(model::time_label(minutes), 13., MUTED).w(px(44.)))
                    .child(
                        row()
                            .size(px(28.))
                            .justify_center()
                            .rounded_full()
                            .bg(rgba((tone << 8) | 0x20))
                            .child(icon(glyph, 14., tone)),
                    )
                    .child(
                        column()
                            .gap(px(4.))
                            .child(text(label, 15., TEXT).font_weight(FontWeight::SEMIBOLD))
                            .child(text(detail, 12., MUTED)),
                    ),
            );
        }
        let timeline_card = card()
            .child(
                row()
                    .justify_between()
                    .items_start()
                    .px(px(24.))
                    .pt(px(24.))
                    .child(
                        column()
                            .child(title(self.t("overview.timeline.title")))
                            .child(subtitle(self.t("overview.timeline.subtitle"))),
                    )
                    .child(
                        button(
                            "timeline-schedule",
                            self.t("overview.action.goSchedule"),
                            None,
                            false,
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.navigate(View::Schedule, cx))),
                    ),
            )
            .child(timeline_body);
        let mut ranked = tasks.clone();
        ranked.retain(|t| t.actual_focus_seconds > 0);
        ranked.sort_by_key(|t| -t.actual_focus_seconds);
        ranked.truncate(5);
        let maximum = ranked.first().map(|t| t.actual_focus_seconds).unwrap_or(1);
        let mut ranking = column().p(px(24.)).gap(px(16.));
        if ranked.is_empty() {
            ranking = ranking.child(text(self.t("overview.focus.empty"), 14., DIM));
        }
        for task in ranked {
            ranking = ranking.child(
                column()
                    .gap(px(8.))
                    .child(
                        row()
                            .justify_between()
                            .child(text(task.title.clone(), 14., TEXT))
                            .child(text(
                                format!("{} min", task.actual_focus_seconds / 60),
                                12.,
                                MUTED,
                            )),
                    )
                    .child(
                        div().h(px(8.)).rounded_full().bg(rgb(SURFACE)).child(
                            div()
                                .h_full()
                                .w(relative(task.actual_focus_seconds as f32 / maximum as f32))
                                .rounded_full()
                                .bg(rgb(GREEN)),
                        ),
                    ),
            );
        }
        let focus_card = card()
            .child(
                column()
                    .px(px(24.))
                    .pt(px(24.))
                    .child(title(self.t("overview.focus.title")))
                    .child(subtitle(self.t("overview.focus.subtitle"))),
            )
            .child(ranking);
        let total = tasks.len().max(1) as f32;
        let segments = vec![
            (completed as f32 / total, GREEN),
            ((active - overdue) as f32 / total, BLUE),
            (overdue as f32 / total, RED),
        ];
        let progress = card()
            .child(
                column()
                    .px(px(24.))
                    .pt(px(24.))
                    .child(title(self.t("overview.progress.title")))
                    .child(subtitle(self.t("overview.progress.subtitle"))),
            )
            .child(
                column()
                    .p(px(24.))
                    .items_center()
                    .gap(px(20.))
                    .child(
                        div()
                            .relative()
                            .size(px(180.))
                            .child(ring(180., 20.57, segments))
                            .child(
                                column()
                                    .absolute()
                                    .inset_0()
                                    .justify_center()
                                    .items_center()
                                    .child(
                                        display(format!("{rate}%"), 28., TEXT)
                                            .font_weight(FontWeight::EXTRA_BOLD),
                                    )
                                    .child(text(self.t("overview.progress.center"), 12., DIM)),
                            ),
                    )
                    .child(
                        column().w_full().gap(px(12.)).children(
                            [
                                (completed, "overview.progress.done", GREEN),
                                (active - overdue, "overview.progress.doing", BLUE),
                                (overdue, "overview.progress.overdue", RED),
                            ]
                            .into_iter()
                            .map(|(value, key, tone)| {
                                row()
                                    .child(dot(tone))
                                    .child(text(self.t(key), 14., MUTED).flex_1())
                                    .child(
                                        text(value.to_string(), 14., TEXT)
                                            .font_weight(FontWeight::BOLD),
                                    )
                            }),
                        ),
                    ),
            );
        let mut upcoming: Vec<_> = tasks
            .iter()
            .filter(|t| {
                t.active()
                    && t.due_date().is_some_and(|date| {
                        date >= model::today() && date <= model::today() + Duration::days(7)
                    })
            })
            .collect();
        upcoming.sort_by_key(|t| t.due_at);
        upcoming.truncate(5);
        let mut upcoming_body = column().p(px(24.)).gap(px(16.));
        if upcoming.is_empty() {
            upcoming_body = upcoming_body.child(text(self.t("overview.upcoming.empty"), 14., DIM));
        }
        for task in upcoming {
            let id = task.meta.id.clone();
            upcoming_body = upcoming_body.child(
                column()
                    .id(SharedString::from(format!("upcoming-{id}")))
                    .gap(px(4.))
                    .cursor_pointer()
                    .child(text(task.title.clone(), 14., TEXT).font_weight(FontWeight::SEMIBOLD))
                    .child(text(self.due_label(task), 12., MUTED))
                    .on_click(cx.listener(move |this, _, _, cx| this.navigate(View::Tasks, cx))),
            );
        }
        let upcoming_card = card()
            .child(
                column()
                    .px(px(24.))
                    .pt(px(24.))
                    .child(title(self.t("overview.upcoming.title")))
                    .child(subtitle(self.t("overview.upcoming.subtitle"))),
            )
            .child(upcoming_body);
        let total_card = card()
            .p(px(24.))
            .gap(px(8.))
            .child(text(self.t("overview.focusTotal.label"), 14., MUTED))
            .child(
                row()
                    .items_end()
                    .child(
                        text(
                            if focus >= 3600 {
                                format!("{:.1}", focus as f64 / 3600.)
                            } else {
                                (focus / 60).to_string()
                            },
                            36.,
                            GREEN,
                        )
                        .font_weight(FontWeight::EXTRA_BOLD),
                    )
                    .child(text(
                        self.t(if focus >= 3600 {
                            "unit.hours"
                        } else {
                            "unit.minutes"
                        }),
                        14.,
                        MUTED,
                    )),
            )
            .child(text(self.t("overview.focusTotal.caption"), 12., DIM));
        div()
            .id("overview-page")
            .flex()
            .when(width <= 900., |el| el.flex_col())
            .items_start()
            .gap(px(16.))
            .size_full()
            .overflow_y_scroll()
            .child(
                column()
                    .flex_1()
                    .w_full()
                    .gap(px(16.))
                    .child(header)
                    .child(metrics)
                    .child(timeline_card)
                    .child(focus_card),
            )
            .child(
                column()
                    .w(px(if width > 900. { 320. } else { width - 40. }))
                    .gap(px(16.))
                    .flex_shrink_0()
                    .child(progress)
                    .child(upcoming_card)
                    .child(total_card),
            )
    }
}
