import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 })
    }

    const employee = await prisma.employee.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, isActive: true },
    })

    // Always return success to prevent email enumeration
    if (!employee || !employee.isActive) {
      return NextResponse.json({ success: true })
    }

    // Invalidate any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email: employee.email } })

    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await prisma.passwordResetToken.create({
      data: { email: employee.email, otp, expiresAt },
    })

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@financecrm.com',
      to: employee.email,
      subject: 'Your password reset OTP',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1B73E8;margin-bottom:8px">Password Reset</h2>
          <p style="color:#444;margin-bottom:20px">Hi ${employee.name},</p>
          <p style="color:#444">Use the OTP below to reset your FinanceCRM password. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:#F3F4F6;border-radius:8px;padding:20px;text-align:center;margin:24px 0">
            <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#1B73E8">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px">If you did not request this, ignore this email. Your password will not change.</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/auth/forgot-password]', error)
    return NextResponse.json({ success: false, error: 'Failed to send OTP' }, { status: 500 })
  }
}
