/**
 * 统计还没进字典的中文界面文案。
 * 只看字符串字面量与 JSX 文本，跳过注释、i18n 目录和测试。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SRC = join(ROOT, 'src')
const HAN = /[\u4e00-\u9fff]/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'i18n') continue
      walk(p, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

/** 粗剥注释：够用即可，只为了别把注释里的中文算成待翻译文案。 */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const rows = []
let grand = 0
for (const file of walk(SRC)) {
  const code = stripComments(readFileSync(file, 'utf8'))
  const hits = new Set()
  for (const m of code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? ''
    if (HAN.test(s)) hits.add(s.trim())
  }
  for (const m of code.matchAll(/>([^<>{}\n]*[\u4e00-\u9fff][^<>{}]*)</g)) {
    const s = m[1].trim()
    if (s) hits.add(s)
  }
  if (hits.size) {
    rows.push({ file: relative(ROOT, file).replace(/\\/g, '/'), count: hits.size })
    grand += hits.size
  }
}

rows.sort((a, b) => b.count - a.count)
for (const r of rows) console.log(String(r.count).padStart(4), r.file)
console.log('----')
console.log(`${grand} 处待翻译文案，分布在 ${rows.length} 个文件`)
