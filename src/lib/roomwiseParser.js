import * as XLSX from 'xlsx'

const DAY_PREFIXES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * parseRoomwiseBuffer
 * ───────────────────
 * Parses the Roomwise-TT-xx.xx.xxxx.csv buffer into RoomwiseEntry documents.
 * Only stores non-empty (non-dash) slots — sparse format.
 *
 * @param {Buffer} buf - Raw file buffer (CSV or XLSX)
 * @param {string} snapshotId - Dataset ID to tag all entries with
 * @returns {Array} Array of RoomwiseEntry-compatible objects
 */
export function parseRoomwiseBuffer(buf, snapshotId) {
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const docs = []

  for (const row of rows) {
    const room_no = row['Roomno']?.toString().trim()
    if (!room_no) continue

    for (let dayIdx = 0; dayIdx < DAY_PREFIXES.length; dayIdx++) {
      const prefix = DAY_PREFIXES[dayIdx]
      const dayNum = dayIdx + 1 // 1=Mon..6=Sat

      for (let hour = 1; hour <= 24; hour++) {
        const colKey = `${prefix}${hour}`
        const val    = row[colKey]?.toString().trim()

        // Skip empty / dash cells
        if (!val || val === '-') continue

        docs.push({
          room_no,
          dataset: snapshotId,
          day:     dayNum,
          hour,
          label:   val,
        })
      }
    }
  }

  return docs
}

/**
 * extractRoomwiseRooms
 * ────────────────────
 * Returns unique room numbers from parsed docs.
 */
export function extractRoomwiseRooms(docs) {
  return [...new Set(docs.map(d => d.room_no))]
}
