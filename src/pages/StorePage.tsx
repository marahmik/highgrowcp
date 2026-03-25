import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Lock, Unlock, MessageSquare, Info, Ban } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { AllSchedulesTab } from '@/pages/admin/AllSchedulesTab'
import type { Schedule, Profile, WorkType, LeaveType, Store, GhostSchedule } from '@/types/database'
import { toast } from 'sonner'
import { MobileScheduleGrid } from '@/components/schedule/MobileScheduleGrid'

// 직급 순서 (낮을수록 위에 표시)
export const ROLE_ORDER: Record<string, number> = {
  admin: 1,
  senior: 2,
  junior: 3,
  parttimer: 4,
  resigned: 5,
}

export const ROLE_LABELS: Record<string, string> = {
  admin: '매니저',
  senior: '시니어',
  junior: '주니어',
  parttimer: '파트타이머',
  resigned: '퇴사자',
}

export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  senior: 'bg-blue-100 text-blue-700',
  junior: 'bg-orange-100 text-orange-700',
  parttimer: 'bg-purple-100 text-purple-700',
  resigned: 'bg-red-200 text-red-800',
}

export interface MemberWithRole extends Profile {
  storeRole: string
  annualLeave: number
  memberId: string
  isGhost?: boolean
  ghostSlot?: number
}

interface PendingWork {
  work_type: WorkType | null
  leave_type: LeaveType | null
}

