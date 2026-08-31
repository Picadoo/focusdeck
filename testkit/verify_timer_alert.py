"""番茄钟结束提醒的三层通道验收。

三层各对应一个「人在哪儿」的场景，脚本逐条量真实 DOM，不靠看截图：

  ① 窗口可见  → 全屏色层存在、相位配色正确、卡片可读
  ② 切到别的标签页 → 标题闪烁到完成文案、favicon 换成 data: 图、处理后都还原
  ③ 切到别的应用   → 通知发送条件从 document.hidden 放宽到 !document.hasFocus()

第③层不能真弹系统通知（需要权限且无法在无头环境断言），改为拦截 Notification
构造函数记录调用，断言「窗口有焦点时不发、失焦时发，且 requireInteraction 为真」。

跑法（先 pnpm build 再 npx vite preview --port 4180）：
    python testkit/verify_timer_alert.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get('FD_URL', 'http://localhost:4180/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

PREVIEW = "(t) => window.dispatchEvent(new CustomEvent('focusdeck:preview-alert', { detail: t }))"

# 相位配色取自 src/styles/index.css 的设计令牌
TONE = {'focus_completed': ('focus', '#ffab00'), 'short_break_completed': ('break', '#00a76f')}


def seed(locale='zh-CN', overlay=True, notify=True):
    payload = {
        'focusdeck-ui-storage': {
            'state': {
                'locale': locale, 'viewMode': 'timer', 'showWeekend': True,
                'dayStartHour': 7, 'dayEndHour': 24,
                'soundEnabled': False, 'overlayEnabled': overlay, 'notifyEnabled': notify,
                'scheduleFullDay': False,
            },
            'version': 6,
        }
    }
    return (
        '(() => { const s = %s;'
        ' for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); })();'
        % json.dumps(payload, ensure_ascii=False)
    )


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return 'rgb(%d, %d, %d)' % tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def open_page(browser, **kw):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.add_init_script(seed(**kw))
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_timeout(350)
    return ctx, page


def check_overlay_layer(browser, failures):
    """① 全屏色层：存在、铺满、配色跟着相位走。"""
    for transition, (tone, color) in TONE.items():
        ctx, page = open_page(browser)
        page.evaluate(PREVIEW, transition)
        page.wait_for_timeout(300)

        flash = page.locator('.timer-alert-flash')
        if flash.count() == 0:
            failures.append(f'[①{transition}] 找不到 .timer-alert-flash 全屏色层')
            ctx.close()
            continue

        box = flash.bounding_box()
        vp = page.viewport_size
        if not box or box['width'] < vp['width'] - 1 or box['height'] < vp['height'] - 1:
            failures.append(f'[①{transition}] 色层没有铺满视口：{box}')

        got = page.evaluate(
            "() => getComputedStyle(document.querySelector('.timer-alert-flash')).backgroundColor"
        )
        if rgb(color) not in got:
            failures.append(f'[①{transition}] 色层配色 {got}，期望含 {rgb(color)}（tone-{tone}）')

        if not page.locator('.timer-alert-card h2').is_visible():
            failures.append(f'[①{transition}] 色层盖住了卡片标题')
        ctx.close()


def check_tab_layer(browser, failures):
    """② 标题闪烁 + favicon 换色，且处理掉之后两者都还原。"""
    ctx, page = open_page(browser)
    base_title = page.title()
    base_icon = page.evaluate("() => document.querySelector('link[rel~=\"icon\"]').href")

    page.evaluate(PREVIEW, 'focus_completed')
    page.wait_for_timeout(200)

    # 闪烁：在一个周期内多次采样，必须同时出现「完成文案」和「非完成文案」两种状态
    seen = set()
    for _ in range(14):
        seen.add(page.title())
        page.wait_for_timeout(150)
    done = [x for x in seen if '专注完成' in x]
    if not done:
        failures.append(f'[②] 标题从未变成完成文案，采样到：{sorted(seen)}')
    if len(seen) < 2:
        failures.append(f'[②] 标题没有闪烁（整段只有一个值 {sorted(seen)}）')

    icon = page.evaluate("() => document.querySelector('link[rel~=\"icon\"]').href")
    if not icon.startswith('data:image/png'):
        failures.append(f'[②] favicon 未换成 canvas 生成的图，仍是 {icon[:60]}')

    page.screenshot(path=os.path.join(OUT, 'alert-tab-attention.png'))

    page.locator('.timer-alert-card button').first.click()
    page.wait_for_timeout(400)
    if page.evaluate("() => document.querySelector('link[rel~=\"icon\"]').href") != base_icon:
        failures.append('[②] 处理提醒后 favicon 没还原')
    if '专注完成' in page.title():
        failures.append(f'[②] 处理提醒后标题仍停在完成文案：{page.title()}')
    if base_title == '':
        failures.append('[②] 初始标题为空，无法判断还原是否正确')
    ctx.close()


def check_notify_gate(browser, failures):
    """③ 通知门槛：有焦点不发，失焦才发，且要求常驻。"""
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800},
                              permissions=['notifications'])
    page = ctx.new_page()
    page.add_init_script(seed())
    # 拦截 Notification：无头环境不会真弹，只记录构造参数
    page.add_init_script("""
      (() => {
        window.__notes = [];
        class FakeNotification {
          constructor(title, opts) { window.__notes.push({ title, opts }); }
          close() {}
          addEventListener() {}
        }
        FakeNotification.permission = 'granted';
        FakeNotification.requestPermission = async () => 'granted';
        Object.defineProperty(window, 'Notification', { value: FakeNotification, writable: true });
      })();
    """)
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_timeout(350)

    # 通知只挂在 store 的 lastTransition 上，预览事件走不到，必须造一次真完成。
    # 办法是把 endsAt 拨到过去再刷新——onRehydrateStorage 会补一次 tick，比等 25 分钟现实。
    page.evaluate("""
      () => {
        const raw = localStorage.getItem('focusdeck-timer-storage');
        const now = Math.floor(Date.now() / 1000);
        const state = raw ? JSON.parse(raw) : { state: {}, version: 4 };
        state.state = Object.assign({}, state.state, {
          profileId: 'classic', phase: 'focus_running', taskId: null,
          startedAt: now - 3600, endsAt: now - 1, remainingSeconds: 0,
          focusElapsedSeconds: 0, sessionCount: 0,
          lastTransition: null, lastTransitionAt: null,
        });
        localStorage.setItem('focusdeck-timer-storage', JSON.stringify(state));
      }
    """)
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(900)

    focused = page.evaluate('() => ({ notes: window.__notes.length, hasFocus: document.hasFocus() })')
    if focused['hasFocus'] and focused['notes'] != 0:
        failures.append(f'[③] 窗口有焦点时仍发了通知（{focused["notes"]} 条），会与弹层重复打扰')

    ctx.close()

    # 失焦分支：新开一个 context 并让页面失焦，再制造一次完成
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800},
                              permissions=['notifications'])
    page = ctx.new_page()
    page.add_init_script(seed())
    page.add_init_script("""
      (() => {
        window.__notes = [];
        class FakeNotification {
          constructor(title, opts) { window.__notes.push({ title, opts }); }
          close() {}
          addEventListener() {}
        }
        FakeNotification.permission = 'granted';
        FakeNotification.requestPermission = async () => 'granted';
        Object.defineProperty(window, 'Notification', { value: FakeNotification, writable: true });
        // 无头环境里窗口始终"有焦点"，直接把 hasFocus 打成 false 模拟人切走了
        Object.defineProperty(document, 'hasFocus', { value: () => false, writable: true });
      })();
    """)
    page.goto(BASE, wait_until='networkidle')
    page.evaluate("""
      () => {
        const raw = localStorage.getItem('focusdeck-timer-storage');
        const now = Math.floor(Date.now() / 1000);
        const state = raw ? JSON.parse(raw) : { state: {}, version: 4 };
        state.state = Object.assign({}, state.state, {
          profileId: 'classic', phase: 'focus_running', taskId: null,
          startedAt: now - 3600, endsAt: now - 1, remainingSeconds: 0,
          focusElapsedSeconds: 0, sessionCount: 0,
          lastTransition: null, lastTransitionAt: null,
        });
        localStorage.setItem('focusdeck-timer-storage', JSON.stringify(state));
      }
    """)
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(900)

    notes = page.evaluate('() => window.__notes')
    if not notes:
        failures.append('[③] 窗口失焦时没有发系统通知 —— 这正是「人在别的应用里」的场景')
    else:
        opts = notes[0].get('opts') or {}
        if not opts.get('requireInteraction'):
            failures.append('[③] 通知没有 requireInteraction，会自动消失，人离开工位就错过了')
        if not opts.get('silent'):
            failures.append('[③] 通知没有 silent，会和应用内和弦撞成双响')
    ctx.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome')
        try:
            check_overlay_layer(browser, failures)
            check_tab_layer(browser, failures)
            check_notify_gate(browser, failures)
        finally:
            browser.close()

    if failures:
        print(f'FAIL {len(failures)} 条')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('PASS 三层提醒全部通过：全屏色层 / 标题+favicon / 失焦通知常驻')


if __name__ == '__main__':
    main()
