import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ success: false, error: 'Token and password are required' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } })

    if (!record) {
      return NextResponse.json({ success: false, error: 'Invalid or expired reset link' }, { status: 400 })
    }

    if (new Date() > record.expiresAt) {
      await prisma.passwordResetToken.delete({ where: { id: record.id } })
      return NextResponse.json({ success: false, error: 'Reset link has expired. Start over.' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 12)

    await prisma.$transaction([
      prisma.employee.update({
        where: { email: record.email },
        data: { password: hashed },
      }),
      prisma.passwordResetToken.delete({ where: { id: record.id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/auth/reset-password]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
