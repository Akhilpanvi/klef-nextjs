/**
 * erpClient
 * ─────────
 * Talks to the KL ERP (newerp.kluniversity.in, a Yii app) on behalf of an
 * admin, using the admin's own faculty login. Nothing here stores a password:
 * the only state carried between requests is the ERP cookie jar and CSRF token.
 *
 *   1. startLogin()        GET the login page → session cookies, _csrf, captcha PNG
 *   2. checkMfa()          POST site/get-stakeholder-id → 1 = MFA required, -2 = not
 *   3. login()             POST site/login (username, password, captcha, MFA code)
 *   4. downloadRoomCsv()   POST room-timetable-all-days-get-download → Roomwise CSV
 *   5. logout()            POST site/logout so the ERP session doesn't linger
 */

export const ERP_BASE = 'https://newerp.kluniversity.in'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'

// Option values as the ERP's Room Timetable form sends them.
export const ERP_CAMPUSES = [{ id: 1, label: 'KLVZA' }]
export const ERP_ACADEMIC_YEARS = [
  { id: 29, label: '2026-2027' }, { id: 19, label: '2025-2026' }, { id: 16, label: '2024-2025' },
  { id: 15, label: '2023-2024' }, { id: 14, label: '2022-2023' }, { id: 13, label: '2021-2022' },
  { id: 10, label: '2020-2021' }, { id: 9,  label: '2019-2020' }, { id: 8,  label: '2018-2019' },
  { id: 7,  label: '2017-2018' }, { id: 6,  label: '2016-2017' }, { id: 5,  label: '2015-2016' },
  { id: 4,  label: '2014-2015' }, { id: 3,  label: '2013-2014' }, { id: 2,  label: '2012-2013' },
  { id: 1,  label: '2011-2012' }, { id: 12, label: '2010-2011' }, { id: 11, label: '2009-2010' },
]
export const ERP_SEMESTERS = [
  { id: 1, label: 'Odd Sem' }, { id: 2, label: 'Even Sem' },
  { id: 3, label: 'Summer Term' }, { id: 4, label: 'Term3' },
]

export class ErpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

const route = r => `${ERP_BASE}/index.php?r=${encodeURIComponent(r)}`

/** fetch with a plain-object cookie jar that is updated from Set-Cookie. */
async function erpFetch(jar, url, { method = 'GET', form, headers = {} } = {}) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  let res
  try {
    res = await fetch(url, {
      method,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        ...(cookie && { Cookie: cookie }),
        ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }),
        ...headers,
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(45_000),
    })
  } catch (err) {
    throw new ErpError(`Could not reach the ERP (${err.name === 'TimeoutError' ? 'timed out' : err.message})`, 502)
  }
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim()
    if (!name) continue
    if (!value || value === 'deleted' || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) delete jar[name]
    else jar[name] = value
  }
  return res
}

const csrfFromHtml = html =>
  html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ||
  html.match(/name="_csrf" value="([^"]+)"/)?.[1] || null

/** Login page → { jar, csrf, captcha (data URL) } */
export async function startLogin() {
  const jar = {}
  const page = await erpFetch(jar, `${ERP_BASE}/`)
  const html = await page.text()
  const csrf = csrfFromHtml(html)
  const captchaPath = html.match(/id="loginFormCaptcha-image" src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&')
  if (!csrf || !captchaPath) throw new ErpError('ERP login page has changed — could not find the login form', 502)

  const img = await erpFetch(jar, ERP_BASE + captchaPath, { headers: { Referer: `${ERP_BASE}/` } })
  if (!img.ok) throw new ErpError(`Could not load the ERP captcha (${img.status})`, 502)
  const buf = Buffer.from(await img.arrayBuffer())
  const type = img.headers.get('content-type') || 'image/png'
  return { jar, csrf, captcha: `data:${type};base64,${buf.toString('base64')}` }
}

/**
 * true when this ERP account needs an MFA code, false when it does not,
 * null when the ERP would not say (the login form then just takes an optional code).
 * yii.js sends the CSRF token as a header on every jQuery AJAX call, so do the same.
 */
export async function checkMfa(jar, csrf, username) {
  const res = await erpFetch(jar, route('site/get-stakeholder-id'), {
    method: 'POST', form: { username, _csrf: csrf },
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf, Referer: `${ERP_BASE}/` },
  })
  if (res.status === 429) throw new ErpError('ERP says too many requests — wait a minute and try again', 429)
  const v = parseInt((await res.text()).trim(), 10)
  if (v === -4) throw new ErpError('ERP says too many requests — wait a minute and try again', 429)
  if (v === 1) return true
  if (v === -1 || v === -2 || v === -3) return false
  console.warn(`erp: MFA lookup gave status ${res.status}, value ${v}`)
  return null
}

