import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rm } from 'fs/promises'
import path from 'path'
import { z } from 'zod'

const renameSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100, 'Name too long').trim(),
})

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

// PATCH /api/documents/folders/[id] — rename a folder
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

    const folder = await prisma.documentFolder.findUnique({ where: { id }, select: { id: true } })
    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 })
    }

    await prisma.documentFolder.update({ where: { id }, data: { name: parsed.data.name } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/documents/folders/[id]]', error)
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

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { id: true, name: true },
    })

    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 })
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
