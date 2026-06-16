'use client'
import { useState, useEffect, useCallback } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UploadCloud, Trash2, RefreshCw, CheckCircle, AlertCircle, Users, Search, ShieldCheck, ExternalLink, UserPlus, ChevronDown, ChevronUp } from 'lucide-react'
import ColMappingPreview from '@/components/ui/ColMappingPreview'
import RoomwiseUploadCard from '@/components/admin/RoomwiseUploadCard'
import ErpRoomUploadCard from '@/components/admin/ErpRoomUploadCard'

const ALL_PERMISSIONS = [
  { key: 'view_clash',          label: 'View Clash Detection' },
  { key: 'manage_data',         label: 'Manage Data (Upload/Clear)' },
  { key: 'view_all_timetables', label: 'View All Faculty Timetables' },
]

const DESG_LABEL = { R: 'Research', Ac: 'Academic', Ad: 'Administrative' }
const UPLOAD_PASSWORD = 'Klefupload'

function askUploadPassword() {
  const pwd = window.prompt('Enter upload password to continue:')
  if (pwd === null) return false           // cancelled
  if (pwd !== UPLOAD_PASSWORD) {
    toast.error('Incorrect password.')
    return false
  }
  return true
}

// ── Create Faculty Panel ──────────────────────────────────────────────────────
function CreateFacultyPanel({ post }) {
  const [form, setForm] = useState({
    username: '', display_name: '', eid: '', dept: '', designation: '',
    cohort: '', designation_category: '', assigned_responsibility: '',
    load_as_per_designation: '', pl: '', role: 'faculty',
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.username.trim()) return toast.error('Username is required')
    setSaving(true)
    try {
      const body = { ...form }
      if (!body.display_name) delete body.display_name
      if (!body.eid) delete body.eid
      if (!body.dept) delete body.dept
      if (!body.designation) delete body.designation
      if (!body.cohort) delete body.cohort
      if (!body.designation_category) delete body.designation_category
      if (!body.assigned_responsibility) delete body.assigned_responsibility
      if (body.load_as_per_designation) body.load_as_per_designation = Number(body.load_as_per_designation)
      else delete body.load_as_per_designation
      if (body.pl) body.pl = Number(body.pl)
      else delete body.pl

      const d = await post('/api/admin/faculty', body)
      if (!d.success) throw new Error(d.message)
      toast.success(`Faculty "${d.user.display_name || d.user.username}" created! Default password: ${d.user.eid || d.user.username}`)
      setForm({ username: '', display_name: '', eid: '', dept: '', designation: '',
        cohort: '', designation_category: '', assigned_responsibility: '',
        load_as_per_designation: '', pl: '', role: 'faculty' })
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ padding: 22, gridColumn: 'span 2' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>
        <UserPlus size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Create Faculty Profile
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-3)' }}>
        Create a faculty account directly. The initial password will be set to the EID (or username if no EID). The faculty member must change it on first login.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { key: 'username',    label: 'Username *',         placeholder: 'e.g. eid1234 or john.doe' },
          { key: 'display_name',label: 'Display Name',       placeholder: 'Full name' },
          { key: 'eid',         label: 'EID',                placeholder: 'e.g. 1234' },
          { key: 'dept',        label: 'Department',         placeholder: 'e.g. CSE' },
          { key: 'designation', label: 'Designation',        placeholder: 'e.g. Assistant Professor' },
          { key: 'cohort',      label: 'Cohort',             placeholder: 'e.g. R22' },
          { key: 'designation_category',    label: 'Category',     placeholder: 'R / Ac / Ad' },
          { key: 'assigned_responsibility', label: 'Responsibility', placeholder: 'e.g. HOD, Advisor' },
          { key: 'load_as_per_designation', label: 'Load (hrs)',    placeholder: 'e.g. 16', type: 'number' },
          { key: 'pl',          label: 'Permitted Load (PL)', placeholder: 'e.g. 18', type: 'number' },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{f.label}</label>
            <input
              className="input"
              type={f.type || 'text'}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={set(f.key)}
              style={{ fontSize: 13, padding: '6px 10px' }}
            />
          </div>
        ))}
      </div>

      {/* Role */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>ROLE</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['faculty', 'admin'].map(r => (
            <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))} style={{
              padding: '6px 16px', borderRadius: 6, border: '2px solid',
              borderColor: form.role === r ? 'var(--brand)' : 'var(--border)',
              background: form.role === r ? 'var(--brand-light)' : 'var(--surface)',
              color: form.role === r ? 'var(--brand)' : 'var(--text)',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              {r === 'admin' ? '⭐ Admin' : '👤 Faculty'}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={saving}>
        <UserPlus size={15} />
        {saving ? 'Creating…' : 'Create Faculty Account'}
      </button>
    </div>
  )
}

