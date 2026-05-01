import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, DollarSign, Settings, LogOut, Clock, Scissors, Menu, X } from 'lucide-react'

const adminNavItems = [
  { to: 'turnos',        label: 'Turnos',        icon: LayoutDashboard },
  { to: 'barberos',      label: 'Barberos',       icon: Users           },
  { to: 'cola',          label: 'Cola',           icon: Clock           },
  { to: 'facturacion',   label: 'Facturación',    icon: DollarSign      },
  { to: 'configuracion', label: 'Configuración',  icon: Settings        },
]

const barberoNavItems = [
  { to: 'panel-barbero', label: 'Mi Panel', icon: Scissors },
]

function Dashboard({ user, onLogout }) {
  const navItems = user?.rol === 'barbero' ? barberoNavItems : adminNavItems
  const [drawerOpen, setDrawerOpen] = useState(false)

  const closeDrawer = () => setDrawerOpen(false)

  return (
    <div className="flex h-screen" style={{ background: '#F8FAFC' }}>

      {/* ─── Sidebar desktop ─── */}
      <aside
        className="sidebar-desktop w-56 flex-col shrink-0"
        style={{ background: '#0F172A', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-3 px-4 py-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: 30, height: 30, background: '#2563EB' }}
          >
            <Scissors size={15} color="#ffffff" />
          </div>
          <div className="min-w-0">
            <p style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', margin: 0, letterSpacing: '-0.02em' }}>
              BarberApp
            </p>
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
              Panel de gestión
            </p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 flex flex-col" style={{ gap: 2 }}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? '' : 'hover:bg-white/5'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'rgba(37,99,235,0.22)', color: '#93C5FD' }
                  : { color: '#64748B' }
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User & logout */}
        <div
          className="px-3 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <div
              className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
              style={{ width: 26, height: 26, background: '#1E293B', color: '#94A3B8' }}
            >
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <p className="text-xs truncate" style={{ color: '#475569', margin: 0 }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-transparent hover:bg-red-500/10"
            style={{ color: '#F87171', border: 'none', justifyContent: 'flex-start' }}
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <main className="flex-1 overflow-y-auto flex flex-col">

        {/* Topbar mobile con hamburger */}
        <div
          className="mobile-topbar flex items-center justify-between px-4 bg-white shrink-0"
          style={{ height: 54, borderBottom: '1px solid #E2E8F0' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{ width: 28, height: 28, background: '#2563EB' }}
            >
              <Scissors size={13} color="#ffffff" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.02em' }}>
              BarberApp
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center justify-center rounded-lg bg-transparent"
            style={{ width: 44, height: 44, border: 'none', color: '#0F172A' }}
          >
            <Menu size={30} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      {/* ─── Overlay ─── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 sm:hidden"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={closeDrawer}
        />
      )}

      {/* ─── Drawer lateral mobile ─── */}
      <div
        className="fixed top-0 left-0 h-full sm:hidden z-50 flex flex-col"
        style={{
          width: 260,
          background: '#0F172A',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          boxShadow: drawerOpen ? '4px 0 24px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        {/* Header drawer */}
        <div
          className="flex items-center justify-between px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{ width: 30, height: 30, background: '#2563EB' }}
            >
              <Scissors size={15} color="#ffffff" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', margin: 0, letterSpacing: '-0.02em' }}>
                BarberApp
              </p>
              <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
                Panel de gestión
              </p>
            </div>
          </div>
          <button
            onClick={closeDrawer}
            className="flex items-center justify-center rounded-lg bg-transparent"
            style={{ width: 32, height: 32, border: 'none', color: '#475569' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items drawer */}
        <nav className="flex-1 px-2 py-3 flex flex-col overflow-y-auto" style={{ gap: 2 }}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeDrawer}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? '' : 'hover:bg-white/5'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'rgba(37,99,235,0.22)', color: '#93C5FD' }
                  : { color: '#64748B' }
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User & logout drawer */}
        <div
          className="px-3 py-4 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <div
              className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
              style={{ width: 28, height: 28, background: '#1E293B', color: '#94A3B8' }}
            >
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <p className="text-xs truncate" style={{ color: '#475569', margin: 0 }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-transparent hover:bg-red-500/10"
            style={{ color: '#F87171', border: 'none', justifyContent: 'flex-start' }}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </div>

    </div>
  )
}

export default Dashboard
