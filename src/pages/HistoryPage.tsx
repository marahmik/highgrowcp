import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { MobileScheduleGrid } from '@/components/schedule/MobileScheduleGrid'
import type { Schedule } from '@/types/database'
import type { MemberWithRole } from '@/pages/StorePage'

export function HistoryPage() {
  const { user, profile } = useAuthStore()
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  
  const days = useMemo(() => eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  }), [currentMonth])

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('schedules')
      .select('*, stores(*)')
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lte('date', monthEnd)

    if (error) {
      console.error('History load error:', error)
    } else {
      setSchedules(data || [])
    }
    setLoading(false)
  }, [user, currentMonth])

  useEffect(() => {
    loadData()
  }, [loadData])

  function navigateMonth(direction: 'prev' | 'next') {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1))
  }

  // MobileScheduleGrid에 전달할 가상 멤버 목록 (본인 1명)
  const dummyMembers: MemberWithRole[] = useMemo(() => {
    if (!profile) return []
    return [{
      ...profile,
      storeRole: 'user',
      annualLeave: 0,
      memberId: 'history-dummy',
    }]
  }, [profile])

  if (loading && schedules.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">기록 로딩 중...</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">내 근무기록</h1>
        </div>
        <div className="text-xs text-muted-foreground">수정 불가 (조회 전용)</div>
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <MobileScheduleGrid
          currentMonth={currentMonth}
          days={days}
          members={dummyMembers}
          schedules={schedules}
          currentUserId={user?.id || ''}
          isManager={false}
          isLocked={true} // 무조건 잠금 (수정 불가)
          onSave={() => {}} 
        />
      </div>

      <div className="bg-slate-50 rounded-lg p-4 space-y-2 border border-slate-100">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Summary</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-3 rounded-md border shadow-sm">
            <div className="text-[10px] text-muted-foreground">이번 달 총 근무</div>
            <div className="text-lg font-bold text-primary">{schedules.filter(s => s.work_type).length}일</div>
          </div>
          <div className="bg-white p-3 rounded-md border shadow-sm">
            <div className="text-[10px] text-muted-foreground">이번 달 연차/요청</div>
            <div className="text-lg font-bold text-amber-600">{schedules.filter(s => s.leave_type).length}일</div>
          </div>
        </div>
      </div>
      
      <p className="text-[11px] text-center text-muted-foreground">
        과거 근무 기록은 정산 및 개인 확인 용도로만 사용해 주세요.<br/>
        기록에 오류가 있는 경우 매장 매니저에게 문의 바랍니다.
      </p>
    </div>
  )
}
