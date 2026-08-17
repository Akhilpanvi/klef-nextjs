import ColumnMapping from '@/lib/models/ColumnMapping'

/**
 * Saved CSV column overrides, or null when none are stored.
 *
 * Never throws: a problem reading the mapping must not block an upload, the
 * parser simply falls back to its built-in defaults.
 */
export async function getColumnOverrides() {
  try {
    const doc = await ColumnMapping.findById('btt').lean()
    if (!doc?.columns) return null
    return Object.fromEntries(Object.entries(doc.columns))
  } catch {
    return null
  }
}
