import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MessageSquare, Info } from 'lucide-react'
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

export function AllSchedulesTab({ storeNameFilter }: AllSchedulesTabProps) {
  const { user } = useAuthStore()
  const [monthKey, setMonthKey] = useState(() => format(new Date(), 'yyyy-MM'))
  const currentMonth = useMemo(() => new Date(monthKey + '-01'), [monthKey])

  const [storeGroups, setStoreGroups] = useState<StoreGroup[]>([])
  const [loading, setLoading] = useState(true)

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
  }

  async function handleSave(storeId: string, userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) {
    const ghostMatch = userId.match(/^ghost-.+-(\d+)$/)
    if (ghostMatch) {
      const slot = parseInt(ghostMatch[1])
      if (!workType && !leaveType) {
        await supabase.from('ghost_schedules').delete().eq('store_id', storeId).eq('slot', slot).eq('date', date)
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
      await supabase.from('schedules').delete().eq('store_id', storeId).eq('user_id', userId).eq('date', date)
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

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">캘린더 로딩 중...</div>
  }

  return (
    <div className="space-y-6">
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
                    schedules={group.schedules}
                    ghostSchedules={group.ghostSchedules}
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
    </div>
  )
}
