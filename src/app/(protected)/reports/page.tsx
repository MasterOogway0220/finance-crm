'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { IndianRupee, CheckSquare, Users, ArrowRight, CalendarDays, TrendingUp } from 'lucide-react'
import { getEffectiveRole } from '@/lib/roles'

const ADMIN_REPORTS = [
  { title: 'Equity Brokerage Report', desc: 'Monthly brokerage analysis per operator', icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50 ring-1 ring-emerald-200/50', href: '/reports/brokerage' },
  { title: 'Task Completion Report', desc: 'Task performance across all departments', icon: CheckSquare, color: 'text-blue-600', bg: 'bg-blue-50 ring-1 ring-blue-200/50', href: '/reports/tasks' },
  { title: 'Client Engagement Report', desc: 'Client trading status and follow-up data', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 ring-1 ring-purple-200/50', href: '/reports/engagement' },
  { title: 'Employee Leave Report', desc: 'Leave balance and usage across departments', icon: CalendarDays, color: 'text-amber-600', bg: 'bg-amber-50 ring-1 ring-amber-200/50', href: '/reports/leave' },
  { title: 'MF Business Report', desc: 'Mutual fund sales and commission by department', icon: TrendingUp, color: 'text-cyan-600', bg: 'bg-cyan-50 ring-1 ring-cyan-200/50', href: '/reports/mf-business' },
]

const EQUITY_REPORTS = [
  { title: 'My Brokerage Report', desc: 'Your monthly brokerage performance', icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50 ring-1 ring-emerald-200/50', href: '/reports/brokerage' },
]

const MF_REPORTS = [
  { title: 'My Clients', desc: 'Your client list and engagement summary', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 ring-1 ring-purple-200/50', href: '/mf/clients' },
]

const BO_REPORTS = [
  { title: 'My Task Performance Report', desc: 'Your task completion rate and history', icon: CheckSquare, color: 'text-blue-600', bg: 'bg-blue-50 ring-1 ring-blue-200/50', href: '/reports/tasks' },
]

export default function ReportsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = session?.user ? getEffectiveRole(session.user) : undefined

  const reports = role === 'SUPER_ADMIN' || role === 'ADMIN' ? ADMIN_REPORTS
    : role === 'EQUITY_DEALER' ? EQUITY_REPORTS
    : role === 'MF_DEALER' ? MF_REPORTS
    : BO_REPORTS

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Analytics and performance insights</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Card
            key={report.title}
            className="group hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer"
            onClick={() => router.push(report.href)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-xl ${report.bg}`}>
                  <report.icon className={`h-5 w-5 ${report.color}`} />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200" />
              </div>
              <h3 className="font-semibold text-foreground mt-4">{report.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{report.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
