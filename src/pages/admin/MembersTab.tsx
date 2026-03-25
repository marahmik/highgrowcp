import { useEffect, useState } from 'react'
import { Check, X, Ban, Trash2, UserMinus, Edit2, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
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
  const [unaffiliated, setUnaffiliated] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    setLoading(true)
    const [membersRes, profilesRes] = await Promise.all([
      supabase.from('store_members').select('*, profiles(*), stores(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('display_name')
    ])

    if (membersRes.data) setMembers(membersRes.data as MemberWithDetails[])
    
    if (profilesRes.data && membersRes.data) {
      const memberUserIds = new Set(membersRes.data.map((m: any) => m.user_id))
      const unaffiliatedProfiles = profilesRes.data.filter(p => !memberUserIds.has(p.id))
      setUnaffiliated(unaffiliatedProfiles)
    }
    
    setLoading(false)
  }

  async function updateMemberStatus(id: string, status: 'approved' | 'rejected' | 'banned') {
    if (status === 'banned' && !confirm('이 회원을 정말 탈퇴(밴) 처리하시겠습니까?')) return
    const { error } = await supabase.from('store_members').update({ status }).eq('id', id)
    if (error) { toast.error('상태 변경 실패', { description: error.message }); return }
    toast.success('상태가 변경되었습니다.')
    loadMembers()
  }

  async function updateStoreRole(id: string, newRole: string) {
    const { error } = await supabase.from('store_members').update({ role: newRole }).eq('id', id)
    if (error) { toast.error('직급 변경 실패', { description: error.message }); return }
    toast.success('직급이 변경되었습니다.')
    loadMembers()
  }

  async function updateProfileRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (newRole === 'user' && !confirm('이 사용자의 전체 관리자 권한을 해제하시겠습니까?')) return
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) { toast.error('권한 변경 실패', { description: error.message }); return }
    toast.success('권한이 변경되었습니다.')
    loadMembers()
  }

  async function renameMember(userId: string, currentName: string) {
    const newName = prompt('새 이름을 입력하세요:', currentName)
    if (!newName || newName === currentName) return
    const { error } = await supabase.from('profiles').update({ display_name: newName }).eq('id', userId)
    if (error) { toast.error('이름 변경 실패', { description: error.message }); return }
    toast.success('이름이 변경되었습니다.')
    loadMembers()
  }

  async function leaveStore(memberId: string) {
    if (!confirm('해당 매장에서 이 회원을 제외하시겠습니까? (매장에서만 삭제되고 계정은 유지됩니다. 타 지점 발령 시 사용하세요)')) return
    const { error } = await supabase.from('store_members').delete().eq('id', memberId)
    if (error) { toast.error('매장 제외 실패', { description: error.message }); return }
    toast.success('매장에서 제외되었습니다.')
    loadMembers()
  }

  async function deleteMemberPermanently(userId: string) {
    if (!confirm('이 회원을 완전히 삭제하시겠습니까? (DB 및 계정 전체 삭제) 이 작업은 되돌릴 수 없습니다.')) return

    // 1. 소속 정보 삭제
    await supabase.from('store_members').delete().eq('user_id', userId)

    // 2. 프로필 삭제
    await supabase.from('profiles').delete().eq('id', userId)

    // 3. Auth 삭제 (Edge function 또는 RPC 필요)
    const { error: authError } = await supabase.rpc('delete_user', { target_user_id: userId })
    if (authError) {
      toast.error('계정 삭제 실패 (수동 삭제 필요)', { description: authError.message })
    } else {
      toast.success('회원이 완전히 삭제되었습니다.')
    }

    loadMembers()
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">로딩 중...</div>

  const pending = members.filter((m) => m.status === 'pending')
  const approved = members.filter((m) => m.status === 'approved')
  const rejected = members.filter((m) => m.status === 'rejected')
  const banned = members.filter((m) => m.status === 'banned')

  return (
    <div className="space-y-8">
      {/* 승인 대기 */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-amber-600">승인 대기 ({pending.length})</h3>
          {pending.map((m) => (
            <MemberCard key={m.id} member={m} onRename={() => renameMember(m.profiles.id, m.profiles.display_name)}>
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
            <MemberCard key={m.id} member={m} onRename={() => renameMember(m.profiles.id, m.profiles.display_name)}>
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
              <div className="flex items-center rounded-md bg-muted p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2 text-xs ${m.profiles.role !== 'admin' ? 'bg-white shadow-sm font-medium text-slate-700' : 'text-muted-foreground'}`}
                  onClick={() => m.profiles.role === 'admin' && updateProfileRole(m.profiles.id, m.profiles.role)}
                >
                  일반
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2 text-xs ${m.profiles.role === 'admin' ? 'bg-white shadow-sm font-medium text-primary' : 'text-muted-foreground'}`}
                  onClick={() => m.profiles.role !== 'admin' && updateProfileRole(m.profiles.id, m.profiles.role)}
                >
                  전체관리
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => leaveStore(m.id)} title="매장에서만 제외 (타지점 발령 시 사용)">
                <UserMinus className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => updateMemberStatus(m.id, 'banned')}>
                <Ban className="h-3 w-3" />
              </Button>
            </MemberCard>
          ))
        )}
      </section>

      {/* 미소속 인원 */}
      {unaffiliated.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-slate-600 flex items-center gap-2">
            <Info className="h-4 w-4" /> 미소속 인원 ({unaffiliated.length})
          </h3>
          <p className="text-xs text-muted-foreground ml-6 mb-2">어떠한 매장에도 가입 신청을 하지 않았거나 소속되지 않은 인원입니다.</p>
          {unaffiliated.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 border rounded-xl bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold">{p.display_name}</span>
                    <button onClick={() => renameMember(p.id, p.display_name)} className="text-muted-foreground hover:text-primary">
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] bg-white">매장 정보 없음</Badge>
                    {p.role === 'admin' && <Badge className="text-[10px] bg-slate-800 text-white">전체관리자</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex items-center rounded-md bg-muted/50 p-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-7 px-2 text-[11px] ${p.role !== 'admin' ? 'bg-white shadow-sm font-medium text-slate-700' : 'text-muted-foreground'}`}
                    onClick={() => p.role === 'admin' && updateProfileRole(p.id, p.role)}
                  >
                    일반
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-7 px-2 text-[11px] ${p.role === 'admin' ? 'bg-white shadow-sm font-medium text-primary' : 'text-muted-foreground'}`}
                    onClick={() => p.role !== 'admin' && updateProfileRole(p.id, p.role)}
                  >
                    전체관리
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMemberPermanently(p.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 거절됨 */}
      {rejected.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-red-600">거절됨 ({rejected.length})</h3>
          {rejected.map((m) => (
            <MemberCard key={m.id} member={m} >
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
              <Button size="sm" variant="destructive" onClick={() => deleteMemberPermanently(m.user_id)}>
                <Trash2 className="mr-1 h-3 w-3" />삭제
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

function MemberCard({ member, children, onRename }: { member: MemberWithDetails; children: React.ReactNode; onRename?: () => void }) {
  const badge = ROLE_BADGE[member.role]
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium">{member.profiles.display_name}</p>
              {onRename && (
                <button onClick={onRename} className="text-muted-foreground hover:text-primary p-0.5">
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{member.stores.name}</span>
              {badge && <Badge variant="secondary" className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>}
              {member.profiles.role === 'admin' && <Badge className="text-[10px] bg-slate-800 text-white">전체관리자</Badge>}
              {member.status === 'banned' && <Badge variant="destructive" className="text-[10px]">밴</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-1 items-center">{children}</div>
      </CardContent>
    </Card>
  )
}
