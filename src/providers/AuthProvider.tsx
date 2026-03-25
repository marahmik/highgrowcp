import { useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, setProfile, setLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [setSession, setProfile, setLoading])

  async function fetchProfile(userId: string) {
    try {
      const [{ data: profile }, { data: memberships }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('store_members').select('role').eq('user_id', userId)
      ])

      // Race condition guard: If session was lost while fetching, abort setting profile
      if (!useAuthStore.getState().session) {
        return
      }

      setProfile(profile)
      
      // Check if user is an admin or manager in any store
      const isManager = memberships?.some(m => m.role === 'admin') || false
      useAuthStore.getState().setIsStoreManager(isManager)
    } catch (err) {
      console.error('프로필 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  return <>{children}</>
}
