import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

// POST /api/documents/upload — upload a file into a folder
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const folderId = formData.get('folderId') as string | null

    if (!file || !file.name) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }
    if (!folderId) {
      return NextResponse.json({ success: false, error: 'folderId is required' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'File exceeds 20 MB limit' }, { status: 400 })
    }

    const folder = await prisma.documentFolder.findUnique({
      where: { id: folderId },
      select: { id: true },
    })
    if (!folder) {
      return NextResponse.json({ success: false, error: 'Folder not found' }, { status: 404 })
    }

    // Build a safe file name: {docId}.{ext}
    const originalName = file.name
    const ext = path.extname(originalName) || ''
    const docId = randomUUID()
    const savedFileName = `${docId}${ext}`

    const uploadBase = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'), 'documents')
    const folderDir = path.join(uploadBase, folderId)

    await mkdir(folderDir, { recursive: true })

    const filePath = path.join(folderDir, savedFileName)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await writeFile(filePath, buffer)

    const document = await prisma.document.create({
      data: {
        id: docId,
        name: originalName,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        filePath,
        folderId,
        uploadedById: session.user.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, department: true } },
      },
    })

    return NextResponse.json({ success: true, data: document }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents/upload]', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
