import { CircleCheckBig, CircleQuestionMark, CircleX } from 'lucide-react'
import type { VerdictStatus } from '../api/client'

export function VerdictIcon({ status }: { status: VerdictStatus }) {
  if (status === 'CONSISTENT') {
    return <CircleCheckBig className="text-ok h-6 w-6 shrink-0" aria-hidden="true" />
  }
  if (status === 'CONTRADICTED') {
    return <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
  }
  return <CircleQuestionMark className="text-unknown h-6 w-6 shrink-0" aria-hidden="true" />
}
