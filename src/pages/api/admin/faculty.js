import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/lib/models/User'

export default async function handler(req, res) {
  const admin = await requireAuth(req, res, 'admin')
  if (!admin) return

  await connectDB()

  // GET /api/admin/faculty  — list all faculty
  if (req.method === 'GET') {
    const { page = 1, limit = 50, dept, q } = req.query
    const filter = { role: 'faculty' }
    if (dept) filter.dept = dept
    if (q) filter.$or = [
      { display_name: { $regex: q, $options: 'i' } },
      { eid: { $regex: q, $options: 'i' } },
    ]

    const [faculty, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash')
        .sort({ eid: 1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean(),
      User.countDocuments(filter),
    ])
    return res.json({ success: true, faculty, total })
  }

  // PATCH /api/admin/faculty  — update a faculty user (role, is_active)
  if (req.method === 'PATCH') {
    const { eid, is_active, role, resetPassword } = req.body || {}
    if (!eid) return res.status(400).json({ success: false, message: 'eid required' })

    const user = await User.findOne({ eid, role: { $in: ['faculty', 'admin'] } })
    if (!user) return res.status(404).json({ success: false, message: 'Faculty not found' })

    // Only super admin can grant admin role — role field update is allowed
    if (typeof is_active === 'boolean') user.is_active = is_active
    if (role && ['faculty', 'admin'].includes(role)) user.role = role
    if (resetPassword) {
      user.password_hash = eid   // reset to EID — pre-save hook hashes it
      user.mustChangePassword = true
    }

    await user.save()
    return res.json({ success: true, user })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
