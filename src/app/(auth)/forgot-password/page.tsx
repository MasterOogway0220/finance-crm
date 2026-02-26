'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { TrendingUp, Loader2, AlertCircle, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})
type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      })
      const data = await res.json()
      if (!data.success) {
        setServerError(data.error ?? 'Something went wrong.')
        return
      }
      // Always navigate — don't reveal whether the email exists
      router.push(`/verify-otp?email=${encodeURIComponent(values.email)}`)
    } catch {
      setServerError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-8 w-8 text-blue-500" />
            <span className="text-2xl font-bold text-gray-900">FinanceCRM</span>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-full">
            <Mail className="h-6 w-6 text-blue-500" />
          </div>
          <h1 className="mt-3 text-xl font-semibold text-gray-900">Forgot password?</h1>
          <p className="mt-1 text-sm text-gray-500 text-center">
            Enter your work email and we&apos;ll send you a 6-digit OTP.
          </p>
        </div>

        {serverError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 text-sm font-semibold"
            style={{ backgroundColor: '#1B73E8' }}
          >
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending OTP…</> : 'Send OTP'}
          </Button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
