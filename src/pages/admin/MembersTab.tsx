import { useEffect, useState } from 'react'
import { Check, X, Ban } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Profile, StoreMember, Store } from '@/types/database'

interface MemberWithDetails extends StoreMember {
  profiles: Profile
  stores: Store
}

const ROLE_OPTIONS = [
  { value: 'parttimer', label: '파트타이머', color: 'text-purple-600' },
  { value: 'junior', label: '주니어', color: 'text-orange-600' },
  { value: 'senior', label: '시니어', color: 'text-blue-600' },
  { value: 'admin', label: '매니저', color: 'text-red-600' },
  { value: 'resigned', label: '퇴사자', color: 'text-red-800' },
]

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

  async function updateMemberStatus(id: string, status: 'approved' | 'rejected' | 'banned') {
    if (status === 'banned' && !confirm('이 회원을 정말 탈퇴(밴) 처리하시겠습니까?')) return
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

  const pending = members.filter((m) => m.status === 'pending')
  const approved = members.filter((m) => m.status === 'approved')
  const rejected = members.filter((m) => m.status === 'rejected')
  const banned = members.filter((m) => m.status === 'banned')

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
              {/* 매장 직급 */}
              <div className="flex items-center rounded-md bg-muted p-0.5">
                {ROLE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant="ghost"
                    className={`h-7 px-1.5 text-[11px] ${m.role === opt.value ? `bg-white shadow-sm font-medium ${opt.color}` : 'text-muted-foreground'}`}
                    onClick={() => updateStoreRole(m.id, opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              {/* 전체관리자 */}
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
              {/* 밴 버튼 */}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => updateMemberStatus(m.id, 'banned')}>
                <Ban className="mr-1 h-3 w-3" />밴
              </Button>
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

      {/* 밴됨 */}
      {banned.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-gray-600">탈퇴/밴 ({banned.length})</h3>
          {banned.map((m) => (
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

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: '매니저', className: 'bg-red-100 text-red-700' },
  senior: { label: '시니어', className: 'bg-blue-100 text-blue-700' },
  junior: { label: '주니어', className: 'bg-orange-100 text-orange-700' },
  parttimer: { label: '파트타이머', className: 'bg-purple-100 text-purple-700' },
  resigned: { label: '퇴사자', className: 'bg-red-200 text-red-800' },
}

function MemberCard({ member, children }: { member: MemberWithDetails; children: React.ReactNode }) {
  const badge = ROLE_BADGE[member.role]
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium">{member.profiles.display_name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{member.stores.name}</span>
              {badge && <Badge variant="secondary" className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>}
              {member.profiles.role === 'admin' && <Badge className="text-xs">전체관리자</Badge>}
              {member.status === 'banned' && <Badge variant="destructive" className="text-xs">밴</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-1 items-center">{children}</div>
      </CardContent>
    </Card>
  )
}
