import { requireAuth }      from '@/lib/auth'
import { connectDB }        from '@/lib/mongodb'
import ErpLoginSession      from '@/lib/models/ErpLoginSession'
import { parseRoomwiseBuffer } from '@/lib/roomwiseParser'
import { makeSnapshotId, replaceRoomwiseSnapshot } from '@/lib/roomwiseStore'
import {
  ErpError, startLogin, checkMfa, login, downloadRoomCsv, logout,
  ERP_CAMPUSES, ERP_ACADEMIC_YEARS, ERP_SEMESTERS,
} from '@/lib/erpClient'

/**
 * /api/admin/erp-fetch
 * ────────────────────
 * Pulls the Room-wise TT straight from the KL ERP with an admin's own
 * faculty login, then replaces the Roomwise snapshot exactly like an upload.
 *
 *   GET                         → new ERP login session; returns captcha image + form options
 *   POST { action: 'mfa', username }        → { mfa: true | false | null (unknown) }
 *   POST { action: 'fetch', username, password, captcha, mfaCode,
 *          campid, academicyear, semesterid } → logs in, downloads, saves, logs out
 *
 * The password is sent to the ERP once and never stored or logged.
 */

export const config = { maxDuration: 60 }

const sendError = (res, err) => {
  const status = err instanceof ErpError ? err.status : 500
  if (!(err instanceof ErpError)) console.error('erp-fetch:', err)
  return res.status(status).json({ success: false, message: err.message || 'ERP fetch failed' })
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res, 'admin')
  if (!user) return
  const userId = String(user._id)
  await connectDB()

  if (req.method === 'GET') {
    try {
      const { jar, csrf, captcha } = await startLogin()
      await ErpLoginSession.findOneAndUpdate(
        { userId },
        { userId, jar, csrf, createdAt: new Date() },
        { upsert: true })
      return res.json({
        success: true, captcha,
        options: { campuses: ERP_CAMPUSES, academicYears: ERP_ACADEMIC_YEARS, semesters: ERP_SEMESTERS },
        defaults: { campid: 1, academicyear: 29, semesterid: 1 },
      })
    } catch (err) { return sendError(res, err) }
  }

  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const body = req.body || {}
  const session = await ErpLoginSession.findOne({ userId }).lean()
  if (!session)
    return res.status(409).json({ success: false, message: 'ERP login expired — reload the captcha and try again' })
  const jar = { ...session.jar }

  if (body.action === 'mfa') {
    const username = String(body.username || '').trim()
    if (!username) return res.status(400).json({ success: false, message: 'Enter the ERP username' })
    try {
      const mfa = await checkMfa(jar, session.csrf, username)
      await ErpLoginSession.updateOne({ userId }, { jar })
      return res.json({ success: true, mfa })
    } catch (err) { return sendError(res, err) }
  }

  if (body.action === 'fetch') {
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    const captcha  = String(body.captcha || '').trim()
    const mfaCode  = String(body.mfaCode || '').trim()
    const campid       = Number(body.campid) || 1
    const academicyear = Number(body.academicyear)
    const semesterid   = Number(body.semesterid)
    if (!username || !password || !captcha)
      return res.status(400).json({ success: false, message: 'Username, password and captcha are required' })
    if (mfaCode && !/^\d{6}$/.test(mfaCode))
      return res.status(400).json({ success: false, message: 'MFA code must be exactly six digits' })
    if (!ERP_ACADEMIC_YEARS.some(y => y.id === academicyear) || !ERP_SEMESTERS.some(s => s.id === semesterid))
      return res.status(400).json({ success: false, message: 'Pick an academic year and semester' })

    // A captcha is single-use: whatever happens next, this session is spent.
    await ErpLoginSession.deleteOne({ userId })

    let loggedIn = false
    try {
      // The ERP's own page runs this lookup before every login; it only
      // informs the form, so a failed lookup must not block the login.
      await checkMfa(jar, session.csrf, username).catch(() => null)
      await login(jar, session.csrf, { username, password, captcha, mfaCode })
      loggedIn = true

      const { buf, filename } = await downloadRoomCsv(jar, { campid, academicyear, semesterid })
      const snapshotId = makeSnapshotId()
      const docs = parseRoomwiseBuffer(buf, snapshotId)
      if (!docs.length)
        throw new ErpError('ERP returned a Room Timetable with no classes for that year/semester', 422)

      const year = ERP_ACADEMIC_YEARS.find(y => y.id === academicyear).label
      const sem  = ERP_SEMESTERS.find(s => s.id === semesterid).label
      const { inserted, label } = await replaceRoomwiseSnapshot({
        docs, snapshotId, filename: `ERP Roomwise-TT ${year} ${sem}`,
      })
      return res.json({ success: true, inserted, label, sourceFile: filename,
        message: `Fetched from ERP — ${inserted} slot entries` })
    } catch (err) {
      return sendError(res, err)
    } finally {
      if (loggedIn) await logout(jar)
    }
  }

  return res.status(400).json({ success: false, message: 'Unknown action' })
}
