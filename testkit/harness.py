"""日程测试环境的内核：冻结时钟、注入种子、量取真实几何、收集断言。

三条设计原则：
1. **确定性优先**——时钟冻结 + 数据种子，两次运行的像素必须完全一致，
   否则截图对比没有意义。
2. **量数字，不靠眼睛**——所有结论来自 getBoundingClientRect / getComputedStyle，
   截图只是给人看的旁证。
3. **断言分级**——fail 是明确的坏（溢出、错位、文字被吞），
   warn 是需要人判断的（触控目标偏小、标题截断），info 只是记录。
"""
import json
import os
import re

from playwright.sync_api import sync_playwright

BASE = os.environ.get('FD_URL', 'http://localhost:4180/')
OUT = os.environ.get('FD_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'))

# 手机优先：前四档都是真机常见的逻辑像素宽
VIEWPORTS = [
    ('phone-360', 360, 780),   # 小屏安卓 / 荣耀「大字体」下的等效宽度
    ('phone-390', 390, 844),   # 主流 6.1"
    ('phone-412', 412, 915),   # 荣耀 / 华为常见档
    ('tablet-768', 768, 1024),
    ('desktop-1440', 1440, 900),
]

PHONE_KEYS = {'phone-360', 'phone-390', 'phone-412'}


def freeze_clock_js(frozen):
    y, mo, d, h, mi = frozen
    return f"""
    (() => {{
      const R = Date;
      const FIXED = new R({y}, {mo - 1}, {d}, {h}, {mi}, 0, 0).getTime();
      class F extends R {{
        constructor(...a) {{ if (a.length === 0) super(FIXED); else super(...a); }}
        static now() {{ return FIXED; }}
      }}
      Object.defineProperty(window, 'Date', {{ value: F, writable: true, configurable: true }});
    }})();
    """


def seed_js(seed):
    return f"""
    (() => {{
      const s = {json.dumps(seed, ensure_ascii=False)};
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    }})();
    """


