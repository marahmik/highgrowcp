import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/providers/AuthProvider'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { MainPage } from '@/pages/MainPage'
import { MyPage } from '@/pages/MyPage'
import { StorePage } from '@/pages/StorePage'
import { AdminPage } from '@/pages/admin/AdminPage'
import { HistoryPage } from '@/pages/HistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route
              path="/my"
              element={
                <ProtectedRoute>
                  <MyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/store/:storeId"
              element={
                <ProtectedRoute>
                  <StorePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Layout>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  )
}
