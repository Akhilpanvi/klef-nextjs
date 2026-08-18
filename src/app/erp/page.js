import { redirect } from 'next/navigation'

/** /erp is just an entry point; the sub-tabs are the real pages. */
export default function ErpIndex() {
  redirect('/erp/timetable')
}
