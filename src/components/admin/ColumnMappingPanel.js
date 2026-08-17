'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useApi } from '@/components/AuthContext'

/**
 * Editable CSV header mapping.
 *
 * Each app field lists the column names accepted for it, highest priority
 * first. When the export renames a column, add the new name here instead of
 * changing the parser. Old names can be left in place so previously exported
 * files keep uploading.
 */
export default function ColumnMappingPanel() {
  const { get, patch, del } = useApi()
  const [data,  setData]  = useState(null)
  const [draft, setDraft] = useState({})
  const [busy,  setBusy]  = useState(false)
  const [open,  setOpen]  = useState(false)

  const load = async () => {
    try {
      const d = await get('/api/admin/column-mapping')
      if (!d.success) throw new Error(d.message)
      setData(d)
      setDraft(Object.fromEntries(
        Object.keys(d.defaults).map(f => [f, (d.effective[f] || []).join(', ')])))
    } catch (err) { toast.error(err.message) }
  }
  useEffect(() => { if (open && !data) load() }, [open])

  const save = async () => {
    setBusy(true)
    try {
      const columns = Object.fromEntries(
        Object.entries(draft).map(([f, v]) => [f, String(v).split(',').map(x => x.trim()).filter(Boolean)]))
      const d = await patch('/api/admin/column-mapping', { columns })
      if (!d.success) throw new Error(d.message)
      toast.success('Column mapping saved')
      await load()
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const reset = async () => {
    if (!confirm('Reset every column name back to the built-in defaults?')) return
    setBusy(true)
    try {
      const d = await del('/api/admin/column-mapping')
      if (!d.success) throw new Error(d.message)
      toast.success('Reverted to defaults')
      setData(null); await load()
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const changed = data && Object.keys(data.defaults).some(f =>
    (draft[f] || '') !== (data.effective[f] || []).join(', '))

  const overrideCount = data ? Object.keys(data.overrides || {}).length : 0

  return (
    <div className="card" style={{ padding: 22, gridColumn: 'span 2' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>🧩 CSV Column Names</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Which CSV headers map to each field. If the export renames a column, change it here
            instead of the code. {overrideCount > 0
              ? <strong style={{ color: 'var(--brand)' }}>{overrideCount} field(s) customised.</strong>
              : 'Currently using the built-in defaults.'}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen(o => !o)} style={{ fontSize: 13 }}>
          {open ? 'Hide' : 'Edit column names'}
        </button>
      </div>

      {open && !data && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
      )}

      {open && data && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            Separate alternatives with commas — the first one found in the file wins, so keep the
            newest name first and leave older names after it for backwards compatibility.
            {data.updatedAt && (
              <> Last changed {new Date(data.updatedAt).toLocaleString()}
                {data.updatedBy ? ` by ${data.updatedBy}` : ''}.</>
            )}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  {['App field', 'CSV column name(s)', 'Built-in default'].map((h, i) => (
                    <th key={h} style={{
                      padding: '8px 10px', fontSize: 11, fontWeight: 700, textAlign: 'left',
                      color: 'var(--text-3)', background: 'var(--surface-2)',
                      borderBottom: '2px solid var(--border)',
                      width: i === 0 ? '26%' : i === 1 ? '42%' : '32%',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(data.defaults).map(field => {
                  const req = data.required.includes(field)
                  const def = (data.defaults[field] || []).join(', ')
                  const isCustom = (draft[field] || '') !== def
                  return (
                    <tr key={field}>
                      <td style={{ padding: '6px 10px', fontSize: 13, borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                        {data.labels[field] || field}
                        {req && <span style={{ color: 'var(--brand)', fontSize: 10, fontWeight: 800, marginLeft: 5 }}>REQ</span>}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <input
                          className="input"
                          value={draft[field] ?? ''}
                          onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                          placeholder={def}
                          style={{
                            width: '100%', fontSize: 12, padding: '5px 8px',
                            fontFamily: 'monospace',
                            borderColor: isCustom ? 'var(--brand)' : undefined,
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', fontFamily: 'monospace' }}>
                        {def}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={save} disabled={busy || !changed}>
              {busy ? 'Saving…' : changed ? 'Save column names' : 'No changes'}
            </button>
            <button className="btn btn-ghost" onClick={reset} disabled={busy || !overrideCount}>
              Reset to defaults
            </button>
          </div>

          <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
            Applies to the Live Timetable CSV upload and the Google Sheet sync. Required fields must
            keep at least one column name. Fields left identical to the default are not stored, so
            they keep tracking any future change to the built-in list.
          </p>
        </div>
      )}
    </div>
  )
}
