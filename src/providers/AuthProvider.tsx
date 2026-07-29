import { useEffect, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, setProfile, setProfileResolved, setLoading } = useAuthStore()
  const profileRequestId = useRef(0)

  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setProfileResolved(!session?.user)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        profileRequestId.current += 1
        setLoading(false)
      }
    }).catch(() => {
      profileRequestId.current += 1
      setProfileResolved(true)
      setLoading(false)
    })

    // 2. Listen for auth state changes (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setProfileResolved(!session?.user)
        if (session?.user) {
          // Use setTimeout to avoid Supabase's known race condition
          // where onAuthStateChange fires before getSession resolves
          setTimeout(() => {
            fetchProfile(session.user.id)
          }, 0)
        } else {
          profileRequestId.current += 1
          setProfile(null)
          useAuthStore.getState().setIsStoreManager(false)
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
    const requestId = ++profileRequestId.current
    setProfile(null)
    useAuthStore.getState().setIsStoreManager(false)
    setProfileResolved(false)
    setLoading(true)

    try {
      const [{ data: profile, error: profileError }, { data: memberships }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('store_members').select('role').eq('user_id', userId)
      ])

      const currentSession = useAuthStore.getState().session
      if (profileRequestId.current !== requestId || currentSession?.user.id !== userId) {
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
      if (profileRequestId.current === requestId) {
        console.error('프로필 로드 실패:', err)
      }
    } finally {
      const currentSession = useAuthStore.getState().session
      if (profileRequestId.current === requestId && currentSession?.user.id === userId) {
        setProfileResolved(true)
        setLoading(false)
      }
    }
  }

  return <>{children}</>
}
