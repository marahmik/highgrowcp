import { useState } from 'react'
import { format, getDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ScheduleCell } from './ScheduleCell'
import { EditDropdown } from './EditDropdown'
import type { Schedule, WorkType, LeaveType, GhostSchedule } from '@/types/database'
import type { MemberWithRole } from '@/pages/StorePage'
import { ROLE_COLORS, ROLE_LABELS } from '@/pages/StorePage'

interface ScheduleGridProps {
  year: number
  month: number
  days: Date[]
  members: MemberWithRole[]
  schedules: Schedule[]
  ghostSchedules: GhostSchedule[]
  currentUserId: string
  isManager: boolean
  isLocked: boolean
  onSave: (userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) => void
  onAnnualLeaveUpdate: (memberId: string, value: number) => void
}

interface EditTarget {
  userId: string
  userName: string
  date: Date
  workType: WorkType | null
  leaveType: LeaveType | null
  anchorRect: { top: number; left: number; bottom: number; right: number }
  isManagerEdit: boolean
}

const DAY_COLORS: Record<number, string> = {
  0: 'bg-day-sunday',
  6: 'bg-day-saturday',
}

const DAY_TEXT_COLORS: Record<number, string> = {
  0: 'text-red-500',
  6: 'text-blue-500',
}

export function ScheduleGrid({ days, members, schedules, ghostSchedules, currentUserId, isManager, isLocked, onSave, onAnnualLeaveUpdate }: ScheduleGridProps) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editingLeave, setEditingLeave] = useState<string | null>(null)
  const [leaveInput, setLeaveInput] = useState('')

  // 일반 스케줄 맵
  const scheduleMap = new Map<string, Schedule>()
  for (const s of schedules) {
    scheduleMap.set(`${s.user_id}_${s.date}`, s)
  }

  // 단기알바 스케줄 맵
  const ghostMap = new Map<string, GhostSchedule>()
  for (const g of ghostSchedules) {
    ghostMap.set(`ghost-${g.store_id}-${g.slot}_${g.date}`, g)
  }

  function getSchedule(member: MemberWithRole, date: Date): { workType: WorkType | null; leaveType: LeaveType | null } {
    if (member.isGhost) {
      const key = `${member.id}_${format(date, 'yyyy-MM-dd')}`
      const g = ghostMap.get(key)
      return { workType: (g?.work_type as WorkType) ?? null, leaveType: (g?.leave_type as LeaveType) ?? null }
    }
    const key = `${member.id}_${format(date, 'yyyy-MM-dd')}`
    const s = scheduleMap.get(key)
    return { workType: (s?.work_type as WorkType) ?? null, leaveType: (s?.leave_type as LeaveType) ?? null }
  }

  function handleCellClick(member: MemberWithRole, date: Date, e: React.MouseEvent) {
    if (isLocked) return
    if (member.isGhost && !isManager) return
    const isSelf = member.id === currentUserId
    const canEdit = isManager || isSelf
    if (!canEdit) return

    const { workType, leaveType } = getSchedule(member, date)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

    setEditTarget({
      userId: member.id,
      userName: member.display_name,
      date,
      workType,
      leaveType,
      anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
      isManagerEdit: isManager,
    })
  }

  function handleSave(workType: WorkType | null, leaveType: LeaveType | null) {
    if (!editTarget) return
    onSave(editTarget.userId, format(editTarget.date, 'yyyy-MM-dd'), workType, leaveType)
  }

  function startLeaveEdit(memberId: string, currentValue: number) {
    if (!isManager) return
    setEditingLeave(memberId)
    setLeaveInput(String(currentValue))
  }

  function saveLeaveEdit(member: MemberWithRole) {
    const val = parseFloat(leaveInput)
    if (!isNaN(val) && val >= 0) {
      onAnnualLeaveUpdate(member.memberId, val)
    }
    setEditingLeave(null)
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 min-w-[100px] border-r bg-muted px-2 py-1.5 text-left text-xs font-semibold">
                이름
              </th>
              <th className="min-w-[40px] border-r bg-muted px-1 py-1.5 text-center text-xs font-semibold">
                연차
              </th>
              {days.map((day) => {
                const dow = getDay(day)
                return (
                  <th
                    key={day.toISOString()}
                    className={`min-w-[44px] px-1 py-1.5 text-center text-xs font-medium ${DAY_COLORS[dow] ?? ''} ${DAY_TEXT_COLORS[dow] ?? ''}`}
                  >
                    <div>{format(day, 'd')}</div>
                    <div className="text-[10px]">{format(day, 'EEE', { locale: ko })}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const roleColor = ROLE_COLORS[member.storeRole] ?? ''
              const roleLabel = ROLE_LABELS[member.storeRole] ?? ''

              return (
                <tr key={member.id} className="border-t hover:bg-muted/30">
                  <td className="sticky left-0 z-10 border-r bg-white px-2 py-1 text-xs font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold ${roleColor}`}>
                        {member.isGhost ? '단기' : roleLabel}
                      </span>
                      <span>{member.display_name}</span>
                      {member.id === currentUserId && (
                        <span className="text-[10px] text-primary">(나)</span>
                      )}
                    </div>
                  </td>
                  {/* 잔여 연차 */}
                  <td className="border-r bg-white px-1 py-0.5 text-center text-xs">
                    {member.isGhost ? (
                      <span className="text-muted-foreground">—</span>
                    ) : editingLeave === member.memberId ? (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={leaveInput}
                        onChange={(e) => setLeaveInput(e.target.value)}
                        onBlur={() => saveLeaveEdit(member)}
                        onKeyDown={(e) => e.key === 'Enter' && saveLeaveEdit(member)}
                        className="h-6 w-10 rounded border text-center text-xs"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`inline-block min-w-[24px] ${isManager ? 'cursor-pointer hover:text-primary' : ''}`}
                        onClick={() => startLeaveEdit(member.memberId, member.annualLeave)}
                      >
                        {member.annualLeave}
                      </span>
                    )}
                  </td>
                  {days.map((day) => {
                    const dow = getDay(day)
                    const { workType, leaveType } = getSchedule(member, day)
                    const isSelf = member.id === currentUserId
                    const canEdit = isManager || (isSelf && !member.isGhost)

                    return (
                      <td
                        key={day.toISOString()}
                        className={`px-0.5 py-0.5 ${DAY_COLORS[dow] ?? ''}`}
                      >
                        <ScheduleCell
                          workType={workType}
                          leaveType={leaveType}
                          isEditable={canEdit}
                          onClick={(e) => handleCellClick(member, day, e)}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <EditDropdown
          date={editTarget.date}
          userName={editTarget.userName}
          initialWorkType={editTarget.workType}
          initialLeaveType={editTarget.leaveType}
          anchorRect={editTarget.anchorRect}
          isManager={editTarget.isManagerEdit}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  )
}
