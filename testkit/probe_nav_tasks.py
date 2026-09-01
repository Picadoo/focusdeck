"""量取侧栏抽屉与待办行的真实几何，定位「卡片重叠 / 滑不动」和字号偏小。

只量不改：所有结论来自 getBoundingClientRect / getComputedStyle / scrollHeight，
截图只作旁证。判定口径：

- **重叠**：相邻两个子元素的矩形在纵向有 >1px 的交叠（正常应当依次排开）。
- **被压扁**：元素 scrollHeight 明显大于 clientHeight，说明内容装不下又没地方去。
- **够不着**：元素底边超出抽屉可视区，而抽屉本身又不可滚动 —— 这才是「滑不动」。
"""
import os
import sys

from fixtures import FROZEN, SEED_AT, build_seed
from harness import BASE, Session, click_nav, run

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

# typical 场景本来一个任务都没有，量不到行高；这里补一组带截止/番茄的真实行
TASK_TITLES = [
    ('t1', '把周报初稿写完', 'work', 'p1', 0),
    ('t2', '复习算法课第七章', 'study', 'p2', 26 * 60),
    ('t3', '预约体检', 'life', 'p3', 3 * 24 * 60),
    ('t4', '副业站点改版方案', 'side', 'p2', None),
    ('t5', '回邮件', 'work', 'p4', None),
    ('t6', '整理这一周的会议纪要并同步给相关同事', 'work', 'p2', None),
    ('t7', '买菜', 'life', 'p4', None),
    ('t8', '读完那本书的第三章', 'study', 'p3', None),
]


def seed_tasks():
    base = FROZEN
    from datetime import datetime, timedelta
    now = datetime(base[0], base[1], base[2], base[3], base[4])
    out = []
    for i, (tid, title, project, priority, due_min) in enumerate(TASK_TITLES):
        due = None if due_min is None else int((now + timedelta(minutes=due_min)).timestamp() * 1000)
        out.append({
            'id': tid, 'title': title, 'projectId': project, 'tagIds': [],
            'priority': priority, 'status': 'active', 'dueAt': due,
            'estimatePomodoros': 2, 'actualFocusSeconds': 300 * i, 'sortKey': 1000 + i * 100,
            'createdAt': SEED_AT, 'updatedAt': SEED_AT, 'deletedAt': None,
        })
    return out

VIEWPORTS = [
    ('phone-360', 360, 780),
    ('phone-390', 390, 844),
    ('phone-412', 412, 915),
    ('tablet-768', 768, 1024),
    ('desktop-1440', 1440, 900),
]

NAV_PROBE = r"""
() => {
  const nav = document.querySelector('.layout-nav');
  if (!nav) return { missing: true };
  const navRect = nav.getBoundingClientRect();
  const navCS = getComputedStyle(nav);

  const kids = [...nav.children].map(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      cls: el.className.split(' ')[0] || el.tagName.toLowerCase(),
      top: Math.round(r.top - navRect.top),
      bottom: Math.round(r.bottom - navRect.top),
      h: Math.round(r.height),
      needH: Math.round(el.scrollHeight),
      clientH: Math.round(el.clientHeight),
      flexShrink: cs.flexShrink,
      overflowY: cs.overflowY,
    };
  });

  let overlaps = [];
  for (let i = 0; i + 1 < kids.length; i++) {
    const gap = kids[i + 1].top - kids[i].bottom;
    if (gap < -1) overlaps.push({ a: kids[i].cls, b: kids[i + 1].cls, px: -gap });
  }

  // 手机端底部导航是 fixed 的，跟抽屉不在同一个流里，靠上面的相邻比对量不到。
  // 它压不压得住抽屉只由绘制顺序决定，所以直接问浏览器：抽屉下沿那一点上，
  // 最顶上的元素到底是谁。命中 .bottom-nav 就是真的被盖住了。
  const bar = document.querySelector('.bottom-nav');
  let barCover = null;
  if (bar) {
    const b = bar.getBoundingClientRect();
    const ox = Math.min(navRect.right, b.right) - Math.max(navRect.left, b.left);
    const oy = Math.min(navRect.bottom, b.bottom) - Math.max(navRect.top, b.top);
    if (b.width > 0 && ox > 1 && oy > 1) {
      const px = Math.max(navRect.left, b.left) + Math.min(ox, 40) / 2;
      const py = Math.max(navRect.top, b.top) + oy / 2;
      const hit = document.elementFromPoint(px, py);
      barCover = {
        overlapPx: Math.round(oy),
        onTop: !!(hit && hit.closest('.bottom-nav')),
        hit: hit ? (hit.className.split(' ')[0] || hit.tagName.toLowerCase()) : null,
      };
    }
  }

  const squashed = kids.filter(k => k.needH > k.clientH + 1)
                       .map(k => ({ cls: k.cls, needH: k.needH, gotH: k.clientH }));
  const below = kids.filter(k => k.bottom > Math.round(navRect.height) + 1)
                    .map(k => ({ cls: k.cls, overflowPx: k.bottom - Math.round(navRect.height) }));

  return {
    navH: Math.round(navRect.height),
    navScrollH: Math.round(nav.scrollHeight),
    navClientH: Math.round(nav.clientHeight),
    navOverflowY: navCS.overflowY,
    navCanScroll: nav.scrollHeight > nav.clientHeight + 1
                  && ['auto', 'scroll'].includes(navCS.overflowY),
    contentNeedH: kids.length ? Math.max(...kids.map(k => k.bottom)) : 0,
    kids, overlaps, squashed, below, barCover,
  };
}
"""

