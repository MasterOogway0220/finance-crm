import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { mkdir } from 'fs/promises'
import path from 'path'

const folderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100, 'Name too long').trim(),
})

// POST /api/documents/folders — create a folder
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = folderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const folder = await prisma.documentFolder.create({
      data: {
        name: parsed.data.name,
        createdById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, department: true } },
        _count: { select: { documents: true } },
      },
    })

    // Create the folder directory on disk
    const folderPath = path.join(process.cwd(), 'uploads', 'documents', folder.id)
    await mkdir(folderPath, { recursive: true })

    return NextResponse.json({ success: true, data: folder }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents/folders]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
