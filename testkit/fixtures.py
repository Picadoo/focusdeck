"""日程面板的测试夹具：一组刻意覆盖边界的确定性数据。

每个 scenario 是一份完整的 localStorage 种子。种子 + 冻结时钟 =
同一个 scenario 在任何机器、任何时刻跑出来的像素都一样，
截图能直接做前后对比，不用担心「今天恰好没有下午的事件」这类噪声。

时间基准取 2026-08-31（周一）10:20：
- 周一 → 周视图第一列就是当天，列序不随运行日漂移
- 10:20 → 当前时刻线落在有事件的区间里，能顺带验证它的位置
"""

FROZEN = (2026, 8, 31, 10, 20)  # 年, 月(1-12), 日, 时, 分
FROZEN_DAY = '2026-08-31'

# 周一到周日
WEEK = [f'2026-09-0{d}' if d < 10 else f'2026-09-{d}' for d in range(1, 7)]
WEEK = [FROZEN_DAY] + WEEK  # 08-31(一) 09-01(二) ... 09-06(日)

SEED_AT = 1_704_067_200_000

PROJECTS = [
    {'id': 'work', 'name': '工作', 'color': '#5FD4C7'},
    {'id': 'study', 'name': '学习', 'color': '#E8B05B'},
    {'id': 'life', 'name': '生活', 'color': '#69C58F'},
    {'id': 'side', 'name': '副业', 'color': '#9AA7F8'},
]


def _meta(item):
    return {**item, 'createdAt': SEED_AT, 'updatedAt': SEED_AT, 'deletedAt': None}


def ev(eid, title, day, start, dur, project='work', repeat='none', task=None):
    """start 用 'HH:MM'，dur 是分钟。dayIndex 0=周一，按 day 在 WEEK 里的下标算。"""
    hh, mm = start.split(':')
    item = {
        'id': eid,
        'title': title,
        'projectId': project,
        'date': day,
        'dayIndex': WEEK.index(day),
        'startMinutes': int(hh) * 60 + int(mm),
        'durationMinutes': dur,
        'type': 'task_block' if task else 'fixed',
        'repeat': repeat,
    }
    if task:
        item['taskId'] = task
    return _meta(item)


def task(tid, title, project='work', status='active'):
    return _meta({
        'id': tid, 'title': title, 'projectId': project, 'tagIds': [],
        'priority': 'p2', 'status': status, 'dueAt': None,
        'estimatePomodoros': 1, 'actualFocusSeconds': 0, 'sortKey': 1000,
    })


D0 = FROZEN_DAY      # 周一（今天）
D1 = WEEK[1]         # 周二

