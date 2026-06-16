import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import TimetableSnapshot from '@/lib/models/TimetableSnapshot'
import GSheetConfig from '@/lib/models/GSheetConfig'
import { parseGSheetRows } from '@/lib/csvParser'
import { google } from 'googleapis'

function makeSnapshotId() { return `live_${Date.now()}` }

function makeLabel(sheetName, academicYear, semester) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const ay = academicYear && semester ? ` · AY ${academicYear} ${semester}` : (academicYear ? ` · AY ${academicYear}` : '')
  return `GSheet: ${sheetName}${ay} (${dateStr} ${timeStr})`
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res, 'admin')
  if (!user) return

  await connectDB()

  // Load config from DB
  const cfg = await GSheetConfig.findById('live').lean()
  if (!cfg?.spreadsheetId)
    return res.status(400).json({ success: false, message: 'Google Sheet not configured. Set the Spreadsheet ID in admin settings first.' })

  const { spreadsheetId, sheetName = 'Sheet1', academicYear = '', semester = '' } = cfg

  // Authenticate with Google using service account
  let serviceAccount
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}')
    if (!serviceAccount.private_key) throw new Error('Missing private_key')
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Google service account credentials not configured on server.' })
  }

  let rows
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    })
    rows = response.data.values || []
  } catch (err) {
    const msg = err?.errors?.[0]?.message || err.message || 'Unknown error'
    return res.status(502).json({ success: false, message: `Google Sheets error: ${msg}` })
  }

  if (rows.length < 2)
    return res.status(400).json({ success: false, message: 'Sheet appears empty or has no data rows.' })

  const snapshotId = makeSnapshotId()
  let docs, warnings, headers, firstRow
  try {
    ;({ docs, warnings, headers, firstRow } = parseGSheetRows(rows, snapshotId))
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Parse failed: ' + err.message })
  }

  if (!docs.length)
    return res.status(400).json({ success: false, message: 'No valid timetable rows found in sheet.', warnings })

  // Deactivate current live snapshots
  await TimetableSnapshot.updateMany({ type: 'live', isActive: true }, { $set: { isActive: false } })

  // Bulk insert
  const CHUNK = 1000
  let inserted = 0
  for (let i = 0; i < docs.length; i += CHUNK) {
    await TimetableEntry.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
    inserted += Math.min(CHUNK, docs.length - i)
  }

  const label = makeLabel(sheetName, academicYear, semester)
  await TimetableSnapshot.create({
    label,
    filename: `${sheetName} (Google Sheets)`,
    type: 'live',
    snapshotId,
    rowCount: inserted,
    isActive: true,
    academicYear: academicYear || undefined,
    semester: semester || undefined,
    detectedColumns: headers,
    sampleRow: firstRow,
  })

  // Save last sync time
  await GSheetConfig.findByIdAndUpdate('live', { lastSyncedAt: new Date(), lastSyncRows: inserted, lastSyncLabel: label })

  return res.json({ success: true, inserted, label, warnings, snapshotId })
}
