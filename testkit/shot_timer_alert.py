"""把番茄钟结束提示的现状截下来，供人工评估视觉强度。

界面上的「试听提醒」按钮走的就是 previewTimerAlert，这里直接派发同一个事件，
不用真等 25 分钟。两种语言、两种相位各来一张。

    python testkit/shot_timer_alert.py
"""
import json
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get('FD_URL', 'http://localhost:4180/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

CASES = [('zh-CN', 'focus_completed'), ('zh-CN', 'short_break_completed'), ('en', 'focus_completed')]


def seed(locale):
    payload = {
        'focusdeck-ui-storage': {
            'state': {
                'locale': locale, 'viewMode': 'timer', 'showWeekend': True,
                'dayStartHour': 7, 'dayEndHour': 24,
                # 声音关掉：截图用不上，还会让 AudioContext 在无声卡的环境里报错
                'soundEnabled': False, 'overlayEnabled': True, 'notifyEnabled': False,
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


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome')
        for locale, transition in CASES:
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            page = ctx.new_page()
            page.add_init_script(seed(locale))
            page.goto(BASE, wait_until='networkidle')
            page.wait_for_timeout(400)
            page.evaluate(
                "(t) => window.dispatchEvent("
                "new CustomEvent('focusdeck:preview-alert', { detail: t }))",
                transition,
            )
            # 色层是 3 × 600ms 的脉冲：300ms 落在第一次的波峰（opacity 0.62），
            # 2000ms 时动画已结束、停在常驻淡色（0.18）。两个时刻都要看，
            # 只截一张很容易恰好抓在波谷，误判成「没效果」。
            for label, delay in (('peak', 300), ('settled', 1700)):
                page.wait_for_timeout(delay)
                name = f'alert-{locale}-{transition}-{label}.png'
                page.screenshot(path=os.path.join(OUT, name))
                print('wrote ' + name)
            ctx.close()
        browser.close()


if __name__ == '__main__':
    main()
