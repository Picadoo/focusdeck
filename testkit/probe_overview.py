"""定位概览页 .card 溢出：是哪张卡、被里面什么元素撑开、有没有真的被裁。"""
from fixtures import FROZEN, build_seed
from harness import BASE, Session, click_nav, run

PROBE = r"""
() => {
  return [...document.querySelectorAll('.card')].map((card, i) => {
    if (card.scrollWidth <= card.clientWidth + 1) return null;
    const cs = getComputedStyle(card);
    // 谁把它撑开的：找出右边界超出卡片内容区的直接后代
    const cr = card.getBoundingClientRect();
    const wide = [...card.querySelectorAll('*')]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(x => x.r.right > cr.right - parseFloat(cs.paddingRight) + 1)
      .slice(0, 3)
      .map(x => ({
        cls: (x.el.className || '').toString().split(' ').slice(0, 2).join('.'),
        w: Math.round(x.r.width),
        past: Math.round(x.r.right - cr.right),
        text: (x.el.textContent || '').trim().slice(0, 18),
      }));
    // 祖先里有没有人真的把它裁掉
    let clipper = null;
    for (let p = card.parentElement; p; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.overflowX === 'hidden' || pc.overflowX === 'auto' || pc.overflowX === 'scroll') {
        clipper = { cls: (p.className || '').toString().split(' ')[0], overflow: pc.overflowX };
        break;
      }
    }
    return {
      i,
      title: (card.querySelector('.card-title')?.textContent || '').trim().slice(0, 14),
      client: Math.round(card.clientWidth),
      scroll: Math.round(card.scrollWidth),
      overflowX: cs.overflowX,
      wide, clipper,
    };
  }).filter(Boolean);
}
"""


def body(browser):
    for name, w, h in [('phone-390', 390, 844), ('desktop-1440', 1440, 900)]:
        s = Session(browser, build_seed('typical'), FROZEN, w, h)
        s.page.goto(BASE, wait_until='networkidle')
        s.page.wait_for_timeout(300)
        click_nav(s.page, '概览')
        s.page.wait_for_timeout(600)
        print(f'--- {name} ---')
        for c in s.page.evaluate(PROBE):
            clip = f'祖先 .{c["clipper"]["cls"]} overflow-x:{c["clipper"]["overflow"]}' if c['clipper'] else '无祖先裁剪'
            print(f'  卡片#{c["i"]}「{c["title"]}」 可视{c["client"]} 内容{c["scroll"]} '
                  f'(自身 overflow-x:{c["overflowX"]}，{clip})')
            for x in c['wide']:
                print(f'      撑开者 .{x["cls"]} 宽{x["w"]} 超出{x["past"]}px  「{x["text"]}」')
        s.close()


if __name__ == '__main__':
    run(body)
