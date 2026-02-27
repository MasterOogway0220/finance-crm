import { redirect } from 'next/navigation'
import { auth, getEffectiveRole } from '@/lib/auth'
import { TaskAssignmentForm } from '@/components/tasks/task-assignment-form'

export default async function AssignTaskPage() {
  const session = await auth()
  const role = session?.user ? getEffectiveRole(session.user) : null

  if (role === 'BACK_OFFICE') {
    redirect('/backoffice/tasks')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assign Task</h1>
        <p className="text-sm text-gray-500 mt-0.5">Create and assign a task to a Back Office team member</p>
      </div>
      <TaskAssignmentForm />
    </div>
  )
}
