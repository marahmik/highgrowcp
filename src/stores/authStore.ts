import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  isStoreManager: boolean
  profileResolved: boolean
  loading: boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setIsStoreManager: (isStoreManager: boolean) => void
  setProfileResolved: (profileResolved: boolean) => void
  setLoading: (loading: boolean) => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isStoreManager: false,
  profileResolved: false,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setProfile: (profile) => set({ profile }),
  setIsStoreManager: (isStoreManager) => set({ isStoreManager }),
  setProfileResolved: (profileResolved) => set({ profileResolved }),
  setLoading: (loading) => set({ loading }),
  isAdmin: () => get().profile?.role === 'admin' || get().isStoreManager,
}))
