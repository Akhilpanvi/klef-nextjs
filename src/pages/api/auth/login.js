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

  // Special viewer shortcut: username="viewer", password=APP_PASSWORD
  if (username === 'viewer' && password === process.env.APP_PASSWORD) {
    let viewer = await User.findOne({ username: 'viewer' })
    if (!viewer) {
      viewer = new User({ username: 'viewer', password_hash: password, role: 'viewer', display_name: 'Viewer' })
      await viewer.save()
    }
    viewer.last_login = new Date()
    await viewer.save({ validateBeforeSave: false })
    return res.json({ success: true, token: signToken(viewer._id), user: viewer })
  }

  const user = await User.findOne({ username: username.toLowerCase().trim() })
  if (!user || !(await user.comparePassword(password)))
    return res.status(401).json({ success: false, message: 'Invalid credentials' })
  if (!user.is_active)
    return res.status(401).json({ success: false, message: 'Account inactive' })

  user.last_login = new Date()
  await user.save({ validateBeforeSave: false })
  res.json({ success: true, token: signToken(user._id), user })
}
