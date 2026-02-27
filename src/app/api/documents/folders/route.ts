import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

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

    // Generate the ID upfront so we can create the disk directory first
    const folderId = randomUUID()
    const folderPath = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'), 'documents', folderId)
    await mkdir(folderPath, { recursive: true })

    const folder = await prisma.documentFolder.create({
      data: {
        id: folderId,
        name: parsed.data.name,
        createdById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, department: true } },
        _count: { select: { documents: true } },
      },
    })

    return NextResponse.json({ success: true, data: folder }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents/folders]', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
