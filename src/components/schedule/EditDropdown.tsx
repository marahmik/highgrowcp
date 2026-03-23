import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { WORK_TYPE_LABELS, LEAVE_TYPE_LABELS, WORK_TYPE_COLORS, LEAVE_TYPE_COLORS } from '@/constants/colors'
import type { WorkType, LeaveType } from '@/types/database'

interface EditDropdownProps {
  date: Date
  userName: string
  initialWorkType: WorkType | null
  initialLeaveType: LeaveType | null
  anchorRect: { top: number; left: number; bottom: number; right: number }
  isManager: boolean
  onSave: (workType: WorkType | null, leaveType: LeaveType | null) => void
  onClose: () => void
}

const WORK_TYPES: WorkType[] = ['open', 'middle', 'close', 'allday']
const LEAVE_TYPES: LeaveType[] = ['annual', 'half', 'substitute', 'sick', 'request']

export function EditDropdown({ date, userName, initialWorkType, initialLeaveType, anchorRect, isManager, onSave, onClose }: EditDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [workType, setWorkType] = useState<WorkType | null>(initialWorkType)
  const [leaveType, setLeaveType] = useState<LeaveType | null>(initialLeaveType)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function selectWork(wt: WorkType) {
    const newWt = workType === wt ? null : wt
    setWorkType(newWt)
    setLeaveType(null)
    onSave(newWt, null)
    onClose()
  }

  function selectLeave(lt: LeaveType) {
    const newLt = leaveType === lt ? null : lt
    setLeaveType(null)
    setWorkType(null)
    onSave(null, newLt)
    onClose()
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
  }

  const dropdownWidth = isManager ? 240 : 160
  let left = anchorRect.left
  if (left + dropdownWidth > window.innerWidth - 8) {
    left = window.innerWidth - dropdownWidth - 8
  }
  if (left < 8) left = 8
  style.left = left

  const dropdownHeight = isManager ? 220 : 80
  if (anchorRect.bottom + dropdownHeight < window.innerHeight - 8) {
    style.top = anchorRect.bottom + 4
  } else {
    style.top = Math.max(8, anchorRect.top - dropdownHeight - 4)
  }

  // 일반 직원: 요청 버튼만 표시
  if (!isManager) {
    return (
      <div ref={ref} style={{ ...style, width: dropdownWidth }} className="rounded-lg border bg-white p-3 shadow-xl">
        <p className="mb-2 text-xs font-semibold text-foreground">{userName}</p>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {format(date, 'M/d (EEE)', { locale: ko })}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => selectLeave('request')}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-all ${
              LEAVE_TYPE_COLORS['request']
            } ${leaveType === 'request' ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
          >
            {LEAVE_TYPE_LABELS['request']}
          </button>
          {/* 기존 요청이 있으면 삭제도 가능 */}
          {(initialWorkType || initialLeaveType) && (
            <button
              type="button"
              onClick={() => { onSave(null, null); onClose() }}
              className="rounded px-2 py-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-all"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    )
  }

  // 매니저: 모든 티커 표시
  return (
    <div ref={ref} style={{ ...style, width: dropdownWidth }} className="rounded-lg border bg-white p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold text-foreground">{userName}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {format(date, 'M/d (EEE)', { locale: ko })}
      </p>

      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">근무</p>
      <div className="mb-3 grid grid-cols-4 gap-1">
        {WORK_TYPES.map((wt) => (
          <button
            key={wt}
            type="button"
            onClick={() => selectWork(wt)}
            className={`rounded px-1.5 py-1 text-[11px] font-medium transition-all ${
              WORK_TYPE_COLORS[wt]
            } ${workType === wt ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
          >
            {WORK_TYPE_LABELS[wt]}
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">휴일</p>
      <div className="mb-3 grid grid-cols-5 gap-1">
        {LEAVE_TYPES.map((lt) => (
          <button
            key={lt}
            type="button"
            onClick={() => selectLeave(lt)}
            className={`rounded px-1 py-1 text-[11px] font-medium transition-all ${
              LEAVE_TYPE_COLORS[lt]
            } ${leaveType === lt ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
          >
            {LEAVE_TYPE_LABELS[lt]}
          </button>
        ))}
      </div>

      {/* 삭제 버튼 */}
      {(initialWorkType || initialLeaveType) && (
        <button
          type="button"
          onClick={() => { onSave(null, null); onClose() }}
          className="w-full rounded px-2 py-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-all"
        >
          삭제
        </button>
      )}
    </div>
  )
}
