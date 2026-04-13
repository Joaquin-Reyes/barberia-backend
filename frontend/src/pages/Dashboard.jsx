import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, DollarSign, Settings, LogOut, Clock } from 'lucide-react'

const navItems = [
  { to: 'turnos', label: 'Turnos', icon: LayoutDashboard },
  { to: 'barberos', label: 'Barberos', icon: Users },
  { to: 'cola', label: 'Cola', icon: Clock },
  { to: 'facturacion', label: 'Facturación', icon: DollarSign },
  { to: 'configuracion', label: 'Configuración', icon: Settings },
]

function Dashboard({ user, onLogout }) {
  return (
    <div className="flex h-screen bg-gray-50">

      {/* Sidebar - solo desktop */}
      <aside className="sidebar-desktop w-52 bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-200">
          <p className="font-semibold text-sm text-gray-900">BarberApp</p>
          <p className="text-xs text-gray-400 mt-0.5">Panel de gestión</p>
        </div>
        <nav className="flex-1 px-2 py-3 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-1.5 truncate">{user?.email}</p>
          <button
            onClick={onLogout}
            className="text-xs text-red-500 font-medium hover:text-red-600 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-y-auto main-content">
        <Outlet />
      </main>

      {/* Navbar inferior - solo mobile */}
      <nav className="navbar-mobile fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-gray-900' : 'text-gray-400'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={onLogout}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-red-400 transition-colors"
        >
          <LogOut size={20} />
          Salir
        </button>
      </nav>

    </div>
  )
}

export default Dashboard
