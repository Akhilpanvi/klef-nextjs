import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import ColumnMapping    from '@/lib/models/ColumnMapping'
import { DEFAULT_COLUMNS, FIELD_LABELS, REQUIRED_FIELDS, resolveColumns }
  from '@/lib/csvParser'

/**
 * CSV column-name mapping for the BTT / Google-Sheet parser.
 *
 * GET     returns defaults, saved overrides and the effective mapping
 * PUT     saves overrides ({ columns: { field: [name, ...] } })
 * DELETE  drops overrides and reverts to the built-in defaults
 */
export default async function handler(req, res) {
  const user = await requireAuth(req, res, 'admin')
  if (!user) return
  await connectDB()

  if (req.method === 'GET') {
    const doc = await ColumnMapping.findById('btt').lean()
    const overrides = doc?.columns ? Object.fromEntries(Object.entries(doc.columns)) : null
    return res.json({
      success: true,
      defaults:  DEFAULT_COLUMNS,
      labels:    FIELD_LABELS,
      required:  REQUIRED_FIELDS,
      overrides: overrides || {},
      effective: resolveColumns(overrides),
      updatedAt: doc?.updatedAt || null,
      updatedBy: doc?.updatedBy || null,
    })
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const incoming = req.body?.columns
    if (!incoming || typeof incoming !== 'object')
      return res.status(400).json({ success: false, message: 'columns object required' })

    // Keep only known fields, and only where the names differ from the
    // defaults. Storing a copy of every default would silently freeze the
    // mapping against future changes to the built-in list.
    const cleaned = {}
    for (const [field, names] of Object.entries(incoming)) {
      if (!(field in DEFAULT_COLUMNS)) continue
      const list = (Array.isArray(names) ? names : String(names).split(','))
        .map(n => String(n || '').trim()).filter(Boolean)
      if (!list.length) continue
      if (list.join(' ') === DEFAULT_COLUMNS[field].join(' ')) continue
      cleaned[field] = list
    }

    const effective = resolveColumns(cleaned)
    const missing = REQUIRED_FIELDS.filter(f => !(effective[f] || []).length)
    if (missing.length)
      return res.status(400).json({
        success: false,
        message: `Required fields need at least one column name: ${missing.join(', ')}`,
      })

    await ColumnMapping.findByIdAndUpdate(
      'btt',
      { columns: cleaned, updatedBy: user.username || user.email || 'admin' },
      { upsert: true, new: true },
    )
    return res.json({ success: true, overrides: cleaned, effective })
  }

  if (req.method === 'DELETE') {
    await ColumnMapping.findByIdAndDelete('btt')
    return res.json({ success: true, overrides: {}, effective: DEFAULT_COLUMNS })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