# 量取脚本：一次拿全所有需要的数字，避免多次 evaluate 之间页面状态漂移
PROBE = r"""
() => {
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const grid = q('.schedule-grid');
  const body = q('.schedule-body');
  if (!grid || !body) return { missing: true };

  const cs = getComputedStyle(grid);
  const num = (v) => parseFloat(v) || 0;
  const gridRect = grid.getBoundingClientRect();

  // 表头：CSS 变量声明值 vs 真实渲染高度。两者不一致就意味着
  // 所有以 HEADER_HEIGHT 为基准的定位（当前时刻线、点击建事件）都会偏。
  const headerVar = num(cs.getPropertyValue('--header-height'));
  const dayHeader = q('.schedule-day-header');
  const headerReal = dayHeader ? Math.round(dayHeader.getBoundingClientRect().height) : null;

  const hourHeight = num(cs.getPropertyValue('--hour-height'));

  // 时间轴第一格的小时数 = 窗口起点
  const firstLabel = q('.schedule-time-cell span');
  const startHour = firstLabel ? parseInt(firstLabel.textContent, 10) : null;

  const bar = q('.current-time-bar');
  const nowLine = bar ? Math.round(bar.getBoundingClientRect().top - gridRect.top) : null;

  const evs = qa('.schedule-event').map(el => {
    const r = el.getBoundingClientRect();
    const title = q('.schedule-event-title', el);
    const time = q('.schedule-event-time', el);
    const copy = q('.schedule-event-copy', el);
    const tier = ['compact', 'dense', 'tiny'].filter(c => el.classList.contains(c)).join('+') || 'full';
    return {
      title: title ? title.textContent.trim() : '',
      // display:none 的元素 textContent 照样有值，判「有没有显示」得看有无布局盒
      titleShown: title ? title.getClientRects().length > 0 : false,
      w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.left - gridRect.left), y: Math.round(r.top - gridRect.top),
      tier,
      hasTime: !!time,
      timeText: time ? time.textContent.trim() : '',
      // line-clamp 的截断量不体现在 scrollWidth 上（文字在盒内换了行再被裁），
      // 必须同时看纵向；只测横向会把「标题被吞掉一半」当成正常。
      titleClipped: title ? (title.scrollWidth > title.clientWidth + 1
                             || title.scrollHeight > title.clientHeight + 1) : false,
      copyCut: copy ? Math.max(0, Math.round(copy.scrollHeight - copy.clientHeight)) : 0,
      titleFont: title ? Math.round(parseFloat(getComputedStyle(title).fontSize) * 10) / 10 : 0,
    };
  });

  // 卡片之间不该有像素级重叠：分列算法算对了就应该各占各的
  const boxes = qa('.schedule-event').map(el => el.getBoundingClientRect());
  let collisions = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) collisions++;
    }

  // 表头控件行的宽度预算：手机上这一行 flex-nowrap，塞不下就直接溢出。
  // 放大触控目标之前必须先知道还剩多少余量。
  const actions = q('.schedule-header-actions');
  const actionsRow = actions ? {
    avail: Math.round(actions.clientWidth),
    used: Math.round(actions.scrollWidth),
    items: [...actions.children].map(c => ({
      cls: c.className.split(' ')[0].replace('schedule-', ''),
      w: Math.round(c.getBoundingClientRect().width),
    })),
  } : null;

  // 触控目标：手机上表头里所有可点元素
  const hits = qa('.schedule-header button').map(el => {
    const r = el.getBoundingClientRect();
    return { label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 10),
             w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(b => b.w > 0);

  // 「写了但不生效」的 CSS 变量：媒体查询里声明了，却被组件的内联 style 盖掉。
  // 这类失效不会报错也不会跳版，只会让响应式规则静默失灵，肉眼很难发现。
  const shadowed = [];
  try {
    for (const sheet of [...document.styleSheets]) {
      let rules;
      try { rules = [...sheet.cssRules]; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.type !== CSSRule.MEDIA_RULE) continue;
        if (!matchMedia(rule.conditionText).matches) continue;
        for (const inner of [...rule.cssRules]) {
          if (!inner.selectorText || !inner.style) continue;
          for (const prop of [...inner.style]) {
            if (!prop.startsWith('--')) continue;
            const want = inner.style.getPropertyValue(prop).trim();
            for (const el of qa(inner.selectorText)) {
              if (!el.style.getPropertyValue(prop)) continue;   // 没被内联覆盖就不算
              const got = getComputedStyle(el).getPropertyValue(prop).trim();
              if (want && got && want !== got)
                shadowed.push({ sel: inner.selectorText, prop, want, got, cond: rule.conditionText });
            }
          }
        }
      }
    }
  } catch (e) { /* 跨域样式表读不到就算了 */ }

  // 垂直预算：手机上网格能分到多少屏，是日程好不好用的第一决定因素
  const panel = q('.schedule-panel');
  const schedHeader = q('.schedule-header');
  const budget = {
    win: innerHeight,
    panel: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
    header: schedHeader ? Math.round(schedHeader.getBoundingClientRect().height) : 0,
  };
  budget.chrome = budget.win - budget.panel;          // 应用顶栏 + 底部导航
  budget.grid = body.clientHeight;                    // 真正留给时间网格的高度

  const de = document.scrollingElement;
  return {
    hourHeight, headerVar, headerReal, startHour, shadowed, budget,
    gridH: Math.round(gridRect.height),
    bodyH: Math.round(body.clientHeight),
    bodyScrollH: Math.round(body.scrollHeight),
    scrolls: body.scrollHeight > body.clientHeight + 1,
    nowLine,
    events: evs,
    collisions,
    hits,
    actionsRow,
    docOverflowX: Math.max(0, de.scrollWidth - de.clientWidth),
    gridOverflowX: Math.max(0, grid.scrollWidth - grid.clientWidth),
    headerOverflowX: (() => { const h = q('.schedule-header'); return h ? Math.max(0, h.scrollWidth - h.clientWidth) : 0 })(),
  };
}
"""


