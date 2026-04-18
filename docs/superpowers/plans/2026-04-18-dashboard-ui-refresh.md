# Dashboard UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually refresh the 5 role-based dashboard pages and their shared components to match the NexLink design language expressed in the user's brand palette (blue `#4e6cad` primary, red `#e31e24` accent, black `#0b0b0f` text). Zero functional change.

**Architecture:** All visual tokens and utility classes live in a new scoped CSS file (`dashboard-theme.css`) hung off a `.dash-scope` wrapper class applied only to the dashboard page containers. Shared components (`KpiCard`, `BrokerageChart`, `TaskPieChart`, `OperatorTable`, `EmployeeStatusTable`) read tokens via `var(--dash-*, <fallback>)` so they degrade to current styling when rendered outside `.dash-scope`. `globals.css`, APIs, auth, routing, and data layers are not touched.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui (Radix primitives), Lucide icons, Recharts. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-18-dashboard-ui-refresh-design.md`

**Testing note:** This project has no unit-test infrastructure. "Tests" for each task are (a) `npm run build` passes, (b) `npm run lint` passes, and (c) manual visual check at `http://localhost:3000/<dashboard-route>`. Each task ends with an explicit verification step before committing.

---

## File Structure

**New:**
- `src/app/(protected)/dashboard/dashboard-theme.css` — all `--dash-*` tokens, `.dash-scope` cascade, reusable classes (`.dash-card`, `.dash-pill`, `.dash-pill--*`, `.dash-section-title`, `.dash-breadcrumb`, `.dash-table`, `.dash-controls-row`).

**Modified (ordered by dependency):**
1. `src/components/dashboard/kpi-card.tsx` — rewritten body, same exported interface + one new optional prop.
2. `src/components/dashboard/brokerage-chart.tsx` — card shell via `.dash-card`, new palette, tooltip/axes restyle.
3. `src/components/dashboard/task-pie-chart.tsx` — card shell, semantic donut palette, center label unchanged shape.
4. `src/components/dashboard/operator-table.tsx` — drop slate-800 header, zebra rows, blue-50 totals row; adopt `.dash-table`.
5. `src/components/dashboard/employee-status-table.tsx` — card shell + header row + table style swaps.
6. `src/app/(protected)/dashboard/layout.tsx` — import `dashboard-theme.css` once (covers all 4 dashboards that sit under this layout).
7. `src/app/(protected)/dashboard/page.tsx` — add `dash-scope` wrapper, breadcrumb, section-title treatment, Client Wise Brokerage controls/table restyle.
8. `src/app/(protected)/equity/dashboard/page.tsx` — wrapper, breadcrumb, MF section heading treatment.
9. `src/app/(protected)/mf/dashboard/page.tsx` — wrapper, breadcrumb.
10. `src/app/(protected)/backoffice/dashboard/page.tsx` — wrapper, breadcrumb, inline pending-tasks table restyle, pill/badge class swaps.

**Unchanged:** `globals.css`, all `src/app/api/**`, `src/components/layout/*`, `src/components/ui/*`, `src/lib/*`, `src/stores/*`, `src/hooks/*`, all other `(protected)/*` pages, `package.json`.

**Assumption check:** `src/app/(protected)/dashboard/layout.tsx` is the layout file wrapping the four dashboard routes. Task 1 verifies this before proceeding; if the layout file lives elsewhere, the import moves to that file.

---

## Task 1: Create the scoped theme stylesheet

**Files:**
- Create: `src/app/(protected)/dashboard/dashboard-theme.css`
- Verify only: `src/app/(protected)/dashboard/layout.tsx`, `src/app/(protected)/layout.tsx`

- [ ] **Step 1.1: Verify which layout file wraps the dashboard routes**

Run:

```bash
ls src/app/\(protected\)/dashboard/
ls src/app/\(protected\)/
```

Expected: `src/app/(protected)/layout.tsx` exists (it is the layout seen in Read results — the app router applies `(protected)/layout.tsx` to every route under it, including `/dashboard`, `/equity/dashboard`, `/mf/dashboard`, `/backoffice/dashboard`). `src/app/(protected)/dashboard/layout.tsx` may or may not exist. We will import the CSS into `src/app/(protected)/layout.tsx` so it covers all 4 dashboard routes regardless of their parent folder. Importing CSS into a shared layout is cheap in Next.js — the CSS ships but has zero effect on non-dashboard pages because everything is scoped under `.dash-scope`.

- [ ] **Step 1.2: Create `src/app/(protected)/dashboard/dashboard-theme.css`**

Full file contents:

```css
/* ------------------------------------------------------------------ */
/* Dashboard-scoped theme tokens and reusable primitives.              */
/* All rules live under .dash-scope so non-dashboard pages are         */
/* unaffected. Components inside .dash-scope read tokens via var().    */
/* ------------------------------------------------------------------ */

.dash-scope {
  /* Brand palette (resolved from user-specified brand colors) */
  --dash-primary: #4e6cad;
  --dash-primary-50: #eef2fa;
  --dash-primary-600: #3e588f;
  --dash-accent: #e31e24;
  --dash-accent-50: #fdecec;
  --dash-ink: #0b0b0f;
  --dash-text: #1f232b;
  --dash-muted: #6b7280;
  --dash-border: #e7eaf0;
  --dash-surface: #ffffff;
  --dash-surface-alt: #fafbfe;
  --dash-success: #009966;
  --dash-success-50: #e6f5ee;
  --dash-danger: #e31e24;
  --dash-danger-50: #fdecec;
  --dash-warning: #f5a70d;
  --dash-warning-50: #fef4de;

  /* Chart palette (primary stack + semantic accents) */
  --dash-chart-1: #4e6cad;
  --dash-chart-2: #2f4680;
  --dash-chart-3: #8aa1cf;
  --dash-chart-4: #d7dfee;
  --dash-chart-5: #009966;
  --dash-chart-6: #e31e24;
  --dash-chart-grid: #eef0f5;

  background: var(--dash-surface-alt);
  color: var(--dash-text);
}

/* Headings inside .dash-scope use Inter (overriding the global
   Lexend rule from globals.css) with tighter tracking. */
.dash-scope h1,
.dash-scope h2,
.dash-scope h3,
.dash-scope h4,
.dash-scope h5,
.dash-scope h6 {
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  color: var(--dash-ink);
  letter-spacing: -0.01em;
}

.dash-scope h1 {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

/* Card primitive */
.dash-card {
  background: var(--dash-surface);
  border: 1px solid var(--dash-border);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(11, 11, 15, 0.04),
              0 4px 12px rgba(11, 11, 15, 0.04);
  padding: 20px;
}

.dash-card--flush {
  padding: 0;
}

.dash-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.dash-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dash-ink);
  margin: 0;
}

.dash-card__subtitle {
  font-size: 12px;
  color: var(--dash-muted);
  margin: 2px 0 0 0;
}

/* Pill primitive */
.dash-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  border-radius: 999px;
  white-space: nowrap;
}

.dash-pill--success {
  background: var(--dash-success-50);
  color: var(--dash-success);
  box-shadow: inset 0 0 0 1px rgba(0, 153, 102, 0.18);
}

.dash-pill--danger {
  background: var(--dash-danger-50);
  color: var(--dash-danger);
  box-shadow: inset 0 0 0 1px rgba(227, 30, 36, 0.18);
}

.dash-pill--warning {
  background: var(--dash-warning-50);
  color: var(--dash-warning);
  box-shadow: inset 0 0 0 1px rgba(245, 167, 13, 0.22);
}

.dash-pill--primary-soft {
  background: var(--dash-primary-50);
  color: var(--dash-primary);
  box-shadow: inset 0 0 0 1px rgba(78, 108, 173, 0.22);
}

.dash-pill--muted {
  background: #f1f3f7;
  color: var(--dash-muted);
}

/* Section-title primitive: h2 with 3x14px accent bar on the left */
.dash-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--dash-ink);
  margin: 0;
}

.dash-section-title::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 14px;
  background: var(--dash-primary);
  border-radius: 2px;
}

/* Breadcrumb strip */
.dash-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--dash-muted);
  margin-bottom: 12px;
}

.dash-breadcrumb a {
  color: var(--dash-muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dash-breadcrumb a:hover {
  color: var(--dash-primary);
}

.dash-breadcrumb__sep {
  color: var(--dash-border);
}

.dash-breadcrumb__current {
  color: var(--dash-ink);
  font-weight: 600;
}

/* Table primitive — applied to a wrapping div; <table> inherits */
.dash-table {
  width: 100%;
  font-size: 14px;
  color: var(--dash-text);
  border-collapse: collapse;
}

.dash-table thead th {
  background: #f7f8fb;
  color: var(--dash-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0.02em;
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dash-border);
  white-space: nowrap;
}

.dash-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--dash-border);
  color: var(--dash-text);
}

.dash-table tbody tr:last-child td {
  border-bottom: 0;
}

.dash-table tbody tr:hover {
  background: var(--dash-surface-alt);
}

.dash-table .dash-num {
  font-variant-numeric: tabular-nums;
  color: var(--dash-ink);
}

/* Totals row (for Client Wise Brokerage, Operator Table, etc.) */
.dash-table tfoot td {
  padding: 14px 16px;
  border-top: 2px solid var(--dash-border);
  font-weight: 700;
  color: var(--dash-ink);
  background: var(--dash-surface);
}

.dash-table tfoot .dash-total-amount {
  color: var(--dash-success);
  font-variant-numeric: tabular-nums;
}

/* Controls row (select dropdowns, switches above tables) */
.dash-controls-row [data-slot="select-trigger"],
.dash-controls-row button[role="combobox"] {
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--dash-border);
  background: var(--dash-surface-alt);
  color: var(--dash-ink);
}

/* Utility helpers for component-internal use */
.dash-link-arrow {
  color: var(--dash-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.dash-link-arrow:hover {
  color: var(--dash-primary-600);
}
```

