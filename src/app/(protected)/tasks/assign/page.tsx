import { TaskAssignmentForm } from '@/components/tasks/task-assignment-form'

export default function AssignTaskPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assign Task</h1>
        <p className="text-sm text-gray-500 mt-0.5">Create and assign a task to a team member</p>
      </div>
      <TaskAssignmentForm />
    </div>
  )
}