export function StorePage() {
  const { storeId } = useParams<{ storeId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, profile, isAdmin } = useAuthStore()

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

  // 모바일에서 선택된 멤버 (기본값: 본인)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const isManager = isAdmin() // 전체 관리자 또는 매니저 직급 확인
  const isLocked = store?.locked ?? false
  const isSupervisorStore = store?.name?.includes('수퍼바이저') ?? false

  // 미저장된 변경사항 상태: Key="userId_date"
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingWork>>({})

  // DB 데이터와 변경사항 병합 (UI 즉시 반영용)
  const displaySchedules = useMemo(() => {
    const merged = [...schedules]
    Object.entries(pendingChanges).forEach(([key, change]) => {
      const c = change as PendingWork
      if (key.includes('_ghost_')) return // Ghost는 별도 처리
      const [userId, date] = key.split('_')
      const idx = merged.findIndex(s => s.user_id === userId && s.date === date)
      if (idx !== -1) {
        merged[idx] = { ...merged[idx], work_type: c.work_type, leave_type: c.leave_type }
      } else {
        merged.push({ user_id: userId, date, work_type: c.work_type, leave_type: c.leave_type, status: 'approved' } as Schedule)
      }
    })
    return merged
  }, [schedules, pendingChanges])

  const displayGhostSchedules = useMemo(() => {
    const merged = [...ghostSchedules]
    Object.entries(pendingChanges).forEach(([key, change]) => {
      const c = change as PendingWork
      if (!key.includes('_ghost_')) return
      const [slotStr, date] = key.replace('ghost-', '').split('_ghost_')
      const slot = parseInt(slotStr)
      const idx = merged.findIndex(g => g.slot === slot && g.date === date)
      if (idx !== -1) {
        merged[idx] = { ...merged[idx], work_type: c.work_type, leave_type: c.leave_type }
      } else {
        merged.push({ store_id: storeId!, slot, date, work_type: c.work_type, leave_type: c.leave_type } as GhostSchedule)
      }
    })
    return merged
  }, [ghostSchedules, pendingChanges, storeId])

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // [임시 서비스] 모든 매장 메모 초기화 (2024년 3월 25일 기준 1회 실행)
  useEffect(() => {
    const resetAllMemos = async () => {
      const hasReset = localStorage.getItem('memos_reset_20240325v2')
      if (!hasReset) {
        const { error } = await supabase.from('stores').update({ memo: null }).neq('id', '00000000-0000-0000-0000-000000000000')
        if (!error) {
          localStorage.setItem('memos_reset_20240325v2', 'true')
          console.log('All store memos have been reset.')
        }
      }
    }
    resetAllMemos()
  }, [])

  const memoObj = useMemo(() => {
    if (!store?.memo) return {}
    try {
      const parsed = JSON.parse(store.memo)
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch {
      // legacy fallback
    }
    return { 'legacy': store.memo }
  }, [store?.memo])

  const currentMemo = memoObj[monthKey] ?? (memoObj['legacy'] ?? '')

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

      const ghostMembers: MemberWithRole[] = storeRes.data?.name?.includes('수퍼바이저') ? [] : [
        { id: `ghost-${storeId}-1`, display_name: '단기알바 1', phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 1 },
        { id: `ghost-${storeId}-2`, display_name: '단기알바 2', phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 2 },
      ]

      const active = enriched.filter(m => m.storeRole !== 'resigned')
      setMembers([...active, ...ghostMembers])

      const myMembership = membersRes.data.find((m: any) => m.user_id === user?.id)
      if (myMembership) {
        setCurrentUserRole(myMembership.role)
        if (myMembership.role === 'resigned' && profile?.role !== 'admin') {
          setLoading(false)
          return
        }
      } else if (profile?.role === 'admin') {
        setCurrentUserRole('admin') // 시스템 관리자는 매니저 권한 부여
      }

      if (!selectedMemberId && user?.id) {
        setSelectedMemberId(user.id)
      }
    }
    if (schedulesRes.data) setSchedules(schedulesRes.data)
    if (ghostRes.data) setGhostSchedules(ghostRes.data as GhostSchedule[])
    setLoading(false)
  }, [storeId, monthKey, user?.id, profile?.role, selectedMemberId])

  useEffect(() => { loadData() }, [loadData])

  // 실시간 구독
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`schedules-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `store_id=eq.${storeId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ghost_schedules', filter: `store_id=eq.${storeId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` }, (payload) => {
         if (payload.new) setStore(prev => prev ? { ...prev, ...payload.new } : payload.new as Store)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [storeId, loadData])

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1)
    setSearchParams({ month: format(newMonth, 'yyyy-MM') })
  }

  async function toggleLock() {
    if (!storeId || !store) return
    const newLocked = !store.locked
    await supabase.from('stores').update({ locked: newLocked }).eq('id', storeId)
    setStore({ ...store, locked: newLocked })
  }

  function handleSave(userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) {
    if (!storeId) return
    if (isLocked && !isManager) return

    if (!isManager) {
      if (userId !== user?.id) return
      if (workType !== null || (leaveType !== null && leaveType !== 'request')) {
        toast.error('일반 직급은 "요청" 티커만 설정할 수 있습니다.')
        return
      }
    }

    const ghostMatch = userId.match(/^ghost-.+-(\d+)$/)
    const key = ghostMatch ? `ghost-${ghostMatch[1]}_ghost_${date}` : `${userId}_${date}`
    
    setPendingChanges(prev => ({
      ...prev,
      [key]: { work_type: workType, leave_type: leaveType }
    }))
  }

  async function commitChanges() {
    if (!storeId || Object.keys(pendingChanges).length === 0) return
    setLoading(true)

    try {
      const scheduleUpserts: any[] = []
      const scheduleDeletes: { userId: string; date: string }[] = []
      const ghostUpserts: any[] = []
      const ghostDeletes: { slot: number; date: string }[] = []

      Object.entries(pendingChanges).forEach(([key, change]) => {
        const c = change as PendingWork
        if (key.includes('_ghost_')) {
          const [slotStr, date] = key.replace('ghost-', '').split('_ghost_')
          const slot = parseInt(slotStr)
          if (!c.work_type && !c.leave_type) {
            ghostDeletes.push({ slot, date })
          } else {
            ghostUpserts.push({ store_id: storeId, slot, date, ...c })
          }
        } else {
          const [userId, date] = key.split('_')
          if (!c.work_type && !c.leave_type) {
            scheduleDeletes.push({ userId, date })
          } else {
            scheduleUpserts.push({ store_id: storeId, user_id: userId, date, ...c, status: 'approved' })
          }
        }
      })

      const promises: any[] = []

      if (scheduleUpserts.length > 0) {
        promises.push(supabase.from('schedules').upsert(scheduleUpserts, { onConflict: 'store_id,user_id,date' }))
      }
      scheduleDeletes.forEach(d => {
        promises.push(supabase.from('schedules').delete().eq('store_id', storeId).eq('user_id', d.userId).eq('date', d.date))
      })

      if (ghostUpserts.length > 0) {
        promises.push(supabase.from('ghost_schedules').upsert(ghostUpserts, { onConflict: 'store_id,slot,date' }))
      }
      ghostDeletes.forEach(d => {
        promises.push(supabase.from('ghost_schedules').delete().eq('store_id', storeId).eq('slot', d.slot).eq('date', d.date))
      })

      const results = await Promise.all(promises)
      const errors = results.filter(r => r.error)
      
      if (errors.length > 0) {
        console.error('Commit errors:', errors)
        toast.error(`${errors.length}건의 저장 실패가 발생했습니다.`)
      } else {
        toast.success('변경사항이 저장되었습니다.')
        setPendingChanges({})
        await loadData()
      }
    } catch (err) {
      console.error('Commit exception:', err)
      toast.error('저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function cancelChanges() {
    setPendingChanges({})
    toast.info('변경사항이 취소되었습니다.')
  }

  async function handleAnnualLeaveUpdate(memberId: string, value: number) {
    if (!isManager) return
    const { error } = await supabase.from('store_members').update({ annual_leave: value }).eq('id', memberId)
    if (error) {
      toast.error('연차 수정 실패: ' + error.message)
    } else {
      loadData()
    }
  }

  async function handleMemoUpdate(memoText: string) {
    if (!storeId || !store) return
    const newMemoObj = { ...memoObj, [monthKey]: memoText }
    const newMemoString = JSON.stringify(newMemoObj)
    const { error } = await supabase.from('stores').update({ memo: newMemoString }).eq('id', storeId)
    if (error) { toast.error('메모 저장 실패', { description: error.message }); return }
  }

  if (loading && !Object.keys(pendingChanges).length) {
    return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
  }

  // 퇴사자 접근 차단
  if (currentUserRole === 'resigned' && !isAdmin()) {
    return (
      <div className="mx-auto max-w-md py-20 text-center space-y-4">
        <Ban className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold">접근 권한이 없습니다</h2>
        <p className="text-muted-foreground">관리자에 의해 이 매장에서 퇴사 처리된 상태입니다.</p>
        <Button variant="outline" onClick={() => window.location.href = '/history'}>
          내 근무기록 확인하기
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-12 pb-24">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {store?.name}
              {isLocked && <span className="ml-2 text-sm text-red-500">🔒 <span className="hidden sm:inline">잠금됨</span></span>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isMobile ? (
                <span className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[currentUserRole]}`}>
                    {ROLE_LABELS[currentUserRole]}
                  </span>
                  내 스케줄
                </span>
              ) : (
                `${members.filter(m => !m.isGhost).length}명 근무`
              )}
            </p>
          </div>
          {isManager && !isMobile && (
            <Button
              size="sm"
              variant={isLocked ? 'destructive' : 'outline'}
              onClick={toggleLock}
            >
              {isLocked ? <><Unlock className="mr-1 h-4 w-4" />잠금 해제</> : <><Lock className="mr-1 h-4 w-4" />캘린더 잠금</>}
            </Button>
          )}
        </div>

        {isSupervisorStore && (
          <div className="flex border-l-4 border-slate-800 bg-slate-50 p-3 rounded-r-lg items-center gap-3">
            <Info className="h-4 w-4 text-slate-600 shrink-0" />
            <div className="text-xs text-slate-600">
              {isMobile ? '수퍼바이저 전용 파견지별 색상 적용됨' : '수퍼바이저의 근무 유형은 파견 지점(송도, 인천, 중동, 남양주)을 의미합니다.'}
            </div>
          </div>
        )}

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

        <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-open" />{isSupervisorStore ? '송인' : '오픈'}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-middle" />{isSupervisorStore ? '인천' : '미들'}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-close" />{isSupervisorStore ? '중동' : '마감'}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-work-allday" />{isSupervisorStore ? '남양' : '종일'}</span>
          <span className="text-muted-foreground">|</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-annual" />연차</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-leave-request" />요청</span>
        </div>

        {members.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">승인된 멤버가 없습니다.</p>
        ) : (
          <div className="space-y-6">
            <div className="pb-2">
              {isMobile ? (
                <div className="space-y-4">
                  {isManager && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                      {members.map(m => (
                        <Button
                          key={m.id}
                          size="sm"
                          variant={selectedMemberId === m.id ? 'default' : 'outline'}
                          onClick={() => setSelectedMemberId(m.id)}
                          className="shrink-0 text-[11px] h-8"
                        >
                          {m.display_name}
                        </Button>
                      ))}
                    </div>
                  )}
                  <MobileScheduleGrid
                    currentMonth={currentMonth}
                    days={days}
                    members={members}
                    schedules={displaySchedules}
                    currentUserId={selectedMemberId || user?.id || ''}
                    isManager={isManager}
                    isLocked={isLocked && !isManager}
                    isSupervisorStore={isSupervisorStore}
                    onSave={handleSave}
                  />
                </div>
              ) : (
                <ScheduleGrid
                  year={year}
                  month={month}
                  days={days}
                  members={members}
                  schedules={displaySchedules}
                  ghostSchedules={displayGhostSchedules}
                  currentUserId={user?.id ?? ''}
                  isManager={isManager}
                  isLocked={isLocked && !isManager}
                  isSupervisorStore={isSupervisorStore}
                  onSave={handleSave}
                  onAnnualLeaveUpdate={handleAnnualLeaveUpdate}
                />
              )}
            </div>

            {!isMobile && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1">
                  <MessageSquare className="h-4 w-4" />
                  매장 메모
                </div>
                <textarea
                  key={monthKey}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  rows={5}
                  readOnly={!isManager}
                  defaultValue={currentMemo}
                  onBlur={(e) => handleMemoUpdate(e.target.value)}
                  placeholder={isManager ? "매니저 전달사항 또는 참고 메모를 입력하세요 (자동 저장)" : "등록된 메모가 없습니다."}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {!isMobile && <hr className="border-t-2" />}
      {!isMobile && <AllSchedulesTab storeNameFilter="수퍼바이저" />}

      {/* 저장 버튼 (변경사항이 있을 때만 표시) */}
      {Object.keys(pendingChanges).length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-4 bg-white/90 backdrop-blur-md border shadow-2xl rounded-2xl min-w-[300px] justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Unsaved Changes</span>
            <span className="text-sm font-bold">
              총 <span className="text-primary">{Object.keys(pendingChanges).length}건</span>의 수정사항
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelChanges} className="h-9">
              취소
            </Button>
            <Button onClick={commitChanges} size="sm" className="h-9 px-6 font-semibold shadow-lg shadow-primary/20">
              저장하기
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
