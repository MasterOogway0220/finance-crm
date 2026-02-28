import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/documents — list all folders with file count
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const [folders, looseFiles] = await Promise.all([
      prisma.documentFolder.findMany({
        include: {
          createdBy: { select: { id: true, name: true, department: true } },
          _count: { select: { documents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.findMany({
        where: { folderId: null },
        omit: { fileData: true },
        include: {
          uploadedBy: { select: { id: true, name: true, department: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return NextResponse.json({ success: true, data: folders, looseFiles })
  } catch (error) {
    console.error('[GET /api/documents]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
