'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientCodeInput } from '@/components/clients/client-code-input'
import { clientSchema } from '@/lib/validations'
import { validateClientCode } from '@/lib/client-code-validator'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'

// Use string for dob in form to match HTML date input
type FormData = Omit<z.infer<typeof clientSchema>, 'dob'> & { dob?: string }

interface Employee { id: string; name: string }

export default function AddClientPage() {
  const router = useRouter()
  const [clientCode, setClientCode] = useState('')
  const [clientCodeError, setClientCodeError] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>()

  const department = watch('department')

  useEffect(() => {
    if (!department) return
    setEmployees([])
    setValue('operatorId', '')
    // For BOTH or EQUITY, load equity dealers; for MUTUAL_FUND, load MF dealers
    const deptParam = (department === 'BOTH' || department === 'EQUITY') ? 'EQUITY' : 'MUTUAL_FUND'
    fetch(`/api/employees?department=${deptParam}&isActive=true`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
  }, [department, setValue])

  const onSubmit = async (data: FormData) => {
    if (!validateClientCode(clientCode)) {
      setClientCodeError('Invalid client code format')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clientCode, dob: data.dob ? new Date(data.dob).toISOString() : null }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(data.department === 'BOTH' ? 'Client added to both Equity & MF masters' : 'Client added successfully')
        router.push('/masters/clients')
      } else {
        toast.error(result.error || 'Failed to add client')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="page-title">Add New Client</h1>
        <p className="text-sm text-gray-500">Add a client to the master database</p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base">Client Information</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <ClientCodeInput
              value={clientCode}
              onChange={(v) => { setClientCode(v); setValue('clientCode', v); setClientCodeError('') }}
              error={clientCodeError}
            />

            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'firstName', label: 'First Name *', placeholder: 'First name' },
                { name: 'middleName', label: 'Middle Name', placeholder: 'Middle name' },
                { name: 'lastName', label: 'Last Name *', placeholder: 'Last name' },
              ].map(({ name, label, placeholder }) => (
                <div key={name} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input {...register(name as keyof FormData)} placeholder={placeholder}
                    className={errors[name as keyof FormData] ? 'border-red-500' : ''} />
                  {errors[name as keyof FormData] && <p className="text-xs text-red-500">{errors[name as keyof FormData]?.message as string}</p>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone Number *</Label>
                <Input {...register('phone')} placeholder="10-digit mobile number" className={errors.phone ? 'border-red-500' : ''} />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} type="email" placeholder="client@example.com" className={errors.email ? 'border-red-500' : ''} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message as string}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input {...register('dob')} type="date" className={errors.dob ? 'border-red-500' : ''} />
                {errors.dob && <p className="text-xs text-red-500">{errors.dob.message as string}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>PAN</Label>
                <Input {...register('pan')} placeholder="ABCDE1234F" className={`uppercase ${errors.pan ? 'border-red-500' : ''}`} maxLength={10} />
                {errors.pan && <p className="text-xs text-red-500">{errors.pan.message as string}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select onValueChange={(v) => setValue('department', v as 'EQUITY' | 'MUTUAL_FUND' | 'BOTH')}>
                <SelectTrigger className={errors.department ? 'border-red-500' : ''}><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EQUITY">Equity</SelectItem>
                  <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
                  <SelectItem value="BOTH">Both (Equity + MF)</SelectItem>
                </SelectContent>
              </Select>
              {errors.department && <p className="text-xs text-red-500">{errors.department.message}</p>}
              {department === 'BOTH' && (
                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
                  Client will be added to both Equity and MF masters. MF operator auto-assigned. Select equity operator below.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{department === 'BOTH' ? 'Equity Operator *' : 'Assigned Operator *'}</Label>
              <Select disabled={!department || employees.length === 0} onValueChange={(v) => setValue('operatorId', v)}>
                <SelectTrigger className={errors.operatorId ? 'border-red-500' : ''}>
                  <SelectValue placeholder={!department ? 'Select department first' : 'Select operator'} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.operatorId && <p className="text-xs text-red-500">{errors.operatorId.message}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => router.push('/masters/clients')}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {department === 'BOTH' ? 'Add to Both Masters' : 'Add Client'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
