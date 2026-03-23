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
  onSave: (workType: WorkType | null, leaveType: LeaveType | null) => void
  onClose: () => void
}

const WORK_TYPES: WorkType[] = ['open', 'middle', 'close', 'allday']
const LEAVE_TYPES: LeaveType[] = ['annual', 'half', 'substitute', 'sick', 'request']

export function EditDropdown({ date, userName, initialWorkType, initialLeaveType, anchorRect, onSave, onClose }: EditDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [workType, setWorkType] = useState<WorkType | null>(initialWorkType)
  const [leaveType, setLeaveType] = useState<LeaveType | null>(initialLeaveType)

  // 외부 클릭 시 닫기
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

  // 위치 계산: 셀 아래에 표시하되, 화면 밖으로 나가면 위로
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
  }

  // 가로 위치: 앵커의 왼쪽 기준, 화면 오른쪽 넘으면 보정
  const dropdownWidth = 240
  let left = anchorRect.left
  if (left + dropdownWidth > window.innerWidth - 8) {
    left = window.innerWidth - dropdownWidth - 8
  }
  if (left < 8) left = 8
  style.left = left

  // 세로 위치: 아래쪽에 여유가 있으면 아래, 없으면 위
  const dropdownHeight = 220
  if (anchorRect.bottom + dropdownHeight < window.innerHeight - 8) {
    style.top = anchorRect.bottom + 4
  } else {
    style.top = Math.max(8, anchorRect.top - dropdownHeight - 4)
  }

  return (
    <div ref={ref} style={style} className="w-[240px] rounded-lg border bg-white p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold text-foreground">{userName}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {format(date, 'M/d (EEE)', { locale: ko })}
      </p>

      {/* 근무 */}
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

      {/* 휴일 */}
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">휴일</p>
      <div className="grid grid-cols-5 gap-1">
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
    </div>
  )
}
