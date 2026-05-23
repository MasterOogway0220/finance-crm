/**
 * fix-task-notification-links.ts
 *
 * Rewrites broken `link` values on existing Notification rows so task-related
 * notifications redirect to the recipient's department tasks page instead of
 * the non-existent `/tasks/<id>` route or the admin-only `/tasks` page.
 *
 * Broken patterns handled:
 *   - `/tasks/<id>`  (no dynamic route exists → 404 for everyone)
 *   - `/tasks`       (only valid for admin users)
 *
 * Run with:
 *   Dry run (default, shows what would change):
 *     npx ts-node --project tsconfig.scripts.json scripts/fix-task-notification-links.ts
 *
 *   Apply the updates:
 *     npx ts-node --project tsconfig.scripts.json scripts/fix-task-notification-links.ts --apply
 */

import { PrismaClient, Department } from '@prisma/client'

const prisma = new PrismaClient()

function tasksLinkForDepartment(department: Department): string {
  switch (department) {
    case 'EQUITY':
      return '/equity/tasks'
    case 'MUTUAL_FUND':
      return '/mf/tasks'
    case 'BACK_OFFICE':
      return '/backoffice/tasks'
    case 'ADMIN':
      return '/tasks'
  }
}

function needsRewrite(link: string | null, department: Department): boolean {
  if (!link) return false
  if (link === '/tasks/assign') return false
  if (/^\/tasks\/[^/]+$/.test(link)) return true
  if (link === '/tasks' && department !== 'ADMIN') return true
  return false
}

async function main() {
  const apply = process.argv.includes('--apply')

  const candidates = await prisma.notification.findMany({
    where: {
      OR: [
        { link: { startsWith: '/tasks/' } },
        { link: '/tasks' },
      ],
    },
    select: {
      id: true,
      link: true,
      type: true,
      user: { select: { id: true, department: true } },
    },
  })

  const toFix = candidates
    .filter((n) => needsRewrite(n.link, n.user.department))
    .map((n) => ({
      id: n.id,
      type: n.type,
      department: n.user.department,
      oldLink: n.link!,
      newLink: tasksLinkForDepartment(n.user.department),
    }))

  const byPair = new Map<string, number>()
  for (const row of toFix) {
    const key = `${row.oldLink}  →  ${row.newLink}`
    byPair.set(key, (byPair.get(key) ?? 0) + 1)
  }

  console.log(`Scanned ${candidates.length} task-link notifications.`)
  console.log(`${toFix.length} need rewriting.`)
  if (byPair.size > 0) {
    console.log('\nBreakdown (old → new : count):')
    for (const [pair, count] of [...byPair.entries()].sort()) {
      console.log(`  ${pair}  —  ${count}`)
    }
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to commit these updates.')
    return
  }

  if (toFix.length === 0) {
    console.log('\nNothing to update.')
    return
  }

  const byNewLink = new Map<string, string[]>()
  for (const row of toFix) {
    const arr = byNewLink.get(row.newLink) ?? []
    arr.push(row.id)
    byNewLink.set(row.newLink, arr)
  }

  let updated = 0
  for (const [newLink, ids] of byNewLink) {
    const { count } = await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { link: newLink },
    })
    updated += count
    console.log(`  Updated ${count} row(s) → ${newLink}`)
  }

  console.log(`\nDone. Updated ${updated} notification(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
