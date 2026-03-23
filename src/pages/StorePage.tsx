import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import type { Schedule, Profile, WorkType, LeaveType, Store } from '@/types/database'

export interface MemberWithRole extends Profile {
  storeRole: string  // 'admin' | 'member'
  annualLeave: number
  memberId: string   // store_members.id for updating
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
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string>('member')

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

    const [storeRes, membersRes, schedulesRes] = await Promise.all([
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
    ])

    if (storeRes.data) setStore(storeRes.data)
    if (membersRes.data) {
      const enriched: MemberWithRole[] = membersRes.data.map((m: any) => ({
        ...m.profiles,
        storeRole: m.role,
        annualLeave: m.annual_leave ?? 0,
        memberId: m.id,
      }))
      setMembers(enriched)

      // 현재 유저의 매장 역할을 찾기
      const myMembership = membersRes.data.find((m: any) => m.user_id === user?.id)
      if (myMembership) setCurrentUserRole(myMembership.role)
    }
    if (schedulesRes.data) setSchedules(schedulesRes.data)
    setLoading(false)
  }, [storeId, monthKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1)
    setSearchParams({ month: format(newMonth, 'yyyy-MM') })
  }

  async function handleSave(userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) {
    if (!storeId) return

    if (!workType && !leaveType) {
      await supabase
        .from('schedules')
        .delete()
        .eq('store_id', storeId)
        .eq('user_id', userId)
        .eq('date', date)
    } else {
      await supabase
        .from('schedules')
        .upsert(
          {
            store_id: storeId,
            user_id: userId,
            date,
            work_type: workType,
            leave_type: leaveType,
            status: 'approved',
          },
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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{store?.name}</h1>
          <p className="text-sm text-muted-foreground">{members.length}명 근무</p>
        </div>
      </div>

      {/* 월 네비게이션 */}
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

      {/* 범례 */}
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

      {/* 스케줄 그리드 */}
      {members.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">승인된 멤버가 없습니다.</p>
      ) : (
        <ScheduleGrid
          year={year}
          month={month}
          days={days}
          members={members}
          schedules={schedules}
          currentUserId={user?.id ?? ''}
          isManager={isManager}
          onSave={handleSave}
          onAnnualLeaveUpdate={handleAnnualLeaveUpdate}
        />
      )}
    </div>
  )
}
