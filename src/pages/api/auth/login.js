import { connectDB } from '@/lib/mongodb'
import User from '@/lib/models/User'
import { signToken } from '@/lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'username and password required' })

  await connectDB()

  // 1. Try faculty login: EID as username (stored in eid field, username = eid string)
  // 2. Try admin/viewer login: username field match

  let user = await User.findOne({
    $or: [
      { username: username.toLowerCase().trim() },
      { eid: username.trim(), role: 'faculty' },
    ]
  })

  if (!user || !(await user.comparePassword(password)))
    return res.status(401).json({ success: false, message: 'Invalid credentials' })

  if (!user.is_active)
    return res.status(401).json({ success: false, message: 'Account inactive' })

  user.last_login = new Date()
  await user.save({ validateBeforeSave: false })

  res.json({
    success: true,
    token: signToken(user._id),
    user,
    mustChangePassword: user.mustChangePassword === true,
  })
}
