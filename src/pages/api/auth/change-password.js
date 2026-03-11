import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/lib/models/User'

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword)
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword required' })

  if (newPassword.length < 6)
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' })

  if (currentPassword === newPassword)
    return res.status(400).json({ success: false, message: 'New password must be different from current password' })

  await connectDB()
  const user = await User.findById(authUser._id)
  if (!user) return res.status(404).json({ success: false, message: 'User not found' })

  const valid = await user.comparePassword(currentPassword)
  if (!valid)
    return res.status(401).json({ success: false, message: 'Current password is incorrect' })

  user.password_hash = newPassword   // pre-save hook will hash it
  user.mustChangePassword = false
  await user.save()

  res.json({ success: true, message: 'Password changed successfully' })
}
