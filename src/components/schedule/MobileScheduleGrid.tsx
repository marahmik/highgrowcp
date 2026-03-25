import React, { useState, useMemo } from 'react'
import { format, getDay, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns'
import { EditDropdown } from './EditDropdown'
import type { Schedule, WorkType, LeaveType } from '@/types/database'
import type { MemberWithRole } from '@/pages/StorePage'
import { WORK_TYPE_COLORS, LEAVE_TYPE_COLORS, WORK_TYPE_LABELS, LEAVE_TYPE_LABELS, SUPERVISOR_WORK_LABELS } from '@/constants/colors'

interface MobileScheduleGridProps {
  currentMonth: Date
  days: Date[]
  members: MemberWithRole[]
  schedules: Schedule[]
  currentUserId: string
  isManager: boolean
  isLocked: boolean
  isSupervisorStore?: boolean
  onSave: (userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) => void
}

interface EditTarget {
  userId: string
  userName: string
  date: Date
  workType: WorkType | null
  leaveType: LeaveType | null
  anchorRect: { top: number; left: number; bottom: number; right: number }
  isManagerEdit: boolean
  isSupervisorEdit: boolean
}

export function MobileScheduleGrid({ currentMonth, days, members, schedules, currentUserId, isManager, isLocked, isSupervisorStore = false, onSave }: MobileScheduleGridProps) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  // 내 정보만 필터링
  const myInfo = useMemo(() => members.find(m => m.id === currentUserId), [members, currentUserId])
  
  // 내 스케줄 맵
  const scheduleMap = useMemo(() => {
    const map = new Map<string, Schedule>()
    schedules.filter(s => s.user_id === currentUserId).forEach(s => {
      map.set(s.date, s)
    })
    return map
  }, [schedules, currentUserId])

  // 달력 그리드를 위한 날짜 계산 (주의 시작부터 끝까지)
  const calendarDays = useMemo(() => {
    const start = startOfWeek(days[0], { weekStartsOn: 0 })
    const end = endOfWeek(days[days.length - 1], { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [days])

  const weeks = useMemo(() => {
    const w = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      w.push(calendarDays.slice(i, i + 7))
    }
    return w
  }, [calendarDays])

  function handleCellClick(date: Date, e: React.MouseEvent) {
    if (isLocked) return
    // 매니저면 myInfo가 없더라도(=매장 멤버가 아니더라도) 수정 가능해야 함
    if (!myInfo && !isManager) return

    const key = format(date, 'yyyy-MM-dd')
    const s = scheduleMap.get(key)
    const workType = (s?.work_type as WorkType) ?? null
    const leaveType = (s?.leave_type as LeaveType) ?? null
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

    setEditTarget({
      userId: currentUserId, // myInfo.id 대신 prop으로 받은 currentUserId 사용 (매니저가 다른 사람 볼 때)
      userName: myInfo?.display_name || '관리자',
      date,
      workType,
      leaveType,
      anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
      isManagerEdit: isManager,
      isSupervisorEdit: isSupervisorStore,
    })
  }

  function handleSave(workType: WorkType | null, leaveType: LeaveType | null) {
    if (!editTarget) return
    onSave(editTarget.userId, format(editTarget.date, 'yyyy-MM-dd'), workType, leaveType)
  }

  // 근무 유형별 색상 및 라벨 결정
  function getCellStyles(date: Date) {
    const key = format(date, 'yyyy-MM-dd')
    const s = scheduleMap.get(key)
    if (!s) return { bg: 'bg-white', label: '', color: 'text-foreground' }

    if (s.leave_type) {
      return { 
        bg: LEAVE_TYPE_COLORS[s.leave_type as LeaveType] || 'bg-white', 
        label: LEAVE_TYPE_LABELS[s.leave_type as LeaveType],
        color: 'text-foreground'
      }
    }
    if (s.work_type) {
      const isRecordSupervisor = (s as any).stores?.name?.includes('수퍼바이저')
      const effectiveIsSupervisor = isRecordSupervisor ?? isSupervisorStore

      return { 
        bg: WORK_TYPE_COLORS[s.work_type as WorkType] || 'bg-white', 
        label: effectiveIsSupervisor ? SUPERVISOR_WORK_LABELS[s.work_type as WorkType] : WORK_TYPE_LABELS[s.work_type as WorkType],
        color: 'text-foreground'
      }
    }
    return { bg: 'bg-white', label: '', color: 'text-foreground' }
  }

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {DAY_LABELS.map((d, i) => (
          <div key={d} className={`py-2 text-center text-[11px] font-semibold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'}`}>
            {d}
          </div>
        ))}
      </div>
      
      <div className="divide-y border-b">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 divide-x">
            {week.map((day) => {
              const { bg, label } = getCellStyles(day)
              const isToday = isSameDay(day, new Date())
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const dow = getDay(day)

              return (
                <button
                  key={day.toISOString()}
                  onClick={(e) => handleCellClick(day, e)}
                  disabled={!isCurrentMonth}
                  className={`relative flex min-h-[70px] flex-col items-center justify-start p-1 transition-colors hover:bg-muted/30 ${!isCurrentMonth ? 'bg-muted/20 opacity-30' : 'bg-white'}`}
                >
                  <span className={`text-[10px] font-medium ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-foreground'} ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  
                  {label && (
                    <div className={`mt-1 flex w-full flex-1 items-center justify-center rounded text-[10px] font-bold shadow-sm ${bg} px-0.5 leading-tight text-center`}>
                      {label}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {editTarget && (
        <EditDropdown
          date={editTarget.date}
          userName={editTarget.userName}
          initialWorkType={editTarget.workType}
          initialLeaveType={editTarget.leaveType}
          anchorRect={editTarget.anchorRect}
          isManager={editTarget.isManagerEdit}
          isSupervisor={editTarget.isSupervisorEdit}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
