"""针对审计里两条存疑结论做定点取证，不猜原因。

1. 手机周视图的事件卡为什么会互相压住：是分列算错了，还是卡片有个「压不下去的最小宽」？
2. 手机上垂直空间到底被谁吃掉：逐层量应用外壳、日程表头、网格。
"""
import os

from fixtures import FROZEN, build_seed
from harness import Session, run

WIDTH_PROBE = r"""
() => {
  const evs = [...document.querySelectorAll('.schedule-event')].map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      t: el.querySelector('.schedule-event-title')?.textContent.trim().slice(0, 8),
      // style 里声明的宽（calc 结果） vs 浏览器最终采用的宽
      wanted: Math.round(parseFloat(cs.width) * 10) / 10,
      used: Math.round(r.width * 10) / 10,
      padX: Math.round((parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * 10) / 10,
      borderX: Math.round((parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)) * 10) / 10,
      boxSizing: cs.boxSizing,
      left: Math.round(r.left * 10) / 10,
    };
  });
  const cell = document.querySelector('.schedule-day-cells');
  return { colWidth: cell ? Math.round(cell.getBoundingClientRect().width * 10) / 10 : 0, evs };
}
"""

BUDGET_PROBE = r"""
() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { h: Math.round(r.height), top: Math.round(r.top) };
  };
  const header = document.querySelector('.schedule-header');
  const parts = header ? [...header.children].map(c => ({
    cls: c.className.split(' ')[0],
    h: Math.round(c.getBoundingClientRect().height),
  })) : [];
  return {
    win: innerHeight,
    panel: pick('.schedule-panel'),
    schedHeader: pick('.schedule-header'),
    body: pick('.schedule-body'),
    dayHeader: pick('.schedule-day-header'),
    headerParts: parts,
    legend: pick('.schedule-legend'),
  };
}
"""


def body(browser):
    print('=== 1. 手机周视图：卡片宽度是被谁顶住的 ===')
    s = Session(browser, build_seed('overlap'), FROZEN, 390, 844)
    s.open_schedule('week')
    d = s.probe_raw = s.page.evaluate(WIDTH_PROBE)
    print(f'  单列可用宽 = {d["colWidth"]}px')
    for e in d['evs'][:6]:
        floor = e['padX'] + e['borderX']
        note = '  <== 被内边距+边框顶住，溢出own槽位' if e['used'] > e['wanted'] + 0.5 else ''
        print(f'    {e["t"]:<8} 声明宽={e["wanted"]:>6}  实际={e["used"]:>6}  '
              f'内边距+边框={floor:>4}（{e["boxSizing"]}）{note}')
    s.close()

    print('\n=== 2. 手机垂直预算：网格之外的高度花在哪 ===')
    for name, w, h in [('phone-360', 360, 780), ('phone-390', 390, 844), ('phone-412', 412, 915)]:
        s = Session(browser, build_seed('typical'), FROZEN, w, h)
        s.open_schedule('day')
        b = s.page.evaluate(BUDGET_PROBE)
        chrome = b['win'] - b['panel']['h']
        print(f'  [{name}] 屏高 {b["win"]}')
        print(f'      应用外壳（顶栏+底部导航） {chrome:>4}px')
        print(f'      日程表头               {b["schedHeader"]["h"]:>4}px  '
              f'（{" + ".join(f"{p['cls']} {p['h']}" for p in b["headerParts"])}）')
        print(f'      其中图例行             {b["legend"]["h"] if b["legend"] else 0:>4}px')
        print(f'      列头（星期+日期）       {b["dayHeader"]["h"]:>4}px  ← 在网格内部，随内容滚吗？看 sticky')
        print(f'      时间网格可视           {b["body"]["h"]:>4}px  = 屏高的 {b["body"]["h"] * 100 // b["win"]}%')
        s.close()


def header_budget(browser):
    """表头控件行最挤的状态：最窄手机 + 翻到别的日期（多出「今天」按钮）。
    放大触控目标能加到多少，由这里的余量说了算。"""
    print('\n=== 3. 表头控件行余量（决定触控目标能放多大） ===')
    for name, w, h in [('phone-360', 360, 780), ('phone-390', 390, 844)]:
        for mode, adv, tag in [('day', 0, '今天'), ('day', 1, '翻一天·多出「今天」按钮'),
                               ('week', 1, '周视图·翻一周')]:
            s = Session(browser, build_seed('typical'), FROZEN, w, h)
            s.open_schedule(mode, advance=adv)
            info = s.probe()
            a = info['actionsRow']
            slack = a['avail'] - a['used']
            flag = '  <== 已经溢出' if slack < 0 else ''
            print(f'  [{name} {mode} {tag}] 可用 {a["avail"]} 已用 {a["used"]} '
                  f'余量 {slack:+}px{flag}')
            print('        ' + '  '.join(f'{i["cls"]}={i["w"]}' for i in a['items']))
            s.close()


if __name__ == '__main__':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    run(lambda b: (body(b), header_budget(b)))
