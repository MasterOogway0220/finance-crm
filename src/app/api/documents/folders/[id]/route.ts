import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rm } from 'fs/promises'
import path from 'path'

// GET /api/documents/folders/[id] — folder with its documents
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, department: true } },
        documents: {
          include: {
            uploadedBy: { select: { id: true, name: true, department: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: folder })
  } catch (error) {
    console.error('[GET /api/documents/folders/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/documents/folders/[id] — delete folder and all its files
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

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { id: true, createdById: true, name: true },
    })

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 })
    }

    // Only the creator or Admin/Super Admin can delete a folder
    const canDelete =
      folder.createdById === session.user.id ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'ADMIN'

    if (!canDelete) {
      return NextResponse.json(
        { success: false, error: 'Only the folder creator or an admin can delete this folder' },
        { status: 403 }
      )
    }

    // Delete all files on disk, then delete the folder record (cascade handles documents)
    const folderPath = path.join(process.cwd(), 'uploads', 'documents', id)
    await rm(folderPath, { recursive: true, force: true })

    await prisma.documentFolder.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/documents/folders/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
