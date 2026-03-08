import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const products = await prisma.mFProduct.findMany({
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ success: true, data: products })
  } catch (error) {
    console.error('[GET /api/mf-products]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
