// 通过 `node --import ./scripts/dev-guard.mjs ... vite.js` 注入 Vite dev server 进程内部。
// 装在进程内而非外部监控，是因为只有进程内才能拿到 heapUsed / external 的拆分——
// 2026-08-31 那次泄漏（17 小时涨到 28.5 GB）就是因为进程被提权、外部读不到这个拆分而无法定位根因。
import fs from 'node:fs';
import path from 'node:path';

const LIMIT_MB = Number(process.env.FD_DEV_MEM_LIMIT_MB ?? 4096);
const INTERVAL_S = Number(process.env.FD_DEV_MEM_INTERVAL_S ?? 30);
const LOG_PATH = path.resolve(process.cwd(), process.env.FD_DEV_MEM_LOG ?? 'dev-memory.log');

const mb = (n) => Math.round(n / 1024 / 1024);
const stamp = () => new Date().toISOString().slice(11, 19);

let warned = false;
let baseline = null;

const snapshot = () => {
  const m = process.memoryUsage();
  return {
    rss: mb(m.rss),
    heapUsed: mb(m.heapUsed),
    heapTotal: mb(m.heapTotal),
    external: mb(m.external),
    arrayBuffers: mb(m.arrayBuffers),
    // rss 里既不属于 V8 堆、也不计入 external 的那部分，即 rolldown / lightningcss 等
    // Rust 原生模块的分配。2026-08-31 那次 28.5 GB 泄漏全在这一列——本机 V8 堆上限只有
    // 4144 MB（Node 默认值），进程却涨到 28.5 GB 且从未 OOM，堆的嫌疑已被排除。
    native: mb(m.rss) - mb(m.heapTotal) - mb(m.external),
  };
};

const format = (s, extra = '') =>
  `${stamp()} rss=${s.rss}MB heap=${s.heapUsed}/${s.heapTotal}MB external=${s.external}MB native=${s.native}MB${extra}`;

const append = (line) => {
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {
    // 日志写不了不该拖垮 dev server
  }
};

append(`\n===== dev 启动 ${new Date().toISOString()} 上限 ${LIMIT_MB}MB =====`);

const timer = setInterval(() => {
  const s = snapshot();
  baseline ??= s;

  const minutes = INTERVAL_S / 60;
  const rate = ((s.rss - baseline.rss) / Math.max(minutes, 1 / 60)).toFixed(1);
  append(format(s, ` 自启动净增=${s.rss - baseline.rss}MB`));

  if (s.rss >= LIMIT_MB) {
    // 三列谁占大头，直接决定下一步查哪儿；2026-08-31 那次已证实是 native 列
    const culprit =
      s.heapTotal > s.rss * 0.5
        ? 'V8 堆 —— 查 Vite 插件、模块图、HMR 缓存'
        : s.external > s.rss * 0.5
          ? 'external —— 查 Buffer / ArrayBuffer 持有方'
          : 'native（rolldown / lightningcss 等 Rust 模块）—— 与 2026-08-31 那次同源，' +
            '优先验证「Vite 8.2.1 降到 7.x 绕开 rolldown」';
    const msg = [
      '',
      `[dev-guard] RSS ${s.rss}MB 已达上限 ${LIMIT_MB}MB，主动终止 dev server，避免拖垮整机。`,
      `[dev-guard] ${format(s)}`,
      `[dev-guard] 内存主要在：${culprit}`,
      `[dev-guard] 完整增长曲线：${LOG_PATH}`,
      `[dev-guard] 确需更高上限：FD_DEV_MEM_LIMIT_MB=8192 pnpm dev`,
      '',
    ].join('\n');
    console.error(msg);
    append(msg);
    process.exit(1);
  }

  if (!warned && s.rss >= LIMIT_MB * 0.5) {
    warned = true;
    console.warn(
      `\n[dev-guard] 注意：RSS 已到 ${s.rss}MB（上限 ${LIMIT_MB}MB），近期增速约 ${rate}MB/分钟。` +
        `\n[dev-guard] 正常 dev server 应在数百 MB 量级，建议重启一次并留意 ${LOG_PATH}。\n`
    );
  }
}, INTERVAL_S * 1000);

timer.unref();

process.on('exit', () => append(`${stamp()} dev 进程退出 ${JSON.stringify(snapshot())}`));
