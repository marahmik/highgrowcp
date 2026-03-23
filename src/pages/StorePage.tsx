import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import type { Schedule, Profile, WorkType, LeaveType, Store, GhostSchedule } from '@/types/database'

// 직급 순서 (낮을수록 위에 표시)
export const ROLE_ORDER: Record<string, number> = {
  admin: 1,
  senior: 2,
  junior: 3,
  parttimer: 4,
}

export const ROLE_LABELS: Record<string, string> = {
  admin: '매니저',
  senior: '시니어',
  junior: '주니어',
  parttimer: '파트타이머',
}

// 직급별 이름 배경 색상
export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  senior: 'bg-blue-100 text-blue-700',
  junior: 'bg-orange-100 text-orange-700',
  parttimer: 'bg-purple-100 text-purple-700',
}

export interface MemberWithRole extends Profile {
  storeRole: string
  annualLeave: number
  memberId: string
  isGhost?: boolean
  ghostSlot?: number
}

export function StorePage() {
  const { storeId } = useParams<{ storeId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, profile } = useAuthStore()

  const monthParam = searchParams.get('month')
  const monthKey = monthParam ?? format(new Date(), 'yyyy-MM')
  const currentMonth = useMemo(() => new Date(monthKey + '-01'), [monthKey])
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const [store, setStore] = useState<Store | null>(null)
  const [members, setMembers] = useState<MemberWithRole[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [ghostSchedules, setGhostSchedules] = useState<GhostSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string>('parttimer')

  const isManager = currentUserRole === 'admin' || profile?.role === 'admin'

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const loadData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [storeRes, membersRes, schedulesRes, ghostRes] = await Promise.all([
      supabase.from('stores').select('*').eq('id', storeId).single(),
      supabase
        .from('store_members')
        .select('*, profiles(*)')
        .eq('store_id', storeId)
        .eq('status', 'approved'),
      supabase
        .from('schedules')
        .select('*')
        .eq('store_id', storeId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase
        .from('ghost_schedules')
        .select('*')
        .eq('store_id', storeId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
    ])

    if (storeRes.data) setStore(storeRes.data)
    if (membersRes.data) {
      const enriched: MemberWithRole[] = membersRes.data.map((m: any) => ({
        ...m.profiles,
        storeRole: m.role,
        annualLeave: m.annual_leave ?? 0,
        memberId: m.id,
      }))

      // 직급순 정렬
      enriched.sort((a, b) => (ROLE_ORDER[a.storeRole] ?? 99) - (ROLE_ORDER[b.storeRole] ?? 99))

      // 단기알바 2칸 추가
      const ghostMembers: MemberWithRole[] = [
        { id: `ghost-${storeId}-1`, display_name: '단기알바 1', phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 1 },
        { id: `ghost-${storeId}-2`, display_name: '단기알바 2', phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 2 },
      ]

      setMembers([...enriched, ...ghostMembers])

      const myMembership = membersRes.data.find((m: any) => m.user_id === user?.id)
      if (myMembership) setCurrentUserRole(myMembership.role)
    }
    if (schedulesRes.data) setSchedules(schedulesRes.data)
    if (ghostRes.data) setGhostSchedules(ghostRes.data as GhostSchedule[])
    setLoading(false)
  }, [storeId, monthKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 실시간 구독: schedules 테이블 변경 시 자동 새로고침
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`schedules-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules', filter: `store_id=eq.${storeId}` },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ghost_schedules', filter: `store_id=eq.${storeId}` },
        () => loadData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, loadData])

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1)
    setSearchParams({ month: format(newMonth, 'yyyy-MM') })
  }

  async function handleSave(userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) {
    if (!storeId) return

    // 단기알바인 경우 ghost_schedules 사용
    const ghostMatch = userId.match(/^ghost-.+-(\d+)$/)
    if (ghostMatch) {
      const slot = parseInt(ghostMatch[1])
      if (!workType && !leaveType) {
        await supabase.from('ghost_schedules').delete()
          .eq('store_id', storeId).eq('slot', slot).eq('date', date)
      } else {
        await supabase.from('ghost_schedules').upsert(
          { store_id: storeId, slot, date, work_type: workType, leave_type: leaveType },
          { onConflict: 'store_id,slot,date' }
        )
      }
      loadData()
      return
    }

    if (!workType && !leaveType) {
      await supabase.from('schedules').delete()
        .eq('store_id', storeId).eq('user_id', userId).eq('date', date)
    } else {
      await supabase.from('schedules').upsert(
        { store_id: storeId, user_id: userId, date, work_type: workType, leave_type: leaveType, status: 'approved' },
        { onConflict: 'store_id,user_id,date' }
      )
    }
    loadData()
  }

  async function handleAnnualLeaveUpdate(memberId: string, value: number) {
    await supabase.from('store_members').update({ annual_leave: value }).eq('id', memberId)
    loadData()
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{store?.name}</h1>
          <p className="text-sm text-muted-foreground">{members.filter(m => !m.isGhost).length}명 근무</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigateMonth('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => navigateMonth('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-open" />오픈</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-middle" />미들</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-close" />마감</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-allday" />종일</span>
        <span className="text-muted-foreground">|</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-annual" />연차</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-half" />반차</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-substitute" />대체휴</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-sick" />병가</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-request" />요청</span>
      </div>

      {members.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">승인된 멤버가 없습니다.</p>
      ) : (
        <ScheduleGrid
          year={year}
          month={month}
          days={days}
          members={members}
          schedules={schedules}
          ghostSchedules={ghostSchedules}
          currentUserId={user?.id ?? ''}
          isManager={isManager}
          onSave={handleSave}
          onAnnualLeaveUpdate={handleAnnualLeaveUpdate}
        />
      )}
    </div>
  )
}
