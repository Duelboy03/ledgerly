import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './components/auth'
import { Layout } from './components/Layout'
import { Audit } from './pages/Audit'
import { Approvals } from './pages/Approvals'
import { Calendar } from './pages/Calendar'
import { Dashboard } from './pages/Dashboard'
import { Leave } from './pages/Leave'
import { Login } from './pages/Login'
import { Payroll } from './pages/Payroll'
import { Payslip } from './pages/Payslip'
import { Payslips } from './pages/Payslips'
import { People } from './pages/People'
import { Person } from './pages/Person'
import { Timesheet } from './pages/Timesheet'

export default function App() {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user) return <Login />
  const hr = user.role === 'hr_admin'
  const mgr = user.role !== 'employee'
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="leave" element={<Leave />} />
        <Route path="approvals" element={mgr ? <Approvals /> : <Navigate to="/" replace />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="timesheet" element={<Timesheet />} />
        <Route path="payslips" element={<Payslips />} />
        <Route path="payslips/:id" element={<Payslip />} />
        <Route path="people" element={<People />} />
        <Route path="people/:id" element={<Person />} />
        <Route path="payroll" element={hr ? <Payroll /> : <Navigate to="/" replace />} />
        <Route path="audit" element={hr ? <Audit /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