class Report:
    """把断言攒起来，最后一次性打印，跑的过程中不刷屏。"""

    def __init__(self):
        self.rows = []

    def add(self, level, scope, msg):
        self.rows.append((level, scope, msg))

    def fail(self, scope, msg): self.add('FAIL', scope, msg)
    def warn(self, scope, msg): self.add('WARN', scope, msg)
    def info(self, scope, msg): self.add('INFO', scope, msg)

    def counts(self):
        return {lv: sum(1 for r in self.rows if r[0] == lv) for lv in ('FAIL', 'WARN', 'INFO')}

    def dump(self, only=('FAIL', 'WARN')):
        """同一条问题往往在每个视口都复现一次，按内容合并，只列命中的场景。"""
        for lv in ('FAIL', 'WARN', 'INFO'):
            if lv not in only:
                continue
            rows = [r for r in self.rows if r[0] == lv]
            if not rows:
                continue
            grouped = {}
            for _, scope, msg in rows:
                grouped.setdefault(msg, []).append(scope)
            print(f'\n===== {lv}：{len(grouped)} 类 / {len(rows)} 次 =====')
            for msg, scopes in grouped.items():
                where = scopes[0] if len(scopes) == 1 else f'{len(scopes)} 处，如 {scopes[0]}'
                print(f'  · {msg}\n      ({where})')


def click_nav(page, label):
    """导航按钮在桌面顶栏和手机底栏各有一份，只点当前视口里可见的那个。"""
    items = page.get_by_role('button', name=label, exact=True)
    for i in range(items.count()):
        el = items.nth(i)
        box = el.bounding_box()
        if not box:
            continue
        vp = page.viewport_size
        if 0 <= box['x'] < vp['width'] and 0 <= box['y'] < vp['height']:
            el.click()
            return True
    return False


class Session:
    def __init__(self, browser, seed, frozen, width, height, scale=1):
        self.ctx = browser.new_context(
            viewport={'width': width, 'height': height},
            device_scale_factor=scale,
            has_touch=width < 700,
            is_mobile=width < 700,
        )
        self.ctx.add_init_script(freeze_clock_js(frozen))
        self.ctx.add_init_script(seed_js(seed))
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' else None)
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))

    def open_schedule(self, mode='day', advance=0):
        """advance>0 时向后翻若干天/周——此时表头会多出一个「今天」按钮，
        这是最挤的一种表头状态，控件尺寸必须按它来定，不能只按默认态量。"""
        self.page.goto(BASE, wait_until='networkidle')
        self.page.wait_for_timeout(350)
        if not click_nav(self.page, '日程'):
            return False
        self.page.wait_for_timeout(350)
        btn = self.page.get_by_role('button', name='日' if mode == 'day' else '周', exact=True)
        if btn.count():
            btn.first.click()
            self.page.wait_for_timeout(300)
        for _ in range(advance):
            nxt = self.page.get_by_role('button', name='下一天' if mode == 'day' else '下一周')
            if nxt.count():
                nxt.first.click()
                self.page.wait_for_timeout(200)
        # 滚回顶部，让截图起点一致
        self.page.evaluate("() => { const b = document.querySelector('.schedule-body'); if (b) b.scrollTop = 0 }")
        self.page.wait_for_timeout(250)
        return True

    def probe(self):
        return self.page.evaluate(PROBE)

    def shot(self, name, clip=None):
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, re.sub(r'[^\w.-]', '_', name) + '.png')
        self.page.screenshot(path=path, clip=clip)
        return path

    def close(self):
        self.ctx.close()


def run(fn):
    """统一的 playwright 生命周期，业务脚本只管写 fn(browser)。"""
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome')
        try:
            return fn(browser)
        finally:
            browser.close()
