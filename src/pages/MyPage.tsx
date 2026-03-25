import { useEffect, useState } from 'react'
import { Store, ChevronRight, PlusCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Store as StoreType, StoreMember } from '@/types/database'

interface MemberWithStore extends StoreMember {
  stores: StoreType
}

export function MyPage() {
  const { user } = useAuthStore()
  const [memberships, setMemberships] = useState<MemberWithStore[]>([])
  const [allStores, setAllStores] = useState<StoreType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [membershipsRes, storesRes] = await Promise.all([
      supabase
        .from('store_members')
        .select('*, stores(*)')
        .eq('user_id', user.id),
      supabase.from('stores').select('*').order('name'),
    ])

    if (membershipsRes.error) {
      console.error(membershipsRes.error)
      toast.error('매장 로드 실패', { description: membershipsRes.error.message })
    }

    if (membershipsRes.data) setMemberships(membershipsRes.data as MemberWithStore[])
    if (storesRes.data) setAllStores(storesRes.data)
    setLoading(false)
  }

  async function requestJoin(storeId: string) {
    if (!user) return
    const { error } = await supabase
      .from('store_members')
      .insert({ store_id: storeId, user_id: user.id, status: 'pending', role: 'parttimer' })
      
    if (error) {
      toast.error('가입 요청에 실패했습니다.', { description: error.message })
      return
    }
    
    toast.success('매장 가입 요청이 완료되었습니다.')
    loadData()
  }

  const activeMemberships = memberships.filter(m => m.status === 'approved' && m.role !== 'resigned')
  const pendingMemberships = memberships.filter(m => m.status === 'pending')
  
  const joinedStoreIds = new Set(memberships.map((m) => m.store_id))
  const availableStores = allStores.filter((s) => !joinedStoreIds.has(s.id))

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">마이페이지</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">내 매장</h2>
        {activeMemberships.length === 0 ? (
          <p className="border rounded-xl p-8 text-center text-muted-foreground bg-slate-50/50">아직 소속된 매장이 없습니다.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeMemberships.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                className="h-auto flex items-center justify-between p-4 bg-white hover:border-primary group transition-all"
                onClick={() => window.location.href = `/store/${m.store_id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{m.stores.name}</div>
                    <div className="text-xs text-muted-foreground">매장 캘린더 바로가기</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Button>
            ))}
          </div>
        )}
      </section>

      {pendingMemberships.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            승인 대기 중
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingMemberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-4 border rounded-xl bg-amber-50/30 border-amber-100">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-amber-500" />
                  <div className="font-medium">{m.stores.name}</div>
                </div>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">대기 중</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">매장 가입하기</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {availableStores.map((store) => (
            <div key={store.id} className="p-4 border rounded-xl bg-white space-y-3">
              <div className="font-bold">{store.name}</div>
              <Button 
                variant="secondary" 
                className="w-full h-9 gap-2"
                onClick={() => requestJoin(store.id)}
              >
                <PlusCircle className="h-4 w-4" /> 가입 신청
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
