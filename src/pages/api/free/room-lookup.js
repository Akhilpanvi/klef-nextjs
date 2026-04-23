import { requireAuth } from '@/lib/auth'
import { connectDB }   from '@/lib/mongodb'
import RoomMeta        from '@/lib/models/RoomMeta'
import ErpRoomData     from '@/lib/models/ErpRoomData'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { q } = req.query
  if (!q || !q.trim())
    return res.status(400).json({ success: false, message: 'Query required' })

  await connectDB()

  const query = q.trim()
  const isErpId = /^\d+$/.test(query)

  let metaDoc  = null
  let erpDoc   = null
  let roomName = null

  if (isErpId) {
    const erpId = parseInt(query, 10)
    // Search in ErpRoomData sections for a matching erp_id
    erpDoc = await ErpRoomData.findOne({ 'sections.erp_id': erpId }).lean()
    if (!erpDoc)
      return res.status(404).json({ success: false, message: `No room found with ERP ID ${erpId}` })
    roomName = erpDoc.room_no
    metaDoc  = await RoomMeta.findOne({ room_no: roomName }).lean()
  } else {
    roomName = query.toUpperCase()
    metaDoc  = await RoomMeta.findOne({ room_no: { $regex: new RegExp(`^${roomName}$`, 'i') } }).lean()
    erpDoc   = await ErpRoomData.findOne({ room_no: { $regex: new RegExp(`^${roomName}$`, 'i') } }).lean()

    if (!metaDoc && !erpDoc)
      return res.status(404).json({ success: false, message: `Room ${roomName} not found` })

    if (metaDoc) roomName = metaDoc.room_no
    else if (erpDoc) roomName = erpDoc.room_no
  }

  res.json({
    success:      true,
    room:         roomName,
    block:        metaDoc?.block        || erpDoc?.block || null,
    type:         metaDoc?.room_type    || null,
    capacity:     metaDoc?.capacity     || null,
    alloted_to:   metaDoc?.alloted_to   || null,
    dept_alloted: metaDoc?.dept_alloted || null,
    erp_sections: erpDoc?.sections      || [],
    erp_id:       erpDoc?.erp_id        || null,
    description:  erpDoc?.description   || null,
  })
}
