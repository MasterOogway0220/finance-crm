import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile, access } from 'fs/promises'

// GET /api/documents/files/[id]/download — serve a file for download
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

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, name: true, mimeType: true, filePath: true },
    })

    if (!document) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 })
    }

    // Check if the file exists on disk before reading
    try {
      await access(document.filePath)
    } catch {
      console.error(`[Download] File not found on disk: ${document.filePath}`)
      return NextResponse.json({ success: false, error: 'File not found on disk' }, { status: 404 })
    }

    const buffer = await readFile(document.filePath)

    // Encode filename for Content-Disposition (handles special chars)
    const encodedName = encodeURIComponent(document.name).replace(/'/g, "%27")

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[GET /api/documents/files/[id]/download]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
