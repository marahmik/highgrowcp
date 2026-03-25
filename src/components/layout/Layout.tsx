import { Link, useNavigate } from 'react-router-dom'
import { LogOut, User, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'

export function Layout({ children }: { children: React.ReactNode }) {
  const { session, profile, isAdmin: checkIsAdmin } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = checkIsAdmin()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to={session ? (isAdmin ? '/admin' : '/my') : '/'} className="flex items-center gap-2 font-bold text-lg no-underline text-foreground shrink-0">
            <Calendar className="h-5 w-5" />
            <span className="hidden sm:inline">하이그로우 Corp.</span>
            <span className="sm:hidden">HG</span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            {session && (
              <>
                <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-4 w-4 hidden sm:block" />
                  <span className="max-w-[80px] sm:max-w-none truncate">{profile?.display_name}</span>
                  {isAdmin && (
                    <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                      관리자
                    </span>
                  )}
                </span>
                {isAdmin && (
                  <>
                    <Button variant="outline" size="sm" className="text-xs px-2" onClick={() => navigate('/admin')}>
                      관리
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs px-2" onClick={() => navigate('/my')}>
                      내근무
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="px-4 py-6">
          {children}
        </div>
      </main>

      <footer className="py-2 text-center text-[10px] text-muted-foreground/50 select-none">
        HDH Hugo Kim & Jason Kim
      </footer>
    </div>
  )
}
