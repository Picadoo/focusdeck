use crate::{
    app::{EventEditor, FocusDeck},
    input::TextInput,
    model::{self, Event, Meta},
    tasks::TaskDrag,
    ui::*,
};
use chrono::{Datelike, Duration, NaiveDate};
use gpui::{prelude::*, *};

#[derive(Clone, Copy, PartialEq)]
pub enum DragKind {
    Create,
    Move,
    Resize,
}
pub struct ScheduleDrag {
    pub kind: DragKind,
    pub id: Option<String>,
    pub day: usize,
    pub anchor: i32,
    pub current: i32,
    pub original_start: i32,
    pub duration: i32,
    pub moved: bool,
}

impl FocusDeck {
    fn dates(&self) -> Vec<NaiveDate> {
        if self.day_view {
            vec![model::today() + Duration::days(self.day_offset)]
        } else {
            let start = model::monday(model::today()) + Duration::weeks(self.week_offset);
            (0..if self.doc.ui.show_weekend { 7 } else { 5 })
                .map(|day| start + Duration::days(day))
                .collect()
        }
    }
    fn slot(&self, position: Point<Pixels>) -> Option<(usize, i32)> {
        let bounds = self.schedule_bounds?;
        let x: f32 = (position.x - bounds.left() - px(60.)).into();
        let y: f32 = (position.y - bounds.top()).into();
        let width: f32 = (bounds.size.width - px(60.)).into();
        let dates = self.dates();
        if x < 0. || x >= width || y < 0. {
            return None;
        }
        let day = (x / (width / dates.len() as f32))
            .floor()
            .clamp(0., dates.len() as f32 - 1.) as usize;
        Some((
            day,
            ((self.schedule_hours.0 * 60) as f32 + y / 72. * 60.) as i32 / 15 * 15,
        ))
    }
    pub fn open_event(
        &mut self,
        id: Option<&str>,
        slot: Option<(NaiveDate, i32, i32)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let event = id
            .and_then(|id| {
                self.doc
                    .data
                    .schedule_events
                    .iter()
                    .find(|e| e.meta.id == id)
            })
            .cloned();
        let (date, start, duration) =
            slot.unwrap_or((model::today(), model::clock_minutes() / 30 * 30, 60));
        let make = |value: String, placeholder: &str, cx: &mut Context<Self>| {
            cx.new(|cx| {
                let mut input = TextInput::new(placeholder.to_owned(), cx);
                input.set(value, cx);
                input
            })
        };
        let title = make(
            event.as_ref().map(|e| e.title.clone()).unwrap_or_default(),
            &self.label("日程标题", "Event title"),
            cx,
        );
        let editor = EventEditor {
            id: event.as_ref().map(|e| e.meta.id.clone()),
            project: event
                .as_ref()
                .map(|e| e.project_id.clone())
                .unwrap_or_else(|| "work".into()),
            date: make(
                event
                    .as_ref()
                    .map(|e| e.date.clone())
                    .unwrap_or_else(|| date.to_string()),
                "YYYY-MM-DD",
                cx,
            ),
            start: make(
                model::time_label(event.as_ref().map(|e| e.start_minutes).unwrap_or(start)),
                "HH:MM",
                cx,
            ),
            end: make(
                model::time_label(
                    event
                        .as_ref()
                        .map(|e| e.start_minutes + e.duration_minutes)
                        .unwrap_or((start + duration).min(1440)),
                ),
                "HH:MM",
                cx,
            ),
            repeat: event.as_ref().is_some_and(|e| e.repeat == "weekly"),
            title: title.clone(),
            create_task: false,
        };
        self.editor = Some(editor);
        self.editor_error = None;
        self.menu = None;
        window.focus(&title.focus_handle(cx));
        cx.notify();
    }
    fn save_event(&mut self, cx: &mut Context<Self>) {
        let Some(editor) = &self.editor else {
            return;
        };
        let title = editor.title.read(cx).content.trim().to_owned();
        let date = NaiveDate::parse_from_str(editor.date.read(cx).content.trim(), "%Y-%m-%d");
        let start = model::parse_time(&editor.start.read(cx).content);
        let end = model::parse_time(&editor.end.read(cx).content);
        let valid = match (date, start, end) {
            (Ok(date), Some(start), Some(end))
                if !title.is_empty() && start < end && start < 1440 =>
            {
                Some((date, start, end))
            }
            _ => None,
        };
        let Some((date, start, end)) = valid else {
            self.editor_error = Some(self.label(
                "请输入标题、有效日期和起止时间，结束时间须晚于开始时间。",
                "Enter a title, valid date and an end time after the start.",
            ));
            cx.notify();
            return;
        };
        let id = editor.id.clone();
        let project = editor.project.clone();
        let repeat = if editor.repeat { "weekly" } else { "none" }.to_owned();
        let create_task = editor.create_task;
        if let Some(event) = id.as_ref().and_then(|id| {
            self.doc
                .data
                .schedule_events
                .iter_mut()
                .find(|e| &e.meta.id == id)
        }) {
            event.title = title;
            event.date = date.to_string();
            event.day_index = date.weekday().num_days_from_monday();
            event.start_minutes = start;
            event.duration_minutes = end - start;
            event.project_id = project;
            event.repeat = repeat;
            event.meta.touch();
        } else {
            let task_id = if create_task {
                Some(self.doc.data.add_task(
                    title.clone(),
                    project.clone(),
                    "p2".into(),
                    Some(model::due_timestamp(date)),
                    1,
                ))
            } else {
                None
            };
            self.doc.data.schedule_events.push(Event {
                meta: Meta::new(),
                title,
                project_id: project,
                task_id,
                date: date.to_string(),
                day_index: date.weekday().num_days_from_monday(),
                start_minutes: start,
                duration_minutes: end - start,
                kind: if create_task { "task_block" } else { "fixed" }.into(),
                repeat,
            });
        }
        self.editor = None;
        self.menu = None;
        self.save();
        cx.notify();
    }
    pub fn event_editor(&self, cx: &mut Context<Self>) -> Div {
        let editor = self.editor.as_ref().unwrap();
        let field = |label: String, input: Entity<TextInput>| {
            column()
                .gap(px(6.))
                .flex_1()
                .child(text(label, 13., MUTED).font_weight(FontWeight::SEMIBOLD))
                .child(
                    row()
                        .h(px(42.))
                        .px(px(8.))
                        .rounded(px(8.))
                        .border_1()
                        .border_color(rgba(BORDER))
                        .child(input),
                )
        };
        div()
            .absolute()
            .inset_0()
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .id("editor-backdrop")
                    .absolute()
                    .inset_0()
                    .bg(rgba(0x161c2470))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.editor = None;
                        this.menu = None;
                        cx.notify();
                    })),
            )
            .child(
                card()
                    .w(px(500.))
                    .max_w(relative(0.94))
                    .p(px(24.))
                    .gap(px(18.))
                    .occlude()
                    .child(
                        row()
                            .justify_between()
                            .child(title(self.label(
                                if editor.id.is_some() {
                                    "编辑日程"
                                } else {
                                    "新建日程"
                                },
                                if editor.id.is_some() {
                                    "Edit event"
                                } else {
                                    "New event"
                                },
                            )))
                            .child(icon_button("editor-close", "X").on_click(cx.listener(
                                |this, _, _, cx| {
                                    this.editor = None;
                                    this.menu = None;
                                    cx.notify();
                                },
                            ))),
                    )
                    .child(field(self.label("标题", "Title"), editor.title.clone()))
                    .child(
                        row()
                            .items_end()
                            .child(field(self.label("日期", "Date"), editor.date.clone()))
                            .child(
                                self.select(
                                    "event-project",
                                    self.doc
                                        .data
                                        .project(&editor.project)
                                        .map(|p| p.name.clone())
                                        .unwrap_or_default(),
                                    self.doc
                                        .data
                                        .projects
                                        .iter()
                                        .map(|p| (p.meta.id.clone(), p.name.clone()))
                                        .collect(),
                                    cx,
                                    |this, value, _, _| {
                                        if let Some(editor) = &mut this.editor {
                                            editor.project = value;
                                        }
                                    },
                                ),
                            ),
                    )
                    .child(
                        row()
                            .child(field(self.label("开始", "Start"), editor.start.clone()))
                            .child(field(self.label("结束", "End"), editor.end.clone())),
                    )
                    .child(
                        button(
                            "event-repeat",
                            self.label("每周重复", "Repeat weekly"),
                            Some(if editor.repeat {
                                "CircleCheck"
                            } else {
                                "Circle"
                            }),
                            false,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            if let Some(editor) = &mut this.editor {
                                editor.repeat = !editor.repeat;
                            }
                            cx.notify();
                        })),
                    )
                    .when(editor.id.is_none(), |el| {
                        el.child(
                            button(
                                "event-create-task",
                                self.label("同时创建待办", "Also create a task"),
                                Some(if editor.create_task {
                                    "CircleCheck"
                                } else {
                                    "Circle"
                                }),
                                false,
                            )
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(editor) = &mut this.editor {
                                    editor.create_task = !editor.create_task;
                                }
                                cx.notify();
                            })),
                        )
                    })
                    .when_some(self.editor_error.clone(), |el, error| {
                        el.child(text(error, 13., RED))
                    })
                    .child(
                        row()
                            .justify_between()
                            .child(div().when(editor.id.is_some(), |el| {
                                el.child(
                                    button(
                                        "event-delete",
                                        self.t("common.delete"),
                                        Some("Trash2"),
                                        false,
                                    )
                                    .text_color(rgb(RED))
                                    .on_click(cx.listener(
                                        |this, _, _, cx| {
                                            if let Some(id) =
                                                this.editor.as_ref().and_then(|e| e.id.as_ref())
                                                && let Some(event) = this
                                                    .doc
                                                    .data
                                                    .schedule_events
                                                    .iter_mut()
                                                    .find(|e| &e.meta.id == id)
                                            {
                                                event.meta.delete();
                                            }
                                            this.editor = None;
                                            this.save();
                                            cx.notify();
                                        },
                                    )),
                                )
                            }))
                            .child(
                                row()
                                    .child(
                                        button(
                                            "event-cancel",
                                            self.t("common.cancel"),
                                            None,
                                            false,
                                        )
                                        .on_click(
                                            cx.listener(|this, _, _, cx| {
                                                this.editor = None;
                                                cx.notify();
                                            }),
                                        ),
                                    )
                                    .child(
                                        button("event-save", self.t("common.save"), None, true)
                                            .on_click(
                                                cx.listener(|this, _, _, cx| this.save_event(cx)),
                                            ),
                                    ),
                            ),
                    ),
            )
    }
    fn begin_drag(
        &mut self,
        id: Option<String>,
        kind: DragKind,
        position: Point<Pixels>,
        cx: &mut Context<Self>,
    ) {
        if !self.edit_schedule {
            return;
        }
        let Some((day, minutes)) = self.slot(position) else {
            return;
        };
        let event = id.as_ref().and_then(|id| {
            self.doc
                .data
                .schedule_events
                .iter()
                .find(|e| &e.meta.id == id)
        });
        self.drag = Some(ScheduleDrag {
            kind,
            id: id.clone(),
            day,
            anchor: minutes,
            current: minutes,
            original_start: event.map(|e| e.start_minutes).unwrap_or(minutes),
            duration: event.map(|e| e.duration_minutes).unwrap_or(30),
            moved: false,
        });
        cx.notify();
    }
    fn drag_range(drag: &ScheduleDrag) -> (i32, i32) {
        match drag.kind {
            DragKind::Create => {
                let start = drag.anchor.min(drag.current).clamp(0, 1425);
                (
                    start,
                    (drag.anchor.max(drag.current) + 15).clamp(start + 15, 1440) - start,
                )
            }
            DragKind::Move => (
                (drag.original_start + drag.current - drag.anchor).clamp(0, 1440 - drag.duration),
                drag.duration,
            ),
            DragKind::Resize => (
                drag.original_start,
                (drag.current + 15 - drag.original_start).clamp(15, 1440 - drag.original_start),
            ),
        }
    }
    fn finish_drag(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(drag) = self.drag.take() else {
            return;
        };
        let dates = self.dates();
        let date = dates[drag.day];
        let (start, duration) = Self::drag_range(&drag);
        if drag.kind == DragKind::Create {
            self.open_event(None, Some((date, start, duration)), window, cx);
        } else if !drag.moved {
            self.open_event(drag.id.as_deref(), None, window, cx);
        } else if let Some(event) = self
            .doc
            .data
            .schedule_events
            .iter_mut()
            .find(|e| Some(&e.meta.id) == drag.id.as_ref())
        {
            event.date = date.to_string();
            event.day_index = date.weekday().num_days_from_monday();
            event.start_minutes = start;
            event.duration_minutes = duration;
            event.meta.touch();
            self.save();
            cx.notify();
        }
    }
    pub fn schedule_view(
        &mut self,
        width: f32,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Div {
        let dates = self.dates();
        let first = dates[0];
        let last = *dates.last().unwrap();
        let events: Vec<_> = self
            .doc
            .data
            .schedule_events
            .iter()
            .filter(|e| {
                !self.hidden_projects.contains(&e.project_id) && dates.iter().any(|d| e.occurs(*d))
            })
            .cloned()
            .collect();
        let (start, end) = if self.doc.ui.schedule_full_day {
            (0, 24)
        } else {
            let low = events
                .iter()
                .map(|e| e.start_minutes / 60)
                .min()
                .unwrap_or(9)
                - 1;
            let high = events
                .iter()
                .map(|e| (e.start_minutes + e.duration_minutes + 59) / 60)
                .max()
                .unwrap_or(21)
                + 1;
            let low = low.clamp(0, 18);
            (low, high.max(low + 6).min(24))
        };
        self.schedule_hours = (start, end);
        let height = (end - start) as f32 * 72.;
        let body_width = width - 24.;
        let col_width = (body_width - 60.) / dates.len() as f32;
        let weak = cx.weak_entity();
        let paint_dates = dates.clone();
        let grid_paint = canvas(
            move |bounds, _, cx| {
                let _ = weak.update(cx, |this, _| this.schedule_bounds = Some(bounds));
            },
            move |bounds, _, window, _| {
                let width: f32 = bounds.size.width.into();
                let column_width = (width - 60.) / paint_dates.len() as f32;
                for hour in 0..=end - start {
                    let y = bounds.top() + px(hour as f32 * 72.);
                    window.paint_quad(fill(
                        Bounds::new(
                            point(bounds.left() + px(60.), y),
                            size(px(width - 60.), px(1.)),
                        ),
                        rgba(BORDER),
                    ));
                }
                for day in 0..=paint_dates.len() {
                    window.paint_quad(fill(
                        Bounds::new(
                            point(
                                bounds.left() + px(60. + day as f32 * column_width),
                                bounds.top(),
                            ),
                            size(px(1.), bounds.size.height),
                        ),
                        rgba(BORDER),
                    ));
                }
                if let Some(day) = paint_dates.iter().position(|date| *date == model::today()) {
                    let minute = model::clock_minutes();
                    if minute >= start * 60 && minute < end * 60 {
                        window.paint_quad(fill(
                            Bounds::new(
                                point(
                                    bounds.left() + px(60. + day as f32 * column_width),
                                    bounds.top() + px((minute - start * 60) as f32 * 1.2),
                                ),
                                size(px(column_width), px(2.)),
                            ),
                            rgb(RED),
                        ));
                    }
                }
            },
        )
        .absolute()
        .inset_0();
        let mut grid = div()
            .id("schedule-grid")
            .relative()
            .w_full()
            .h(px(height))
            .flex_shrink_0()
            .child(grid_paint);
        for hour in start..end {
            grid = grid.child(
                text(model::time_label(hour * 60), 12., DIM)
                    .absolute()
                    .left(px(12.))
                    .top(px((hour - start) as f32 * 72. + 4.)),
            );
        }
        for (day, date) in dates.iter().enumerate() {
            let mut day_events: Vec<_> =
                events.iter().filter(|e| e.occurs(*date)).cloned().collect();
            if let Some(drag) = &self.drag {
                if let Some(id) = &drag.id {
                    day_events.retain(|e| &e.meta.id != id);
                }
                if day == drag.day {
                    let (s, d) = Self::drag_range(drag);
                    let mut e = drag
                        .id
                        .as_ref()
                        .and_then(|id| events.iter().find(|e| &e.meta.id == id))
                        .cloned()
                        .unwrap_or(Event {
                            meta: Meta::new(),
                            title: self.label("新建日程", "New event"),
                            project_id: "work".into(),
                            task_id: None,
                            date: date.to_string(),
                            day_index: date.weekday().num_days_from_monday(),
                            start_minutes: s,
                            duration_minutes: d,
                            kind: "fixed".into(),
                            repeat: "none".into(),
                        });
                    e.start_minutes = s;
                    e.duration_minutes = d;
                    day_events.push(e);
                }
            }
            for (event, col, cols) in model::event_columns(&day_events) {
                let tone = self
                    .doc
                    .data
                    .project(&event.project_id)
                    .map(|p| color(&p.color))
                    .unwrap_or(GREEN);
                let id = event.meta.id.clone();
                let move_id = id.clone();
                let resize_id = id.clone();
                let top = (event.start_minutes - start * 60) as f32 * 1.2;
                if top < 0. || top >= height {
                    continue;
                }
                let event_width = (col_width - 6.) / cols as f32 - 2.;
                grid = grid.child(
                    column()
                        .id(SharedString::from(format!("event-{day}-{id}")))
                        .absolute()
                        .left(px(60.
                            + day as f32 * col_width
                            + 3.
                            + col as f32 * (event_width + 2.)))
                        .top(px(top + 1.))
                        .w(px(event_width.max(1.)))
                        .h(px((event.duration_minutes as f32 * 1.2 - 2.).max(18.)))
                        .px(px(if event_width < 56. { 3. } else { 9. }))
                        .py(px(5.))
                        .bg(rgba((tone << 8) | 0x28))
                        .border_l(px(3.))
                        .border_color(rgb(tone))
                        .rounded(px(6.))
                        .overflow_hidden()
                        .cursor_pointer()
                        .occlude()
                        .child(
                            text(event.title.clone(), 13., TEXT)
                                .font_weight(FontWeight::SEMIBOLD)
                                .truncate(),
                        )
                        .when(event.duration_minutes >= 45 && event_width >= 56., |el| {
                            el.child(text(
                                if event_width >= 112. {
                                    format!(
                                        "{} – {}",
                                        model::time_label(event.start_minutes),
                                        model::time_label(
                                            event.start_minutes + event.duration_minutes
                                        )
                                    )
                                } else {
                                    model::time_label(event.start_minutes)
                                },
                                12.,
                                MUTED,
                            ))
                        })
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                                if this.edit_schedule {
                                    this.begin_drag(
                                        Some(move_id.clone()),
                                        DragKind::Move,
                                        event.position,
                                        cx,
                                    );
                                    cx.stop_propagation();
                                }
                            }),
                        )
                        .on_click(cx.listener(move |this, _, window, cx| {
                            if !this.edit_schedule {
                                this.open_event(Some(&id), None, window, cx);
                            }
                        }))
                        .when(self.edit_schedule, |el| {
                            el.child(
                                div()
                                    .id(SharedString::from(format!("resize-{resize_id}")))
                                    .absolute()
                                    .left_0()
                                    .right_0()
                                    .bottom_0()
                                    .h(px(8.))
                                    .cursor(CursorStyle::ResizeUpDown)
                                    .on_mouse_down(
                                        MouseButton::Left,
                                        cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                                            this.begin_drag(
                                                Some(resize_id.clone()),
                                                DragKind::Resize,
                                                event.position,
                                                cx,
                                            );
                                            cx.stop_propagation();
                                        }),
                                    ),
                            )
                        }),
                );
            }
        }
        let grid = grid
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, _, cx| {
                    this.begin_drag(None, DragKind::Create, event.position, cx)
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                if let Some((day, minute)) = this.slot(event.position)
                    && let Some(drag) = &mut this.drag
                {
                    if minute != drag.current || day != drag.day {
                        drag.moved = true;
                    }
                    drag.day = day;
                    drag.current = minute.clamp(0, 1425);
                    cx.notify();
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, window, cx| this.finish_drag(window, cx)),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    this.drag = None;
                    cx.notify();
                }),
            )
            .on_drop(cx.listener(|this, drag: &TaskDrag, window, cx| {
                if let Some((day, start)) = this.slot(window.mouse_position())
                    && let Some(task) = this
                        .doc
                        .data
                        .tasks
                        .iter()
                        .find(|t| t.meta.id == drag.0)
                        .cloned()
                {
                    let date = this.dates()[day];
                    this.doc.data.schedule_events.push(Event {
                        meta: Meta::new(),
                        title: task.title,
                        project_id: task.project_id,
                        task_id: Some(task.meta.id),
                        date: date.to_string(),
                        day_index: date.weekday().num_days_from_monday(),
                        start_minutes: start.clamp(0, 1410),
                        duration_minutes: 30,
                        kind: "task_block".into(),
                        repeat: "none".into(),
                    });
                    this.save();
                    cx.notify();
                }
            }));
        let mut legend = row().flex_wrap().gap(px(6.));
        for (i, project) in self.doc.data.projects.iter().enumerate() {
            let id = project.meta.id.clone();
            legend = legend.child(
                pill(
                    ("legend", i),
                    project.name.clone(),
                    color(&project.color),
                    !self.hidden_projects.contains(&id),
                )
                .child(dot(color(&project.color)))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if !this.hidden_projects.remove(&id) {
                        this.hidden_projects.insert(id.clone());
                    }
                    cx.notify();
                })),
            );
        }
        let toolbar = row()
            .flex_wrap()
            .justify_between()
            .items_start()
            .gap(px(12.))
            .px(px(20.))
            .py(px(16.))
            .child(
                column()
                    .gap(px(6.))
                    .child(
                        row()
                            .child(title(self.label("课程表式日程", "Schedule")))
                            .child(text(
                                format!("{} – {}", first.format("%m/%d"), last.format("%m/%d")),
                                14.,
                                MUTED,
                            )),
                    )
                    .child(legend),
            )
            .child(
                row()
                    .flex_wrap()
                    .gap(px(8.))
                    .child(
                        icon_button("schedule-prev", "ChevronLeft").on_click(cx.listener(
                            |this, _, _, cx| {
                                if this.day_view {
                                    this.day_offset -= 1
                                } else {
                                    this.week_offset -= 1
                                }
                                cx.notify();
                            },
                        )),
                    )
                    .child(
                        button("schedule-today", self.t("common.today"), None, false).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.week_offset = 0;
                                this.day_offset = 0;
                                cx.notify();
                            }),
                        ),
                    )
                    .child(
                        icon_button("schedule-next", "ChevronRight").on_click(cx.listener(
                            |this, _, _, cx| {
                                if this.day_view {
                                    this.day_offset += 1
                                } else {
                                    this.week_offset += 1
                                }
                                cx.notify();
                            },
                        )),
                    )
                    .child(
                        button(
                            "schedule-mode",
                            self.label(
                                if self.day_view { "日" } else { "周" },
                                if self.day_view { "Day" } else { "Week" },
                            ),
                            None,
                            false,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.day_view = !this.day_view;
                            cx.notify();
                        })),
                    )
                    .child(
                        icon_button("schedule-weekend", "CalendarDays")
                            .when(self.doc.ui.show_weekend, |el| el.bg(rgba(0x00a76f29)))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.doc.ui.show_weekend = !this.doc.ui.show_weekend;
                                this.save();
                                cx.notify();
                            })),
                    )
                    .child(
                        icon_button(
                            "schedule-full-day",
                            if self.doc.ui.schedule_full_day {
                                "Minimize2"
                            } else {
                                "Maximize2"
                            },
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.doc.ui.schedule_full_day = !this.doc.ui.schedule_full_day;
                            this.save();
                            cx.notify();
                        })),
                    )
                    .child(
                        icon_button("schedule-edit", "Pencil")
                            .when(self.edit_schedule, |el| el.bg(rgba(0xffab0029)))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.edit_schedule = !this.edit_schedule;
                                cx.notify();
                            })),
                    )
                    .child(
                        icon_button("schedule-tasks", "ListTodo").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.tasks_open = !this.tasks_open;
                                cx.notify();
                            },
                        )),
                    )
                    .child(
                        button(
                            "schedule-add",
                            self.label("添加日程", "Add event"),
                            Some("Plus"),
                            true,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.open_event(None, None, window, cx)
                        })),
                    ),
            );
        let mut headers = row()
            .gap_0()
            .pl(px(60.))
            .border_b_1()
            .border_color(rgba(BORDER))
            .h(px(64.))
            .flex_shrink_0();
        for (i, date) in dates.iter().enumerate() {
            let is_today = *date == model::today();
            headers = headers.child(
                row()
                    .flex_1()
                    .justify_center()
                    .gap(px(10.))
                    .child(text(
                        self.t(&format!(
                            "weekday.long.{}",
                            date.weekday().num_days_from_monday()
                        )),
                        14.,
                        MUTED,
                    ))
                    .child(
                        row()
                            .id(("day-head", i))
                            .size(px(32.))
                            .justify_center()
                            .rounded_full()
                            .when(is_today, |el| el.bg(rgb(GREEN)).text_color(rgb(0xffffff)))
                            .child(date.day().to_string()),
                    ),
            );
        }
        card()
            .size_full()
            .min_h_0()
            .relative()
            .overflow_hidden()
            .child(toolbar)
            .when(!self.day_view, |el| el.child(headers))
            .child(
                div()
                    .id("schedule-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(grid),
            )
            .when(self.tasks_open, |el| {
                el.child(
                    div()
                        .id("tasks-backdrop")
                        .absolute()
                        .inset_0()
                        .bg(rgba(0x161c2448))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.tasks_open = false;
                            cx.notify();
                        })),
                )
                .child(
                    div()
                        .absolute()
                        .top(px(12.))
                        .bottom(px(12.))
                        .left(px(12.))
                        .w(px(420.))
                        .max_w(relative(0.9))
                        .occlude()
                        .child(self.task_panel("schedule-tasks", cx)),
                )
            })
    }
}