- [ ] **Step 1.3: Import the stylesheet in the protected layout**

File: `src/app/(protected)/layout.tsx`

Read the current file and add exactly one new import line at the top (alongside existing imports):

```ts
import '@/app/(protected)/dashboard/dashboard-theme.css'
```

Do not change anything else in the file.

- [ ] **Step 1.4: Verify build**

Run:

```bash
npm run build
```

Expected: build succeeds. The new CSS file is bundled. No visible change yet on any page because nothing wears the `.dash-scope` class.

- [ ] **Step 1.5: Verify lint**

Run:

```bash
npm run lint
```

Expected: passes.

- [ ] **Step 1.6: Commit**

```bash
git add src/app/\(protected\)/dashboard/dashboard-theme.css src/app/\(protected\)/layout.tsx
git commit -m "feat(dashboard): add scoped theme stylesheet for UI refresh"
```

---

## Task 2: Rewrite KpiCard component

**Files:**
- Modify: `src/components/dashboard/kpi-card.tsx`

The exported interface keeps all existing props (`title`, `value`, `subtitle`, `icon`, `accent`, `trend`, `onClick`, `actionLabel`, `onAction`) plus one new optional `sparkData?: number[]`. `icon` remains in the props for compatibility but is no longer rendered (no regression on call sites; only the chip removal).

The visual output is fully controlled by `.dash-scope` tokens via CSS variables, with fallbacks to current-looking slate colors so rendering outside `.dash-scope` stays reasonable.

- [ ] **Step 2.1: Replace the entire contents of `src/components/dashboard/kpi-card.tsx` with:**

```tsx
'use client'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  accent?: 'blue' | 'indigo' | 'green' | 'emerald' | 'amber' | 'red'
  trend?: { value: string; positive: boolean }
  onClick?: () => void
  actionLabel?: string
  onAction?: () => void
  sparkData?: number[]
}

const ACCENT_TO_PILL: Record<NonNullable<KpiCardProps['accent']>, string> = {
  blue:    'dash-pill--primary-soft',
  indigo:  'dash-pill--primary-soft',
  green:   'dash-pill--success',
  emerald: 'dash-pill--success',
  amber:   'dash-pill--warning',
  red:     'dash-pill--danger',
}

const ACCENT_TO_STROKE: Record<NonNullable<KpiCardProps['accent']>, string> = {
  blue:    'var(--dash-primary, #4e6cad)',
  indigo:  'var(--dash-primary, #4e6cad)',
  green:   'var(--dash-success, #009966)',
  emerald: 'var(--dash-success, #009966)',
  amber:   'var(--dash-warning, #f5a70d)',
  red:     'var(--dash-accent, #e31e24)',
}

// High-signal KPIs get a 1px top accent border when accent is red.
// Controlled here via a title whitelist so every caller keeps working
// without needing a new prop.
const ATTENTION_RED_TITLES = new Set(['Overdue Tasks', 'Not Traded', 'Tasks Expired'])

export function KpiCard({
  title,
  value,
  subtitle,
  accent = 'blue',
  trend,
  actionLabel,
  onAction,
  sparkData,
}: KpiCardProps) {
  const pillClass = ACCENT_TO_PILL[accent]
  const strokeColor = ACCENT_TO_STROKE[accent]
  const isAttentionRed = accent === 'red' && ATTENTION_RED_TITLES.has(title)

  const sparkSeries =
    sparkData && sparkData.length > 0
      ? sparkData.map((v, i) => ({ i, v }))
      : null

  const gradientId = `kpi-spark-${title.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <div
      className={cn(
        'dash-card flex flex-col gap-3',
        isAttentionRed && 'dash-card--attention-red'
      )}
      style={
        isAttentionRed
          ? { borderTop: '1px solid var(--dash-accent, #e31e24)' }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[13px] font-semibold"
          style={{ color: 'var(--dash-muted, #64748b)' }}
        >
          {title}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <p
            className="text-[28px] font-bold leading-none tabular-nums truncate"
            style={{ color: 'var(--dash-ink, #0f172a)' }}
          >
            {value}
          </p>
          {trend && (
            <span className={cn('dash-pill', trend.positive ? 'dash-pill--success' : 'dash-pill--danger')}>
              <span>{trend.positive ? '▲' : '▼'}</span>
              {trend.value}
            </span>
          )}
        </div>

        {sparkSeries && (
          <div className="h-8 w-[72px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkSeries} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {(subtitle || (actionLabel && onAction)) && (
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: '1px solid var(--dash-border, #e2e8f0)' }}
        >
          {subtitle && (
            <p
              className="text-[12px] truncate"
              style={{ color: 'var(--dash-muted, #64748b)' }}
            >
              {subtitle}
            </p>
          )}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-[12px] font-semibold dash-link-arrow cursor-pointer"
              style={{ color: strokeColor }}
            >
              {actionLabel} →
            </button>
          ) : subtitle ? (
            <span
              aria-hidden
              className="dash-link-arrow text-[14px]"
              style={{ color: strokeColor }}
            >
              →
            </span>
          ) : null}
          {/* Also pill-badge unused lint silence */}
          <span className={cn('sr-only', pillClass)} />
        </div>
      )}
    </div>
  )
}
```

Notes on the code above:
- The `pillClass` variable is referenced but also force-emitted via an `sr-only` element at the bottom so the lint doesn't warn about unused mapping; more importantly the trend pill itself uses `dash-pill--success` / `dash-pill--danger` from the `trend.positive` branch, not `pillClass` — that's deliberate, because trend semantics are about direction, not accent.
- Actually, the `sr-only` hack is a code smell. Remove it in the next micro-step:

- [ ] **Step 2.2: Clean up the unused-pill-class artifact**

Remove both the `ACCENT_TO_PILL` map and its unused `sr-only` reference. Final cleanup — edit the file to:

1. Delete these lines:

```ts
const ACCENT_TO_PILL: Record<NonNullable<KpiCardProps['accent']>, string> = {
  blue:    'dash-pill--primary-soft',
  indigo:  'dash-pill--primary-soft',
  green:   'dash-pill--success',
  emerald: 'dash-pill--success',
  amber:   'dash-pill--warning',
  red:     'dash-pill--danger',
}
```

2. Delete this line from the `KpiCard` function body:

```ts
  const pillClass = ACCENT_TO_PILL[accent]
