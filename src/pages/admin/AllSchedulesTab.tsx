import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MessageSquare, Info, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ROLE_ORDER } from '@/pages/StorePage'
import type { Schedule, WorkType, LeaveType, Store, GhostSchedule } from '@/types/database'
import type { MemberWithRole } from '@/pages/StorePage'
import { toast } from 'sonner'

interface StoreGroup {
  store: Store
  members: MemberWithRole[]
  schedules: Schedule[]
  ghostSchedules: GhostSchedule[]
}

interface AllSchedulesTabProps {
  storeNameFilter?: string
}

interface PendingWork {
  work_type: WorkType | null
  leave_type: LeaveType | null
}

export function AllSchedulesTab({ storeNameFilter }: AllSchedulesTabProps) {
  const { user } = useAuthStore()
  const [monthKey, setMonthKey] = useState(() => format(new Date(), 'yyyy-MM'))
  const currentMonth = useMemo(() => new Date(monthKey + '-01'), [monthKey])

  const [storeGroups, setStoreGroups] = useState<StoreGroup[]>([])
  const [loading, setLoading] = useState(true)

  // 미저장된 변경사항 상태: Key="storeId_userId_date"
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingWork>>({})

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const loadData = useCallback(async () => {
    setLoading(true)
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [storesRes, membersRes, schedulesRes, ghostRes] = await Promise.all([
      supabase.from('stores').select('*').order('name'),
      supabase.from('store_members').select('*, profiles(*)').eq('status', 'approved'),
      supabase.from('schedules').select('*').gte('date', monthStart).lte('date', monthEnd),
      supabase.from('ghost_schedules').select('*').gte('date', monthStart).lte('date', monthEnd),
    ])

    const stores: Store[] = storesRes.data ?? []
    const allMembers: any[] = membersRes.data ?? []
    const allSchedules: Schedule[] = schedulesRes.data ?? []
    const allGhosts: GhostSchedule[] = (ghostRes.data ?? []) as GhostSchedule[]

    const groups: StoreGroup[] = stores
      .filter(s => !storeNameFilter || s.name.includes(storeNameFilter))
      .map((store) => {
        const isSupervisorStore = store.name.includes('수퍼바이저')
        
        const storeMembers: MemberWithRole[] = allMembers
          .filter((m: any) => m.store_id === store.id)
          .map((m: any) => ({
            ...m.profiles,
            storeRole: m.role,
            annualLeave: m.annual_leave ?? 0,
            memberId: m.id,
          }))
          .filter((m: MemberWithRole) => m.storeRole !== 'resigned')
          .sort((a: MemberWithRole, b: MemberWithRole) =>
            (ROLE_ORDER[a.storeRole] ?? 99) - (ROLE_ORDER[b.storeRole] ?? 99)
          )

        const ghostMembers: MemberWithRole[] = isSupervisorStore ? [] : [
          { id: `ghost-${store.id}-1`, display_name: '단기알바 1', phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 1 },
          { id: `ghost-${store.id}-2`, display_name: '단기알바 2', phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 2 },
        ]

        return {
          store,
          members: [...storeMembers, ...ghostMembers],
          schedules: allSchedules.filter((s) => s.store_id === store.id),
          ghostSchedules: allGhosts.filter((g) => g.store_id === store.id),
        }
      })

    groups.sort((a, b) => b.members.filter(m => !m.isGhost).length - a.members.filter(m => !m.isGhost).length)

    setStoreGroups(groups)
    setLoading(false)
  }, [monthKey, storeNameFilter])

  useEffect(() => { loadData() }, [loadData])

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1)
    setMonthKey(format(newMonth, 'yyyy-MM'))
    setPendingChanges({}) // 월 변경 시 미저장 초기화
  }

  function handleSave(storeId: string, userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) {
    const ghostMatch = userId.match(/^ghost-.+-(\d+)$/)
    const key = ghostMatch ? `${storeId}_ghost-${ghostMatch[1]}_ghost_${date}` : `${storeId}_${userId}_${date}`
    
    setPendingChanges(prev => ({
      ...prev,
      [key]: { work_type: workType, leave_type: leaveType }
    }))
  }

  async function commitChanges() {
    const keys = Object.keys(pendingChanges)
    if (keys.length === 0) return
    setLoading(true)

    try {
      const scheduleUpserts: any[] = []
      const scheduleDeletes: { storeId: string; userId: string; date: string }[] = []
      const ghostUpserts: any[] = []
      const ghostDeletes: { storeId: string; slot: number; date: string }[] = []

      Object.entries(pendingChanges).forEach(([key, change]) => {
        const c = change as PendingWork
        if (key.includes('_ghost_')) {
          const [storeId, rest] = key.split('_ghost-')
          const [slotStr, date] = rest.split('_ghost_')
          const slot = parseInt(slotStr)
          if (!c.work_type && !c.leave_type) {
            ghostDeletes.push({ storeId, slot, date })
          } else {
            ghostUpserts.push({ store_id: storeId, slot, date, ...c })
          }
        } else {
          const [storeId, userId, date] = key.split('_')
          if (!c.work_type && !c.leave_type) {
            scheduleDeletes.push({ storeId, userId, date })
          } else {
            scheduleUpserts.push({ store_id: storeId, user_id: userId, date, ...c, status: 'approved' })
          }
        }
      })

      const promises: any[] = []

      if (scheduleUpserts.length > 0) {
        promises.push(supabase.from('schedules').upsert(scheduleUpserts))
      }
      scheduleDeletes.forEach(d => {
        promises.push(supabase.from('schedules').delete().eq('store_id', d.storeId).eq('user_id', d.userId).eq('date', d.date))
      })

      if (ghostUpserts.length > 0) {
        promises.push(supabase.from('ghost_schedules').upsert(ghostUpserts))
      }
      ghostDeletes.forEach(d => {
        promises.push(supabase.from('ghost_schedules').delete().eq('store_id', d.storeId).eq('slot', d.slot).eq('date', d.date))
      })

      const results = await Promise.all(promises)
      const errors = results.filter(r => r.error)

      if (errors.length > 0) {
        console.error('Admin commit errors:', errors)
        toast.error(`${errors.length}건의 저장 실패가 발생했습니다.`)
      } else {
        toast.success('통합 캘린더의 모든 변경사항이 저장되었습니다.')
        setPendingChanges({})
        await loadData()
      }
    } catch (err) {
      console.error('Admin commit exception:', err)
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
    await supabase.from('store_members').update({ annual_leave: value }).eq('id', memberId)
    loadData()
  }

  async function handleMemoUpdate(storeId: string, memoText: string) {
    const group = storeGroups.find(g => g.store.id === storeId)
    if (!group) return

    let currentMemoObj: Record<string, string> = {}
    try {
      const parsed = JSON.parse(group.store.memo || '{}')
      if (typeof parsed === 'object' && parsed !== null) {
        currentMemoObj = parsed
      }
    } catch {
      currentMemoObj = { 'legacy': group.store.memo || '' }
    }

    const newMemoObj = { ...currentMemoObj, [monthKey]: memoText }
    const newMemoString = JSON.stringify(newMemoObj)

    const { error } = await supabase.from('stores').update({ memo: newMemoString }).eq('id', storeId)
    if (error) { toast.error('메모 저장 실패', { description: error.message }); return }
    setStoreGroups(prev => prev.map(g => g.store.id === storeId ? { ...g, store: { ...g.store, memo: newMemoString } } : g))
    toast.success('메모가 저장되었습니다.')
  }

  if (loading && Object.keys(pendingChanges).length === 0) {
    return <div className="py-12 text-center text-muted-foreground">캘린더 로딩 중...</div>
  }

  return (
    <div className="space-y-6 pb-20">
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

      <div className="space-y-12">
        {storeGroups.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">표시할 데이터가 없습니다.</p>
        ) : (
          storeGroups.map((group) => {
            const isSupervisorStore = group.store.name.includes('수퍼바이저')
            
            // 병합된 데이터 계산
            const mergedSchedules = [...group.schedules]
            const mergedGhosts = [...group.ghostSchedules]
            
            Object.entries(pendingChanges).forEach(([key, change]) => {
              const c = change as PendingWork
              if (key.startsWith(group.store.id)) {
                if (key.includes('_ghost_')) {
                   const [_, rest] = key.split('_ghost-')
                   const [slotStr, date] = rest.split('_ghost_')
                   const slot = parseInt(slotStr)
                   const idx = mergedGhosts.findIndex(g => g.slot === slot && g.date === date)
                   if (idx !== -1) {
                     mergedGhosts[idx] = { ...mergedGhosts[idx], ...c }
                   } else {
                     mergedGhosts.push({ store_id: group.store.id, slot, date, ...c } as GhostSchedule)
                   }
                } else {
                   const [_, userId, date] = key.split('_')
                   const idx = mergedSchedules.findIndex(s => s.user_id === userId && s.date === date)
                   if (idx !== -1) {
                     mergedSchedules[idx] = { ...mergedSchedules[idx], ...c }
                   } else {
                     mergedSchedules.push({ store_id: group.store.id, user_id: userId, date, ...c, status: 'approved' } as Schedule)
                   }
                }
              }
            })

            const memoObj = (() => {
               if (!group.store.memo) return {}
               try {
                 const parsed = JSON.parse(group.store.memo)
                 if (typeof parsed === 'object' && parsed !== null) return parsed
               } catch { }
               return { 'legacy': group.store.memo }
            })()
            const currentMemo = memoObj[monthKey] ?? (memoObj['legacy'] ?? '')
            
            return (
              <section key={group.store.id} className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {group.store.name}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({group.members.filter(m => !m.isGhost).length}명)
                  </span>
                </h3>
                
                {isSupervisorStore && (
                  <div className="flex border-l-4 border-slate-800 bg-slate-50 p-3 rounded-r-lg items-center gap-3 mb-4">
                    <Info className="h-4 w-4 text-slate-600 shrink-0" />
                    <div className="text-xs text-slate-600">
                      <p className="font-bold">수퍼바이저 지점 안내</p>
                      <p className="opacity-80">수퍼바이저의 근무 유형은 파견 지점(송도, 인천, 중동, 남양주)을 의미합니다.</p>
                    </div>
                  </div>
                )}

                <div className="pb-2">
                  <ScheduleGrid
                    year={year}
                    month={month}
                    days={days}
                    members={group.members}
                    schedules={mergedSchedules}
                    ghostSchedules={mergedGhosts}
                    currentUserId={user?.id ?? ''}
                    isManager={true}
                    isLocked={false}
                    isSupervisorStore={isSupervisorStore}
                    onSave={(userId, date, workType, leaveType) => handleSave(group.store.id, userId, date, workType, leaveType)}
                    onAnnualLeaveUpdate={handleAnnualLeaveUpdate}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1">
                    <MessageSquare className="h-4 w-4" />
                    매장 메모
                  </div>
                  <textarea
                    key={monthKey}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    rows={3}
                    defaultValue={currentMemo}
                    onBlur={(e) => handleMemoUpdate(group.store.id, e.target.value)}
                    placeholder="참고 메모를 입력하세요 (자동 저장)"
                  />
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* 통합 관리자 저장 버튼 */}
      {Object.keys(pendingChanges).length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-4 bg-slate-900 text-white shadow-2xl rounded-2xl min-w-[360px] justify-between border border-slate-700">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Admin Batch Mode</span>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-bold">
                <span className="text-green-400">{Object.keys(pendingChanges).length}건</span>의 미저장 스케줄
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelChanges} className="text-slate-300 hover:text-white hover:bg-slate-800 h-9">
              <X className="h-4 w-4 mr-1" /> 취소
            </Button>
            <Button onClick={commitChanges} size="sm" className="bg-white text-slate-900 hover:bg-slate-100 h-9 px-6 font-bold shadow-lg">
              <Save className="h-4 w-4 mr-1" /> 전체 저장
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
