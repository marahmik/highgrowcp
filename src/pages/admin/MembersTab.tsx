import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Profile, StoreMember, Store } from '@/types/database'

interface MemberWithDetails extends StoreMember {
  profiles: Profile
  stores: Store
}

export function MembersTab() {
  const [members, setMembers] = useState<MemberWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase
      .from('store_members')
      .select('*, profiles(*), stores(*)')
      .order('created_at', { ascending: false })
    if (data) setMembers(data as MemberWithDetails[])
    setLoading(false)
  }

  async function updateMemberStatus(id: string, status: 'approved' | 'rejected') {
    await supabase.from('store_members').update({ status }).eq('id', id)
    loadMembers()
  }

  async function updateStoreRole(id: string, newRole: string) {
    await supabase.from('store_members').update({ role: newRole }).eq('id', id)
    loadMembers()
  }

  async function updateProfileRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (newRole === 'user' && !confirm('이 사용자의 전체 관리자 권한을 해제하시겠습니까?')) return
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    loadMembers()
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">로딩 중...</div>

  // 승인대기 / 승인됨으로 분리
  const pending = members.filter((m) => m.status === 'pending')
  const approved = members.filter((m) => m.status === 'approved')
  const rejected = members.filter((m) => m.status === 'rejected')

  return (
    <div className="space-y-6">
      {/* 승인 대기 */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-amber-600">승인 대기 ({pending.length})</h3>
          {pending.map((m) => (
            <MemberCard key={m.id} member={m}>
              <Button size="sm" onClick={() => updateMemberStatus(m.id, 'approved')}>
                <Check className="mr-1 h-4 w-4" />승인
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateMemberStatus(m.id, 'rejected')}>
                <X className="mr-1 h-4 w-4" />거절
              </Button>
            </MemberCard>
          ))}
        </section>
      )}

      {/* 승인됨 */}
      <section className="space-y-2">
        <h3 className="font-semibold text-green-600">활성 멤버 ({approved.length})</h3>
        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">승인된 멤버가 없습니다.</p>
        ) : (
          approved.map((m) => (
            <MemberCard key={m.id} member={m}>
              <div className="flex items-center rounded-md bg-muted p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2 text-xs ${m.role === 'member' ? 'bg-white shadow-sm font-medium text-slate-700' : 'text-muted-foreground'}`}
                  onClick={() => updateStoreRole(m.id, 'member')}
                >
                  일반
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2 text-xs ${m.role === 'admin' ? 'bg-white shadow-sm font-medium text-primary' : 'text-muted-foreground'}`}
                  onClick={() => updateStoreRole(m.id, 'admin')}
                >
                  매니저
                </Button>
              </div>
              <div className="flex items-center rounded-md bg-muted p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2 text-xs ${m.profiles.role !== 'admin' ? 'bg-white shadow-sm font-medium text-slate-700' : 'text-muted-foreground'}`}
                  onClick={() => m.profiles.role === 'admin' && updateProfileRole(m.profiles.id, m.profiles.role)}
                >
                  일반유저
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2 text-xs ${m.profiles.role === 'admin' ? 'bg-white shadow-sm font-medium text-primary' : 'text-muted-foreground'}`}
                  onClick={() => m.profiles.role !== 'admin' && updateProfileRole(m.profiles.id, m.profiles.role)}
                >
                  관리자
                </Button>
              </div>
            </MemberCard>
          ))
        )}
      </section>

      {/* 거절됨 */}
      {rejected.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-red-600">거절됨 ({rejected.length})</h3>
          {rejected.map((m) => (
            <MemberCard key={m.id} member={m}>
              <Button size="sm" variant="outline" onClick={() => updateMemberStatus(m.id, 'approved')}>
                재승인
              </Button>
            </MemberCard>
          ))}
        </section>
      )}
    </div>
  )
}

function MemberCard({ member, children }: { member: MemberWithDetails; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium">{member.profiles.display_name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{member.stores.name}</span>
              {member.role === 'admin' && <Badge variant="secondary" className="text-xs">매니저</Badge>}
              {member.profiles.role === 'admin' && <Badge className="text-xs">전체관리자</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-1">{children}</div>
      </CardContent>
    </Card>
  )
}
