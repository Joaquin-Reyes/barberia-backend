import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Dashboard from './pages/Dashboard'
import SuperAdminPanel from './pages/SuperAdminPanel'
import Turnos from './pages/Turnos'
import Barberos from './pages/Barberos'
import Facturacion from './pages/Facturacion'
import Configuracion from './pages/Configuracion'
import Cola from './pages/Cola'
import PanelBarbero from './pages/PanelBarbero'
import './styles.css'

function App() {
  const [user, setUser] = useState(null)

  const hash = new URLSearchParams(window.location.hash.substring(1))
  if (hash.get('type') === 'invite' && hash.get('access_token')) {
    return <SetPassword />
  }

  if (window.location.pathname === '/set-password') {
    return <SetPassword />
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (user.rol === 'superadmin') {
    return <SuperAdminPanel user={user} onLogout={() => setUser(null)} />
  }

  const defaultRoute = user.rol === 'barbero' ? 'panel-barbero' : 'turnos'

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard user={user} onLogout={() => setUser(null)} />}>
          <Route index element={<Navigate to={defaultRoute} replace />} />
          <Route path="turnos" element={<Turnos user={user} onLogout={() => setUser(null)} />} />
          <Route path="barberos" element={<Barberos user={user} />} />
          <Route path="facturacion" element={<Facturacion user={user} />} />
          <Route path="configuracion" element={<Configuracion user={user} />} />
          <Route path="cola" element={<Cola user={user} />} />
          {user.rol === 'barbero' && (
            <Route path="panel-barbero" element={<PanelBarbero user={user} />} />
          )}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App