/** Logs in; throws ErpError with the ERP's own message on failure. */
export async function login(jar, csrf, { username, password, captcha, mfaCode = '' }) {
  const res = await erpFetch(jar, route('site/login'), {
    method: 'POST',
    headers: { Referer: `${ERP_BASE}/` },
    form: {
      _csrf: csrf,
      'LoginForm[username]': username,
      'LoginForm[password]': password,
      'LoginForm[captcha]':  captcha,
      'LoginForm[qr_code]':  mfaCode,
    },
  })
  const location = res.headers.get('location') || res.headers.get('x-redirect') || ''
  if (res.status >= 300 && res.status < 400 && !/site%2Flogin|site\/login/.test(location)) return

  // Failed: the form comes back with Yii's error messages in .help-block.
  const html = await res.text()
  if (res.status === 200 && /site%2Flogout|site\/logout/.test(html)) return
  const errors = [...html.matchAll(/class="help-block[^"]*"[^>]*>([^<]+)</g)]
    .map(m => m[1].trim()).filter(Boolean)
  throw new ErpError(errors.length ? errors.join(' ') : `ERP login failed (${res.status})`, 401)
}

/** Room Timetable → CSV buffer (roomno, mon1 … sun24). */
export async function downloadRoomCsv(jar, { campid = 1, academicyear, semesterid }) {
  const pageRes = await erpFetch(jar, route('timetables/universitymasteracademictimetableview/indexroomdaywisesearch'))
  if (pageRes.status >= 300) throw new ErpError('ERP session was not accepted after login', 401)
  const csrf = csrfFromHtml(await pageRes.text())
  if (!csrf) throw new ErpError('This ERP account cannot open Day Room Timetable', 403)

  const res = await erpFetch(jar, route('timetables/universitymasteracademictimetableview/room-timetable-all-days-get-download'), {
    method: 'POST',
    headers: { Referer: route('timetables/universitymasteracademictimetableview/indexroomdaywisesearch') },
    form: { _csrf: csrf, cam: campid, acym: academicyear, sem: semesterid, dwld: 'csv' },
  })
  if (res.status === 403) throw new ErpError('This ERP account is not allowed to download the Room Timetable', 403)
  if (!res.ok) throw new ErpError(`ERP room timetable download failed (${res.status})`, 502)
  const buf = Buffer.from(await res.arrayBuffer())
  const head = buf.subarray(0, 200).toString('utf8').replace(/^﻿/, '').toLowerCase()
  if (!head.startsWith('roomno') && !head.startsWith('"roomno"'))
    throw new ErpError('ERP did not return a Room Timetable CSV (maybe no timetable for that year/semester)', 502)
  const filename = res.headers.get('content-disposition')?.match(/filename="?([^";]+)/)?.[1] || 'room_timetable.csv'
  return { buf, filename }
}

export async function logout(jar) {
  try {
    const page = await erpFetch(jar, route('site/indexindi'))
    const csrf = csrfFromHtml(await page.text())
    if (csrf) await erpFetch(jar, route('site/logout'), { method: 'POST', form: { _csrf: csrf } })
  } catch { /* best effort */ }
}
