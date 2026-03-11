import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/lib/models/User'

export const PERMISSIONS = [
  { key: 'view_clash',   label: 'View Clash Detection' },
  { key: 'manage_data',  label: 'Manage Data (Upload/Clear)' },
]

export default async function handler(req, res) {
  const admin = await requireAuth(req, res, 'admin')
  if (!admin) return

  await connectDB()

  // GET /api/admin/faculty  — list all faculty
  if (req.method === 'GET') {
    const { page = 1, limit = 50, dept, q } = req.query
    const filter = { role: { $in: ['faculty', 'admin'] } }
    if (dept) filter.dept = dept
    if (q) filter.$or = [
      { display_name: { $regex: q, $options: 'i' } },
      { eid: { $regex: q, $options: 'i' } },
      { username: { $regex: q, $options: 'i' } },
    ]

    const [faculty, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash')
        .sort({ role: -1, eid: 1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean(),
      User.countDocuments(filter),
    ])
    return res.json({ success: true, faculty, total, permissions: PERMISSIONS })
  }

  // PATCH /api/admin/faculty  — update a faculty user
  if (req.method === 'PATCH') {
    const {
      eid, username, is_active, role, resetPassword, permissions,
      cohort, designation_category, assigned_responsibility,
      load_as_per_designation, pl,
    } = req.body || {}
    if (!eid && !username)
      return res.status(400).json({ success: false, message: 'eid or username required' })

    const query = eid
      ? { eid, role: { $in: ['faculty', 'admin'] } }
      : { username, role: { $in: ['faculty', 'admin'] } }

    const user = await User.findOne(query)
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    if (typeof is_active === 'boolean') user.is_active = is_active
    if (role && ['faculty', 'admin'].includes(role)) user.role = role
    if (Array.isArray(permissions)) {
      const valid = PERMISSIONS.map(p => p.key)
      user.permissions = permissions.filter(p => valid.includes(p))
    }
    if (resetPassword) {
      const resetTo = user.eid || user.username
      user.password_hash = resetTo
      user.mustChangePassword = true
    }
    // Profile fields
    if (cohort !== undefined)                  user.cohort                  = cohort || undefined
    if (designation_category !== undefined)    user.designation_category    = designation_category || undefined
    if (assigned_responsibility !== undefined) user.assigned_responsibility = assigned_responsibility || undefined
    if (load_as_per_designation !== undefined) user.load_as_per_designation = load_as_per_designation || undefined
    if (pl !== undefined)                      user.pl                      = pl || undefined

    await user.save()
    const updated = user.toJSON()
    return res.json({ success: true, user: updated })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