SCROLL_TAIL_PROBE = r"""
() => {
  const nav = document.querySelector('.layout-nav');
  if (!nav || !nav.lastElementChild) return { missing: true };
  nav.scrollTop = nav.scrollHeight;
  const navRect = nav.getBoundingClientRect();
  const last = nav.lastElementChild;
  const r = last.getBoundingClientRect();
  // padding-bottom 也算抽屉自己的地盘，所以拿 rect 底边比，而不是 clientHeight
  const slack = Math.round(navRect.bottom - r.bottom);
  const hit = document.elementFromPoint(
    Math.round(r.left + r.width / 2),
    Math.round(r.bottom - 6),
  );
  return {
    cls: last.className.split(' ')[0] || last.tagName.toLowerCase(),
    slackPx: slack,
    fullyVisible: slack >= 0 && r.top < navRect.bottom,
    covered: !!(hit && !last.contains(hit) && hit !== last),
    hit: hit ? (hit.className.split(' ')[0] || hit.tagName.toLowerCase()) : null,
  };
}
"""

TASK_PROBE = r"""
() => {
  const list = document.querySelector('.task-list');
  const rows = [...document.querySelectorAll('.task-row')];
  if (!list) return { missing: true };
  const fs = (el) => el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null;
  const sample = rows.slice(0, 3).map(row => {
    const meta = row.querySelector('.task-meta');
    const metaFont = fs(row.querySelector('.task-project')) ?? fs(row.querySelector('.task-due'));
    const metaH = meta ? Math.round(meta.getBoundingClientRect().height) : 0;
    // 折行时元信息的孩子会分布在多行，靠「所有孩子宽度之和 + 间隙」估算单行需要多宽，
    // 再跟容器实宽比，就知道还差几个像素才放得下
    let avail = 0, need = 0;
    if (meta) {
      const cs = getComputedStyle(meta);
      const gap = parseFloat(cs.columnGap) || 0;
      const kids = [...meta.children];
      avail = Math.round(meta.getBoundingClientRect().width);
      need = Math.round(kids.reduce((s, c) => s + c.getBoundingClientRect().width, 0)
                        + gap * Math.max(0, kids.length - 1));
    }
    return {
      h: Math.round(row.getBoundingClientRect().height),
      titleFont: fs(row.querySelector('.task-title')),
      metaFont,
      metaH, metaAvail: avail, metaNeed: need,
      // 单行高度约等于字号 × 1.5；明显超过就是折行了
      metaWrapped: metaFont ? metaH > metaFont * 2 : false,
    };
  });
  return {
    rowCount: rows.length,
    listH: Math.round(list.clientHeight),
    listScrollH: Math.round(list.scrollHeight),
    visibleRows: rows.length && rows[0].getBoundingClientRect().height
      ? Math.round(list.clientHeight / rows[0].getBoundingClientRect().height * 10) / 10
      : 0,
    sample,
  };
}
"""


