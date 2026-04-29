import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, DollarSign, Settings, LogOut, Clock, Scissors } from 'lucide-react'

const adminNavItems = [
  { to: 'turnos',        label: 'Turnos',        mobileLabel: 'Turnos',   icon: LayoutDashboard },
  { to: 'barberos',      label: 'Barberos',       mobileLabel: 'Barberos', icon: Users           },
  { to: 'cola',          label: 'Cola',           mobileLabel: 'Cola',     icon: Clock           },
  { to: 'facturacion',   label: 'Facturación',    mobileLabel: 'Factura',  icon: DollarSign      },
  { to: 'configuracion', label: 'Configuración',  mobileLabel: 'Config',   icon: Settings        },
]

const barberoNavItems = [
  { to: 'panel-barbero', label: 'Mi Panel', mobileLabel: 'Panel', icon: Scissors },
  { to: 'cola',          label: 'Cola',     mobileLabel: 'Cola',  icon: Clock    },
]

function Dashboard({ user, onLogout }) {
  const navItems = user?.rol === 'barbero' ? barberoNavItems : adminNavItems

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
      <main className="flex-1 overflow-y-auto main-content">
        <Outlet />
      </main>

      {/* ─── Navbar mobile (bottom) ─── */}
      <nav
        className="navbar-mobile fixed bottom-0 left-0 right-0 bg-white z-50"
        style={{ borderTop: '1px solid #E2E8F0' }}
      >
        {navItems.map(({ to, mobileLabel, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-blue-600' : 'text-slate-400'
              }`
            }
          >
            <Icon size={20} />
            {mobileLabel}
          </NavLink>
        ))}
        <button
          onClick={onLogout}
          className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium text-red-400 bg-transparent"
          style={{ border: 'none' }}
        >
          <LogOut size={20} />
          Salir
        </button>
      </nav>

    </div>
  )
}

export default Dashboard
