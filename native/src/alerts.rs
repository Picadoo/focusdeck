use crate::{app::FocusDeck, ui::*};
use gpui::{prelude::*, *};

impl FocusDeck {
    pub fn transition_key(transition: &str) -> &'static str {
        match transition {
            "focus_completed" => "focusCompleted",
            "short_break_completed" => "shortBreakCompleted",
            "long_break_completed" => "longBreakCompleted",
            "focus_skipped" => "focusSkipped",
            _ => "breakSkipped",
        }
    }
    pub fn completion_overlay(&self, cx: &mut Context<Self>) -> Div {
        let key = Self::transition_key(
            self.doc
                .timer
                .last_transition
                .as_deref()
                .unwrap_or("focus_completed"),
        );
        let focus = key == "focusCompleted";
        let tone = if focus { AMBER } else { GREEN };
        let base = div().absolute().inset_0().bg(rgb(tone)).opacity(0.08);
        let background = if self.reduced_motion {
            base.into_any_element()
        } else {
            base.with_animation(
                "completion-pulse",
                Animation::new(std::time::Duration::from_millis(1800)),
                |el, progress| {
                    let pulse = (progress * 3. * std::f32::consts::PI).sin().powi(2);
                    el.opacity(if progress >= 1. {
                        0.08
                    } else {
                        0.08 + pulse * 0.2
                    })
                },
            )
            .into_any_element()
        };
        div()
            .absolute()
            .inset_0()
            .flex()
            .items_center()
            .justify_center()
            .occlude()
            .child(background)
            .child(
                card()
                    .w(px(460.))
                    .max_w(relative(0.9))
                    .p(px(32.))
                    .gap(px(18.))
                    .items_center()
                    .shadow_lg()
                    .child(
                        row()
                            .size(px(64.))
                            .justify_center()
                            .rounded_full()
                            .bg(rgba((tone << 8) | 0x25))
                            .child(icon("Bell", 30., tone)),
                    )
                    .child(title(self.t(&format!("timer.notice.{key}.title"))))
                    .child(
                        text(self.t(&format!("timer.overlay.{key}.body")), 15., MUTED)
                            .text_center(),
                    )
                    .child(
                        button(
                            "completion-dismiss",
                            self.t(if focus {
                                "common.gotIt"
                            } else {
                                "timer.action.startFocus"
                            }),
                            Some(if focus { "Check" } else { "Play" }),
                            true,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.alert_since = None;
                                if !focus && this.doc.timer.phase == "idle" {
                                    this.timer_toggle(cx);
                                }
                                window.focus(&this.focus);
                                cx.notify();
                            },
                        )),
                    ),
            )
    }
}
