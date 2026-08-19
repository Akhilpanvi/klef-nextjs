import mongoose from 'mongoose'
import fs from 'fs'
import { resolveRoom } from './src/lib/roomLabel.js'
import { buildRoomMaster } from './src/lib/roomMaster.js'
const env=Object.fromEntries(fs.readFileSync(new URL('./.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]))
await mongoose.connect(env.MONGODB_URI)
const db=mongoose.connection.db
const snap=await db.collection('roomwisesnapshots').findOne()
const rows=await db.collection('roomwiseentries').find({dataset:snap.snapshotId},{projection:{room_no:1,day:1,hour:1,label:1}}).toArray()
const {knownRooms}=await buildRoomMaster([1,2,3,4,5,6])
const SUF=/-(MA|AB|CD|[A-F])$/i
const base=r=>{const s=String(r||'').trim().toUpperCase(); const viaMaster=resolveRoom(s,knownRooms)
  if(knownRooms.has(viaMaster))return viaMaster
  let t=s; while(SUF.test(t)) t=t.replace(SUF,''); return t}
const merged=new Map()
for(const e of rows){
  const b=base(e.room_no)
  const m=merged.get(b)||{room:b,variants:new Set(),cells:new Map()}
  m.variants.add(String(e.room_no).trim())
  const k=`${e.day}-${e.hour}`
  const c=m.cells.get(k)||{labels:new Set(),n:0}
  c.labels.add(String(e.label||'').trim()); c.n++
  m.cells.set(k,c); merged.set(b,m)
}
const srcRooms=new Set(rows.map(r=>String(r.room_no).trim())).size
let cells=0,conflicts=0,collapsed=0
for(const m of merged.values()) for(const c of m.cells.values()){cells++; if(c.labels.size>1)conflicts++; collapsed+=c.n-1}
console.log(`source rows ${rows.length} | source room names ${srcRooms} -> merged rooms ${merged.size}`)
console.log(`merged cells ${cells} | duplicate rows collapsed ${collapsed} | cells where sub-rooms DISAGREE ${conflicts}`)
const payload=[...merged.values()].map(m=>({
  room:m.room, variants:[...m.variants].sort(),
  cells:[...m.cells.entries()].map(([k,c])=>{const[d,h]=k.split('-').map(Number)
    const L=[...c.labels]; return L.length>1?{d,h,l:L[0],n:c.n,c:L.slice(1)}:{d,h,l:L[0],n:c.n}})}))
console.log(`payload ${(Buffer.byteLength(JSON.stringify(payload))/1024/1024).toFixed(2)} MB`)
console.log('\nsample merged room:')
const s=payload.find(p=>p.variants.length>=4)
console.log(' ',s.room,'<-',s.variants.join(', '),`(${s.cells.length} busy cells)`)
console.log('  first cells:',JSON.stringify(s.cells.slice(0,3)))
console.log('\nconflict examples:')
let n=0
for(const p of payload){for(const c of p.cells){if(c.c&&n<4){console.log(`  ${p.room} d${c.d}h${c.h}: "${c.l}" vs "${c.c.join('" / "')}"`);n++}}}
await mongoose.disconnect()