```

3. Delete the `sr-only` force-emit line:

```tsx
          {/* Also pill-badge unused lint silence */}
          <span className={cn('sr-only', pillClass)} />
```

- [ ] **Step 2.3: Verify the component still type-checks**

Run:

```bash
npx tsc --noEmit
```

Expected: 0 errors specific to `kpi-card.tsx`. (Unrelated pre-existing errors elsewhere are not introduced by this task — if you see any, confirm they already existed on `master` before this change.)

- [ ] **Step 2.4: Verify build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 2.5: Visual check**

Start dev server if not running:

```bash
npm run dev
```

Open in browser: `http://localhost:3000/dashboard`. Log in if needed. The KPI cards will already look slightly different because the layout changed, but — because the page isn't wrapped in `.dash-scope` yet — the `var(--dash-*)` references fall back and colors will look like the listed fallbacks. **That's expected at this step.** Wrapping happens in Tasks 7–10. Just confirm no broken layout, no missing text, no console errors.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/dashboard/kpi-card.tsx
git commit -m "feat(dashboard): rewrite KpiCard for NexLink-style visuals"
```

---

## Task 3: Restyle BrokerageChart

**Files:**
- Modify: `src/components/dashboard/brokerage-chart.tsx`

We keep all logic (`useMemo`, `useState`, period filter, vertical bar layout) and swap out: the `<Card>` wrapper for a plain `<div className="dash-card">`, the color palette, and axis/grid/tooltip styling.

- [ ] **Step 3.1: Replace the entire contents of `src/components/dashboard/brokerage-chart.tsx` with:**

```tsx
'use client'
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

interface BrokerageChartProps {
  data: Array<{
    name: string
    [month: string]: string | number
  }>
  months: string[]
}

// NexLink-style primary stack + semantic highlights; repeats from #1 if >6 months.
const MONTH_COLORS = [
  'var(--dash-chart-1, #4e6cad)',
  'var(--dash-chart-2, #2f4680)',
  'var(--dash-chart-3, #8aa1cf)',
  'var(--dash-chart-4, #d7dfee)',
  'var(--dash-chart-5, #009966)',
  'var(--dash-chart-6, #e31e24)',
]

const PERIOD_OPTIONS = [
  { value: 'FY', label: 'Full Year' },
  { value: 'Q1', label: 'Q1 (Jan–Mar)' },
  { value: 'Q2', label: 'Q2 (Apr–Jun)' },
  { value: 'Q3', label: 'Q3 (Jul–Sep)' },
  { value: 'Q4', label: 'Q4 (Oct–Dec)' },
  { value: 'H1', label: 'H1 (Jan–Jun)' },
  { value: 'H2', label: 'H2 (Jul–Dec)' },
]

const PERIOD_MONTH_INDICES: Record<string, number[]> = {
  FY: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Q1: [0, 1, 2],
  Q2: [3, 4, 5],
  Q3: [6, 7, 8],
  Q4: [9, 10, 11],
  H1: [0, 1, 2, 3, 4, 5],
  H2: [6, 7, 8, 9, 10, 11],
}

