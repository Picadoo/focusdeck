use gpui::{prelude::*, *};
use std::{borrow::Cow, collections::BTreeMap, sync::LazyLock};

pub const BG: u32 = 0xf6f8f9;
pub const SURFACE: u32 = 0xf4f6f8;
pub const TEXT: u32 = 0x1c252e;
pub const MUTED: u32 = 0x637381;
pub const DIM: u32 = 0x919eab;
pub const GREEN: u32 = 0x00a76f;
pub const DARK_GREEN: u32 = 0x007867;
pub const AMBER: u32 = 0xffab00;
pub const RED: u32 = 0xff5630;
pub const BLUE: u32 = 0x00b8d9;
pub const BORDER: u32 = 0x919eab33;

static ICONS: LazyLock<BTreeMap<String, String>> =
    LazyLock::new(|| serde_json::from_str(include_str!("../assets/icons.json")).unwrap());
pub struct Assets;
impl AssetSource for Assets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        Ok(ICONS.get(path).map(|svg| Cow::Borrowed(svg.as_bytes())))
    }
    fn list(&self, _: &str) -> anyhow::Result<Vec<SharedString>> {
        Ok(ICONS.keys().cloned().map(Into::into).collect())
    }
}
pub fn icon(name: &'static str, size: f32, color: u32) -> Svg {
    svg()
        .path(name)
        .size(px(size))
        .text_color(rgb(color))
        .flex_shrink_0()
}
pub fn color(value: &str) -> u32 {
    u32::from_str_radix(value.trim_start_matches('#'), 16).unwrap_or(GREEN)
}
pub fn row() -> Div {
    div().flex().items_center().gap(px(8.))
}
pub fn column() -> Div {
    div().flex().flex_col().min_w_0()
}
pub fn card() -> Div {
    column()
        .relative()
        .bg(rgb(0xffffff))
        .rounded(px(16.))
        .shadow(vec![BoxShadow {
            color: rgba(0x919eab22).into(),
            offset: point(px(0.), px(12.)),
            blur_radius: px(24.),
            spread_radius: px(-4.),
        }])
}
pub fn text(value: impl Into<SharedString>, size: f32, tone: u32) -> Div {
    div()
        .text_size(px(size))
        .text_color(rgb(tone))
        .child(value.into())
}
pub fn display(value: impl Into<SharedString>, size: f32, tone: u32) -> Div {
    text(value, size, tone).font_family("Barlow")
}
pub fn title(value: impl Into<SharedString>) -> Div {
    text(value, 22., TEXT).font_weight(FontWeight::BOLD)
}
pub fn subtitle(value: impl Into<SharedString>) -> Div {
    text(value, 15., MUTED).mt(px(6.))
}
pub fn dot(tone: u32) -> Div {
    div()
        .size(px(8.))
        .rounded_full()
        .bg(rgb(tone))
        .flex_shrink_0()
}
pub fn button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    glyph: Option<&'static str>,
    primary: bool,
) -> Stateful<Div> {
    row()
        .id(id)
        .h(px(36.))
        .px(px(12.))
        .rounded(px(8.))
        .text_size(px(14.))
        .font_weight(FontWeight::BOLD)
        .bg(rgb(if primary { GREEN } else { SURFACE }))
        .text_color(rgb(if primary { 0xffffff } else { MUTED }))
        .cursor_pointer()
        .hover(move |s| s.bg(rgb(if primary { DARK_GREEN } else { 0xdfe3e8 })))
        .when_some(glyph, |el, glyph| {
            el.child(icon(glyph, 16., if primary { 0xffffff } else { MUTED }))
        })
        .child(label.into())
}
pub fn icon_button(id: impl Into<ElementId>, glyph: &'static str) -> Stateful<Div> {
    row()
        .id(id)
        .justify_center()
        .size(px(36.))
        .rounded(px(8.))
        .cursor_pointer()
        .hover(|s| s.bg(rgb(SURFACE)))
        .child(icon(glyph, 18., MUTED))
}
pub fn pill(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    tone: u32,
    active: bool,
) -> Stateful<Div> {
    row()
        .id(id)
        .h(px(26.))
        .px(px(11.))
        .rounded_full()
        .border_1()
        .border_color(if active {
            Hsla::from(rgb(tone))
        } else {
            Hsla::from(rgba(0))
        })
        .bg(if active {
            Hsla::from(rgba((tone << 8) | 0x20))
        } else {
            Hsla::from(rgb(SURFACE))
        })
        .text_size(px(12.))
        .font_weight(FontWeight::BOLD)
        .text_color(rgb(if active { TEXT } else { MUTED }))
        .cursor_pointer()
        .hover(|s| s.bg(rgb(0xdfe3e8)))
        .child(label.into())
}

/// Paint circular strokes directly on the GPU; there is no bitmap regenerated on each tick.
pub fn ring(diameter: f32, width: f32, segments: Vec<(f32, u32)>) -> impl IntoElement {
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            let center = bounds.center();
            let radius = diameter / 2. - width / 2.;
            let mut paint_arc = |start: f32, fraction: f32, tone: u32| {
                if fraction <= 0. {
                    return;
                }
                let steps = (fraction * 180.).ceil() as usize;
                let mut path = PathBuilder::stroke(px(width));
                for i in 0..=steps {
                    let angle = (start + fraction * i as f32 / steps as f32)
                        * std::f32::consts::TAU
                        - std::f32::consts::FRAC_PI_2;
                    let p = point(
                        center.x + px(angle.cos() * radius),
                        center.y + px(angle.sin() * radius),
                    );
                    if i == 0 {
                        path.move_to(p)
                    } else {
                        path.line_to(p)
                    }
                }
                if let Ok(path) = path.build() {
                    window.paint_path(path, rgb(tone));
                }
            };
            paint_arc(0., 1., 0xdfe3e8);
            let mut start = 0.;
            for (fraction, tone) in segments {
                paint_arc(start, fraction, tone);
                start += fraction;
            }
        },
    )
    .size(px(diameter))
}
