/**
 * 打一个「解开就能跑」的服务端发布包，全部在本机完成 —— 目标机上一条 npm 都不用跑。
 *
 * 这条约束不是洁癖：目标服务器只有 1.6 GB 可用内存、没有 gcc，在上面 npm install
 * 既慢又可能因为要编译原生模块直接失败。所以这里把唯一的原生依赖 better-sqlite3
 * 的 Linux 预编译产物也在本机拉好一起打进去。
 *
 * 用法：
 *   node scripts/pack-server.mjs                       # 默认 linux-x64 + 当前 Node 大版本
 *   node scripts/pack-server.mjs --node 22.23.2        # 指定目标机的 Node 版本
 *   node scripts/pack-server.mjs --out dist-server.tar.gz
 *
 * 产出包内结构：
 *   dist/                服务端编译产物
 *   node_modules/        仅生产依赖，原生模块已换成目标平台的
 *   public/              前端 dist，服务端会自己托管（不需要 nginx）
 *   package.json
 *   focusdeck.service    systemd 单元模板
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const targetNode = argOf('node', process.versions.node)
const platform = argOf('platform', 'linux')
const arch = argOf('arch', 'x64')
const outFile = resolve(ROOT, argOf('out', 'focusdeck-svc.tar.gz'))
const stage = join(tmpdir(), 'fd-pack')

const run = (cmd, cmdArgs, cwd = ROOT) =>
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

console.log(`目标：${platform}-${arch}，Node ${targetNode}\n`)

console.log('[1/6] 编译服务端')
run('npm', ['--prefix', 'server', 'run', 'build'])

console.log('\n[2/6] 构建前端')
// 有意不传 --base：服务端从根路径发，带前缀会让所有资源 404。
// Pages 那条线才需要 --base=/focusdeck/，两者不能共用一份产物。
run('npx', ['vite', 'build'])

console.log('\n[3/6] 准备暂存目录')
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(join(ROOT, 'server/dist'), join(stage, 'dist'), { recursive: true })
cpSync(join(ROOT, 'dist'), join(stage, 'public'), { recursive: true })
cpSync(join(ROOT, 'server/package.json'), join(stage, 'package.json'))
cpSync(join(ROOT, 'server/package-lock.json'), join(stage, 'package-lock.json'))
cpSync(join(ROOT, 'deploy/focusdeck.service'), join(stage, 'focusdeck.service'))

console.log('\n[4/6] 只装生产依赖')
run('npm', ['ci', '--omit=dev'], stage)
rmSync(join(stage, 'package-lock.json'), { force: true })

console.log(`\n[5/6] 把原生模块换成 ${platform}-${arch} 预编译产物`)
const sqliteDir = join(stage, 'node_modules/better-sqlite3')
run('npx', ['prebuild-install', '--platform', platform, '--arch', arch,
  '--target', targetNode, '--runtime', 'node'], sqliteDir)

// 装完必须验一眼头四个字节。npm ci 刚装的是本机平台的版本，prebuild-install 万一
// 静默失败（网络、tag 不存在），留下的就还是本机那个——包看着好好的，
// 传上去启动才报 invalid ELF header，那时候排查成本高得多。
const nodeFile = join(sqliteDir, 'build/Release/better_sqlite3.node')
const magic = readFileSync(nodeFile).subarray(0, 4)
const isElf = magic[0] === 0x7f && magic.subarray(1, 4).toString() === 'ELF'
if (platform === 'linux' && !isElf) {
  console.error(`\n原生模块不是 ELF（头四字节 ${magic.toString('hex')}），prebuild-install 没换成功`)
  process.exit(1)
}
console.log(`  ${nodeFile.replace(stage, '')} 头四字节 ${magic.toString('hex')} -> ${isElf ? 'ELF ✓' : '非 ELF'}`)

console.log('\n[6/6] 打包')
rmSync(outFile, { force: true })
run('tar', ['-czf', outFile, '.'], stage)
if (!existsSync(outFile)) {
  console.error('打包失败')
  process.exit(1)
}
const mb = (readFileSync(outFile).length / 1024 / 1024).toFixed(2)
console.log(`\n完成：${outFile}  ${mb} MB`)
console.log('\n目标机上：')
console.log('  sudo tar -xzf focusdeck-svc.tar.gz -C /opt/focusdeck/svc')
console.log('  sudo chown -R focusdeck:focusdeck /opt/focusdeck/svc')
console.log('  sudo systemctl restart focusdeck')
