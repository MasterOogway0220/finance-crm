# Dashboard UI Refresh — Design Spec

**Date:** 2026-04-18
**Status:** Draft (pending user review)
**Scope:** UI-only pilot on role-based dashboard pages. No functional, route, API, or data-shape changes.

---

## 1. Goal

Visually refresh the 5 role-based dashboards to match the NexLink CRM admin template's design language, expressed in the user's brand palette (blue primary, red accent, black text). Structure, routes, data, and behavior remain unchanged.

**Reference:** `demo/nexlink.layoutdrop.com/demo/` (Bootstrap 5 HTML template — used as visual benchmark only; no code is ported).

## 2. Scope

### In scope

**Pages:**
- `src/app/(protected)/dashboard/page.tsx` (Admin & Super Admin)
- `src/app/(protected)/equity/dashboard/page.tsx` (Equity Dealer)
- `src/app/(protected)/mf/dashboard/page.tsx` (MF Dealer)
- `src/app/(protected)/backoffice/dashboard/page.tsx` (Back Office)

**Shared components:**
- `src/components/dashboard/kpi-card.tsx`
- `src/components/dashboard/brokerage-chart.tsx`
- `src/components/dashboard/task-pie-chart.tsx`
- `src/components/dashboard/operator-table.tsx`
- `src/components/dashboard/employee-status-table.tsx`

### Out of scope

- Sidebar (`components/layout/sidebar.tsx`) and topbar (`components/layout/topbar.tsx`).
- All non-dashboard pages: clients, brokerage, tasks, documents, calendar, reports, masters, login-history, notifications, settings, authentication screens.
- Dark-mode visual parity on refreshed surfaces (light mode only in this pilot).
- API routes, data layer, auth, stores, hooks, utilities.
- No new npm dependencies (no new chart lib, icon set, or font).
- No redesign below 768px beyond what grid reflow already provides.
- `src/app/globals.css` — not modified.

## 3. Design tokens

All tokens are introduced in a new file, `src/app/(protected)/dashboard/dashboard-theme.css`, scoped to a `.dash-scope` class. They do not leak into `globals.css` or other pages.

### Color tokens

| Token | Value | Usage |
|---|---|---|
| `--dash-primary` | `#4e6cad` | CTAs, links, focus ring, selected states, primary chart series |
| `--dash-primary-50` | `#eef2fa` | Soft primary backgrounds |
| `--dash-primary-600` | `#3e588f` | Primary hover |
| `--dash-accent` | `#e31e24` | Brand mark, attention KPI badges, destructive, overdue/alert |
| `--dash-accent-50` | `#fdecec` | Soft accent backgrounds |
| `--dash-ink` | `#0b0b0f` | Headings (near-black) |
| `--dash-text` | `#1f232b` | Body text |
| `--dash-muted` | `#6b7280` | Secondary / meta text |
| `--dash-border` | `#e7eaf0` | Card borders, dividers |
| `--dash-surface` | `#ffffff` | Card background |
| `--dash-surface-alt` | `#fafbfe` | Page background |
| `--dash-success` | `#009966` | Positive trend |
| `--dash-success-50` | `#e6f5ee` | Soft success background |
| `--dash-danger` | `#e31e24` | Negative trend (shares accent) |
| `--dash-danger-50` | `#fdecec` | Soft danger background |
| `--dash-warning` | `#f5a70d` | Pending / warning |
| `--dash-warning-50` | `#fef4de` | Soft warning background |

### Chart palette (Recharts)

Primary series stack: `#4e6cad` → `#2f4680` → `#8aa1cf` → `#d7dfee`.
Semantic highlights: `#009966` (positive), `#e31e24` (accent).
Replaces the current rainbow `--chart-1` through `--chart-5` scheme.

### Typography

- Body family: Inter (unchanged — already loaded via `--font-inter`).
- Headings: Inter with tight tracking (`-0.01em`) inside `.dash-scope`. The global `h1–h6 { font-family: var(--font-lexend) }` rule from `globals.css` is locally overridden to Inter inside `.dash-scope` only.
- Scale:
  - Page title `h1`: 22px / 700 / -0.01em / `--dash-ink`
  - Section heading `h2`: 16px / 600 / `--dash-ink`
  - Card title: 14px / 600 / `--dash-ink` (sentence case)
  - Stat value: 28px / 700 / `--dash-ink`
  - Body: 14px / 400 / `--dash-text`
  - Meta / footer: 12px / 500 / `--dash-muted`
  - Breadcrumb: 12px / 500

### Geometry

