import { getAuthToken, supabase } from './supabase.js'

const BASE = import.meta.env.VITE_API_URL || ''

async function request(path, options = {}) {
  const token = await getAuthToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    if (res.status === 401) await supabase.auth.signOut()
    throw new Error([err.error, err.detalle].filter(Boolean).join(' - ') || `Error ${res.status}`)
  }

  if (res.status === 204) return null
  return res.json()
}

export const facturacion = {
  resumen: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/facturacion/resumen${qs ? `?${qs}` : ''}`)
  },
}

export const pagos = {
  turnos: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/pagos/turnos${qs ? `?${qs}` : ''}`)
  },
  byTurno: (turnoId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/pagos/turno/${turnoId}${qs ? `?${qs}` : ''}`)
  },
  addProductoTurno: (body) => request('/api/pagos/turno-productos', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  removeProductoTurno: (itemId) => request(`/api/pagos/turno-productos/${itemId}`, {
    method: 'DELETE',
  }),
  create: (body) => request('/api/pagos', { method: 'POST', body: JSON.stringify(body) }),
  anular: (id, motivo) => request(`/api/pagos/${id}/anular`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  }),
  caja: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/pagos/caja/resumen${qs ? `?${qs}` : ''}`)
  },
  cierres: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/pagos/caja/cierres${qs ? `?${qs}` : ''}`)
  },
  cerrarCaja: (body) => request('/api/pagos/caja/cierres', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  anularCierre: (id, motivo) => request(`/api/pagos/caja/cierres/${id}/anular`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  }),
}

export const productos = {
  list: () => request('/api/productos'),
  create: (body) => request('/api/productos', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/api/productos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  delete: (id) => request(`/api/productos/${id}`, { method: 'DELETE' }),
}
