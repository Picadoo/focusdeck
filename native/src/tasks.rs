use crate::{
    app::{FocusDeck, View},
    model::{self, Task},
    ui::*,
};
use chrono::{Datelike, Duration, Local, NaiveDateTime, TimeZone};
use gpui::{prelude::*, *};

#[derive(Clone)]
pub struct TaskDrag(pub String);
pub struct DragLabel(pub String);
impl Render for DragLabel {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        card().p(px(14.)).w(px(280.)).child(self.0.clone())
    }
}

impl FocusDeck {
    pub fn submit_task(&mut self, cx: &mut Context<Self>) {
        let title = self.draft.read(cx).content.trim().to_owned();
        if title.is_empty() {
            return;
        }
        let due = self.draft_due.read(cx).content.trim().to_owned();
        let due_at = if due.is_empty() {
            None
        } else {
            match NaiveDateTime::parse_from_str(&due.replace('T', " "), "%Y-%m-%d %H:%M")
                .ok()
                .and_then(|d| Local.from_local_datetime(&d).earliest())
            {
                Some(date) => Some(date.timestamp_millis()),
                None => {
                    self.message = Some(self.label(
                        "截止时间格式：YYYY-MM-DD HH:MM",
                        "Due date format: YYYY-MM-DD HH:MM",
                    ));
                    cx.notify();
                    return;
                }
            }
        };
        self.doc.data.add_task(
            title,
            self.draft_project.clone(),
            self.draft_priority.clone(),
            due_at,
            self.draft_estimate,
        );
        self.draft.update(cx, |input, cx| input.set("", cx));
        self.draft_due.update(cx, |input, cx| input.set("", cx));
        self.composer = false;
        self.draft_estimate = 1;
        self.save();
        cx.notify();
    }
    pub fn due_label(&self, task: &Task) -> String {
        task.due_at
            .and_then(|at| Local.timestamp_millis_opt(at).single())
            .map(|date| {
                date.format(if date.year() == Local::now().year() {
                    "%-m/%-d %H:%M"
                } else {
                    "%Y/%-m/%-d %H:%M"
                })
                .to_string()
            })
            .unwrap_or_default()
    }
    pub fn tasks_view(&self, width: f32, cx: &mut Context<Self>) -> Div {
        let narrow = width <= 900.;
        div()
            .flex()
            .when(narrow, |el| el.flex_col())
            .gap(px(16.))
            .size_full()
            .min_h_0()
            .child(
                div()
                    .flex()
                    .min_w_0()
                    .min_h_0()
                    .flex_grow()
                    .flex_basis(relative(if narrow { 0.69 } else { 1.55 / 2.55 }))
                    .child(self.task_panel("main-tasks", cx)),
            )
            .child(
                div()
                    .flex()
                    .min_w_0()
                    .min_h_0()
                    .flex_grow()
                    .flex_basis(relative(if narrow { 0.31 } else { 1. / 2.55 }))
                    .child(self.agenda(cx)),
            )
    }
    pub fn task_panel(&self, id: &'static str, cx: &mut Context<Self>) -> Div {
        let visible: Vec<_> = self.doc.data.tasks.iter().filter(|t| t.visible()).collect();
        let completed = visible.iter().filter(|t| t.status == "completed").count();
        let remaining = visible.len() - completed;
        let progress = if visible.is_empty() {
            0
        } else {
            completed * 100 / visible.len()
        };
        let mut chips = row().flex_wrap().gap(px(6.)).child(
            pill(
                (id, 0usize),
                self.t("common.all"),
                GREEN,
                self.project_filter.is_empty(),
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.project_filter.clear();
                this.task_list.reset(0);
                cx.notify();
            })),
        );
        for (i, project) in self
            .doc
            .data
            .projects
            .iter()
            .filter(|p| p.meta.deleted_at.is_none())
            .enumerate()
        {
            let project_id = project.meta.id.clone();
            chips = chips.child(
                pill(
                    (id, i + 1),
                    project.name.clone(),
                    color(&project.color),
                    self.project_filter == project_id,
                )
                .child(dot(color(&project.color)))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.project_filter = project_id.clone();
                    this.task_list.reset(0);
                    this.draft_project = project_id.clone();
                    cx.notify();
                })),
            );
        }
        let tasks = self.doc.data.sorted_tasks(&self.project_filter, "");
        let count = tasks.len();
        let tasks = std::rc::Rc::new(tasks);
        if self.task_list.item_count() != count {
            self.task_list.reset(count);
        }
        card()
            .size_full()
            .min_h_0()
            .child(
                row()
                    .justify_between()
                    .items_start()
                    .px(px(24.))
                    .pt(px(24.))
                    .pb(px(16.))
                    .gap(px(16.))
                    .child(
                        row()
                            .flex_wrap()
                            .gap(px(14.))
                            .flex_1()
                            .child(title(self.t("tasks.title")))
                            .child(chips),
                    )
                    .child(
                        column()
                            .items_end()
                            .child(
                                text(format!("{progress}%"), 24., GREEN)
                                    .font_weight(FontWeight::EXTRA_BOLD)
                                    .line_height(px(24.)),
                            )
                            .child(
                                text(
                                    self.tf(
                                        "tasks.progress.remaining",
                                        &[("count", remaining.to_string())],
                                    ),
                                    12.,
                                    MUTED,
                                )
                                .font_weight(FontWeight::BOLD),
                            ),
                    ),
            )
            .child(
                div()
                    .h(px(6.))
                    .mx(px(24.))
                    .mb(px(8.))
                    .rounded(px(4.))
                    .bg(rgb(SURFACE))
                    .flex_shrink_0()
                    .child(
                        div()
                            .h_full()
                            .w(relative(progress as f32 / 100.))
                            .rounded(px(4.))
                            .bg(rgb(GREEN)),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .when(count == 0, |el| {
                        el.child(
                            column()
                                .p(px(32.))
                                .items_center()
                                .gap(px(16.))
                                .child(icon("Circle", 40., DIM))
                                .child(text(self.t("tasks.empty.title"), 16., MUTED)),
                        )
                    })
                    .when(count > 0, |el| {
                        el.child(
                            list(
                                self.task_list.clone(),
                                cx.processor(move |this, index: usize, _, cx| {
                                    this.task_row(&tasks[index], cx).into_any_element()
                                }),
                            )
                            .size_full(),
                        )
                    }),
            )
            .child(self.task_composer(cx))
    }
    fn task_row(&self, task: &Task, cx: &mut Context<Self>) -> Stateful<Div> {
        let id = task.meta.id.clone();
        let toggle_id = id.clone();
        let delete_id = id.clone();
        let focus_id = id.clone();
        let drop_id = id.clone();
        let project = self.doc.data.project(&task.project_id);
        let tone = project.map(|p| color(&p.color)).unwrap_or(GREEN);
        let priority = match task.priority.as_str() {
            "p1" => RED,
            "p2" => AMBER,
            "p3" => 0x22c55e,
            _ => MUTED,
        };
        let due_tone = if task.overdue() {
            RED
        } else if task.due_date() == Some(model::today()) {
            0xb76e00
        } else {
            MUTED
        };
        row()
            .id(SharedString::from(format!("task-{id}")))
            .min_h(px(96.))
            .items_start()
            .gap(px(12.))
            .pl(px(12.))
            .pr(px(20.))
            .py(px(18.))
            .border_b_1()
            .border_dashed()
            .border_color(rgba(0x919eab3d))
            .hover(|s| s.bg(rgba(0x919eab14)))
            .when(task.status == "completed", |el| el.opacity(0.68))
            .child(
                row()
                    .id(SharedString::from(format!("drag-{id}")))
                    .w(px(28.))
                    .h(px(36.))
                    .justify_center()
                    .flex_shrink_0()
                    .cursor_grab()
                    .child(icon("GripVertical", 24., DIM))
                    .on_drag(TaskDrag(id.clone()), {
                        let title = task.title.clone();
                        move |_, _, _, cx| cx.new(|_| DragLabel(title.clone()))
                    }),
            )
            .child(
                row()
                    .id(SharedString::from(format!("check-{id}")))
                    .size(px(36.))
                    .justify_center()
                    .flex_shrink_0()
                    .cursor_pointer()
                    .child(icon(
                        if task.status == "completed" {
                            "CircleCheck"
                        } else {
                            "Circle"
                        },
                        30.,
                        if task.status == "completed" {
                            0x22c55e
                        } else {
                            DIM
                        },
                    ))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(task) = this
                            .doc
                            .data
                            .tasks
                            .iter_mut()
                            .find(|t| t.meta.id == toggle_id)
                        {
                            task.status = if task.status == "completed" {
                                "active"
                            } else {
                                "completed"
                            }
                            .into();
                            task.meta.touch();
                        }
                        this.save();
                        cx.notify();
                    })),
            )
            .child(
                column()
                    .flex_1()
                    .gap(px(6.))
                    .child(
                        row()
                            .items_start()
                            .gap(px(10.))
                            .child(
                                text(
                                    task.title.clone(),
                                    19.,
                                    if task.status == "completed" {
                                        DIM
                                    } else {
                                        TEXT
                                    },
                                )
                                .font_weight(FontWeight::SEMIBOLD)
                                .line_height(px(27.))
                                .line_clamp(2)
                                .when(task.status == "completed", |el| el.line_through()),
                            )
                            .child(
                                row()
                                    .size(px(24.))
                                    .justify_center()
                                    .rounded(px(6.))
                                    .bg(rgb(SURFACE))
                                    .flex_shrink_0()
                                    .child(icon("Flag", 16., priority)),
                            ),
                    )
                    .child(
                        row()
                            .flex_wrap()
                            .gap(px(12.))
                            .child(
                                row().gap(px(7.)).child(dot(tone).size(px(10.))).child(
                                    text(
                                        project.map(|p| p.name.clone()).unwrap_or_default(),
                                        15.,
                                        MUTED,
                                    )
                                    .font_weight(FontWeight::BOLD),
                                ),
                            )
                            .when(task.due_at.is_some(), |el| {
                                el.child(
                                    row()
                                        .gap(px(5.))
                                        .child(icon("CalendarClock", 20., due_tone))
                                        .child(
                                            display(self.due_label(task), 15., due_tone)
                                                .font_weight(FontWeight::BOLD),
                                        ),
                                )
                            })
                            .child(
                                row().gap(px(5.)).child(icon("Timer", 20., TEXT)).child(
                                    display(
                                        format!(
                                            "{}/{}",
                                            (task.actual_focus_seconds + 59) / 60,
                                            task.estimate_pomodoros * 25
                                        ),
                                        15.,
                                        TEXT,
                                    )
                                    .font_weight(FontWeight::BOLD),
                                ),
                            ),
                    ),
            )
            .child(
                row()
                    .gap(px(8.))
                    .when(task.status != "completed", |el| {
                        el.child(
                            icon_button(SharedString::from(format!("start-{id}")), "Clock")
                                .bg(rgba(0xffab0029))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.start_task(focus_id.clone(), cx)
                                })),
                        )
                    })
                    .child(
                        icon_button(SharedString::from(format!("delete-{id}")), "Trash2").on_click(
                            cx.listener(move |this, _, _, cx| {
                                if let Some(task) = this
                                    .doc
                                    .data
                                    .tasks
                                    .iter_mut()
                                    .find(|t| t.meta.id == delete_id)
                                {
                                    task.meta.delete();
                                    task.status = "deleted".into();
                                }
                                this.save();
                                cx.notify();
                            }),
                        ),
                    ),
            )
            .on_drop(cx.listener(move |this, drag: &TaskDrag, _, cx| {
                this.doc.data.reorder_tasks(&drag.0, &drop_id);
                this.save();
                cx.notify();
            }))
    }
    fn task_composer(&self, cx: &mut Context<Self>) -> Div {
        let expanded = self.composer || !self.draft.read(cx).content.is_empty();
        column()
            .p(px(16.))
            .gap(px(12.))
            .border_t_1()
            .border_color(rgba(BORDER))
            .flex_shrink_0()
            .child(
                row()
                    .id("composer-title")
                    .gap(px(10.))
                    .h(px(44.))
                    .px(px(12.))
                    .rounded(px(8.))
                    .bg(rgb(SURFACE))
                    .child(icon("Plus", 20., GREEN))
                    .child(self.draft.clone())
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.composer = true;
                        window.focus(&this.draft.focus_handle(cx));
                        cx.notify();
                    })),
            )
            .when(expanded, |el| {
                el.child(
                    column()
                        .gap(px(10.))
                        .child(
                            row()
                                .flex_wrap()
                                .gap(px(10.))
                                .child(
                                    self.select(
                                        "draft-project",
                                        self.doc
                                            .data
                                            .project(&self.draft_project)
                                            .map(|p| p.name.clone())
                                            .unwrap_or_default(),
                                        self.doc
                                            .data
                                            .projects
                                            .iter()
                                            .map(|p| (p.meta.id.clone(), p.name.clone()))
                                            .collect(),
                                        cx,
                                        |this, value, _, _| this.draft_project = value,
                                    ),
                                )
                                .child(
                                    self.select(
                                        "draft-priority",
                                        self.draft_priority.to_uppercase(),
                                        ["p1", "p2", "p3", "p4"]
                                            .into_iter()
                                            .map(|p| (p.into(), p.to_uppercase()))
                                            .collect(),
                                        cx,
                                        |this, value, _, _| this.draft_priority = value,
                                    ),
                                )
                                .child(
                                    row()
                                        .w(px(205.))
                                        .border_1()
                                        .border_color(rgba(BORDER))
                                        .rounded(px(8.))
                                        .child(self.draft_due.clone()),
                                )
                                .child(self.select(
                                    "draft-estimate",
                                    format!(
                                        "{} {}",
                                        self.draft_estimate,
                                        self.t("timer.stats.pomodoros")
                                    ),
                                    (1..=16).map(|i| (i.to_string(), i.to_string())).collect(),
                                    cx,
                                    |this, value, _, _| {
                                        this.draft_estimate = value.parse().unwrap_or(1)
                                    },
                                )),
                        )
                        .child(
                            row()
                                .justify_end()
                                .child(
                                    button("cancel-task", self.t("common.cancel"), None, false)
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.composer = false;
                                            this.draft.update(cx, |i, cx| i.set("", cx));
                                            cx.notify();
                                        })),
                                )
                                .child(
                                    button(
                                        "add-task",
                                        self.label("添加任务", "Add task"),
                                        Some("Plus"),
                                        true,
                                    )
                                    .on_click(cx.listener(|this, _, _, cx| this.submit_task(cx))),
                                ),
                        ),
                )
            })
    }
    fn agenda(&self, cx: &mut Context<Self>) -> Div {
        let monday = model::monday(model::today());
        let mut entries = Vec::new();
        for day in 0..7 {
            let date = monday + Duration::days(day);
            for event in &self.doc.data.schedule_events {
                if event.occurs(date) {
                    entries.push((date, event.clone()));
                }
            }
        }
        entries.sort_by_key(|(date, e)| (*date, e.start_minutes));
        let mut body = column()
            .id("agenda-body")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .px(px(16.))
            .pt(px(16.))
            .pb(px(20.))
            .gap(px(8.));
        let mut previous_group = "";
        for (date, event) in &entries {
            let group = match (*date - model::today()).num_days() {
                i64::MIN..=-1 => "schedule.summary.group.earlier",
                0 => "common.today",
                1 => "schedule.offset.tomorrow",
                _ => "schedule.summary.group.later",
            };
            if previous_group != group {
                body = body.child(
                    text(self.t(group), 13., MUTED)
                        .font_weight(FontWeight::BOLD)
                        .mt(px(if previous_group.is_empty() { 0. } else { 10. }))
                        .mb(px(2.))
                        .mx(px(4.)),
                );
                previous_group = group;
            }
            let event_id = event.meta.id.clone();
            let task_id = event.task_id.clone();
            let type_label = self.t(if event.kind == "task_block" {
                "schedule.summary.type.task"
            } else {
                "schedule.summary.type.fixed"
            });
            body = body.child(
                row()
                    .id(SharedString::from(format!("agenda-{event_id}")))
                    .gap(px(12.))
                    .py(px(12.))
                    .px(px(14.))
                    .rounded(px(10.))
                    .bg(rgb(SURFACE))
                    .child(
                        column()
                            .min_w(px(76.))
                            .flex_shrink_0()
                            .gap(px(2.))
                            .child(
                                text(
                                    self.tf(
                                        "schedule.summary.dayLabel",
                                        &[
                                            (
                                                "weekday",
                                                self.t(&format!(
                                                    "weekday.long.{}",
                                                    date.weekday().num_days_from_monday()
                                                )),
                                            ),
                                            ("day", date.day().to_string()),
                                        ],
                                    ),
                                    12.,
                                    MUTED,
                                )
                                .font_weight(FontWeight::BOLD),
                            )
                            .child(
                                display(
                                    format!(
                                        "{}–{}",
                                        model::time_label(event.start_minutes),
                                        model::time_label(
                                            event.start_minutes + event.duration_minutes
                                        )
                                    ),
                                    22.,
                                    TEXT,
                                )
                                .font_weight(FontWeight::EXTRA_BOLD)
                                .line_height(relative(1.1)),
                            ),
                    )
                    .child(
                        column()
                            .gap(px(4.))
                            .flex_1()
                            .child(
                                row()
                                    .gap(px(8.))
                                    .child(
                                        text(event.title.clone(), 15., TEXT)
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .truncate(),
                                    )
                                    .when(event.repeat == "weekly", |el| {
                                        el.child(
                                            row()
                                                .gap(px(3.))
                                                .px(px(6.))
                                                .py(px(1.))
                                                .rounded_full()
                                                .bg(rgba(0x00a76f29))
                                                .child(icon("Repeat", 11., DARK_GREEN))
                                                .child(text(
                                                    self.t("schedule.summary.weekly"),
                                                    11.,
                                                    DARK_GREEN,
                                                )),
                                        )
                                    }),
                            )
                            .child(
                                text(
                                    self.tf(
                                        "duration.minutes",
                                        &[("minutes", event.duration_minutes.to_string())],
                                    ),
                                    12.,
                                    DIM,
                                )
                                .font_weight(FontWeight::SEMIBOLD),
                            ),
                    )
                    .when(task_id.is_none(), |el| {
                        el.child(
                            text(type_label, 12., DIM)
                                .px(px(10.))
                                .py(px(6.))
                                .rounded(px(8.))
                                .bg(rgb(0xffffff)),
                        )
                    })
                    .when_some(task_id, |el, id| {
                        el.child(
                            button(
                                SharedString::from(format!("agenda-start-{event_id}")),
                                self.t("schedule.summary.focus"),
                                Some("Clock"),
                                false,
                            )
                            .bg(rgba(0xffab0029))
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.start_task(id.clone(), cx)),
                            ),
                        )
                    }),
            );
        }
        if entries.is_empty() {
            body = body.child(
                column()
                    .min_h(px(240.))
                    .items_center()
                    .justify_center()
                    .p(px(28.))
                    .gap(px(8.))
                    .rounded(px(16.))
                    .border_1()
                    .border_dashed()
                    .border_color(rgba(BORDER))
                    .bg(rgb(SURFACE))
                    .child(icon("Clock", 28., GREEN))
                    .child(text(self.t("schedule.summary.emptyTitle"), 16., TEXT))
                    .child(text(self.t("schedule.summary.emptyHint"), 14., DIM)),
            );
        }
        card()
            .size_full()
            .min_h_0()
            .child(
                row()
                    .justify_between()
                    .items_start()
                    .px(px(24.))
                    .pt(px(24.))
                    .child(
                        column()
                            .child(title(self.t("schedule.summary.title")))
                            .child(subtitle(self.t("schedule.summary.subtitle"))),
                    )
                    .child(
                        button("go-schedule", self.t("schedule.summary.goAdd"), None, false)
                            .bg(rgb(0xffffff))
                            .text_color(rgb(GREEN))
                            .on_click(
                                cx.listener(|this, _, _, cx| this.navigate(View::Schedule, cx)),
                            ),
                    ),
            )
            .child(body)
    }
}
