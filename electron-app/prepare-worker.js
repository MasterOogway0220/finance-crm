// Stages the standalone worker into electron-app/build-resources/worker (code +
// node_modules + generated Prisma client incl. the Windows query engine) and writes
// worker-config.js with the embedded DATABASE_URL.
//
// It self-heals the worker install so whoever builds the installer does NOT have to
// remember to `npm install` in worker/ first: if deps or the Windows Prisma engine
// are missing, it installs/generates them here, then verifies before copying.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const src = path.join(root, 'worker')
const outRoot = path.join(__dirname, 'build-resources')
const outWorker = path.join(outRoot, 'worker')

const run = (cmd) => execSync(cmd, { cwd: src, stdio: 'inherit' })
const has = (p) => fs.existsSync(path.join(src, p))

// 1. Ensure worker dependencies are installed (postinstall runs prisma generate).
if (!has('node_modules/@open-wa') || !has('node_modules/@prisma/client')) {
  console.log('[prepare-worker] worker deps missing — running npm install...')
  run('npm install')
}

// 2. Ensure the Windows Prisma query engine was generated (binaryTargets includes it).
//    Regenerate if the Windows engine file isn't present.
function windowsEnginePresent() {
  const dir = path.join(src, 'node_modules', '.prisma', 'client')
  if (!fs.existsSync(dir)) return false
  return fs.readdirSync(dir).some((f) => /query.*windows|windows.*\.dll\.node|windows/i.test(f))
}
if (!windowsEnginePresent()) {
  console.log('[prepare-worker] Windows Prisma engine missing — running prisma generate...')
  run('npx prisma generate --schema=./prisma/schema.prisma')
}
if (!windowsEnginePresent()) {
  console.error('[prepare-worker] FAILED: Windows Prisma engine still not present after generate.')
  console.error('  Check worker/prisma/schema.prisma has: binaryTargets = ["native", "windows"]')
  process.exit(1)
}

// 3. Stage the worker (excluding its dev .env — never ship one).
fs.rmSync(outRoot, { recursive: true, force: true })
fs.mkdirSync(outWorker, { recursive: true })
fs.cpSync(src, outWorker, {
  recursive: true,
  filter: (p) => path.basename(p) !== '.env',
})

// 4. Embed the DATABASE_URL for the packaged app.
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) { console.error('[prepare-worker] DATABASE_URL must be set to embed into the build'); process.exit(1) }
fs.writeFileSync(
  path.join(outRoot, 'worker-config.js'),
  `module.exports = { DATABASE_URL: ${JSON.stringify(dbUrl)} }\n`,
)
console.log('[prepare-worker] staged worker + worker-config.js')
