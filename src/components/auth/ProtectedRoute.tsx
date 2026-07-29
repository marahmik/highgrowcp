import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requireSuperAdmin?: boolean
}

export function ProtectedRoute({ children, requireAdmin = false, requireSuperAdmin = false }: ProtectedRouteProps) {
  const { session, profile, profileResolved, loading, isAdmin } = useAuthStore()

  if (loading || (session && requireSuperAdmin && !profileResolved)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/my" replace />
  }

  if (requireSuperAdmin && (profile?.id !== session.user.id || profile.role !== 'admin')) {
    return <Navigate to="/my" replace />
  }

  return <>{children}</>
}
