"""四个页面 × 五档视口的通用回归：横向溢出、控制台报错、控件被裁。

日程之外的页面没有专门的量化断言，但「不溢出、不报错、按钮没被切掉」
这三条是所有页面都该守住的底线，改样式之后先跑它确认没有牵连。
"""
import sys

from fixtures import FROZEN, build_seed
from harness import BASE, VIEWPORTS, Report, Session, click_nav, run

PAGES = ['待办', '日程', '番茄', '概览']

PAGE_PROBE = r"""
() => {
  const de = document.scrollingElement;

  // 有一类溢出是故意的：绝对定位的装饰色块会伸出卡片外，靠容器 overflow:hidden 裁成弧形。
  // 它们 aria-hidden / pointer-events:none，不承载信息，裁掉正是设计意图。
  const isDecor = (el) => {
    const cs = getComputedStyle(el);
    return (cs.position === 'absolute' || cs.position === 'fixed')
        && (el.getAttribute('aria-hidden') === 'true' || cs.pointerEvents === 'none');
  };

  const clipped = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'hidden' && cs.overflowX !== 'visible') continue;
    const r = el.getBoundingClientRect();
    const edge = r.right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0);
    const out = [...el.querySelectorAll('*')].filter(c => c.getBoundingClientRect().right > edge + 1);
    if (out.length > 0 && out.every(isDecor)) continue;   // 纯装饰越界，放过
    clipped.push({
      cls: (el.className || '').toString().split(' ')[0] || el.tagName.toLowerCase(),
      over: Math.round(el.scrollWidth - el.clientWidth),
      text: (el.textContent || '').trim().slice(0, 20),
    });
    if (clipped.length >= 5) break;
  }
  return { docOverflowX: Math.max(0, de.scrollWidth - de.clientWidth), clipped };
}
"""


def main():
    rep = Report()

    def body(browser):
        for vp_name, w, h in VIEWPORTS:
            seed = build_seed('typical')
            s = Session(browser, seed, FROZEN, w, h)
            try:
                s.page.goto(BASE, wait_until='networkidle')
                s.page.wait_for_timeout(300)
                for page_name in PAGES:
                    scope = f'{page_name}/{vp_name}'
                    if not click_nav(s.page, page_name):
                        rep.fail(scope, '导航按钮点不到')
                        continue
                    s.page.wait_for_timeout(350)
                    info = s.page.evaluate(PAGE_PROBE)
                    if info['docOverflowX'] > 0:
                        rep.fail(scope, f'页面横向溢出 {info["docOverflowX"]}px')
                    for c in info['clipped']:
                        rep.fail(scope, f'.{c["cls"]} 内容超出容器 {c["over"]}px 会被裁掉'
                                        f'{"（" + c["text"] + "）" if c["text"] else ""}')
                    print(f'  {scope:<22} 溢出={info["docOverflowX"]}  被裁元素={len(info["clipped"])}')
                if s.errors:
                    rep.fail(f'*/{vp_name}', f'控制台报错：{s.errors[0][:140]}')
            finally:
                s.close()

    run(body)
    rep.dump()
    c = rep.counts()
    print(f'\n合计 FAIL={c["FAIL"]}  WARN={c["WARN"]}')
    return 1 if c['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
