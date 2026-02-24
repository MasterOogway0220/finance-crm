import { Role, Department, TaskStatus, TaskPriority, ClientStatus, ClientRemark, MFClientStatus, MFClientRemark } from '@prisma/client'

export type { Role, Department, TaskStatus, TaskPriority, ClientStatus, ClientRemark, MFClientStatus, MFClientRemark }

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  department: Department
  designation: string
}

export interface DashboardKPI {
  totalEmployees: number
  totalClients: number
  equityClients: number
  mfClients: number
  monthlyBrokerage: number
  tradedClients: number
  totalEquityClients: number
  pendingTasks: number
  overdueTasks: number
}

export interface OperatorPerformance {
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

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  link?: string | null
  createdAt: Date
}

export interface TaskWithRelations {
  id: string
  title: string
  description: string
  assignedTo: { id: string; name: string; department: Department }
  assignedBy: { id: string; name: string; department: Department }
  startDate: Date
  deadline: Date
  status: TaskStatus
  priority: TaskPriority
  completedAt?: Date | null
  createdAt: Date
  comments?: TaskCommentItem[]
}

export interface TaskCommentItem {
  id: string
  content: string
  createdAt: Date
  author: { id: string; name: string }
}

export interface ClientWithOperator {
  id: string
  clientCode: string
  firstName: string
  middleName?: string | null
  lastName: string
  phone: string
  department: Department
  operatorId: string
  operator: { id: string; name: string }
  status: ClientStatus
  remark: ClientRemark
  mfStatus: MFClientStatus
  mfRemark: MFClientRemark
  notes?: string | null
  followUpDate?: Date | null
  createdAt: Date
}

export interface BrokerageUploadSummary {
  operatorId: string
  operatorName: string
  clientCount: number
  totalAmount: number
}