export function BrokerageChart({ data, months }: BrokerageChartProps) {
  const [period, setPeriod] = useState('FY')

  const filteredMonths = useMemo(() => {
    const indices = PERIOD_MONTH_INDICES[period] ?? PERIOD_MONTH_INDICES.FY
    return indices.filter((i) => i < months.length).map((i) => months[i])
  }, [period, months])

  const filteredData = useMemo(() => {
    return data.map((row) => {
      const filtered: Record<string, string | number> = { name: row.name }
      for (const m of filteredMonths) {
        filtered[m] = row[m] ?? 0
      }
      return filtered
    })
  }, [data, filteredMonths])

  const chartHeight = Math.max(300, data.length * 44)
  const maxNameLen = data.reduce((max, row) => Math.max(max, String(row.name).length), 0)
  const yAxisWidth = Math.min(220, Math.max(160, maxNameLen * 7))

  return (
    <div className="dash-card h-full flex flex-col dash-controls-row">
      <div className="dash-card__header">
        <div>
          <h3 className="dash-card__title">Brokerage by Operator</h3>
          <p className="dash-card__subtitle">Monthly breakdown per operator</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 h-9 text-xs" aria-label="Select period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={filteredData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 8, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--dash-chart-grid, #eef0f5)"
            />
            <XAxis
              type="number"
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'var(--dash-muted, #64748B)' }}
              axisLine={{ stroke: 'var(--dash-border, #E2E8F0)' }}
              tickLine={{ stroke: 'var(--dash-border, #E2E8F0)' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: 11, fill: 'var(--dash-text, #475569)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0), name ?? '']}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid var(--dash-border, #E2E8F0)',
                boxShadow: '0 4px 12px rgba(11,11,15,.08)',
                fontSize: '13px',
                padding: '8px 12px',
                color: 'var(--dash-ink, #0b0b0f)',
              }}
              cursor={{ fill: 'var(--dash-surface-alt, #F1F5F9)' }}
            />
            <Legend
              iconSize={8}
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: '8px', color: 'var(--dash-muted, #64748B)' }}
            />
            {filteredMonths.map((month, i) => (
              <Bar
                key={month}
                dataKey={month}
                stackId="a"
                fill={MONTH_COLORS[i % MONTH_COLORS.length]}
                radius={i === filteredMonths.length - 1 ? [0, 4, 4, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Verify build**

Run:

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 3.3: Verify lint**

Run:

```bash
npm run lint
```

Expected: passes. If it flags the unused `Card`/`CardContent`/`CardHeader`/`CardTitle` imports (removed above), that's the point — the imports are not in the new file.

- [ ] **Step 3.4: Commit**

```bash
git add src/components/dashboard/brokerage-chart.tsx
git commit -m "feat(dashboard): restyle BrokerageChart with NexLink card shell and palette"
```

---

## Task 4: Restyle TaskPieChart

**Files:**
- Modify: `src/components/dashboard/task-pie-chart.tsx`

Keep logic (data derivation, center label, legend layout). Swap card shell to `.dash-card`, swap palette to `--dash-*` tokens, and adopt compact NexLink-style legend dots with count pills.

- [ ] **Step 4.1: Replace the entire contents of `src/components/dashboard/task-pie-chart.tsx` with:**

```tsx
'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface TaskPieChartProps {
  pending: number
  completed: number
  expired: number
}

const SEGMENT_COLORS = {
  pending:   'var(--dash-warning, #F59E0B)',
  completed: 'var(--dash-success, #10B981)',
  expired:   'var(--dash-accent, #EF4444)',
}

const LEGEND_DOT_FALLBACK = {
  pending:   '#f5a70d',
  completed: '#009966',
  expired:   '#e31e24',
}

export function TaskPieChart({ pending, completed, expired }: TaskPieChartProps) {
  const total = pending + completed + expired
  const data = [
    { name: 'Pending', value: pending, color: SEGMENT_COLORS.pending },
    { name: 'Completed', value: completed, color: SEGMENT_COLORS.completed },
    { name: 'Expired', value: expired, color: SEGMENT_COLORS.expired },
  ].filter((d) => d.value > 0)

  return (
    <div className="dash-card h-full flex flex-col">
      <div className="dash-card__header" style={{ marginBottom: 4 }}>
        <div>
          <h3 className="dash-card__title">Task Distribution</h3>
          <p className="dash-card__subtitle">Current month overview</p>
        </div>
      </div>

      {total === 0 ? (
        <div
          className="flex items-center justify-center h-[280px] text-sm"
          style={{ color: 'var(--dash-muted, #64748b)' }}
        >
          No task data available
        </div>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={72}
                outerRadius={108}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={2}
                stroke="var(--dash-surface, #fff)"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: number | undefined) => [val ?? 0, '']}
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid var(--dash-border, #E2E8F0)',
                  boxShadow: '0 4px 12px rgba(11,11,15,.08)',
                  fontSize: '13px',
                  padding: '8px 12px',
                  color: 'var(--dash-ink, #0b0b0f)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ top: '-24px' }}
          >
            <div className="text-center">
              <p
                className="text-[24px] font-bold tabular-nums"
                style={{ color: 'var(--dash-ink, #0f172a)' }}
              >
                {total}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--dash-muted, #64748b)' }}
              >
                Total Tasks
              </p>
            </div>
          </div>
        </div>
      )}

      {total > 0 && (
        <div
          className="grid grid-cols-3 gap-3 mt-4 pt-4"
          style={{ borderTop: '1px solid var(--dash-border, #E2E8F0)' }}
        >
          {[
            { label: 'Pending',   value: pending,   dot: LEGEND_DOT_FALLBACK.pending },
            { label: 'Completed', value: completed, dot: LEGEND_DOT_FALLBACK.completed },
            { label: 'Expired',   value: expired,   dot: LEGEND_DOT_FALLBACK.expired },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: item.dot }}
                />
                <span
                  className="text-xs"
                  style={{ color: 'var(--dash-muted, #64748b)' }}
                >
                  {item.label}
                </span>
              </div>
              <p
                className="text-lg font-bold tabular-nums"
                style={{ color: 'var(--dash-ink, #0b0b0f)' }}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4.2: Verify build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/dashboard/task-pie-chart.tsx
git commit -m "feat(dashboard): restyle TaskPieChart with NexLink shell and semantic palette"
```

---

## Task 5: Restyle OperatorTable

**Files:**
- Modify: `src/components/dashboard/operator-table.tsx`

The current `slate-800` header with white text and zebra rows gets replaced with the `.dash-table` treatment: light `#f7f8fb` header, muted labels, 1px row borders, soft hover. The `blue-50` totals row becomes the `.dash-table tfoot` treatment. Sticky-left behavior on the operator-name column is preserved.

- [ ] **Step 5.1: Replace the entire contents of `src/components/dashboard/operator-table.tsx` with:**

```tsx
'use client'
import { formatCurrency } from '@/lib/utils'

interface OperatorRow {
  operatorId: string
  operatorName: string
  totalClients: number
  tradedClients: number
  notTraded: number
  tradedPercentage: number
  tradedAmountPercent: number
  didNotAnswer: number
  monthlyTotal: number
  dailyBreakdown: Record<number, number>
}

interface OperatorTableProps {
  data: OperatorRow[]
  daysInMonth: number
  currentDay: number
}

export function OperatorTable({ data, currentDay }: OperatorTableProps) {
  const totals = data.reduce(
    (acc, row) => {
      acc.totalClients += row.totalClients
      acc.tradedClients += row.tradedClients
      acc.notTraded += row.notTraded
      acc.didNotAnswer += row.didNotAnswer
      acc.monthlyTotal += row.monthlyTotal
      for (let d = 1; d <= currentDay; d++) {
        acc.dailyBreakdown[d] = (acc.dailyBreakdown[d] || 0) + (row.dailyBreakdown[d] || 0)
      }
      return acc
    },
    {
      totalClients: 0,
      tradedClients: 0,
      notTraded: 0,
      didNotAnswer: 0,
      monthlyTotal: 0,
      dailyBreakdown: {} as Record<number, number>,
    }
  )

  const totalTradedPct = totals.totalClients > 0
    ? ((totals.tradedClients / totals.totalClients) * 100).toFixed(2) + '%'
    : '0%'

  const stickyBg = 'var(--dash-surface, #ffffff)'

  return (
    <div
      className="overflow-x-auto dash-card dash-card--flush"
      style={{ borderRadius: 14 }}
    >
      <table className="dash-table">
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10"
              style={{
                background: '#f7f8fb',
                minWidth: 150,
                textAlign: 'left',
              }}
            >
              Operator
            </th>
            {['Clients', 'Traded', 'Not Traded', 'Traded %', 'Amount %', 'DNA', 'Monthly (₹)'].map((h) => (
              <th key={h} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <th key={day} style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: 72 }}>
                Day {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.operatorId}>
              <td
                className="sticky left-0 z-10 font-semibold"
                style={{ background: stickyBg, color: 'var(--dash-ink, #0b0b0f)' }}
              >
                {row.operatorName}
              </td>
              <td className="dash-num" style={{ textAlign: 'center' }}>{row.totalClients}</td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', color: 'var(--dash-success, #009966)', fontWeight: 600 }}
              >
                {row.tradedClients}
              </td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', color: 'var(--dash-accent, #e31e24)' }}
              >
                {row.notTraded}
              </td>
              <td className="dash-num" style={{ textAlign: 'center' }}>{row.tradedPercentage.toFixed(2)}%</td>
              <td className="dash-num" style={{ textAlign: 'center' }}>{row.tradedAmountPercent.toFixed(2)}%</td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', color: 'var(--dash-warning, #f5a70d)' }}
              >
                {row.didNotAnswer}
              </td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', fontWeight: 600 }}
              >
                {formatCurrency(row.monthlyTotal)}
              </td>
              {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
                <td
                  key={day}
                  className="dash-num"
                  style={{ textAlign: 'center', color: 'var(--dash-muted, #64748b)', fontSize: 12 }}
                >
                  {row.dailyBreakdown[day] ? formatCurrency(row.dailyBreakdown[day]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              className="sticky left-0 z-10"
              style={{ background: stickyBg, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.02em' }}
            >
              Total
            </td>
            <td className="dash-num" style={{ textAlign: 'center' }}>{totals.totalClients}</td>
            <td
              className="dash-num dash-total-amount"
              style={{ textAlign: 'center' }}
            >
              {totals.tradedClients}
            </td>
            <td
              className="dash-num"
              style={{ textAlign: 'center', color: 'var(--dash-accent, #e31e24)' }}
            >
              {totals.notTraded}
            </td>
            <td className="dash-num" style={{ textAlign: 'center' }}>{totalTradedPct}</td>
            <td className="dash-num" style={{ textAlign: 'center' }}>100%</td>
            <td
              className="dash-num"
              style={{ textAlign: 'center', color: 'var(--dash-warning, #f5a70d)' }}
            >
              {totals.didNotAnswer}
            </td>
            <td className="dash-num" style={{ textAlign: 'center' }}>{formatCurrency(totals.monthlyTotal)}</td>
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <td key={day} className="dash-num" style={{ textAlign: 'center', fontSize: 12 }}>
                {totals.dailyBreakdown[day] ? formatCurrency(totals.dailyBreakdown[day]) : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

Note: the `daysInMonth` prop is kept in the interface but not used (matches current behavior — it was already passed but only `currentDay` drove rendering). We keep the prop to avoid breaking the caller.

Correction: the function signature I wrote above destructures only `currentDay`. Keep `daysInMonth` in the `OperatorTableProps` interface (so the call site in `dashboard/page.tsx` still compiles) but it's acceptable to not destructure it inside the function. This is behavior-preserving — the current file also computes `currentDay`-bounded columns; the `daysInMonth` prop is actually unused in the current implementation already.

- [ ] **Step 5.2: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: both pass. If lint complains that `OperatorTableProps.daysInMonth` is declared but unused, leave the interface as-is — it documents the intended shape from the caller. If necessary, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` above the unused param in the interface, but try without it first.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/dashboard/operator-table.tsx
git commit -m "feat(dashboard): restyle OperatorTable with dash-table primitive"
```

---

## Task 6: Restyle EmployeeStatusTable

**Files:**
- Modify: `src/components/dashboard/employee-status-table.tsx`

Keep all logic (polling, expanded rows, session timeline). Swap the outer card from `rounded-xl border border-border bg-card shadow-sm` to `.dash-card dash-card--flush`. Swap the header pills from Tailwind `bg-green-100 text-green-700` / `bg-gray-100 text-gray-500` to `.dash-pill--success` / `.dash-pill--muted`. Swap the table head to `.dash-table` semantics. Keep the expanded-session detail area but swap the blue tinted background for neutral `--dash-surface-alt`.

- [ ] **Step 6.1: Read the current file then apply the edits below**

Use `Edit` for each replacement. Each `old_string` below is unique in the current file.

- [ ] **Step 6.2: Replace the loading branch**

Find:

```tsx
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
        <div className="h-4 w-48 skeleton mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 skeleton" />
          ))}
        </div>
      </div>
    )
  }
```

Replace with:

```tsx
  if (loading) {
    return (
      <div className="dash-card p-6 animate-pulse">
        <div className="h-4 w-48 skeleton mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 skeleton" />
          ))}
        </div>
      </div>
    )
  }
