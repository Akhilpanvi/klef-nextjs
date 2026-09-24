import rooms from './data/approvedRooms.json'
import { resolveRoom } from './roomLabel.js'

// Authoritative inventory supplied in ROOM DATA.xlsx (311 physical rooms).
export const approvedRooms = rooms
const byName = new Map(rooms.map(r => [r.room_no, r]))
const known = new Set(byName.keys())
const compact = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const aliases = new Map(rooms.map(r => [compact(r.source_name), r.room_no]))

export function approvedRoomKey(raw) {
  const name = compact(raw)
  if (aliases.has(name)) return aliases.get(name)
  // Descriptive names can also carry an ERP section suffix.
  const withoutSection = name.replace(/(?:-(?:MA|AB|CD|[A-F]))+$/i, '')
  if (aliases.has(withoutSection)) return aliases.get(withoutSection)
  const key = resolveRoom(name, known)
  return byName.has(key) ? key : ''
}

export function approvedRoom(raw) {
  return byName.get(approvedRoomKey(raw))
}

export function isApprovedRoom(raw) {
  return Boolean(approvedRoomKey(raw))
}