// ── Faculty Permissions Panel ─────────────────────────────────────────────────
function FacultyPermissionsPanel({ get, patch }) {
  const [q,          setQ]          = useState('')
  const [results,    setResults]    = useState([])
  const [selected,   setSelected]   = useState(null)
  const [searching,  setSearching]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [editPerms,  setEditPerms]  = useState([])
  const [editRole,   setEditRole]   = useState('faculty')
  const [editProfile, setEditProfile] = useState({
    designation: '', cohort: '', designation_category: '', assigned_responsibility: '',
    load_as_per_designation: '', pl: '',
  })

  const search = useCallback(async () => {
    if (!q.trim()) return
    setSearching(true)
    try {
      const d = await get(`/api/admin/faculty?q=${encodeURIComponent(q)}&limit=10`)
      if (d.success) setResults(d.faculty)
    } finally { setSearching(false) }
  }, [q, get])

  const select = (f) => {
    setSelected(f)
    setEditPerms(f.permissions || [])
    setEditRole(f.role)
    setEditProfile({
      designation:             f.designation || '',
      cohort:                  f.cohort || '',
      designation_category:    f.designation_category || '',
      assigned_responsibility: f.assigned_responsibility || '',
      load_as_per_designation: f.load_as_per_designation ?? '',
      pl:                      f.pl ?? '',
    })
    setResults([])
    setQ('')
  }

  const togglePerm = (key) => {
    setEditPerms(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key])
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const body = {
        permissions: editPerms,
        role: editRole,
        designation:             editProfile.designation             || undefined,
        cohort:                  editProfile.cohort                  || undefined,
        designation_category:    editProfile.designation_category    || undefined,
        assigned_responsibility: editProfile.assigned_responsibility || undefined,
        load_as_per_designation: editProfile.load_as_per_designation !== '' ? Number(editProfile.load_as_per_designation) : undefined,
        pl:                      editProfile.pl !== '' ? Number(editProfile.pl) : undefined,
      }
      if (selected.eid) body.eid = selected.eid
      else body.username = selected.username

      const d = await patch('/api/admin/faculty', body)
      if (!d.success) throw new Error(d.message)
      toast.success(`Updated ${selected.display_name || selected.username}`)
      setSelected({ ...selected, permissions: editPerms, role: editRole, ...editProfile })
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const resetPwd = async () => {
    if (!selected) return
    if (!confirm(`Reset password for ${selected.display_name || selected.username}?`)) return
    const body = { resetPassword: true }
    if (selected.eid) body.eid = selected.eid
    else body.username = selected.username
    const d = await patch('/api/admin/faculty', body)
    if (d.success) toast.success('Password reset. They must change it on next login.')
    else toast.error(d.message)
  }

  return (
    <div className="card" style={{ padding: 22, gridColumn: 'span 2' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>
        <ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Faculty Permissions & Roles
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-3)' }}>
        Search a faculty member to grant/revoke permissions or promote to admin.
      </p>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="input" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by name, EID or username…"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={search} disabled={searching}>
          <Search size={15} /> {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Dropdown results */}
      {results.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
          {results.map(f => (
            <button key={f._id} onClick={() => select(f)} style={{
              display: 'block', width: '100%', padding: '10px 14px',
              textAlign: 'left', background: 'var(--surface)', border: 'none',
              borderBottom: '1px solid var(--border)', cursor: 'pointer',
              fontSize: 13, color: 'var(--text)',
            }}>
              <strong>{f.display_name || f.username}</strong>
              <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
                {f.eid && `EID: ${f.eid} · `}{f.dept || ''} · {f.role}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Edit panel */}
      {selected && (
        <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.display_name || selected.username}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {selected.eid && `EID: ${selected.eid} · `}{selected.dept || ''} · {selected.designation || ''}
              </div>
            </div>
            <button className="btn btn-ghost" onClick={() => setSelected(null)} style={{ fontSize: 12, padding: '4px 10px' }}>✕ Close</button>
          </div>

          {/* Role */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>ROLE</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['faculty', 'admin'].map(r => (
                <button key={r} onClick={() => setEditRole(r)} style={{
                  padding: '6px 16px', borderRadius: 6, border: '2px solid',
                  borderColor: editRole === r ? 'var(--brand)' : 'var(--border)',
                  background: editRole === r ? 'var(--brand-light)' : 'var(--surface)',
                  color: editRole === r ? 'var(--brand)' : 'var(--text)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>
                  {r === 'admin' ? '⭐ Admin' : '👤 Faculty'}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              PERMISSIONS {editRole === 'admin' && <span style={{ color: '#16a34a', fontWeight: 400 }}>(Admin has all permissions)</span>}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ALL_PERMISSIONS.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', opacity: editRole === 'admin' ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    checked={editRole === 'admin' || editPerms.includes(p.key)}
                    onChange={() => editRole !== 'admin' && togglePerm(p.key)}
                    disabled={editRole === 'admin'}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13 }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Profile fields */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 8 }}>PROFILE</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { key: 'designation',             label: 'Designation',             placeholder: 'e.g. Assistant Professor' },
                { key: 'cohort',                  label: 'Cohort',                  placeholder: 'e.g. R22' },
                { key: 'designation_category',    label: 'Designation Category',    placeholder: 'R / Ac / Ad' },
                { key: 'assigned_responsibility', label: 'Assigned Responsibility', placeholder: 'e.g. HOD, Advisor' },
                { key: 'load_as_per_designation', label: 'Load (hrs)',              placeholder: 'e.g. 16', type: 'number' },
                { key: 'pl',                      label: 'Permitted Load (PL)',      placeholder: 'e.g. 18', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{f.label}</label>
                  <input
                    className="input"
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={editProfile[f.key]}
                    onChange={e => setEditProfile(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ fontSize: 13, padding: '6px 10px' }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn btn-ghost" onClick={resetPwd} style={{ fontSize: 13 }}>
              🔑 Reset Password
            </button>
            {(selected.eid || selected.username) && (
              <a
                href={`/faculty?q=${encodeURIComponent(selected.eid || selected.username)}`}
                target="_blank" rel="noreferrer"
                className="btn btn-ghost"
                style={{ fontSize: 13, textDecoration: 'none' }}
              >
                <ExternalLink size={13} /> View Timetable
              </a>
            )}
          </div>

          {/* Profile preview */}
          {(editProfile.designation || editProfile.cohort || editProfile.designation_category ||
            editProfile.assigned_responsibility || editProfile.load_as_per_designation || editProfile.pl) && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface)', borderRadius: 8,
              border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>
                Profile card preview
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '6px 16px' }}>
                {[
                  { label: 'Designation',             value: editProfile.designation },
                  { label: 'Cohort',                  value: editProfile.cohort },
                  { label: 'Designation Category',    value: editProfile.designation_category
                    ? `${editProfile.designation_category} — ${DESG_LABEL[editProfile.designation_category] || editProfile.designation_category}` : '' },
                  { label: 'Assigned Responsibility', value: editProfile.assigned_responsibility },
                  { label: 'Load as per Designation', value: editProfile.load_as_per_designation ? `${editProfile.load_as_per_designation} hrs` : '' },
                  { label: 'Permitted Load (PL)',      value: editProfile.pl ? `${editProfile.pl} hrs` : '' },
                ].filter(f => f.value).map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 1 }}>{f.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AdminContent() {
  const { user, loading, isAdmin, hasPermission } = useAuth()
  const router = useRouter()
  const { get, del, patch, post, postForm } = useApi()

  const canManageData = isAdmin || hasPermission('manage_data')

  const [status,      setStatus]      = useState(null)
  const [files,       setFiles]       = useState({ timetable: null, rooms: null, master: null })
  const [facultyFile, setFacultyFile] = useState(null)
  const [busy,        setBusy]        = useState(false)
  const [facultyBusy, setFacultyBusy] = useState(false)
  const [log,         setLog]         = useState([])
  const [versions,       setVersions]       = useState([])
  const [expandedVersion, setExpandedVersion] = useState(null)
  const [uploadAY,       setUploadAY]       = useState('')
  const [uploadSem,   setUploadSem]   = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user && !isAdmin && !hasPermission('manage_data')) router.replace('/faculty')
  }, [user, loading, isAdmin])

  const fetchStatus = async () => {
    const d = await get('/api/upload/status')
    if (d.success) setStatus(d.status)
  }
  const fetchVersions = async () => {
    const d = await get('/api/upload/versions')
    if (d.success) setVersions(d.snapshots || [])
  }
  useEffect(() => { if (user && canManageData) { fetchStatus(); fetchVersions() } }, [user])

  const activateVersion = async (snapshotId) => {
    const d = await patch('/api/upload/versions', { snapshotId })
    if (d.success) { toast.success(d.message); fetchVersions() }
    else toast.error(d.message)
  }

  const deleteVersion = async (snapshotId, label) => {
    if (!confirm(`Delete "${label}"? This will permanently remove all its timetable entries.`)) return
    const d = await del(`/api/upload/versions?snapshotId=${encodeURIComponent(snapshotId)}`)
    if (d.success) { toast.success(d.message); fetchVersions(); fetchStatus() }
    else toast.error(d.message)
  }

  const setFile = (key) => (e) => setFiles(f => ({ ...f, [key]: e.target.files[0] || null }))

  const upload = async () => {
    if (!files.timetable && !files.rooms && !files.master)
      return toast.error('Select at least one file')
    if (!askUploadPassword()) return
    setBusy(true)
    const newLog = []
    try {
      const fd = new FormData()
      if (files.timetable) fd.append('timetable', files.timetable)
      if (files.rooms)     fd.append('rooms', files.rooms)
      if (files.master)    fd.append('master', files.master)
      if (uploadAY)        fd.append('academicYear', uploadAY)
      if (uploadSem)       fd.append('semester', uploadSem)

      const d = await postForm('/api/upload', fd)
      if (!d.success) throw new Error(d.message)

      for (const [key, r] of Object.entries(d.results)) {
        if (r.error) {
          newLog.push({ ok: false, msg: `${key}: ${r.error}` })
          toast.error(`${key}: ${r.error}`)
        } else {
          const cnt = r.inserted ?? (r.upserted + r.modified)
          newLog.push({ ok: true, msg: `${key}: ${cnt.toLocaleString()} rows loaded into "${r.dataset || 'rooms'}"` })
        }
      }

      toast.success('Upload Successful.')
      setFiles({ timetable: null, rooms: null, master: null })
      await fetchStatus()
    } catch (err) {
      newLog.push({ ok: false, msg: err.message })
      toast.error(err.message)
    } finally {
      setLog(l => [...newLog, ...l].slice(0, 20))
      setBusy(false)
    }
  }

  const clearDataset = async (dataset) => {
    if (!confirm(`This will permanently delete all "${dataset}" data. Continue?`)) return
    const d = await del(`/api/upload/status?dataset=${dataset}`)
    if (d.success) { toast.success(d.message); fetchStatus() }
    else toast.error(d.message)
  }

  const uploadFaculty = async () => {
    if (!facultyFile) return toast.error('Select a faculty CSV file')
    if (!askUploadPassword()) return
    setFacultyBusy(true)
    try {
      const fd = new FormData()
      fd.append('faculty', facultyFile)
      const d = await postForm('/api/admin/upload-faculty', fd)
      if (!d.success) throw new Error(d.message)
      toast.success(`Upload Successful. Created: ${d.created}, Updated: ${d.updated}, Skipped: ${d.skipped}`)
      setFacultyFile(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setFacultyBusy(false)
    }
  }

  // Default tab: admins start on permissions, manage_data-only users go straight to data
  const [tab, setTab] = useState(isAdmin ? 'permissions' : 'data')

  if (loading || !user || (!isAdmin && !hasPermission('manage_data'))) return null

  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>Admin Dashboard</h2>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'2px solid var(--border)', paddingBottom:0 }}>
        {[
          isAdmin && { key:'permissions', label:'👥 Faculty Permissions' },
          isAdmin && { key:'create',      label:'➕ Create Faculty' },
          canManageData && { key:'data',  label:'📤 Data Management' },
        ].filter(Boolean).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background:'none', border:'none', cursor:'pointer', padding:'8px 18px',
            fontWeight:700, fontSize:14, fontFamily:'inherit',
            color: tab === t.key ? 'var(--brand)' : 'var(--text-3)',
            borderBottom: tab === t.key ? '3px solid var(--brand)' : '3px solid transparent',
            marginBottom:-2, transition:'all .15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Faculty Permissions tab ── */}
      {tab === 'permissions' && isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <FacultyPermissionsPanel get={get} patch={patch} />
        </div>
      )}

      {/* ── Create Faculty tab ── */}
      {tab === 'create' && isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <CreateFacultyPanel post={post} />
        </div>
      )}

      {/* ── Data Management tab ── */}
      {tab === 'data' && canManageData && (<>
      {/* Status Cards */}
      {status && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:24 }}>
          {[
            { label:'Live Entries',   value: status.live,   cls:'badge-green'  },
            { label:'Master Entries', value: status.master, cls:'badge-yellow' },
            { label:'Rooms Loaded',   value: status.rooms,  cls:'badge-blue'   },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontSize:'1.8rem', fontWeight:800, fontFamily:"'DM Serif Display',serif",
                color: s.value > 0 ? 'var(--brand)' : 'var(--text-3)' }}>
                {s.value.toLocaleString()}
              </div>
              <div style={{ fontSize:12, color:'var(--text-3)', marginTop:4, fontWeight:600, textTransform:'uppercase' }}>{s.label}</div>
            </div>
          ))}
          <div className="card" style={{ padding:'16px 18px' }}>
            <div style={{ fontSize:'1.8rem', fontWeight:800, fontFamily:"'DM Serif Display',serif",
              color: status.hasData ? 'var(--brand)' : 'var(--text-3)' }}>
              {status.hasData ? '✓' : '✗'}
            </div>
            <div style={{ fontSize:12, color:'var(--text-3)', marginTop:4, fontWeight:600, textTransform:'uppercase' }}>Data Loaded</div>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* Upload panel */}
        <div className="card" style={{ padding:22, gridColumn:'span 2' }}>
          <h3 style={{ margin:'0 0 16px', fontSize:'1rem', fontWeight:700 }}>📤 Upload New Data</h3>
          <p style={{ margin:'0 0 16px', fontSize:13, color:'var(--text-3)' }}>
            Upload the same CSV format as the original files. Uploading will <strong>replace</strong> the existing data for that dataset.
          </p>

          {[
            { key:'timetable', label:'Live Timetable CSV', hint:'BTT-XXXXXX.csv — replaces current live timetable', icon:'📅' },
            { key:'rooms',     label:'Room Metadata CSV',   hint:'KLEF-ERP-RD.csv — upserts room info',              icon:'🚪' },
            { key:'master',    label:'Master Timetable CSV (optional)', hint:'Used as source for clash detection instead of live', icon:'🔍', warn:true },
          ].map(({ key, label, hint, icon, warn }) => (
            <div key={key} style={{ marginBottom:20, padding:14, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span>{icon}</span>
                <span style={{ fontWeight:700, fontSize:14, color: warn ? 'var(--brand)' : 'var(--text)' }}>{label}</span>
              </div>
              <p style={{ margin:'0 0 8px', fontSize:12, color:'var(--text-3)' }}>{hint}</p>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <input type="file" accept=".csv,.CSV" onChange={setFile(key)} style={{ display:'none' }} id={`file-${key}`} />
                  <div
                    onClick={() => document.getElementById(`file-${key}`).click()}
                    style={{
                      padding:'9px 14px', border:`2px dashed ${files[key] ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius:8, cursor:'pointer', fontSize:13,
                      color: files[key] ? 'var(--brand)' : 'var(--text-3)',
                      background: files[key] ? 'var(--brand-light)' : 'var(--surface)',
                      transition:'all .15s',
                    }}>
                    {files[key] ? `✓ ${files[key].name}` : 'Click to choose CSV file…'}
                  </div>
                </div>
                {files[key] && (
                  <button className="btn btn-ghost" style={{ padding:'9px 12px' }}
                    onClick={() => setFiles(f => ({ ...f, [key]: null }))}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Academic year + semester */}
          <div style={{ display:'flex', gap:10, marginTop:4, marginBottom:4, flexWrap:'wrap', padding:'10px 14px',
            background:'var(--surface-2)', borderRadius:8, border:'1px solid var(--border)', alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', whiteSpace:'nowrap' }}>📘 AY / Semester:</span>
            <input
              className="input" value={uploadAY} onChange={e => setUploadAY(e.target.value)}
              placeholder="Academic Year e.g. 2025-2026" style={{ flex:1, minWidth:160, fontSize:13 }}
            />
            <select className="input" value={uploadSem} onChange={e => setUploadSem(e.target.value)} style={{ maxWidth:140, fontSize:13 }}>
              <option value="">Semester…</option>
              <option value="Odd">Odd</option>
              <option value="Even">Even</option>
            </select>
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8 }}>
            <button className="btn btn-primary" onClick={upload} disabled={busy} style={{ flex:1 }}>
              <UploadCloud size={16} />
              {busy ? 'Uploading & Processing…' : 'Upload Selected Files'}
            </button>
            <button className="btn btn-ghost" onClick={fetchStatus}>
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Roomwise TT Upload */}
        <div style={{ gridColumn:'span 2' }}>
          <RoomwiseUploadCard />
          <ErpRoomUploadCard />
        </div>

        {/* Faculty CSV upload */}
        <div className="card" style={{ padding:22, gridColumn:'span 2' }}>
          <h3 style={{ margin:'0 0 8px', fontSize:'1rem', fontWeight:700 }}>
            <Users size={16} style={{ verticalAlign:'middle', marginRight:6 }} />
            Upload Faculty Accounts (KLEF-FD.csv)
          </h3>
          <p style={{ margin:'0 0 14px', fontSize:13, color:'var(--text-3)' }}>
            Creates new faculty accounts and updates existing ones in MongoDB. New accounts use EID as initial password.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1 }}>
              <input type="file" accept=".csv,.CSV" onChange={e => setFacultyFile(e.target.files[0] || null)} style={{ display:'none' }} id="file-faculty" />
              <div
                onClick={() => document.getElementById('file-faculty').click()}
                style={{
                  padding:'9px 14px', border:`2px dashed ${facultyFile ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius:8, cursor:'pointer', fontSize:13,
                  color: facultyFile ? 'var(--brand)' : 'var(--text-3)',
                  background: facultyFile ? 'var(--brand-light)' : 'var(--surface)',
                  transition:'all .15s',
                }}>
                {facultyFile ? `✓ ${facultyFile.name}` : 'Click to choose KLEF-FD.csv…'}
              </div>
            </div>
            {facultyFile && (
              <button className="btn btn-ghost" style={{ padding:'9px 12px' }} onClick={() => setFacultyFile(null)}>✕</button>
            )}
            <button className="btn btn-primary" onClick={uploadFaculty} disabled={facultyBusy || !facultyFile}>
              <UploadCloud size={15} />
              {facultyBusy ? 'Uploading…' : 'Upload Faculty'}
            </button>
          </div>
        </div>

        {/* Version History */}
        <div className="card" style={{ padding:22, gridColumn:'span 2' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3 style={{ margin:0, fontSize:'1rem', fontWeight:700 }}>📅 Timetable Version History</h3>
            <button className="btn btn-ghost" onClick={fetchVersions} style={{ fontSize:12, padding:'4px 10px' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {versions.filter(v => v.type === 'live').length === 0 ? (
            <p style={{ color:'var(--text-3)', fontSize:13 }}>No timetable versions uploaded yet.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {versions.filter(v => v.type === 'live').map(v => {
                const isExpanded = expandedVersion === v.snapshotId
                const hasColData = v.detectedColumns?.length > 0
                return (
                  <div key={v.snapshotId} style={{
                    background:'var(--surface-2)', borderRadius:8,
                    border:`1px solid ${v.isActive ? 'var(--brand)' : 'var(--border)'}`,
                    overflow:'hidden',
                  }}>
                    {/* Card header row */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', flexWrap:'wrap' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                          {v.label}
                          {v.isActive && <span className="badge badge-active">ACTIVE</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>
                          {v.rowCount?.toLocaleString()} rows · {new Date(v.uploadedAt).toLocaleString()}
                          {v.academicYear && <span className="badge badge-blue" style={{ marginLeft:6 }}>AY {v.academicYear}{v.semester ? ` ${v.semester}` : ''}</span>}
                          {v.filename && ` · ${v.filename}`}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <button
                          className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }}
                          title="View column mapping"
                          onClick={() => setExpandedVersion(isExpanded ? null : v.snapshotId)}>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          Columns
                        </button>
                        {!v.isActive && (
                          <button className="btn btn-primary" style={{ fontSize:12, padding:'5px 12px' }}
                            onClick={() => activateVersion(v.snapshotId)}>
                            <CheckCircle size={13} /> Set Active
                          </button>
                        )}
                        <button
                          className="btn btn-danger" style={{ fontSize:12, padding:'5px 10px', opacity: v.isActive ? 0.4 : 1 }}
                          disabled={v.isActive}
                          title={v.isActive ? 'Cannot delete active version' : 'Delete this version'}
                          onClick={() => deleteVersion(v.snapshotId, v.label)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Expandable column mapping */}
                    {isExpanded && (
                      <div style={{ borderTop:'1px solid var(--border)', padding:'12px 14px' }}>
                        {hasColData
                          ? <ColMappingPreview
                              preview={{ headers: v.detectedColumns, firstRow: v.sampleRow || {} }}
                              defaultExpanded={true}
                            />
                          : <p style={{ margin:0, fontSize:12, color:'var(--text-3)', fontStyle:'italic' }}>
                              No column data stored — this snapshot was uploaded before the column tracking feature was added.
                              Re-upload the CSV to see the full mapping.
                            </p>
                        }
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="card" style={{ padding:22, borderColor:'var(--brand)' }}>
          <h3 style={{ margin:'0 0 12px', fontSize:'1rem', fontWeight:700, color:'var(--brand)' }}>🗑 Clear Data</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[['live','Clear Live Timetable'],['master','Clear Master Timetable'],['all','Clear Everything']].map(([ds, label]) => (
              <button key={ds} className="btn btn-danger" style={{ justifyContent:'flex-start', opacity: ds === 'all' ? 1 : 0.8 }}
                onClick={() => clearDataset(ds)}>
                <Trash2 size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload log */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ margin:'0 0 12px', fontSize:'1rem', fontWeight:700 }}>📋 Upload Log</h3>
          {log.length === 0 ? (
            <p style={{ color:'var(--text-3)', fontSize:13 }}>No uploads this session.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {log.map((l, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:13 }}>
                  {l.ok ? <CheckCircle size={15} style={{ color:'#16a34a', flexShrink:0, marginTop:2 }} />
                        : <AlertCircle size={15} style={{ color:'#dc2626', flexShrink:0, marginTop:2 }} />}
                  <span style={{ color: l.ok ? 'var(--text)' : '#dc2626' }}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>)}
    </PortalShell>
  )
}

export default function AdminPage() { return <AuthProvider><AdminContent /></AuthProvider> }