SCENARIOS = {
    # ---- 基线：一天里最常见的几种时长混排 ----
    'typical': {
        'label': '典型一天（15/30/60/90 混排）',
        'why': '日常主路径，任何改动都得先在这里看着对',
        'events': [
            ev('a1', '晨会', D0, '09:00', 30),
            ev('a2', '需求评审', D0, '10:00', 60, 'study'),
            ev('a3', '算法课', D0, '14:00', 90, 'study'),
            ev('a4', '健身', D0, '19:00', 60, 'life'),
            ev('a5', '周报', D1, '17:00', 45, 'work'),
        ],
    },

    # ---- 碎片：15 分钟档，此前从没有数据验证过 ----
    'fragments': {
        'label': '碎片时段（15 分钟档 + 背靠背）',
        'why': 'tiny 档一直没有实拍验证；背靠背能暴露卡片边贴边糊在一起的问题',
        'events': [
            ev('f1', '站会', D0, '09:00', 15),
            ev('f2', '看板整理', D0, '09:15', 15, 'study'),
            ev('f3', '回消息', D0, '09:30', 15, 'life'),
            ev('f4', '喝水走动', D0, '09:45', 15, 'side'),
            ev('f5', '半小时块', D0, '10:30', 30),
            ev('f6', '紧接着的半小时', D0, '11:00', 30, 'study'),
            ev('f7', '一刻钟收尾', D0, '11:30', 15, 'life'),
        ],
    },

    # ---- 重叠：分列逻辑在窄屏上的极限 ----
    'overlap': {
        'label': '重叠冲突（2 列 / 3 列 / 4 列）',
        'why': '手机日视图列宽本来就窄，四路重叠会把每张卡压到 80px 上下',
        'events': [
            ev('o1', '双人同步', D0, '09:00', 60),
            ev('o2', '并行的另一件', D0, '09:30', 60, 'study'),
            ev('o3', '三方评审 A', D0, '13:00', 90),
            ev('o4', '三方评审 B', D0, '13:30', 60, 'study'),
            ev('o5', '三方评审 C', D0, '14:00', 60, 'life'),
            ev('o6', '四路 A', D0, '16:00', 60),
            ev('o7', '四路 B', D0, '16:00', 60, 'study'),
            ev('o8', '四路 C', D0, '16:15', 45, 'life'),
            ev('o9', '四路 D', D0, '16:30', 60, 'side'),
        ],
    },

    # ---- 边界：0 点、末班、超长标题、跨窗口 ----
    'edges': {
        'label': '边界（00:00 / 23:45 / 超长标题 / 8 小时块）',
        'why': '收窗口径、裁剪、标题截断都在这里露馅',
        'events': [
            ev('e1', '零点部署', D0, '00:00', 30),
            ev('e2', '这是一个非常长的日程标题用来验证截断行为是否合理不该把时间挤掉', D0, '08:00', 30, 'study'),
            ev('e3', '全天集训', D0, '09:00', 480, 'life'),
            ev('e4', '末班车前的最后一件事', D0, '23:45', 15, 'side'),
        ],
    },

    # ---- 高密度：手机上最坏的情况 ----
    'dense_day': {
        'label': '高密度一天（14 件）',
        'why': '手机日视图滚动距离、点线刻度在密集排布下是否还读得出层级',
        'events': [
            ev(f'd{i}', t, D0, s, d, p)
            for i, (t, s, d, p) in enumerate([
                ('晨读', '07:00', 30, 'study'), ('通勤', '07:30', 30, 'life'),
                ('站会', '08:00', 15, 'work'), ('专注块一', '08:15', 45, 'work'),
                ('需求沟通', '09:00', 30, 'work'), ('专注块二', '09:30', 60, 'work'),
                ('午餐', '12:00', 60, 'life'), ('午休', '13:00', 30, 'life'),
                ('课程', '14:00', 90, 'study'), ('答疑', '15:30', 30, 'study'),
                ('复盘', '16:00', 30, 'work'), ('副业推进', '17:00', 60, 'side'),
                ('晚饭', '18:30', 45, 'life'), ('健身', '20:00', 60, 'life'),
            ])
        ],
    },

    # ---- 空态 ----
    'empty': {
        'label': '空日程',
        'why': '没有事件时回落到 8:00–22:00，检查空态不塌',
        'events': [],
    },

    # ---- 已完成 / 周期 ----
    'states': {
        'label': '状态位（已完成划线 / 每周重复）',
        'why': '完成态降透明度后同色系深字还读不读得清；重复图标在窄卡里会不会挤掉时间',
        'events': [
            ev('s1', '已完成的事', D0, '09:00', 60, 'work', task='tk1'),
            ev('s2', '每周重复', D0, '11:00', 30, 'study', repeat='weekly'),
            ev('s3', '重复且很窄', D0, '13:00', 15, 'life', repeat='weekly'),
            ev('s4', '带番茄入口', D0, '15:00', 60, 'side', task='tk2'),
        ],
        'tasks': [
            task('tk1', '已完成的事', status='completed'),
            task('tk2', '带番茄入口'),
        ],
    },
}


def build_seed(key):
    """拼出可直接塞进 localStorage 的两份 zustand 持久化载荷。"""
    sc = SCENARIOS[key]
    return {
        'focusdeck-app-storage': {
            'state': {
                'tasks': sc.get('tasks', []),
                'projects': [_meta(p) for p in PROJECTS],
                'tags': [],
                'scheduleEvents': sc['events'],
                'timerProfiles': [_meta({
                    'id': 'classic', 'name': '经典', 'focusSeconds': 1500,
                    'shortBreakSeconds': 300, 'longBreakSeconds': 900,
                    'sessionsBeforeLongBreak': 4,
                })],
            },
            'version': 6,
        },
        'focusdeck-ui-storage': {
            'state': {
                # 语言必须写死：不写就走 detectLocale()，截图跟着跑测试那台机器的
                # 浏览器语言变，中英两版像素不同，比对就没意义了。
                'locale': 'zh-CN',
                'showWeekend': True, 'dayStartHour': 7, 'dayEndHour': 24,
                'soundEnabled': False, 'overlayEnabled': False,
                'notifyEnabled': False, 'scheduleFullDay': False,
            },
            'version': 6,
        },
    }
