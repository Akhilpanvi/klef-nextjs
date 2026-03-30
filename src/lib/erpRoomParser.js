import * as XLSX from 'xlsx'

/**
 * parseErpRoomBuffer
 * ──────────────────
 * Parses the ERP-ROOMDATA CSV/XLSX into ErpRoomData documents.
 * Groups all section rows (A/B/C/D/MA) under the base ROOM NAME.
 * Picks the MA section erp_id as primary; falls back to the first section found.
 * All headers are matched case-insensitively.
 *
 * Expected columns (case-insensitive, duplicate headers handled):
 *   ROOM -MA | ROOM ID | ROOM NAME | Assoc | description | ROOM NAMEs | block | ROOM NAME
 *
 * @param {Buffer} buf
 * @returns {Array} Array of ErpRoomData-compatible objects
 */
export function parseErpRoomBuffer(buf) {
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  // Normalize each row: lowercase keys, strip _1/_2 suffixes from duplicates,
  // keep first occurrence of each key.
  const normalizeRow = (row) => {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      const lk = k.toLowerCase().replace(/_\d+$/, '').trim()
      if (!(lk in out)) out[lk] = v
    }
    return out
  }

  const groups = {}

  for (const rawRow of rows) {
    const row = normalizeRow(rawRow)

    // Base room name — try several column name variants
    const roomName = (
      row['room name'] || row['room names'] || row['roomname'] || ''
    ).toString().trim()
    if (!roomName) continue

    const erpId      = parseInt(row['room id'])
    const assoc      = (row['assoc'] || row['association'] || '').toString().trim()
    const description = (row['description'] || row['desc'] || '').toString().trim()
    const block       = (row['block'] || '').toString().trim()

    if (!groups[roomName]) {
      groups[roomName] = { room_no: roomName, description, block, sections: [] }
    }

    // Only add sections that have a valid assoc label (skip empty/duplicate rows)
    if (!isNaN(erpId) && assoc) {
      groups[roomName].sections.push({ assoc, erp_id: erpId })
    }
  }

  const docs = []
  for (const g of Object.values(groups)) {
    // Deduplicate sections by assoc label (keep first occurrence)
    const seen = new Set()
    g.sections = g.sections.filter(s => {
      const key = s.assoc.toUpperCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Pick MA as the primary ERP ID; fall back to first section
    const maSection = g.sections.find(s => s.assoc.toUpperCase() === 'MA')
    g.erp_id = maSection ? maSection.erp_id : (g.sections[0]?.erp_id ?? null)
    docs.push(g)
  }

  return docs
}
