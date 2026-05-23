/**
 * verify-attribution-helper.ts
 *
 * Stand-alone unit assertions for src/lib/brokerage-attribution.ts.
 * No DB access — pure logic check.
 */
import { brokerageOperatorFilter } from '../src/lib/brokerage-attribution'

const now = new Date()
const curMonth = now.getMonth() + 1
const curYear = now.getFullYear()
const pastMonth = curMonth === 1 ? 12 : curMonth - 1
const pastYear = curMonth === 1 ? curYear - 1 : curYear

function eq(label: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { console.error(`✗ ${label}\n   got:  ${a}\n   want: ${b}`); process.exit(1) }
  console.log(`✓ ${label}`)
}

// Single id, current month → current-owner join
eq('single id, current month',
  brokerageOperatorFilter('op1', curMonth, curYear),
  { client: { operatorId: 'op1' } })

// Single id, past month → snapshot column
eq('single id, past month',
  brokerageOperatorFilter('op1', pastMonth, pastYear),
  { operatorId: 'op1' })

// Array, current month → current-owner IN
eq('array, current month',
  brokerageOperatorFilter(['a', 'b'], curMonth, curYear),
  { client: { operatorId: { in: ['a', 'b'] } } })

// Array, past month → snapshot IN
eq('array, past month',
  brokerageOperatorFilter(['a', 'b'], pastMonth, pastYear),
  { operatorId: { in: ['a', 'b'] } })

// null scope → empty (no operator restriction)
eq('null scope', brokerageOperatorFilter(null, curMonth, curYear), {})
eq('undefined scope', brokerageOperatorFilter(undefined, pastMonth, pastYear), {})

console.log('\nAll helper assertions pass.')
