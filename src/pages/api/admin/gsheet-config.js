import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import GSheetConfig from '@/lib/models/GSheetConfig'

export default async function handler(req, res) {
  const user = await requireAuth(req, res, 'admin')
  if (!user) return
  await connectDB()

  if (req.method === 'GET') {
    const cfg = await GSheetConfig.findById('live').lean()
    return res.json({ success: true, config: cfg || {} })
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const { spreadsheetId, sheetName, academicYear, semester } = req.body || {}
    await GSheetConfig.findByIdAndUpdate(
      'live',
      { spreadsheetId: (spreadsheetId || '').trim(), sheetName: (sheetName || 'Sheet1').trim(), academicYear, semester },
      { upsert: true, new: true }
    )
    return res.json({ success: true })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
