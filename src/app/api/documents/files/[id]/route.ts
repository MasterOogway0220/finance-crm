import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'

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
    const userRole = getEffectiveRole(session.user)

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, filePath: true, uploadedById: true, name: true },
    })

    if (!document) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 })
    }

    const canDelete =
      document.uploadedById === session.user.id ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'ADMIN'

    if (!canDelete) {
      return NextResponse.json(
        { success: false, error: 'Only the uploader or an admin can delete this file' },
        { status: 403 }
      )
    }

    // Remove from disk (silently ignore if already gone)
    await unlink(document.filePath).catch(() => {})

    await prisma.document.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/documents/files/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
