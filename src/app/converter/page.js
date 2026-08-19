import { redirect } from 'next/navigation'

/** /converter is an entry point; the sub-sections are the real pages. */
export default function ConverterIndex() {
  redirect('/converter/rooms')
}
