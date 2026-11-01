use crate::{app::FocusDeck, sync, ui::*};
use gpui::{prelude::*, *};

impl FocusDeck {
    pub fn sync_card(&self, cx: &mut Context<Self>) -> Div {
        let field = |input: Entity<crate::input::TextInput>| {
            row()
                .h(px(40.))
                .px(px(8.))
                .rounded(px(8.))
                .border_1()
                .border_color(rgba(BORDER))
                .child(input)
        };
        let status = if self.sync_busy {
            "sync.status.syncing"
        } else if self.sync_error.is_some() {
            "sync.status.error"
        } else if self.session.is_some() {
            "sync.status.idle"
        } else {
            "sync.status.local"
        };
        let mut card = column()
            .p(px(16.))
            .gap(px(10.))
            .rounded(px(12.))
            .bg(rgb(SURFACE))
            .child(text(self.t("sync.login.title"), 16., TEXT).font_weight(FontWeight::BOLD));
        if let Some(session) = &self.session {
            card = card
                .child(text(
                    self.tf(
                        "sync.account.signedIn",
                        &[("username", session.username.clone())],
                    ),
                    13.,
                    MUTED,
                ))
                .child(
                    button("sync-now", self.t(status), Some("Cloud"), true).on_click(
                        cx.listener(|this, _, window, cx| this.begin_sync(None, window, cx)),
                    ),
                )
                .child(
                    button(
                        "logout",
                        self.t("sync.account.logout"),
                        Some("LogOut"),
                        false,
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.session = None;
                        this.sync_generation += 1;
                        this.doc.sync.since = 0;
                        this.save();
                        cx.notify();
                    })),
                );
        } else {
            card = card
                .child(text(self.t("sync.login.serverLabel"), 12., MUTED))
                .child(field(self.server_input.clone()))
                .child(text(self.t("sync.login.username"), 12., MUTED))
                .child(field(self.username_input.clone()))
                .child(text(self.t("sync.login.password"), 12., MUTED))
                .child(field(self.password_input.clone()))
                .child(
                    button(
                        "login",
                        self.t(if self.sync_busy {
                            "sync.login.submitting"
                        } else {
                            "sync.login.submit"
                        }),
                        Some("LogIn"),
                        true,
                    )
                    .on_click(cx.listener(|this, _, window, cx| {
                        let password = this.password_input.read(cx).content.to_string();
                        this.begin_sync(Some(password), window, cx);
                    })),
                )
                .child(text(self.t("sync.login.localHint"), 12., DIM));
        }
        card.when_some(self.sync_error.clone(), |el, error| {
            el.child(text(error, 12., RED))
        })
    }
    pub fn begin_sync(
        &mut self,
        password: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.sync_busy {
            return;
        }
        if password.is_some() {
            let server = self.server_input.read(cx).content.to_string();
            match sync::normalize_server(&server) {
                Ok(server) => {
                    if server != self.doc.sync.server
                        || self.username_input.read(cx).content.as_ref() != self.doc.sync.username
                    {
                        self.doc.sync.since = 0;
                    }
                    self.doc.sync.server = server;
                    self.doc.sync.username = self.username_input.read(cx).content.to_string();
                }
                Err(error) => {
                    self.sync_error = Some(error.to_string());
                    cx.notify();
                    return;
                }
            }
        }
        let settings = self.doc.sync.clone();
        let session = self.session.clone();
        let data = self.doc.data.clone();
        let generation = self.sync_generation;
        self.password_input
            .update(cx, |input, cx| input.set("", cx));
        self.sync_busy = true;
        self.sync_error = None;
        let job = cx
            .background_executor()
            .spawn(async move { sync::run(settings, session, password, data) });
        self.network_task = Some(cx.spawn_in(window, async move |this, cx| {
            let result = job.await;
            let _ = this.update_in(cx, |this, _, cx| {
                this.sync_busy = false;
                if generation != this.sync_generation {
                    cx.notify();
                    return;
                }
                match result {
                    Ok(result) => {
                        this.doc.data.merge(&result.data);
                        this.task_list.reset(this.task_list.item_count());
                        this.doc.sync.since = result.cursor;
                        this.session = Some(result.session);
                        crate::model::set_clock_offset(result.clock_offset);
                        if let Err(error) = this.doc.save(&this.path) {
                            this.message = Some(format!("{error:#}"));
                        }
                    }
                    Err(error) => {
                        this.sync_error = Some(error.to_string());
                    }
                }
                cx.notify();
            });
        }));
        cx.notify();
    }
}
