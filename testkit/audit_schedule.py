"""日程面板全量审计：所有夹具 × 手机三档 + 桌面，量数字并给出分级断言。

用法：
    python testkit/audit_schedule.py              # 全量
    python testkit/audit_schedule.py fragments    # 只跑指定夹具
环境变量：FD_URL（默认 http://localhost:4180/）、FD_OUT（截图目录）、FD_TAG（截图前缀）
"""
import os
import sys

from fixtures import FROZEN, SCENARIOS, build_seed
from harness import PHONE_KEYS, VIEWPORTS, Report, Session, run

TAG = os.environ.get('FD_TAG', 'audit')
NOW_MINUTES = FROZEN[3] * 60 + FROZEN[4]

# 手机三档跑日视图（真机默认就是它），另加手机周视图——用户能手动切过去，
# 390/7 列一列只剩 49px。再各加一档「翻到别的日期」：那时表头会多出「今天」按钮，
# 是控件行最挤的状态，只测默认态会漏掉主操作被裁掉这种问题。
PLAN = ([(k, 'day', 0) for k in ('phone-360', 'phone-390', 'phone-412')]
        + [('phone-360', 'day', 1), ('phone-390', 'week', 1),
           ('phone-360', 'week', 1),
           ('desktop-1440', 'day', 0), ('desktop-1440', 'week', 0)])
VP = {name: (w, h) for name, w, h in VIEWPORTS}

# 触控目标下限：Material 建议 48，这里先用 32 作为「还能忍」的线
TOUCH_MIN = 32


def check(rep, scope, info, is_phone):
    if info.get('missing'):
        rep.fail(scope, '页面里没找到日程网格')
        return

    for key, label in (('docOverflowX', '页面'), ('gridOverflowX', '网格'), ('headerOverflowX', '表头')):
        if info[key] > 0:
            rep.fail(scope, f'{label}横向溢出 {info[key]}px')

    if info['collisions']:
        rep.fail(scope, f'{info["collisions"]} 对事件卡在像素上互相压住，分列没算对')

    a = info.get('actionsRow')
    if a and a['used'] > a['avail'] + 1:
        parts = ' '.join('{}:{}'.format(i['cls'], i['w']) for i in a['items'])
        rep.fail(scope, f'表头控件行溢出 {a["used"] - a["avail"]}px 被裁掉'
                        f'（可用 {a["avail"]}，控件 {parts}）')

    for s in info.get('shadowed', []):
        rep.fail(scope, f'媒体查询 {s["cond"]} 里的 {s["sel"]} {s["prop"]}:{s["want"]} '
                        f'被内联样式盖成 {s["got"]}——这条响应式规则实际没生效')

    # 当前时刻线：用真实表头高反推，验证 JS 里的 HEADER_HEIGHT 常量和渲染是否一致
    if info['nowLine'] is not None and info['startHour'] is not None:
        want = round(info['headerReal'] + (NOW_MINUTES - info['startHour'] * 60) / 60 * info['hourHeight'])
        off = abs(want - info['nowLine'])
        if off > 2:
            rep.fail(scope, f'当前时刻线偏了 {off}px（应在 {want}，实际 {info["nowLine"]}）')

    for e in info['events']:
        who = f'「{e["title"][:10]}」{e["h"]}px'
        if e['copyCut'] > 0:
            rep.fail(scope, f'{who} 文字被卡片切掉 {e["copyCut"]}px（档位 {e["tier"]}）')
        if not e['hasTime'] and e['h'] >= 22:
            rep.fail(scope, f'{who} 高度够却没渲染时间标签')
        # 不变量：窄到放不下一个字时标题必须让位，否则会逐字竖排成乱码
        if e['w'] < 26 and e['titleShown']:
            rep.fail(scope, f'{who} 宽只有 {e["w"]}px 却还在渲染标题，会竖排成乱码')
        if e['w'] < 4:
            rep.fail(scope, f'{who} 宽只有 {e["w"]}px，等于看不见')
        if e['titleClipped'] and e['w'] >= 26:
            rep.warn(scope, f'{who} 标题被截断（档位 {e["tier"]}，宽 {e["w"]}，字号 {e["titleFont"]}）')

    if is_phone and info['hits']:
        small = sorted({(b['w'], b['h'], b['label']) for b in info['hits'] if min(b['w'], b['h']) < TOUCH_MIN})
        if small:
            desc = '、'.join(f'{l or "?"} {w}×{h}' for w, h, l in small[:4])
            rep.warn(scope, f'表头有 {len(small)} 个触控目标小于 {TOUCH_MIN}px：{desc}')


def summarize(scope, info):
    if info.get('missing'):
        return
    half = round(info['hourHeight'] / 2)
    over = max(0, info['bodyScrollH'] - info['bodyH'])
    tiers = {}
    for e in info['events']:
        tiers[e['tier']] = tiers.get(e['tier'], 0) + 1
    tier_s = ' '.join(f'{k}×{v}' for k, v in sorted(tiers.items())) or '无事件'
    b = info['budget']
    # 真正有用的不是网格容器高，而是「一屏能看见几个小时」——列头是不显示事件的
    visible_h = (b['grid'] - info['headerReal']) / info['hourHeight']
    print(f'  {scope:<36} 行高={info["hourHeight"]:>3} 半小时={half:>3}px '
          f'一屏={visible_h:>4.1f}h（列头{info["headerReal"]:>2}px）'
          f' 需滚={over:>4}px  {tier_s}')


def main():
    want = sys.argv[1:] or list(SCENARIOS)
    rep = Report()

    def body(browser):
        for key in want:
            sc = SCENARIOS[key]
            print(f'\n--- {key}: {sc["label"]} ---')
            seed = build_seed(key)
            for vp_name, mode, adv in PLAN:
                w, h = VP[vp_name]
                s = Session(browser, seed, FROZEN, w, h)
                scope = f'{key}/{vp_name}/{mode}' + ('+翻页' if adv else '')
                try:
                    if not s.open_schedule(mode, advance=adv):
                        rep.fail(scope, '进不去日程页')
                        continue
                    info = s.probe()
                    check(rep, scope, info, vp_name in PHONE_KEYS)
                    summarize(scope, info)
                    s.shot(f'{TAG}_{key}_{vp_name}_{mode}{adv or ""}')
                    if s.errors:
                        rep.fail(scope, f'控制台报错：{s.errors[0][:120]}')
                finally:
                    s.close()

    run(body)
    rep.dump()
    c = rep.counts()
    print(f'\n合计 FAIL={c["FAIL"]}  WARN={c["WARN"]}')
    return 1 if c['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