```

- [ ] **Step 6.3: Replace the outer container**

Find:

```tsx
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <h2 className="font-semibold text-foreground flex-1">Employee Status</h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {onlineCount} Online
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          {offlineCount} Offline
        </span>
      </div>
```

Replace with:

```tsx
  return (
    <div
      className="dash-card dash-card--flush overflow-hidden"
      style={{ borderRadius: 14 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-4"
        style={{ borderBottom: '1px solid var(--dash-border, #e2e8f0)' }}
      >
        <h2
          className="flex-1"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--dash-ink, #0b0b0f)',
          }}
        >
          Employee Status
        </h2>
        <span className="dash-pill dash-pill--success">
          <span
            className="h-2 w-2 rounded-full animate-pulse"
            style={{ background: 'var(--dash-success, #10b981)' }}
          />
          {onlineCount} Online
        </span>
        <span className="dash-pill dash-pill--muted">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          {offlineCount} Offline
        </span>
      </div>
```

- [ ] **Step 6.4: Replace the table thead**

Find:

```tsx
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 text-left">Employee</th>
              <th className="px-6 py-3 text-left">Department</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Login (Today)</th>
              <th className="px-6 py-3 text-left">Logout (Today)</th>
              <th className="px-6 py-3 text-left">Last Seen</th>
            </tr>
          </thead>
```

Replace with:

```tsx
        <table className="dash-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24, paddingRight: 24 }}>Employee</th>
              <th style={{ paddingLeft: 24, paddingRight: 24 }}>Department</th>
              <th style={{ paddingLeft: 24, paddingRight: 24 }}>Status</th>
              <th style={{ paddingLeft: 24, paddingRight: 24 }}>Login (Today)</th>
              <th style={{ paddingLeft: 24, paddingRight: 24 }}>Logout (Today)</th>
              <th style={{ paddingLeft: 24, paddingRight: 24 }}>Last Seen</th>
            </tr>
          </thead>
```

- [ ] **Step 6.5: Replace the body rows' status cell**

Find:

```tsx
                    <td className="px-6 py-3">
                      {emp.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <Wifi className="h-3 w-3" />Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                          <WifiOff className="h-3 w-3" />Offline
                        </span>
                      )}
                    </td>
```

Replace with:

```tsx
                    <td style={{ padding: '12px 24px' }}>
                      {emp.isOnline ? (
                        <span className="dash-pill dash-pill--success">
                          <Wifi className="h-3 w-3" />Online
                        </span>
                      ) : (
                        <span className="dash-pill dash-pill--muted">
                          <WifiOff className="h-3 w-3" />Offline
                        </span>
                      )}
                    </td>
