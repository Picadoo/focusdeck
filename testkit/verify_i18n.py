"""中英双语的端到端验收：种子写死语言，逐条量真实 DOM，不靠肉眼看截图。

跑法（先 `pnpm build` 再 `npx vite preview --port 4180`）：
    python testkit/verify_i18n.py

判定口径：
- `<html lang>` 与 `document.title` 必须跟着语言走 —— 这两处 React 管不到，
  靠 uiStore 的 applyLocale 推，最容易在改动中悄悄失效。
- 每种语言各抽 4 个页面的关键文案，断言「该语言的词出现、另一语言的词不出现」。
  只断言出现不断言消失是抓不到漏迁移的：漏了的组件照样渲染中文。
- 切换器点一下要就地改语言，不能靠刷新。
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get('FD_URL', 'http://localhost:4180/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

# 每种语言：期望出现的词 / 期望绝不出现的词（后者是漏迁移的探针）
EXPECT = {
    'zh-CN': {
        'lang': 'zh-CN',
        'title_has': '待办工作台',
        'present': ['概览', '待办', '番茄钟', '日程'],
        'absent': ['Overview', 'Focus timer', 'Schedule'],
    },
    'en': {
        'lang': 'en',
        'title_has': 'Focus workspace',
        'present': ['Overview', 'Tasks', 'Schedule'],
        'absent': ['概览', '番茄钟', '日程'],
    },
}

VIEWS = ['overview', 'tasks', 'timer', 'schedule']


def seed(locale):
    """只种 UI store：语言 + 关掉声音/弹层/通知，避免验收时弹东西挡文案。"""
    payload = {
        'focusdeck-ui-storage': {
            'state': {
                'locale': locale,
                'viewMode': 'overview',
                'showWeekend': True,
                'dayStartHour': 7,
                'dayEndHour': 24,
                'soundEnabled': False,
                'overlayEnabled': False,
                'notifyEnabled': False,
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


def visible_text(page):
    return page.evaluate('() => document.body.innerText')


def check_locale(page, locale, failures):
    exp = EXPECT[locale]
    page.add_init_script(seed(locale))
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_timeout(400)

    lang = page.evaluate('() => document.documentElement.lang')
    if lang != exp['lang']:
        failures.append(f'[{locale}] <html lang> = {lang!r}，期望 {exp["lang"]!r}')

    title = page.title()
    if exp['title_has'] not in title:
        failures.append(f'[{locale}] document.title = {title!r}，未含 {exp["title_has"]!r}')

    # 按 data-view 点，不按文案点：文案本身就是被测对象，拿它当选择器会自证。
    # 侧栏与顶栏各有一套同名按钮，取当前可见的那个。
    seen = ''
    vw = page.viewport_size['width']
    vh = page.viewport_size['height']
    for view in VIEWS:
        clicked = False
        for cand in page.locator(f'[data-view="{view}"]').all():
            # 侧栏抽屉是 transform 移出去的：is_visible() 仍为真，得看几何。
            box = cand.bounding_box() if cand.is_visible() else None
            if box and 0 <= box['x'] < vw and 0 <= box['y'] < vh:
                cand.click()
                page.wait_for_timeout(250)
                clicked = True
                break
        if not clicked:
            failures.append(f'[{locale}] 找不到落在视口内的导航按钮 data-view={view}')
        seen += '\n' + visible_text(page)
        page.screenshot(path=os.path.join(OUT, f'i18n-{locale}-{view}.png'), full_page=False)

    for word in exp['present']:
        if word not in seen:
            failures.append(f'[{locale}] 四个页面都没出现应有文案 {word!r}')
    for word in exp['absent']:
        if re.search(re.escape(word), seen):
            failures.append(f'[{locale}] 出现了不该有的另一语言文案 {word!r}（疑似漏迁移）')

    return seen


def check_live_switch(page, failures):
    """切换器点一下必须就地生效，且刷新后记得住。"""
    # 这里不能用 add_init_script：它每次导航都重跑，下面那次 reload 会被它
    # 重新种回中文，把「没持久化」的假失败做实。种一次，然后 reload 让 app 读它。
    page.goto(BASE, wait_until='networkidle')
    page.evaluate(seed('zh-CN'))
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(400)

    before = page.evaluate('() => document.documentElement.lang')
    btn = page.locator('.language-switch button', has_text='EN').first
    if btn.count() == 0:
        failures.append('[切换器] 顶栏找不到 .language-switch 里的 EN 按钮')
        return
    btn.click()
    page.wait_for_timeout(400)
    after = page.evaluate('() => document.documentElement.lang')
    text = visible_text(page)

    if before != 'zh-CN' or after != 'en':
        failures.append(f'[切换器] lang 未就地切换：{before!r} → {after!r}')
    if 'Overview' not in text:
        failures.append('[切换器] 点 EN 后页面仍未出现英文文案')
    page.screenshot(path=os.path.join(OUT, 'i18n-switch-after-en.png'))

    # 刷新后要记得住：locale 进了 partialize 才算真持久化
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(400)
    if page.evaluate('() => document.documentElement.lang') != 'en':
        failures.append('[切换器] 刷新后语言回退，locale 没被持久化')


def main():
    os.makedirs(OUT, exist_ok=True)
    failures = []
    with sync_playwright() as p:
        # 跟 harness.py 一致走系统 Chrome：本机 playwright 自带的 headless shell
        # 版本号与 pip 包对不上，装一套只为跑这一个脚本不值当。
        browser = p.chromium.launch(channel='chrome')
        try:
            for locale in EXPECT:
                ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
                check_locale(ctx.new_page(), locale, failures)
                ctx.close()
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            check_live_switch(ctx.new_page(), failures)
            ctx.close()
        finally:
            browser.close()

    if failures:
        print(f'FAIL {len(failures)} 条')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('PASS 中英双语 + 就地切换 + 刷新保持，全部通过')


if __name__ == '__main__':
    main()
