import { useEffect, useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { ArrowLeft, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MobileScheduleGrid } from '@/components/schedule/MobileScheduleGrid'
import { MonthPickerDropdown } from '@/components/schedule/MonthPickerDropdown'
import { supabase } from '@/lib/supabase'
import type { MemberWithRole } from '@/pages/StorePage'
import type { Profile, Schedule, Store, StoreMember } from '@/types/database'

interface ResignedMemberDetails extends StoreMember {
  profiles: Profile
  stores: Store
}

export function ResignedHistoryPage() {
  const { memberId } = useParams<{ memberId: string }>()
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [member, setMember] = useState<ResignedMemberDetails | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [memberLoading, setMemberLoading] = useState(true)
  const [schedulesLoading, setSchedulesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const days = useMemo(() => eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  }), [currentMonth])

  useEffect(() => {
    let cancelled = false

    async function loadMember() {
      setMemberLoading(true)
      setMember(null)
      setError(null)

      if (!memberId) {
        setError('퇴사자 정보를 찾을 수 없습니다.')
        setMemberLoading(false)
        return
      }

      const { data, error: memberError } = await supabase
        .from('store_members')
        .select('*, profiles(*), stores(*)')
        .eq('id', memberId)
        .eq('role', 'resigned')
        .maybeSingle()

      if (cancelled) return

      if (memberError || !data) {
        setError('퇴사자 정보를 찾을 수 없습니다.')
      } else {
        setMember(data as ResignedMemberDetails)
      }
      setMemberLoading(false)
    }

    void loadMember()
    return () => {
      cancelled = true
    }
  }, [memberId])

  useEffect(() => {
    if (!member) return
    const selectedMember = member

    let cancelled = false

    async function loadSchedules() {
      setSchedulesLoading(true)
      setSchedules([])
      setError(null)

      const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
      const { data, error: schedulesError } = await supabase
        .from('schedules')
        .select('*')
        .eq('user_id', selectedMember.user_id)
        .eq('store_id', selectedMember.store_id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date')

      if (cancelled) return

      if (schedulesError) {
        setError('근무기록을 불러오지 못했습니다.')
      } else {
        setSchedules(data || [])
      }
      setSchedulesLoading(false)
    }

    void loadSchedules()
    return () => {
      cancelled = true
    }
  }, [member, currentMonth])

  const members = useMemo<MemberWithRole[]>(() => {
    if (!member) return []

    return [{
      ...member.profiles,
      storeRole: member.role,
      annualLeave: member.annual_leave,
      memberId: member.id,
    }]
  }, [member])

  const workedDays = useMemo(
    () => schedules.filter((schedule) => schedule.work_type).length,
    [schedules],
  )

  if (memberLoading) {
    return <div className="py-12 text-center text-muted-foreground">퇴사자 정보를 불러오는 중...</div>
  }

  if (error || !member) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-sm text-destructive">{error || '퇴사자 정보를 찾을 수 없습니다.'}</p>
        <Button variant="outline" onClick={() => navigate('/admin')}>
          관리자 페이지로 돌아가기
        </Button>
      </div>
    )
  }

  if (schedulesLoading) {
    return <div className="py-12 text-center text-muted-foreground">근무기록을 불러오는 중...</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/admin')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          관리자 페이지
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{member.profiles.display_name} 근무기록</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {member.stores.name}
              {member.resignation_date && ` · 퇴사일 ${member.resignation_date}`}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">조회 전용</div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentMonth((month) => subMonths(month, 1))}
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <MonthPickerDropdown currentMonth={currentMonth} onChange={setCurrentMonth} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentMonth((month) => addMonths(month, 1))}
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <MobileScheduleGrid
          currentMonth={currentMonth}
          days={days}
          members={members}
          schedules={schedules}
          ghostSchedules={[]}
          currentUserId={member.user_id}
          isManager={false}
          isLocked
          onSave={() => {}}
        />
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
        <div className="text-[10px] text-muted-foreground">선택 월 총 근무</div>
        <div className="text-lg font-bold text-primary">{workedDays}일</div>
      </div>
    </div>
  )
}