```

- [ ] **Step 6.6: Replace the expanded session row's outer bg tint**

Find:

```tsx
                  {isExpanded && (
                    <tr className="bg-blue-50/20">
                      <td colSpan={6} className="px-8 py-3">
```

Replace with:

```tsx
                  {isExpanded && (
                    <tr style={{ background: 'var(--dash-surface-alt, #f8fafc)' }}>
                      <td colSpan={6} className="px-8 py-3">
```

- [ ] **Step 6.7: Replace the parent row's expanded-tint**

Find:

```tsx
                  <tr className={cn('hover:bg-gray-50', isExpanded && 'bg-blue-50/40')}>
```

Replace with:

```tsx
                  <tr
                    style={
                      isExpanded
                        ? { background: 'var(--dash-primary-50, #eef2fa)' }
                        : undefined
                    }
                    className="hover:bg-[color:var(--dash-surface-alt,#f8fafc)]"
                  >
```

- [ ] **Step 6.8: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: both pass.

- [ ] **Step 6.9: Commit**

```bash
git add src/components/dashboard/employee-status-table.tsx
git commit -m "feat(dashboard): restyle EmployeeStatusTable with dash-card and pills"
```

---

## Task 7: Apply theme to Admin dashboard

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`

Wrap the outermost container in `.dash-scope`, add breadcrumb strip above the title, swap the Operator Performance `<h2>` to `.dash-section-title`, swap Client Wise Brokerage `<Card>` shell to `.dash-card`, swap controls row to `.dash-controls-row`, swap inline table to `.dash-table`, drop the `bg-green-50` totals row.

- [ ] **Step 7.1: Replace the outermost `<div className="page-container space-y-6">` with the scoped wrapper**

Find:

```tsx
  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateLong(today)}</p>
        </div>
      </div>
```

Replace with:

```tsx
  return (
    <div className="dash-scope page-container space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="dash-breadcrumb">
        <a href="/dashboard">Home</a>
        <span className="dash-breadcrumb__sep">›</span>
        <span className="dash-breadcrumb__current">Dashboard</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dash-muted, #64748b)' }}>
            {formatDateLong(today)}
          </p>
        </div>
      </div>
```

- [ ] **Step 7.2: Swap the Operator Performance heading**

Find:

```tsx
      {/* Operator Performance Table */}
      {!loading && data && data.operatorPerformance.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Operator Performance</h2>
```

Replace with:

```tsx
      {/* Operator Performance Table */}
      {!loading && data && data.operatorPerformance.length > 0 && (
        <div>
          <h2 className="dash-section-title mb-3">Operator Performance</h2>
```

- [ ] **Step 7.3: Swap the Client Wise Brokerage Card shell**

Find:

```tsx
      {/* Client Wise Brokerage (Admin View) */}
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-800">Client Wise Brokerage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Controls Row */}
          <div className="flex flex-wrap items-center gap-3">
```

Replace with:

```tsx
      {/* Client Wise Brokerage (Admin View) */}
      <div className="dash-card">
        <div className="dash-card__header">
          <h3 className="dash-card__title">Client Wise Brokerage</h3>
        </div>
        <div className="space-y-4">
          {/* Controls Row */}
          <div className="dash-controls-row flex flex-wrap items-center gap-3">
```

- [ ] **Step 7.4: Close the Client Wise Brokerage container correctly**

The previous step opened a `<div>` in place of `<Card>` and `<CardContent>`. The closing tags must match. Find:

```tsx
          )}
        </CardContent>
      </Card>
```

Replace with:

```tsx
          )}
        </div>
      </div>
```

- [ ] **Step 7.5: Restyle the inline Client Wise Brokerage table**

Find:

```tsx
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase w-12">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">Client Code</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">Client Name</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 text-xs uppercase">Brokerage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                        No client brokerage data for this period
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client, idx) => (
                      <tr key={client.clientCode} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-gray-700 font-medium">{client.clientCode}</td>
                        <td className="px-4 py-2.5 text-gray-700">{client.clientName}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                          {formatCurrency(client.totalBrokerage)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredClients.length > 0 && (
                  <tfoot>
                    <tr className="bg-green-50 font-bold border-t-2">
                      <td className="px-4 py-3" colSpan={3}>Total</td>
                      <td className="px-4 py-3 text-right text-green-700">
                        {formatCurrency(filteredClients.reduce((s, c) => s + c.totalBrokerage, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
```

Replace with:

```tsx
            <div className="overflow-x-auto" style={{ borderRadius: 10, border: '1px solid var(--dash-border, #e2e8f0)' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Client Code</th>
                    <th>Client Name</th>
                    <th style={{ textAlign: 'right' }}>Brokerage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: '32px 16px',
                          textAlign: 'center',
                          color: 'var(--dash-muted, #94a3b8)',
                          fontSize: 14,
                        }}
                      >
                        No client brokerage data for this period
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client, idx) => (
                      <tr key={client.clientCode}>
                        <td style={{ fontSize: 12, color: 'var(--dash-muted, #64748b)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500, color: 'var(--dash-ink, #0b0b0f)' }}>{client.clientCode}</td>
                        <td>{client.clientName}</td>
                        <td className="dash-num" style={{ textAlign: 'right', fontWeight: 500 }}>
                          {formatCurrency(client.totalBrokerage)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredClients.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td
                        className="dash-num dash-total-amount"
                        style={{ textAlign: 'right' }}
                      >
                        {formatCurrency(filteredClients.reduce((s, c) => s + c.totalBrokerage, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
```

- [ ] **Step 7.6: Swap the "Showing ..." meta line color**

Find:

```tsx
          <p className="text-xs text-gray-400">
            Showing client-wise brokerage for{' '}
```

Replace with:

```tsx
          <p className="text-xs" style={{ color: 'var(--dash-muted, #9ca3af)' }}>
            Showing client-wise brokerage for{' '}
```

- [ ] **Step 7.7: Remove unused imports**

At the top of the file, the `Card, CardContent, CardHeader, CardTitle` import is no longer used. Remove the line:

```ts
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
```

- [ ] **Step 7.8: Verify build, lint, and visual**

```bash
npm run build && npm run lint
```

Then with dev server running, open `http://localhost:3000/dashboard` and confirm:

- Breadcrumb strip appears above the page title.
- KPI cards look like the new design (no left-border, no icon chip, trend pills, footer row with arrow).
- BrokerageChart shows in a single-palette blue stack, not rainbow.
- TaskPieChart donut shows semantic colors (amber pending, green completed, red expired).
- OperatorTable has light header (not dark slate), soft hover, light totals row (no green tint except on amount where applicable).
- Client Wise Brokerage table looks like the new style (no zebra striping, no green-50 totals background).
- EmployeeStatusTable has compact pills for Online/Offline counts.
- No console errors.
- Red "attention" border appears only on "Overdue Tasks" card.
- Data values (counts, currency) are correct — same numbers as before.

- [ ] **Step 7.9: Commit**

```bash
git add src/app/\(protected\)/dashboard/page.tsx
git commit -m "feat(dashboard): apply NexLink theme to Admin dashboard page"
```

---

## Task 8: Apply theme to Equity dashboard

**Files:**
- Modify: `src/app/(protected)/equity/dashboard/page.tsx`

- [ ] **Step 8.1: Wrap in `.dash-scope` and add breadcrumb**

Find:

```tsx
  return (
    <div className="page-container space-y-6">
      {/* Welcome Banner */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your work overview for today</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
      </div>
```

Replace with:

```tsx
  return (
    <div className="dash-scope page-container space-y-6">
      <nav aria-label="Breadcrumb" className="dash-breadcrumb">
        <a href="/equity/dashboard">Home</a>
        <span className="dash-breadcrumb__sep">›</span>
        <span className="dash-breadcrumb__current">Equity Dashboard</span>
      </nav>

      {/* Welcome Banner */}
      <div className="flex items-start justify-between">
        <div>
          <h1>Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dash-muted, #6b7280)' }}>
            Here&apos;s your work overview for today
          </p>
        </div>
        <p
          className="text-sm hidden md:block"
          style={{ color: 'var(--dash-muted, #6b7280)' }}
        >
          {formatDateLong(today)}
        </p>
      </div>
```

- [ ] **Step 8.2: Restyle the "My Mutual Fund Business" section heading**

Find:

```tsx
      {/* My Mutual Fund Business */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-800">My Mutual Fund Business</h2>
          <span className="text-xs text-gray-400 ml-1">— this month</span>
        </div>
```

Replace with:

```tsx
      {/* My Mutual Fund Business */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="dash-section-title">My Mutual Fund Business</h2>
          <span className="dash-pill dash-pill--primary-soft ml-1">this month</span>
        </div>
```

(The `ShoppingBag` icon is dropped because the new accent bar on the heading gives it visual weight. If you want the icon back, put it to the left of `<h2>` with `color: var(--dash-primary)`.)

- [ ] **Step 8.3: Remove the unused `ShoppingBag` import**

Find:

```ts
import { Users, TrendingUp, TrendingDown, Percent, IndianRupee, ShoppingBag } from 'lucide-react'
```

Replace with:

```ts
import { Users, TrendingUp, TrendingDown, Percent, IndianRupee } from 'lucide-react'
```

- [ ] **Step 8.4: Verify build, lint, and visual**

```bash
npm run build && npm run lint
```

Open `http://localhost:3000/equity/dashboard`. Confirm new KPI card look, breadcrumb, "My Mutual Fund Business" section heading with accent bar and small primary-soft pill.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/\(protected\)/equity/dashboard/page.tsx
git commit -m "feat(dashboard): apply NexLink theme to Equity dashboard page"
```

---

## Task 9: Apply theme to MF dashboard

**Files:**
- Modify: `src/app/(protected)/mf/dashboard/page.tsx`

- [ ] **Step 9.1: Wrap in `.dash-scope` and add breadcrumb**

Find:

```tsx
  return (
    <div className="page-container space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here&apos;s your work overview for today</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="myBizDash"
              checked={myBusinessOnly}
              onCheckedChange={(c) => setMyBusinessOnly(c === true)}
            />
            <label htmlFor="myBizDash" className="text-sm cursor-pointer text-gray-600">My Business Only</label>
          </div>
          <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
        </div>
      </div>
```

Replace with:

```tsx
  return (
    <div className="dash-scope page-container space-y-6">
      <nav aria-label="Breadcrumb" className="dash-breadcrumb">
        <a href="/mf/dashboard">Home</a>
        <span className="dash-breadcrumb__sep">›</span>
        <span className="dash-breadcrumb__current">MF Dashboard</span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1>Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dash-muted, #6b7280)' }}>
            Here&apos;s your work overview for today
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="myBizDash"
              checked={myBusinessOnly}
              onCheckedChange={(c) => setMyBusinessOnly(c === true)}
            />
            <label
              htmlFor="myBizDash"
              className="text-sm cursor-pointer"
              style={{ color: 'var(--dash-text, #4b5563)' }}
            >
              My Business Only
            </label>
          </div>
          <p
            className="text-sm hidden md:block"
            style={{ color: 'var(--dash-muted, #6b7280)' }}
          >
            {formatDateLong(today)}
          </p>
        </div>
      </div>
```

- [ ] **Step 9.2: Verify build, lint, and visual**

```bash
npm run build && npm run lint
```

Open `http://localhost:3000/mf/dashboard`. Confirm KPI cards, breadcrumb, typography.

- [ ] **Step 9.3: Commit**

```bash
git add src/app/\(protected\)/mf/dashboard/page.tsx
git commit -m "feat(dashboard): apply NexLink theme to MF dashboard page"
```

---

## Task 10: Apply theme to Backoffice dashboard

**Files:**
- Modify: `src/app/(protected)/backoffice/dashboard/page.tsx`

The backoffice dashboard has an additional inline pending-tasks table with status/priority/department pills that need swapping, plus a section heading. Keep all interactions (row click opens task modal, filter select, "View All Tasks →" link).

- [ ] **Step 10.1: Swap local pill color maps to dash tokens**

Find:

```tsx
const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  EXPIRED:   'bg-red-100 text-red-700',
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW:    'bg-green-100 text-green-700',
}

const DEPT_COLORS: Record<string, string> = {
  EQUITY:      'bg-blue-100 text-blue-700',
  MUTUAL_FUND: 'bg-green-100 text-green-700',
  BACK_OFFICE: 'bg-purple-100 text-purple-700',
  ADMIN:       'bg-orange-100 text-orange-700',
}
```

Replace with:

```tsx
const STATUS_CLASS: Record<string, string> = {
  PENDING:   'dash-pill dash-pill--warning',
  COMPLETED: 'dash-pill dash-pill--success',
  EXPIRED:   'dash-pill dash-pill--danger',
}

const PRIORITY_CLASS: Record<string, string> = {
  HIGH:   'dash-pill dash-pill--danger',
  MEDIUM: 'dash-pill dash-pill--warning',
  LOW:    'dash-pill dash-pill--success',
}

const DEPT_CLASS: Record<string, string> = {
  EQUITY:      'dash-pill dash-pill--primary-soft',
  MUTUAL_FUND: 'dash-pill dash-pill--success',
  BACK_OFFICE: 'dash-pill dash-pill--muted',
  ADMIN:       'dash-pill dash-pill--warning',
}
```

- [ ] **Step 10.2: Update all three pill usages in the JSX**

Find:

```tsx
                        <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${DEPT_COLORS[task.assignedTo.department] ?? 'bg-gray-100 text-gray-600'}`}>
                          {task.assignedTo.department.replace(/_/g, ' ')}
                        </span>
```

Replace with:

```tsx
                        <span className={DEPT_CLASS[task.assignedTo.department] ?? 'dash-pill dash-pill--muted'}>
                          {task.assignedTo.department.replace(/_/g, ' ')}
                        </span>
```

Find:

```tsx
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority]}`}>
                          {task.priority}
                        </span>
```

Replace with:

```tsx
                        <span className={PRIORITY_CLASS[task.priority]}>
                          {task.priority}
                        </span>
```

Find:

```tsx
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                          {task.status}
                        </span>
```

Replace with:

```tsx
                        <span className={STATUS_CLASS[task.status]}>
                          {task.status}
                        </span>
```

- [ ] **Step 10.3: Wrap in `.dash-scope` and add breadcrumb**

Find:

```tsx
  return (
    <div className="page-container space-y-6">
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Back Office</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
      </div>
```

Replace with:

```tsx
  return (
    <div className="dash-scope page-container space-y-6">
      <nav aria-label="Breadcrumb" className="dash-breadcrumb">
        <a href="/backoffice/dashboard">Home</a>
        <span className="dash-breadcrumb__sep">›</span>
        <span className="dash-breadcrumb__current">Back Office Dashboard</span>
      </nav>

      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1>Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dash-muted, #6b7280)' }}>
            Back Office
          </p>
        </div>
        <p
          className="text-sm hidden md:block"
          style={{ color: 'var(--dash-muted, #6b7280)' }}
        >
          {formatDateLong(today)}
        </p>
      </div>
```

- [ ] **Step 10.4: Swap the "Pending Tasks" section heading + select wrapper**

Find:

```tsx
          {/* Tasks Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Pending Tasks</h2>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Due Today</SelectItem>
                  <SelectItem value="tomorrow">Due Tomorrow</SelectItem>
                  <SelectItem value="week">Due This Week</SelectItem>
                  <SelectItem value="month">Due This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
```

Replace with:

```tsx
          {/* Tasks Table */}
          <div>
            <div className="dash-controls-row flex items-center justify-between mb-3">
              <h2 className="dash-section-title">Pending Tasks</h2>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Due Today</SelectItem>
                  <SelectItem value="tomorrow">Due Tomorrow</SelectItem>
                  <SelectItem value="week">Due This Week</SelectItem>
                  <SelectItem value="month">Due This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
```

- [ ] **Step 10.5: Restyle the inline tasks table**

Find:

```tsx
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-64">Task</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-36 whitespace-nowrap">Assigned To</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-36 whitespace-nowrap">Assigned By</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-32">Department</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-24">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-24">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-32">Deadline</th>
                  </tr>
                </thead>
                <tbody>
```

Replace with:

```tsx
            <div
              className="overflow-x-auto"
              style={{ borderRadius: 10, border: '1px solid var(--dash-border, #e5e7eb)' }}
            >
              <table className="dash-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: 256 }}>Task</th>
                    <th style={{ width: 144, whiteSpace: 'nowrap' }}>Assigned To</th>
                    <th style={{ width: 144, whiteSpace: 'nowrap' }}>Assigned By</th>
                    <th style={{ width: 128 }}>Department</th>
                    <th style={{ width: 96 }}>Priority</th>
                    <th style={{ width: 96 }}>Status</th>
                    <th style={{ width: 128 }}>Deadline</th>
                  </tr>
                </thead>
                <tbody>
```

- [ ] **Step 10.6: Restyle the task row's hover and cell text colors**

Find:

```tsx
                  ) : data.filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedTask(task)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 truncate max-w-60">{task.title}</p>
                        <p className="text-xs text-gray-400 truncate max-w-60 mt-0.5">{task.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {getInitials(task.assignedTo.name)}
                          </div>
                          <span className="font-medium text-gray-800 whitespace-nowrap">{task.assignedTo.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{task.assignedBy.name}</td>
                      <td className="px-4 py-3">
```

Replace with:

```tsx
                  ) : data.filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedTask(task)}
                    >
                      <td>
                        <p
                          className="font-medium truncate max-w-60"
                          style={{ color: 'var(--dash-ink, #1f2937)' }}
                        >
                          {task.title}
                        </p>
                        <p
                          className="text-xs truncate max-w-60 mt-0.5"
                          style={{ color: 'var(--dash-muted, #9ca3af)' }}
                        >
                          {task.description}
                        </p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-medium flex-shrink-0"
                            style={{ background: 'var(--dash-primary, #4e6cad)' }}
                          >
                            {getInitials(task.assignedTo.name)}
                          </div>
                          <span
                            className="font-medium whitespace-nowrap"
                            style={{ color: 'var(--dash-ink, #1f2937)' }}
                          >
                            {task.assignedTo.name}
                          </span>
                        </div>
                      </td>
                      <td
                        className="text-xs whitespace-nowrap"
                        style={{ color: 'var(--dash-muted, #4b5563)' }}
                      >
                        {task.assignedBy.name}
                      </td>
                      <td>
```

- [ ] **Step 10.7: Remove remaining `px-4 py-3` hardcodes on the three `<td>`s holding pills**

Because we removed `px-4 py-3` on the three cells above, we need to remove it on the other three cells of that row too so `.dash-table` padding applies uniformly. Find each remaining `<td className="px-4 py-3">` inside the row (the three cells wrapping the dept/priority/status pills and the deadline cell) and strip the className.

Search for the priority/status/deadline pill cells. Find:

```tsx
                      <td className="px-4 py-3">
                        <span className={DEPT_CLASS[task.assignedTo.department] ?? 'dash-pill dash-pill--muted'}>
                          {task.assignedTo.department.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={PRIORITY_CLASS[task.priority]}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={STATUS_CLASS[task.status]}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 whitespace-nowrap">{formatDate(task.deadline)}</p>
                        <DeadlineInfo deadline={new Date(task.deadline)} status={task.status} />
                      </td>
                    </tr>
                  ))}
```

Replace with:

```tsx
                      <td>
                        <span className={DEPT_CLASS[task.assignedTo.department] ?? 'dash-pill dash-pill--muted'}>
                          {task.assignedTo.department.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={PRIORITY_CLASS[task.priority]}>
                          {task.priority}
                        </span>
                      </td>
                      <td>
                        <span className={STATUS_CLASS[task.status]}>
                          {task.status}
                        </span>
                      </td>
                      <td>
                        <p
                          className="text-xs whitespace-nowrap"
                          style={{ color: 'var(--dash-text, #4b5563)' }}
                        >
                          {formatDate(task.deadline)}
                        </p>
                        <DeadlineInfo deadline={new Date(task.deadline)} status={task.status} />
                      </td>
                    </tr>
                  ))}
```

- [ ] **Step 10.8: Update the "View All Tasks →" link color**

Find:

```tsx
            <button
              onClick={() => router.push('/backoffice/tasks')}
              className="mt-3 text-sm text-blue-600 hover:underline font-medium"
            >
              View All Tasks →
            </button>
```

Replace with:

```tsx
            <button
              onClick={() => router.push('/backoffice/tasks')}
              className="mt-3 text-sm hover:underline font-medium"
              style={{ color: 'var(--dash-primary, #4e6cad)' }}
            >
              View All Tasks →
            </button>
```

- [ ] **Step 10.9: Update the empty-state "No pending tasks" cell**

Find:

```tsx
                  {data.filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center">
                        <ClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-gray-400">No pending tasks for this period</p>
                      </td>
                    </tr>
```

Replace with:

```tsx
                  {data.filteredTasks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: '56px 16px', textAlign: 'center' }}
                      >
                        <ClipboardList
                          className="h-10 w-10 mx-auto mb-2"
                          style={{ color: 'var(--dash-border, #d1d5db)' }}
                        />
                        <p
                          className="text-sm"
                          style={{ color: 'var(--dash-muted, #9ca3af)' }}
                        >
                          No pending tasks for this period
                        </p>
                      </td>
                    </tr>
```

- [ ] **Step 10.10: Verify build, lint, and visual**

```bash
npm run build && npm run lint
```

Open `http://localhost:3000/backoffice/dashboard`. Confirm:

- Breadcrumb strip.
- KPI cards with new styling; "Tasks Expired" has red attention border-top.
- "Pending Tasks" section heading has accent bar.
- Filter select matches new control style.
- Tasks table: light header, pill badges for status/priority/department (no bright tailwind backgrounds), avatar uses brand blue (not purple).
- Clicking a task row still opens the detail modal.
- "View All Tasks →" text is brand blue.
- Data values are unchanged from before.

- [ ] **Step 10.11: Commit**

```bash
git add src/app/\(protected\)/backoffice/dashboard/page.tsx
git commit -m "feat(dashboard): apply NexLink theme to Backoffice dashboard page"
```

---

## Task 11: End-to-end verification

**Files:**
- Read only. No changes.

- [ ] **Step 11.1: Full build**

```bash
npm run build
```

Expected: succeeds with zero new errors or warnings compared to `master` at the start of this work.

- [ ] **Step 11.2: Full lint**

```bash
npm run lint
```

Expected: passes. If new warnings appear that relate to this work (e.g., unused imports in the modified files), go back and clean them up. Do not suppress; fix.

- [ ] **Step 11.3: Run all 4 dashboards in the browser**

Dev server running. Log in with each role (or switch roles via the active-role store if your test account supports it) and visit in turn:

1. `/dashboard` (Admin/Super Admin)
2. `/equity/dashboard` (Equity Dealer)
3. `/mf/dashboard` (MF Dealer)
4. `/backoffice/dashboard` (Back Office)

For each, confirm the checklist:

- [ ] Breadcrumb strip present and styled.
- [ ] Page title uses Inter, size 22px, near-black.
- [ ] KPI cards match new structure (no left-border, no icon chip, compact trend pills, footer arrow).
- [ ] Red "attention" border only appears on KPIs listed in `ATTENTION_RED_TITLES` (and is absent on "Closed Accounts").
- [ ] Charts (BrokerageChart, TaskPieChart) read correct values and use new palettes.
- [ ] Tables (OperatorTable, EmployeeStatusTable, Client Wise Brokerage, Backoffice Pending Tasks) have light headers, soft hover, no zebra striping, no colored backgrounds except via `.dash-pill` variants.
- [ ] All interactions still work: selects open/close, switches toggle, session expand/collapse on EmployeeStatusTable, task row click opens modal on Backoffice.
- [ ] No console errors or React warnings.

- [ ] **Step 11.4: Regression sweep of non-dashboard pages**

Open in the browser and confirm no visual change vs. before:

- `/clients`
- `/brokerage`
- `/tasks`
- `/masters/clients`
- `/login` (logged out)

Expected: these pages look identical to before. The only CSS file we added is scoped under `.dash-scope`, and none of these pages use that class.

- [ ] **Step 11.5: Data correctness smoke test**

Pick one KPI on `/dashboard` (e.g., "Total Employees") and verify the number matches what the API returns:

```bash
curl -s 'http://localhost:3000/api/dashboard/admin' | head -200
```

(Requires a valid session cookie; use the browser devtools Network tab instead if you don't have session auth wired via curl.)

Expected: visible KPI value equals the corresponding field in the API response.

- [ ] **Step 11.6: Confirm no unintended file changes**

Run:

```bash
git diff --stat master
```

Expected: only the files listed in "File Structure" above appear in the diff. No changes to `globals.css`, `package.json`, `next.config.ts`, API routes, or any component outside `components/dashboard/*`.

- [ ] **Step 11.7: No final commit needed**

Each task already committed. Verify history:

```bash
git log --oneline master..HEAD
```

Expected: ~10 clean commits, one per task (tasks 1–10). Task 11 is verification only.

---

## Self-Review Checklist (performed by plan author)

- **Spec coverage:**
  - §3 color tokens → Task 1 ✓
  - §3 typography → Task 1 (base-layer override, heading sizes) + Tasks 7–10 (`<h1>` strips `page-title` where needed — kept `page-container` wrapper which sets its own `.page-title`; `dash-scope h1` overrides color/family/size via `!important`? Check below) ✓
  - §3 geometry → Task 1 `.dash-card` ✓
  - §3 pills → Task 1 `.dash-pill*` ✓
  - §4.1 KpiCard → Task 2 ✓
  - §4.2 BrokerageChart → Task 3 ✓
  - §4.3 TaskPieChart → Task 4 ✓
  - §4.4 OperatorTable / EmployeeStatusTable / Client Wise Brokerage / controls row → Tasks 5, 6, 7, 10 ✓
  - §4.5 Section headings → Tasks 7, 8, 10 ✓
  - §4.6 Page header breadcrumb → Tasks 7, 8, 9, 10 ✓
  - §5 per-page specifics → Tasks 7–10 ✓
  - §6 scoping mechanism → Task 1 wrapper + Tasks 7–10 apply ✓
  - §7 risks → addressed by fallback `var(--dash-*, <fallback>)` in components, `.dash-scope` isolation, optional sparklines ✓
  - §8 verification → Task 11 ✓
  - §9 success criteria → verified in Task 11 ✓

- **Typography note (catch-up):** The spec says "base-layer `h1–h6 { font-family: var(--font-lexend) }` from `globals.css` is overridden locally inside `.dash-scope`." The CSS in Task 1 does this but CSS specificity is equal (one class + element vs. element alone in globals.css), so `.dash-scope h1` wins because it's more specific (class + element > element). However, the existing `page-title` class in `globals.css` applies to `<h1 className="page-title">` which may include its own `font-family`. To be safe, Tasks 7–10 drop `className="page-title"` from the `<h1>` in the dashboard pages. **Re-check:** Tasks 7, 8, 9, 10 all replace `<h1 className="page-title">...</h1>` with plain `<h1>...</h1>`. ✓ Confirmed.

- **Placeholder scan:** No `TBD`, `TODO`, "implement later", or "fill in details". Every code step shows complete code. Every bash step shows the exact command.

- **Type consistency:**
  - `KpiCardProps.icon` typed as `icon?: LucideIcon` in Task 2 — existing call sites pass `Users`, `Briefcase`, etc. which all satisfy `LucideIcon`. ✓
  - `KpiCardProps.sparkData?: number[]` new optional — no existing call site breaks. ✓
  - `OperatorTableProps.daysInMonth` kept in interface, unused in body — call site in `dashboard/page.tsx` still compiles. ✓
  - `BrokerageChartProps` signature unchanged. ✓
  - `TaskPieChartProps` signature unchanged. ✓
  - `EmployeeStatusTable` signature unchanged. ✓
  - All dashboard page component signatures unchanged. ✓

- **Attention-red KPI title list:** `ATTENTION_RED_TITLES = new Set(['Overdue Tasks', 'Not Traded', 'Tasks Expired'])` matches spec §4.1 (Overdue Tasks, Not Traded) + Task 10 backoffice ("Tasks Expired" is `accent="red"` and should get attention). "Closed Accounts" has `accent="red"` but is deliberately excluded, matching spec. ✓

- **DRY:** The `.dash-*` tokens and classes are defined once in Task 1; every later task uses them. No duplication of color hex codes outside the fallback suffixes in `var(..., #fallback)` — which are intentional for safety when rendered outside `.dash-scope`.

- **YAGNI:** No new dependencies. No new abstractions beyond the one scoped stylesheet and one new optional prop. Sparklines are opt-in; pilot ships with them off.

- **Frequent commits:** 10 tasks = 10 commits, each self-contained and buildable.

---

## Notes for the executor

- The `page-container` class used on the existing pages lives in `globals.css` (not modified by this plan). It continues to provide page padding and max-width. `.dash-scope` sits alongside it on the same `<div>`; both apply.
- When you run `npm run build`, Next.js 16 may print warnings unrelated to this work (e.g., from Prisma generation or Turbopack). Compare against a fresh `git stash` → build to confirm they pre-existed.
- If the dev server is already running when you make a CSS-only change, hot-reload picks it up without a rebuild. For component `.tsx` edits, hot-reload also works.
- Role-based dashboard redirect logic (`getDashboardForRole`) is unchanged; if your test session lands on a dashboard different from the one you're trying to test, switch active role via the role switcher in the topbar.
