"""手机端整屏取证：日视图默认态 / 翻页态 / 周视图，2 倍像素。"""
import os

from fixtures import FROZEN, build_seed
from harness import OUT, Session, run

TAG = os.environ.get('FD_TAG', 'ph')
CASES = [
    ('typical', 'day', 0), ('typical', 'day', 1), ('typical', 'week', 0),
    ('fragments', 'day', 0), ('overlap', 'day', 0), ('overlap', 'week', 0),
    ('dense_day', 'day', 0),
]


def body(browser):
    for scenario, mode, adv in CASES:
        for name, w, h in [('360', 360, 780), ('390', 390, 844)]:
            s = Session(browser, build_seed(scenario), FROZEN, w, h, scale=2)
            s.open_schedule(mode, advance=adv)
            s.page.screenshot(path=os.path.join(
                OUT, f'{TAG}_{scenario}_{mode}{adv or ""}_{name}.png'))
            s.close()
    print('done ->', OUT)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    run(body)
