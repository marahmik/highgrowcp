import { WORK_TYPE_LABELS, LEAVE_TYPE_LABELS, WORK_TYPE_COLORS, LEAVE_TYPE_COLORS, SUPERVISOR_WORK_LABELS } from '@/constants/colors'
import type { WorkType, LeaveType } from '@/types/database'

interface ScheduleCellProps {
  workType: WorkType | null
  leaveType: LeaveType | null
  isEditable: boolean
  isSupervisor?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export function ScheduleCell({ workType, leaveType, isEditable, isSupervisor = false, onClick }: ScheduleCellProps) {
  const isEmpty = !workType && !leaveType

  let bgColor = ''
  let label = ''

  if (workType) {
    bgColor = WORK_TYPE_COLORS[workType]
    label = isSupervisor ? SUPERVISOR_WORK_LABELS[workType] : WORK_TYPE_LABELS[workType]
  } else if (leaveType) {
    bgColor = LEAVE_TYPE_COLORS[leaveType]
    label = LEAVE_TYPE_LABELS[leaveType]
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isEditable}
      className={`
        h-7 sm:h-8 w-full min-w-0 rounded-sm text-[8px] sm:text-[9px] xl:text-[11px] font-medium transition-colors leading-none tracking-tighter overflow-hidden text-ellipsis whitespace-nowrap
        ${bgColor}
        ${isEmpty ? 'text-muted-foreground hover:bg-muted' : ''}
        ${isEditable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
      `}
    >
      {label || (isEditable ? '—' : '')}
    </button>
  )
}
