'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart3, IndianRupee, CheckSquare, Users, ArrowRight } from 'lucide-react'

const ADMIN_REPORTS = [
  { title: 'Equity Brokerage Report', desc: 'Monthly brokerage analysis per operator', icon: IndianRupee, color: 'text-green-600 bg-green-50', href: '/reports/brokerage' },
  { title: 'Task Completion Report', desc: 'Task performance across all departments', icon: CheckSquare, color: 'text-blue-600 bg-blue-50', href: '/reports/tasks' },
  { title: 'Client Engagement Report', desc: 'Client trading status and follow-up data', icon: Users, color: 'text-purple-600 bg-purple-50', href: '/reports/brokerage' },
]

const EQUITY_REPORTS = [
  { title: 'My Brokerage Report', desc: 'Your monthly brokerage performance', icon: IndianRupee, color: 'text-green-600 bg-green-50', href: '/reports/brokerage' },
  { title: 'My Task Report', desc: 'Your task completion history', icon: CheckSquare, color: 'text-blue-600 bg-blue-50', href: '/reports/tasks' },
]

const MF_REPORTS = [
  { title: 'My Clients', desc: 'Your client list and engagement summary', icon: Users, color: 'text-purple-600 bg-purple-50', href: '/mf/clients' },
  { title: 'My Task Report', desc: 'Your task completion history', icon: CheckSquare, color: 'text-blue-600 bg-blue-50', href: '/reports/tasks' },
]

const BO_REPORTS = [
  { title: 'My Task Performance Report', desc: 'Your task completion rate and history', icon: CheckSquare, color: 'text-blue-600 bg-blue-50', href: '/reports/tasks' },
]

export default function ReportsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = session?.user?.role

  const reports = role === 'SUPER_ADMIN' || role === 'ADMIN' ? ADMIN_REPORTS
    : role === 'EQUITY_DEALER' ? EQUITY_REPORTS
    : role === 'MF_DEALER' ? MF_REPORTS
    : BO_REPORTS

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">Analytics and performance insights</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Card key={report.title} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(report.href)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-lg ${report.color.split(' ')[1]}`}>
                  <report.icon className={`h-5 w-5 ${report.color.split(' ')[0]}`} />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-800 mt-3">{report.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{report.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