- Card radius: `14px`
- Card border: `1px solid var(--dash-border)`
- Card shadow: `0 1px 2px rgba(11,11,15,.04), 0 4px 12px rgba(11,11,15,.04)`
- Card padding: `20px`
- Spacing rhythm: 4 / 8 / 12 / 16 / 20 / 24

### Pills / badges

Reusable classes inside `.dash-scope`:

- `.dash-pill` — base: 20-22px height, 11px / 500, rounded-full, 8px horizontal padding, 1px inset ring.
- Variants: `.dash-pill--success`, `.dash-pill--danger`, `.dash-pill--warning`, `.dash-pill--primary-soft`.

## 4. Component designs

### 4.1 KpiCard (rewritten)

**Remove:**
- `border-l-4` left accent stripe.
- Colored icon chip (icon prop remains in interface for compatibility but is unused visually).

**New structure:**

```
┌─────────────────────────────────────────────┐
│  Title                                      │   13px/600/muted
│                                             │
│  28px Value    [trend pill]   [sparkline]  │   inline row
│                                             │
│  ─────────────────────────────────────────  │
│  Subtitle / comparison                   →  │   12px muted + primary arrow link
└─────────────────────────────────────────────┘
```

No kebab menu is added. NexLink's kebab opens an Edit/Delete menu; we don't have that behavior and will not introduce an inert one (per UI-only, no-functionality-change rule).

**Accent variants (prop values reinterpreted):**

- `blue` / `indigo` → neutral card; sparkline + arrow in `--dash-primary`.
- `red` → neutral card; trend pill, sparkline, arrow in `--dash-accent`.
  - Additional "attention" treatment (1px top border in `--dash-accent`) only for high-signal KPIs: `Overdue Tasks` and `Not Traded`. `Closed Accounts` keeps the red accents without the top border (historical info, not urgent).
- `green` / `emerald` → sparkline + pill in `--dash-success`.
- `amber` → sparkline + pill in `--dash-warning`.

**Sparkline:**
- Optional. When `sparkData?: number[]` prop is provided, renders a 60×28 Recharts `<AreaChart>` with gradient fill in the accent color.
- Pilot leaves `sparkData` undefined on all existing call sites (zero regression). Optionally showcase on 2-3 KPIs where data is trivially derivable; skip if not.

**Props interface:** unchanged (`title`, `value`, `subtitle`, `icon`, `accent`, `trend`, `onClick`, `actionLabel`, `onAction`) plus optional `sparkData?: number[]`. All existing call sites continue to compile.

**Grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5`.

### 4.2 BrokerageChart

- Wrap in `.dash-card` shell.
- Header row: title (16px/600) + muted subtitle (12px) left; existing filter dropdowns restyled to NexLink pill-button look on right.
- Bar series use new primary stack palette (not rainbow).
- Grid lines: `#eef0f5`, dashed.
- Tooltip: 10px radius, 1px border, `--dash-ink` text, soft shadow.
- Axis ticks: 11px / `--dash-muted`.

### 4.3 TaskPieChart

- `.dash-card` shell.
- Donut segment colors:
  - Pending → `--dash-warning`
  - Completed → `--dash-success`
  - Expired → `--dash-accent`
- Center label: total count (24px/700) + "Total tasks" (12px/muted).
- Custom legend: colored dots + count pills, compact.

### 4.4 OperatorTable, EmployeeStatusTable, Client Wise Brokerage inline table

Shared "DataPanel" treatment:

- Wrap in `.dash-card` shell.
- Table head: `bg-[#f7f8fb]`, 11px / 600, `--dash-muted`, `tracking-wide`, bottom border 1px.
- Row separators: single 1px `--dash-border`. **Remove** the existing zebra striping (`bg-white` / `bg-gray-50` alternation).
- Row hover: `bg-[#fafbfe]`.
- Cell padding: `12px 16px`.
- Monetary cells: `tabular-nums`, `--dash-ink`.
- Client Wise Brokerage totals row: drop `bg-green-50` tint; use `border-t-2` + bold, with only the amount in `--dash-success`.
- Controls row (Selects, Switch): dashboard-scoped class gives them 36px height, 10px radius, 1px border, `#fafbfe` bg, `--dash-muted` chevron.

### 4.5 Section headings

Style for `<h2>` inside `.dash-scope` (e.g. "Operator Performance", "My Mutual Fund Business"):
- 15px / 600 / `--dash-ink`
- 3px × 14px vertical accent bar in `--dash-primary` before the label.

### 4.6 Page header (all 4 dashboards)

- Breadcrumb strip above existing title block: `Home › Dashboard` (or role-specific), 12px.
- `Home` link styled in `--dash-muted`; active crumb in `--dash-ink` 600.
- 12px gap between breadcrumb strip and title row.
- Existing `<h1>Dashboard</h1>` + date line stays; typography updates per §3.

