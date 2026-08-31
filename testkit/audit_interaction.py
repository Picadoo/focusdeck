"""落点精度回归：在网格上点一个已知时刻，看弹出的草稿是不是这个时刻。

这条专门盯 `pointToSlot` 的换算原点。列头高度既喂给 CSS 变量、又是
屏幕坐标换算时刻的原点，日视图把它改成 0 之后，一旦两边不同步，
表现是「点 10:00 建出来 09:00 的事件」——纯看截图完全看不出来。

鼠标（拖拽建）和触屏（轻点建）走的是组件里两条不同的分支，各测一遍。
"""
import sys

from fixtures import FROZEN, build_seed
from harness import Report, Session, run

GEOM = r"""
() => {
  const grid = document.querySelector('.schedule-grid');
  const cs = getComputedStyle(grid);
  const r = grid.getBoundingClientRect();
  const first = document.querySelector('.schedule-time-cell span');
  const timeCol = document.querySelector('.schedule-time-column');
  return {
    left: r.left, top: r.top,
    header: parseFloat(cs.getPropertyValue('--header-height')),
    hour: parseFloat(cs.getPropertyValue('--hour-height')),
    startHour: parseInt(first.textContent, 10),
    timeW: timeCol.getBoundingClientRect().width,
    colW: document.querySelector('.schedule-day-cells').getBoundingClientRect().width,
  };
}
"""

# 挑不是整点、且在 typical 夹具里落在空白处的时刻：
# 整点即使原点算错也可能碰巧对上；压在事件上则会点开那张卡而不是建新事件。
TARGETS = [(9, 45), (12, 30), (16, 45)]

HIT = """(p) => {
  const el = document.elementFromPoint(p.x, p.y);
  return el ? (el.closest('.schedule-event') ? 'event' : 'grid') : 'none';
}"""


def enable_edit(page):
    btn = page.locator("button[title*='进入编辑']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(250)
        return True
    return False


def probe_one(rep, s, scope, touch):
    g = s.page.evaluate(GEOM)
    if not enable_edit(s.page):
        rep.fail(scope, '找不到编辑模式开关')
        return
    for hh, mm in TARGETS:
        minutes = hh * 60 + mm
        if not (g['startHour'] * 60 <= minutes < g['startHour'] * 60 + 60 * 12):
            continue
        y = g['top'] + g['header'] + (minutes - g['startHour'] * 60) / 60 * g['hour']
        x = g['left'] + g['timeW'] + g['colW'] * 0.5
        # 目标点可能在可视区外，先滚进来再按滚动量修正
        s.page.evaluate('(dy) => { document.querySelector(".schedule-body").scrollTop = Math.max(0, dy) }',
                        y - g['top'] - 200)
        s.page.wait_for_timeout(200)
        g2 = s.page.evaluate(GEOM)
        y2 = g2['top'] + g2['header'] + (minutes - g2['startHour'] * 60) / 60 * g2['hour']
        # 压在事件卡上就点不出新草稿——那是夹具选点的问题，不该伪装成落点偏移
        where = s.page.evaluate(HIT, {'x': x, 'y': y2})
        if where != 'grid':
            rep.warn(scope, f'{hh:02d}:{mm:02d} 落点压在{where}上，换个时刻再测')
            continue
        if touch:
            s.page.touchscreen.tap(x, y2)
        else:
            s.page.mouse.click(x, y2)
        s.page.wait_for_timeout(400)
        box = s.page.locator("input[aria-label='开始时间']")
        if not box.count():
            rep.fail(scope, f'点 {hh:02d}:{mm:02d} 没弹出草稿弹窗')
            continue
        got = box.input_value()
        want = f'{hh:02d}:{mm:02d}'
        if got != want:
            rep.fail(scope, f'点 {want} 建出来的是 {got}——落点换算偏了')
        else:
            print(f'  {scope:<30} 点 {want} -> {got}  ok')
        s.page.get_by_role('button', name='取消').first.click()
        s.page.wait_for_timeout(250)


def main():
    rep = Report()

    def body(browser):
        cases = [
            ('phone-390/day', 390, 844, 'day', True),
            ('phone-390/week', 390, 844, 'week', True),
            ('desktop/day', 1440, 900, 'day', False),
            ('desktop/week', 1440, 900, 'week', False),
        ]
        for scope, w, h, mode, touch in cases:
            s = Session(browser, build_seed('typical'), FROZEN, w, h)
            try:
                if not s.open_schedule(mode):
                    rep.fail(scope, '进不去日程页')
                    continue
                probe_one(rep, s, scope, touch)
            finally:
                s.close()

    run(body)
    rep.dump()
    c = rep.counts()
    print(f'\n合计 FAIL={c["FAIL"]}')
    return 1 if c['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
