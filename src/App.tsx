import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'

// Code-split all page components — each becomes its own chunk
const Landing = lazy(() => import('@/pages/Landing'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const CreateSplit = lazy(() => import('@/pages/CreateSplit'))
const Receipt = lazy(() => import('@/pages/Receipt'))
const Activity = lazy(() => import('@/pages/Activity'))
const HowItWorks = lazy(() => import('@/pages/HowItWorks'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="size-6 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: 'var(--accent)' }} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={<Layout><Landing /></Layout>}
          />
          <Route
            path="/dashboard"
            element={<Layout><Dashboard /></Layout>}
          />
          <Route
            path="/create"
            element={<Layout><CreateSplit /></Layout>}
          />
          <Route
            path="/d/:id"
            element={<Layout><Receipt /></Layout>}
          />
          <Route
            path="/activity"
            element={<Layout><Activity /></Layout>}
          />
          <Route
            path="/how-it-works"
            element={<Layout><HowItWorks /></Layout>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
