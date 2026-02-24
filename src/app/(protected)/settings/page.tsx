'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, User, Lock } from 'lucide-react'
import { getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const { data: session } = useSession()
  const user = session?.user
  const [changingPassword, setChangingPassword] = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<{
    currentPassword: string; newPassword: string; confirmPassword: string
  }>()

  const onChangePassword = async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    setChangingPassword(true)
    try {
      const res = await fetch(`/api/employees/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: data.newPassword, currentPassword: data.currentPassword }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success('Password changed successfully')
        reset()
      } else {
        toast.error(result.error || 'Failed to change password')
      }
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your account preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" />Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Lock className="h-4 w-4" />Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Profile Information</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                  {user?.name ? getInitials(user.name) : '??'}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-lg">{user?.name}</p>
                  <p className="text-sm text-gray-500">{user?.designation} · {user?.department?.replace('_', ' ')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{user?.role?.replace('_', ' ')}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500 uppercase">Email</Label>
                  <Input value={user?.email || ''} readOnly className="bg-gray-50 text-gray-600" />
                  <p className="text-xs text-gray-400">Email change requires admin approval</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500 uppercase">Department</Label>
                  <Input value={user?.department?.replace('_', ' ') || ''} readOnly className="bg-gray-50 text-gray-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500 uppercase">Role</Label>
                  <Input value={user?.role?.replace('_', ' ') || ''} readOnly className="bg-gray-50 text-gray-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500 uppercase">Designation</Label>
                  <Input value={user?.designation || ''} readOnly className="bg-gray-50 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Current Password</Label>
                  <Input {...register('currentPassword', { required: 'Required' })} type="password" placeholder="Enter current password" />
                  {errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>New Password</Label>
                  <Input {...register('newPassword', { required: 'Required', minLength: { value: 8, message: 'Min 8 characters' } })} type="password" placeholder="Enter new password" />
                  {errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm New Password</Label>
                  <Input {...register('confirmPassword', { required: 'Required' })} type="password" placeholder="Confirm new password" />
                  {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
                </div>
                <Button type="submit" disabled={changingPassword} className="w-full">
                  {changingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
