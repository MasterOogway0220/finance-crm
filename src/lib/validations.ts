import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const taskSchema = z.object({
  assignedToId: z.string().min(1, 'Please select an employee'),
  title: z.string().min(1, 'Title is required').max(100, 'Title must be under 100 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  deadline: z.coerce.date().refine(
    (date) => date >= new Date(new Date().setHours(0, 0, 0, 0)),
    'Deadline cannot be in the past'
  ),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
})

export const clientSchema = z.object({
  clientCode: z.string().min(1, 'Client code is required'),
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().length(10, 'Phone must be 10 digits').regex(/^\d{10}$/, 'Phone must be 10 digits'),
  department: z.enum(['EQUITY', 'MUTUAL_FUND']),
  operatorId: z.string().min(1, 'Please select an operator'),
})

export const employeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().length(10, 'Phone must be 10 digits').regex(/^\d{10}$/, 'Phone must be 10 digits'),
  department: z.enum(['EQUITY', 'MUTUAL_FUND', 'BACK_OFFICE', 'ADMIN']),
  designation: z.string().min(1, 'Designation is required'),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  isActive: z.boolean().default(true),
})

export const clientUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  middleName: z.string().optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().length(10).regex(/^\d{10}$/).optional(),
  operatorId: z.string().optional(),
  status: z.enum(['TRADED', 'NOT_TRADED']).optional(),
  remark: z.enum(['SUCCESSFULLY_TRADED', 'NOT_TRADED', 'NO_FUNDS_FOR_TRADING', 'DID_NOT_ANSWER', 'SELF_TRADING']).optional(),
  mfStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  mfRemark: z.enum(['INVESTMENT_DONE', 'INTERESTED', 'NOT_INTERESTED', 'DID_NOT_ANSWER', 'FOLLOW_UP_REQUIRED']).optional(),
  notes: z.string().optional(),
  followUpDate: z.coerce.date().optional().nullable(),
})

export const bulkClientUpdateSchema = z.object({
  clientIds: z.array(z.string()).min(1, 'Select at least one client'),
  status: z.enum(['TRADED', 'NOT_TRADED']).optional(),
  remark: z.enum(['SUCCESSFULLY_TRADED', 'NOT_TRADED', 'NO_FUNDS_FOR_TRADING', 'DID_NOT_ANSWER', 'SELF_TRADING']).optional(),
  mfStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  mfRemark: z.enum(['INVESTMENT_DONE', 'INTERESTED', 'NOT_INTERESTED', 'DID_NOT_ANSWER', 'FOLLOW_UP_REQUIRED']).optional(),
})
