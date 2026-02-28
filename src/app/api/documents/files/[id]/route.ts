import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const renameSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long').trim(),
})

// PATCH /api/documents/files/[id] — rename a file
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = renameSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const document = await prisma.document.findUnique({ where: { id }, select: { id: true } })
    if (!document) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 })
    }

    await prisma.document.update({ where: { id }, data: { name: parsed.data.name } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/documents/files/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/documents/files/[id] — delete a file
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!document) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 })
    }

    await prisma.document.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/documents/files/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
