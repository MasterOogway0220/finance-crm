import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json()

    if (!email || !otp) {
      return NextResponse.json({ success: false, error: 'Email and OTP are required' }, { status: 400 })
    }

    const record = await prisma.passwordResetToken.findFirst({
      where: { email: email.toLowerCase().trim() },
    })

    if (!record) {
      return NextResponse.json({ success: false, error: 'Invalid or expired OTP' }, { status: 400 })
    }

    if (new Date() > record.expiresAt) {
      await prisma.passwordResetToken.delete({ where: { id: record.id } })
      return NextResponse.json({ success: false, error: 'OTP has expired. Request a new one.' }, { status: 400 })
    }

    if (record.otp !== otp.toString().trim()) {
      return NextResponse.json({ success: false, error: 'Incorrect OTP' }, { status: 400 })
    }

    // OTP verified — issue a short-lived reset token (15 min)
    const resetToken = randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { token: resetToken, otp: '', expiresAt },
    })

    return NextResponse.json({ success: true, data: { token: resetToken } })
  } catch (error) {
    console.error('[POST /api/auth/verify-otp]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