## 5. Per-page specifics

| Page | Specific notes |
|---|---|
| `/dashboard` | All 9 KPIs use new card. Grid unchanged. `Overdue Tasks` and `Closed Accounts` carry red accent treatment per §4.1. `Client Wise Brokerage` card: controls row restyled, inline table uses DataPanel treatment. |
| `/equity/dashboard` | 5 top KPIs restyled. `Not Traded` gets red attention treatment. `My Mutual Fund Business` section heading gets accent-bar treatment; `— this month` converts to `.dash-pill--primary-soft` next to heading. |
| `/mf/dashboard` | Shared component polish only. No structural changes. |
| `/backoffice/dashboard` | Shared component polish only. No structural changes. |

## 6. Implementation strategy

### Scoping mechanism

The `.dash-scope` class is applied to the outermost container `<div>` on each of the 4 dashboard pages. All new CSS variables and utility classes are defined under `.dash-scope { ... }` in `dashboard-theme.css`. Children inherit via CSS custom property cascade.

Components that could theoretically be used outside the dashboard (KpiCard, BrokerageChart, TaskPieChart, OperatorTable, EmployeeStatusTable) read tokens via `var(--dash-*)`. When rendered outside `.dash-scope`, those variables are undefined and the components fall back to their current styling via `var(--dash-*, <fallback>)` in CSS — guaranteeing no regression on non-dashboard pages.

Grep confirms these components are only used on dashboard pages today; the fallback mechanism is defense-in-depth.

### File inventory

**New:**
- `src/app/(protected)/dashboard/dashboard-theme.css`

**Modified (UI only, no logic changes):**
- `src/components/dashboard/kpi-card.tsx`
- `src/components/dashboard/brokerage-chart.tsx`
- `src/components/dashboard/task-pie-chart.tsx`
- `src/components/dashboard/operator-table.tsx`
- `src/components/dashboard/employee-status-table.tsx`
- `src/app/(protected)/dashboard/page.tsx`
- `src/app/(protected)/equity/dashboard/page.tsx`
- `src/app/(protected)/mf/dashboard/page.tsx`
- `src/app/(protected)/backoffice/dashboard/page.tsx`

**Unchanged:**
- `src/app/globals.css`
- All `src/app/api/**`
- `components/layout/*`
- `components/ui/*` (shadcn primitives)
- All other `(protected)/*` pages
- `lib/`, `stores/`, `hooks/`, `types/`
- `package.json` (no new deps)

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Restyled KPI card height/padding breaks layouts on non-dashboard pages using it | Grep confirmed current usages. Fallback-variable mechanism keeps out-of-scope rendering identical. |
| Dropping left-border stripe + icon chip reduces visual differentiation | Compensated by sparklines (accent-colored) + trend pills + red attention border-top on high-signal KPIs. |
| Recharts palette change alters expectations / screenshots | Visual-only impact; no data change; acceptable per product intent of the refresh. |
| Tailwind v4 interaction with scoped CSS variables | Plain CSS custom properties + standard `var()` references inside `.dash-scope`. No `@theme` extension; no Tailwind v4 surface touched. |
| Sparkline data not available from existing APIs | Sparklines are optional/progressive. Pilot ships with them off everywhere by default; enabling on select KPIs is best-effort. |
| Dark-mode appearance on dashboard pages | Out of scope. `.dash-scope` variables resolve to light values always. Documented limitation. |

## 8. Verification

- `npm run build` succeeds; no new TypeScript errors.
- `npm run lint` passes.
- Manual visual pass on each of 4 dashboards at viewport widths 1280, 1440, 1920: KPI grid reflow, chart card readability, table scroll, controls alignment.
- Side-by-side comparison against `demo/nexlink.layoutdrop.com/demo/index.html` — targeting design-language fidelity (palette, spacing, typography, card shell, badges), not pixel parity.
- Spot-check non-dashboard pages (`/clients`, `/brokerage`, `/tasks`, `/masters/clients`) confirm no visual regression.
- Smoke-test: at least one KPI value, one chart, and one table per dashboard render the correct data.

## 9. Success criteria

- All 4 role dashboards visually align with NexLink's design language expressed in the brand palette.
- Zero functional change; every previously working interaction still works.
- Zero regression on non-dashboard pages.
- `globals.css`, API routes, auth, stores, hooks, and `package.json` are untouched.
- The design-token layer is structured so it can be promoted from `.dash-scope` to `:root` in a later pass when we roll out to other pages.
