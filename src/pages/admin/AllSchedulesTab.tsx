import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MessageSquare, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ROLE_ORDER, ROLE_LABELS } from '@/pages/StorePage'
import type { Schedule, WorkType, LeaveType, Store, GhostSchedule } from '@/types/database'
import type { MemberWithRole } from '@/pages/StorePage'
import { toast } from 'sonner'

interface UnifiedMember extends MemberWithRole {
  primaryStoreId: string
}

interface StoreGroup {
  store: Store
  members: UnifiedMember[]
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

  const [unifiedGroup, setUnifiedGroup] = useState<StoreGroup | null>(null)
  const [allValidStores, setAllValidStores] = useState<Store[]>([])
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

    const filteredStores = stores.filter(s => !storeNameFilter || s.name.includes(storeNameFilter))
    const validStoreIds = new Set(filteredStores.map(s => s.id))
    
    setAllValidStores(filteredStores)

    // 1. Group active human members
    const memberMap = new Map<string, any>()

    allMembers.forEach(m => {
      if (m.role === 'resigned') return
      if (!validStoreIds.has(m.store_id)) return
      
      const storeName = stores.find(s => s.id === m.store_id)?.name ?? '알수없음'
      const roleLabel = ROLE_LABELS[m.role] ?? m.role
      const order = ROLE_ORDER[m.role] ?? 99

      if (!memberMap.has(m.profiles.id)) {
        memberMap.set(m.profiles.id, {
          ...m.profiles,
          storeRole: m.role,
          annualLeave: m.annual_leave ?? 0,
          memberId: m.id,
          storeNames: new Set([storeName]),
          roles: new Set([roleLabel]),
          primaryStoreId: m.store_id,
          sortOrder: order
        })
      } else {
        const existing = memberMap.get(m.profiles.id)!
        existing.storeNames.add(storeName)
        existing.roles.add(roleLabel)
        if (order < existing.sortOrder) {
           existing.storeRole = m.role
           existing.sortOrder = order
        }
      }
    })

    const unifiedHumans: UnifiedMember[] = Array.from(memberMap.values()).map(m => {
       const storesStr = Array.from(m.storeNames).join('/')
       const rolesStr = Array.from(m.roles).join('/')
       return {
         ...m,
         display_name: `${m.display_name} (${storesStr}/${rolesStr})`,
       }
    })

    // Sort humans
    unifiedHumans.sort((a, b) => (ROLE_ORDER[a.storeRole] ?? 99) - (ROLE_ORDER[b.storeRole] ?? 99))

    // 2. Add ghosts
    const unifiedGhosts: UnifiedMember[] = []
    filteredStores.forEach(store => {
      const isSupervisorStore = store.name.includes('수퍼바이저')
      if (!isSupervisorStore) {
        unifiedGhosts.push({ id: `ghost-${store.id}-1`, display_name: `단기알바 1 (${store.name})`, phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 1, primaryStoreId: store.id })
        unifiedGhosts.push({ id: `ghost-${store.id}-2`, display_name: `단기알바 2 (${store.name})`, phone: null, role: 'user', created_at: '', updated_at: '', storeRole: 'parttimer', annualLeave: 0, memberId: '', isGhost: true, ghostSlot: 2, primaryStoreId: store.id })
      }
    })

    const filteredSchedules = allSchedules.filter(s => validStoreIds.has(s.store_id))
    const filteredGhosts = allGhosts.filter(s => validStoreIds.has(s.store_id))

    setUnifiedGroup({
       store: { id: 'unified', name: storeNameFilter ? `${storeNameFilter} 통합 점포` : '전체 점포 통합 캘린더', memo: '', locked: false } as Store,
       members: [...unifiedHumans, ...unifiedGhosts],
       schedules: filteredSchedules,
       ghostSchedules: filteredGhosts,
    })
    
    setLoading(false)
  }, [monthKey, storeNameFilter])

  useEffect(() => { loadData() }, [loadData])

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1)
    setMonthKey(format(newMonth, 'yyyy-MM'))
  }

  async function handleSaveInternal(storeId: string, userId: string, date: string, workType: WorkType | null, leaveType: LeaveType | null) {
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

  async function handleMemoUpdate(storeId: string, memo: string) {
    const { error } = await supabase.from('stores').update({ memo }).eq('id', storeId)
    if (error) { toast.error('메모 저장 실패', { description: error.message }); return }
    toast.success('메모가 저장되었습니다.')
  }

  if (loading || !unifiedGroup) {
    return <div className="py-12 text-center text-muted-foreground">캘린더 로딩 중...</div>
  }

  const isSupervisorTheme = storeNameFilter === '수퍼바이저'

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
        <section className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {unifiedGroup.store.name}
          </h3>
          
          {isSupervisorTheme && (
            <div className="flex border-l-4 border-slate-800 bg-slate-50 p-3 rounded-r-lg items-center gap-3 mb-4">
              <Info className="h-4 w-4 text-slate-600 shrink-0" />
              <div className="text-xs text-slate-600">
                <p className="font-bold">수퍼바이저 지점 안내</p>
                <p className="opacity-80">수퍼바이저의 근무 유형은 파견 지점(송도, 인천, 중동, 남양주)을 의미합니다.</p>
              </div>
            </div>
          )}

          <div className="pb-4">
            <ScheduleGrid
              year={year}
              month={month}
              days={days}
              members={unifiedGroup.members}
              schedules={unifiedGroup.schedules}
              ghostSchedules={unifiedGroup.ghostSchedules}
              currentUserId={user?.id ?? ''}
              isManager={true}
              isLocked={false}
              isSupervisorStore={isSupervisorTheme}
              onSave={(userId, date, workType, leaveType) => {
                const member = unifiedGroup.members.find(m => m.id === userId)
                if (member) {
                  handleSaveInternal(member.primaryStoreId, userId, date, workType, leaveType)
                }
              }}
              onAnnualLeaveUpdate={handleAnnualLeaveUpdate}
            />
          </div>
        </section>

        {/* 점포별 메모 표시 */}
        {!isSupervisorTheme && allValidStores.length > 0 && (
          <div className="space-y-4 pt-8 border-t">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4" />
              점포별 메모 (개별 저장)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allValidStores.map(store => (
                <div key={store.id} className="space-y-2 border p-3 rounded-lg bg-slate-50/50">
                  <div className="text-sm font-semibold text-slate-700">{store.name}</div>
                  <textarea
                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    rows={3}
                    defaultValue={store.memo ?? ''}
                    onBlur={(e) => handleMemoUpdate(store.id, e.target.value)}
                    placeholder="참고 메모를 입력하세요 (자동 저장)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
