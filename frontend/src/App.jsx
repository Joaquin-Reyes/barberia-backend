import { useState, useEffect } from 'react'
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
import { supabase } from './lib/supabase'
import './styles.css'

function App() {
  const [user, setUser] = useState(null)
  const [cargando, setCargando] = useState(true)

  const hash = new URLSearchParams(window.location.hash.substring(1))
  const esInvite = hash.get('type') === 'invite' && hash.get('access_token')

  useEffect(() => {
    if (esInvite) {
      setCargando(false)
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setCargando(false)
        return
      }

      const { data: usuarioDB } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (usuarioDB) setUser(usuarioDB)
      setCargando(false)
    })
  }, [])

  if (esInvite || window.location.pathname === '/set-password') {
    return <SetPassword />
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#475569', fontSize: 14 }}>Cargando...</p>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('token')
    setUser(null)
  }

  if (user.rol === 'superadmin') {
    return <SuperAdminPanel user={user} onLogout={handleLogout} />
  }

  const defaultRoute = user.rol === 'barbero' ? 'panel-barbero' : 'turnos'

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard user={user} onLogout={handleLogout} />}>
          <Route index element={<Navigate to={defaultRoute} replace />} />
          <Route path="turnos" element={<Turnos user={user} onLogout={handleLogout} />} />
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