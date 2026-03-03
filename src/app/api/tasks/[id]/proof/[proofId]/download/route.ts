import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/tasks/[id]/proof/[proofId]/download — serve a proof file for download
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; proofId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id, proofId } = await params

    // Verify the task exists and user has access
    const task = await prisma.task.findUnique({
      where: { id },
      select: { assignedToId: true, assignedById: true },
    })

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    const userRole = getEffectiveRole(session.user)
    if (
      userRole === 'BACK_OFFICE' &&
      task.assignedToId !== session.user.id &&
      task.assignedById !== session.user.id
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const proof = await prisma.taskCompletionProof.findUnique({
      where: { id: proofId },
      select: { id: true, taskId: true, name: true, mimeType: true, fileData: true },
    })

    if (!proof || proof.taskId !== id) {
      return NextResponse.json({ success: false, error: 'Proof file not found' }, { status: 404 })
    }

    const encodedName = encodeURIComponent(proof.name).replace(/'/g, "%27")

    return new NextResponse(proof.fileData, {
      headers: {
        'Content-Type': proof.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'Content-Length': proof.fileData.length.toString(),
      },
    })
  } catch (error) {
    console.error('[GET /api/tasks/[id]/proof/[proofId]/download]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
