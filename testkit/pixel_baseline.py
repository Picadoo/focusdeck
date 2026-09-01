"""改样式前后的逐像素对照：证明「重构没有改变任何一个像素」。

改 CSS 最难的不是改，是证明没改坏。肉眼看两张截图、或者只跑「不溢出不报错」
那类断言，都漏得掉一像素的偏移和一个色号的差别。这个脚本把「视觉零变化」变成
一个可以打印出来的数字。

能这么用的前提是 harness 已经做到确定性：时钟冻结在 FROZEN、数据来自固定种子、
语言写死 zh-CN。少任何一条，两次运行的像素本来就不一样，对照就没有意义。

跑法（先 `pnpm build` 再 `npx vite preview --port 4180`）：

    python testkit/pixel_baseline.py capture .baseline/before
    ...改 CSS，重新 build...
    python testkit/pixel_baseline.py capture .baseline/after
    python testkit/pixel_baseline.py compare .baseline/before .baseline/after

compare 逐张比：尺寸不同直接判失败；尺寸相同就数有多少个像素的 RGBA 不完全相等，
并给出最大单通道差值——1 个像素差 1 个色阶也会被报出来，不设容差。
真有预期内的视觉改动时，看 diff-*.png，差异处会被染成红色。
"""
import os
import sys

from PIL import Image, ImageChops

from fixtures import FROZEN, build_seed
from harness import BASE, VIEWPORTS, Session, click_nav, run

PAGES = ['待办', '日程', '番茄', '概览']


def capture(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    seed = build_seed('typical')
    # 语言写死：locale 跟着浏览器走的话，换个环境跑出来的就是另一套文案，对照直接失效
    seed['focusdeck-ui-storage']['state']['locale'] = 'zh-CN'

    shot_count = 0

    def body(browser):
        nonlocal shot_count
        for vp_name, w, h in VIEWPORTS:
            s = Session(browser, seed, FROZEN, w, h)
            try:
                s.page.goto(BASE, wait_until='networkidle')
                s.page.wait_for_timeout(400)
                for page_name in PAGES:
                    if not click_nav(s.page, page_name):
                        print(f'  [跳过] {page_name}/{vp_name} 导航点不到')
                        continue
                    s.page.wait_for_timeout(400)
                    path = os.path.join(out_dir, f'{page_name}_{vp_name}.png')
                    s.page.screenshot(path=path)
                    shot_count += 1
            finally:
                s.close()

    run(body)
    print(f'\n已截 {shot_count} 张 -> {out_dir}')
    return 0


def compare(dir_a, dir_b):
    names = sorted(f for f in os.listdir(dir_a) if f.endswith('.png'))
    if not names:
        print(f'FAIL {dir_a} 里一张图都没有')
        return 1

    bad = []
    for name in names:
        pa, pb = os.path.join(dir_a, name), os.path.join(dir_b, name)
        if not os.path.exists(pb):
            bad.append((name, '对照目录里缺这张'))
            continue
        a = Image.open(pa).convert('RGBA')
        b = Image.open(pb).convert('RGBA')
        if a.size != b.size:
            bad.append((name, f'尺寸不同 {a.size} vs {b.size}'))
            continue
        diff = ImageChops.difference(a, b)
        if diff.getbbox() is None:
            print(f'  [同] {name}')
            continue
        # getbbox 只说「有差异」，还要知道差多少、差在哪
        data = list(diff.getdata())
        pixels = sum(1 for px in data if px[:3] != (0, 0, 0))
        worst = max(max(px[:3]) for px in data)
        total = a.size[0] * a.size[1]
        out = os.path.join(dir_b, f'diff-{name}')
        red = Image.new('RGBA', a.size, (255, 0, 0, 255))
        mask = diff.convert('L').point(lambda v: 255 if v else 0)
        Image.composite(red, b, mask).save(out)
        bad.append((name, f'{pixels} / {total} 像素不同（{pixels / total:.4%}），最大色阶差 {worst}；见 {out}'))

    if bad:
        print(f'\nFAIL {len(bad)} / {len(names)} 张有差异')
        for name, why in bad:
            print(f'  - {name}: {why}')
        return 1
    print(f'\nPASS {len(names)} 张全部逐像素一致，零差异')
    return 0


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == 'capture':
        return capture(sys.argv[2])
    if len(sys.argv) >= 4 and sys.argv[1] == 'compare':
        return compare(sys.argv[2], sys.argv[3])
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main())
