import { useEffect, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, setProfile, setLoading } = useAuthStore()
  const isFetching = useRef(false)

  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }).catch(() => {
      setLoading(false)
    })

    // 2. Listen for auth state changes (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user) {
          // Use setTimeout to avoid Supabase's known race condition
          // where onAuthStateChange fires before getSession resolves
          setTimeout(() => {
            fetchProfile(session.user.id)
          }, 0)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    // 3. Safety timeout - if loading doesn't resolve within 8s, force it
    const safetyTimer = setTimeout(() => {
      const state = useAuthStore.getState()
      if (state.loading) {
        console.warn('Auth loading safety timeout triggered')
        setLoading(false)
      }
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(safetyTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(userId: string) {
    // Prevent duplicate concurrent calls
    if (isFetching.current) return
    isFetching.current = true

    try {
      const [{ data: profile, error: profileError }, { data: memberships }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('store_members').select('role').eq('user_id', userId)
      ])

      // Race condition guard: If session was lost while fetching, abort
      if (!useAuthStore.getState().session) {
        setLoading(false)
        return
      }

      if (profileError) {
        console.error('프로필 조회 에러:', profileError.message)
      }

      setProfile(profile)
      
      // Check if user is an admin or manager in any store
      const isManager = memberships?.some(m => m.role === 'admin') || false
      useAuthStore.getState().setIsStoreManager(isManager)
    } catch (err) {
      console.error('프로필 로드 실패:', err)
    } finally {
      isFetching.current = false
      setLoading(false)
    }
  }

  return <>{children}</>
}
