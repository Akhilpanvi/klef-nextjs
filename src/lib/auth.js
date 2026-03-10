import jwt from 'jsonwebtoken'
import { connectDB } from './mongodb'
import User from './models/User'

const SECRET = process.env.JWT_SECRET
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d'

export function signToken(userId) {
  return jwt.sign({ id: userId }, SECRET, { expiresIn: EXPIRES })
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}

/**
 * getAuthUser(req)
 * ─────────────────
 * Extracts and verifies the Bearer token from a Next.js API route request.
 * Returns the user document or null.
 */
export async function getAuthUser(req) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization || ''
    if (!auth.startsWith('Bearer ')) return null

    const token = auth.slice(7)
    const decoded = verifyToken(token)

    await connectDB()
    const user = await User.findById(decoded.id).select('-password_hash').lean()
    if (!user || !user.is_active) return null
    return user
  } catch {
    return null
  }
}

/**
 * requireAuth(req, res, role?)
 * ─────────────────────────────
 * Call at the top of an API route handler.
 * Returns the user, or writes a 401/403 and returns null.
 */
export async function requireAuth(req, res, role = null) {
  const user = await getAuthUser(req)
  if (!user) {
    res.status(401).json({ success: false, message: 'Not authenticated' })
    return null
  }
  if (role && user.role !== role) {
    res.status(403).json({ success: false, message: 'Insufficient permissions' })
    return null
  }
  return user
}