def main():
    seed = build_seed('typical')
    seed['focusdeck-ui-storage']['state']['locale'] = 'zh-CN'
    seed['focusdeck-app-storage']['state']['tasks'] = seed_tasks()
    os.makedirs(OUT, exist_ok=True)
    bad = 0

    def body(browser):
        nonlocal bad
        for vp_name, w, h in VIEWPORTS:
            s = Session(browser, seed, FROZEN, w, h)
            try:
                s.page.goto(BASE, wait_until='networkidle')
                s.page.wait_for_timeout(400)

                print(f'\n########## {vp_name}  {w}x{h} ##########')

                click_nav(s.page, '待办')
                s.page.wait_for_timeout(350)
                tp = s.page.evaluate(TASK_PROBE)
                if tp.get('missing'):
                    print('  [跳过] 找不到 .task-list')
                else:
                    print(f"  待办：{tp['rowCount']} 行，列表可视 {tp['listH']}px / 需要 {tp['listScrollH']}px"
                          f"，一屏约 {tp['visibleRows']} 行")
                    for i, r in enumerate(tp['sample']):
                        wrap = (f"  <<元信息折行：单行需 {r['metaNeed']}px，只有 {r['metaAvail']}px"
                                f"（差 {r['metaNeed'] - r['metaAvail']}px）") if r['metaWrapped'] else ''
                        print(f"    行{i + 1}: 高 {r['h']}px  标题字号 {r['titleFont']}px  "
                              f"次要信息 {r['metaFont']}px{wrap}")
                    # pixel_baseline 用的 typical 种子一条任务都没有，待办页在那边是空态，
                    # 字号改动它一个像素都看不见。这张是待办行唯一的视觉旁证。
                    s.page.screenshot(path=os.path.join(OUT, f'tasks-{vp_name}.png'))

                s.page.click('.menu-btn')
                s.page.wait_for_timeout(500)
                np_ = s.page.evaluate(NAV_PROBE)
                if np_.get('missing'):
                    print('  [跳过] 找不到 .layout-nav')
                    continue

                print(f"  侧栏：可视高 {np_['navH']}px，内容排到 {np_['contentNeedH']}px"
                      f"，overflow-y={np_['navOverflowY']}，可滚动={np_['navCanScroll']}")
                for k in np_['kids']:
                    flag = ''
                    if k['needH'] > k['clientH'] + 1:
                        flag += f"  <<被压扁，需要 {k['needH']}px 只给了 {k['clientH']}px"
                    print(f"    {k['cls']:<26} top={k['top']:>5} bottom={k['bottom']:>5} "
                          f"h={k['h']:>4} shrink={k['flexShrink']}{flag}")

                bc = np_.get('barCover')
                if bc and bc['onTop']:
                    bad += 1
                    print(f"  [FAIL] 底部导航压住抽屉下沿 {bc['overlapPx']}px"
                          f"（该点最顶上的是 {bc['hit']}）")
                elif bc:
                    print(f"  [OK] 底部导航与抽屉有 {bc['overlapPx']}px 交叠，"
                          f"但抽屉在上（该点命中 {bc['hit']}）")

                if np_['overlaps']:
                    bad += 1
                    for o in np_['overlaps']:
                        print(f"  [FAIL] 重叠：{o['a']} 与 {o['b']} 压了 {o['px']}px")
                if np_['squashed']:
                    bad += 1
                    for q in np_['squashed']:
                        print(f"  [FAIL] 压扁：{q['cls']} 需要 {q['needH']}px，只拿到 {q['gotH']}px")
                if np_['below'] and not np_['navCanScroll']:
                    bad += 1
                    for b in np_['below']:
                        print(f"  [FAIL] 够不着：{b['cls']} 超出抽屉底部 {b['overflowPx']}px，且抽屉不可滚动")
                elif np_['below']:
                    deepest = max(b['overflowPx'] for b in np_['below'])
                    print(f"  [OK] 内容比抽屉高 {deepest}px，但抽屉可滚动，够得着")
                if not (np_['overlaps'] or np_['squashed'] or np_['below']):
                    print('  [OK] 无重叠、无压扁、无溢出')

                s.page.screenshot(path=os.path.join(OUT, f'nav-{vp_name}.png'))

                # 「够得着」不能只看可滚动标志：真滚到底，最后一张卡必须整张露出来，
                # 且那一点上最顶的元素得是它自己，不能是别的浮层
                tail = s.page.evaluate(SCROLL_TAIL_PROBE)
                if tail.get('missing'):
                    continue
                if tail['fullyVisible'] and not tail['covered']:
                    print(f"  [OK] 滚到底：末卡 {tail['cls']} 完整露出"
                          f"（底边距抽屉下沿 {tail['slackPx']}px）")
                else:
                    bad += 1
                    why = []
                    if not tail['fullyVisible']:
                        why.append(f"还差 {-tail['slackPx']}px 没露出来")
                    if tail['covered']:
                        why.append(f"被 {tail['hit']} 盖住")
                    print(f"  [FAIL] 滚到底：末卡 {tail['cls']} " + "，".join(why))
                s.page.screenshot(path=os.path.join(OUT, f'nav-{vp_name}-bottom.png'))
            finally:
                s.close()

    run(body)
    print(f"\n{'FAIL' if bad else 'PASS'}：{bad} 个视口存在问题")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
