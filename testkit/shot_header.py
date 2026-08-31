"""专拍手机表头：默认态 / 翻页后多出「今天」/ 周视图，看溢出到底怎么表现。"""
import os

from fixtures import FROZEN, build_seed
from harness import OUT, Session, run

TAG = os.environ.get('FD_TAG', 'hdr')


def body(browser):
    for name, w, h in [('360', 360, 780), ('390', 390, 844)]:
        for mode, adv, tag in [('day', 0, 'today'), ('day', 1, 'away'), ('week', 1, 'weekaway')]:
            s = Session(browser, build_seed('typical'), FROZEN, w, h, scale=2)
            s.open_schedule(mode, advance=adv)
            box = s.page.locator('.schedule-header').bounding_box()
            s.page.screenshot(
                path=os.path.join(OUT, f'{TAG}_{name}_{mode}_{tag}.png'),
                clip={'x': 0, 'y': max(0, box['y'] - 8), 'width': w, 'height': box['height'] + 16},
            )
            s.close()
    print('done ->', OUT)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    run(body)
