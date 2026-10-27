import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import CreateSplit from '@/pages/CreateSplit'
import Receipt from '@/pages/Receipt'
import Activity from '@/pages/Activity'
import HowItWorks from '@/pages/HowItWorks'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing has its own full-bleed layout */}
        <Route
          path="/"
          element={
            <Layout>
              <Landing />
            </Layout>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Layout>
              <Dashboard />
            </Layout>
          }
        />
        <Route
          path="/create"
          element={
            <Layout>
              <CreateSplit />
            </Layout>
          }
        />
        <Route
          path="/d/:id"
          element={
            <Layout>
              <Receipt />
            </Layout>
          }
        />
        <Route
          path="/activity"
          element={
            <Layout>
              <Activity />
            </Layout>
          }
        />
        <Route
          path="/how-it-works"
          element={
            <Layout>
              <HowItWorks />
            </Layout>
          }
        />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
