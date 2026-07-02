import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck,
  ClipboardCheck,
  Copy,
  Download,
  DollarSign,
  ReceiptText,
  RefreshCw,
  Scissors,
  TrendingUp,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { facturacion as facturacionApi, pagos as pagosApi } from '../lib/api.js'

const METODOS = ['efectivo', 'transferencia', 'mercado_pago', 'tarjeta', 'otro']
const TIPOS = ['pago_total', 'sena', 'parcial', 'ajuste']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function monthStart() {
  return `${today().slice(0, 7)}-01`
}

function money(value) {
  return Number(value || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })
}

function labelText(value) {
  return String(value || '-')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function niceDate(value) {
  if (!value) return '-'
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date)
}

function niceDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

function periodoCompleto(desde, hasta) {
  if (!desde || !hasta) return '-'
  return desde === hasta ? niceDate(desde) : `${niceDate(desde)} - ${niceDate(hasta)}`
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function controlPorMetodo(data, conteoMetodo) {
  return (data?.por_metodo || []).map((row) => {
    const esperado = Number(row.total || 0)
    const contado = Number(conteoMetodo[row.id] || 0)
    return { ...row, esperado, contado, diferencia: contado - esperado }
  })
}

function totalDiferencia(control) {
  return control.reduce((sum, row) => sum + row.diferencia, 0)
}

function cierreControlRows(cierre) {
  if (Array.isArray(cierre?.diferencias_metodo) && cierre.diferencias_metodo.length) return cierre.diferencias_metodo
  return (cierre?.por_metodo || []).map((row) => ({
    id: row.id,
    nombre: row.nombre,
    esperado: Number(row.total || 0),
    contado: Number(row.total || 0),
    diferencia: 0,
  }))
}

function buildCajaResumen(data, nota, conteoMetodo) {
  const control = controlPorMetodo(data, conteoMetodo)
  const lines = [
    `Caja ${periodoCompleto(data?.desde, data?.hasta)}`,
    `Total: ${money(data?.total)}`,
    `Pagos: ${data?.pagos_count || 0}`,
    'Control:',
    ...control.map((row) => `${labelText(row.nombre)} contado: ${money(row.contado)} / diferencia: ${money(row.diferencia)}`),
    `Diferencia total: ${money(totalDiferencia(control))}`,
  ]
  if (nota?.trim()) lines.push(`Nota: ${nota.trim()}`)
  return lines.join('\n')
}

function StatCard({ label, value, sub, Icon }) {
  return (
    <div className="fact-card">
      <div className="fact-card-head">
        <span>{label}</span>
        {createElement(Icon, { size: 17, color: 'var(--primary)' })}
      </div>
      <strong className="fact-card-value">{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function Tabs({ items, active, onChange }) {
  return (
    <div className="fact-tabs">
      {items.map(({ id, label, sub, Icon }) => {
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            className={`fact-tab${selected ? ' active' : ''}`}
            onClick={() => onChange(id)}
          >
            {createElement(Icon, { size: 16 })}
            <span>
              <strong>{label}</strong>
              {sub && <small>{sub}</small>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function EmptyState({ text }) {
  return <div className="fact-empty">{text}</div>
}

function Ranking({ title, Icon, rows, nameLabel, countLabel = 'Pagos', countKey = 'pagos' }) {
  return (
    <section>
      <div className="fact-section-title">
        {createElement(Icon, { size: 17, color: 'var(--primary)' })}
        <h2>{title}</h2>
      </div>
      {!rows?.length ? (
        <EmptyState text="No hay datos para este período." />
      ) : (
        <div className="fact-list">
          <div className="fact-list-head">
            <span>{nameLabel}</span>
            <span>{countLabel}</span>
            <span>Total</span>
          </div>
          {rows.map((row) => (
            <div className="fact-list-row" key={row.id}>
              <span title={labelText(row.nombre)}>{labelText(row.nombre)}</span>
              <span>{row[countKey] ?? row.pagos ?? row.turnos ?? 0}</span>
              <strong>{money(row.total)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CobrarPanel({ turnos, pagoForm, setPagoForm, registrando, onRegistrar }) {
  return (
    <section className="fact-panel">
      <div className="fact-section-title">
        <WalletCards size={17} color="var(--primary)" />
        <h2>Cobrar turnos completados</h2>
      </div>
      {!turnos.length ? (
        <EmptyState text="No hay turnos completados en este período." />
      ) : (
        <div className="fact-charge-list">
          {turnos.map((turno) => {
            const seleccionado = pagoForm.turno_id === turno.id
            const saldo = Number(turno.saldo || 0)
            return (
              <div className={`fact-charge-row${seleccionado ? ' selected' : ''}`} key={turno.id}>
                <button
                  type="button"
                  className="fact-charge-main"
                  onClick={() => setPagoForm((current) => ({
                    ...current,
                    turno_id: turno.id,
                    monto: saldo || turno.precio || '',
                  }))}
                >
                  <span>
                    <strong>{turno.nombre || 'Sin cliente'}</strong>
                    <small>{niceDate(turno.fecha)} · {turno.hora || '-'} · {turno.servicio || 'Sin servicio'} · {turno.barbero || 'Sin barbero'}</small>
                  </span>
                  <span>
                    <strong>{money(turno.precio)}</strong>
                    <small>{turno.estado_pago === 'pagado' ? 'Pagado' : `Saldo ${money(saldo)}`}</small>
                  </span>
                </button>
                {seleccionado && (
                  <form className="fact-pay-form" onSubmit={onRegistrar}>
                    <label>
                      Monto
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={pagoForm.monto}
                        onChange={(e) => setPagoForm((current) => ({ ...current, monto: e.target.value }))}
                      />
                    </label>
                    <label>
                      Método
                      <select value={pagoForm.metodo} onChange={(e) => setPagoForm((current) => ({ ...current, metodo: e.target.value }))}>
                        {METODOS.map((metodo) => <option key={metodo} value={metodo}>{labelText(metodo)}</option>)}
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select value={pagoForm.tipo} onChange={(e) => setPagoForm((current) => ({ ...current, tipo: e.target.value }))}>
                        {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{labelText(tipo)}</option>)}
                      </select>
                    </label>
                    <label>
                      Nota
                      <input
                        value={pagoForm.nota}
                        onChange={(e) => setPagoForm((current) => ({ ...current, nota: e.target.value }))}
                        placeholder="Opcional"
                      />
                    </label>
                    <button className="btn-primary" type="submit" disabled={registrando || !Number(pagoForm.monto)}>
                      {registrando ? 'Registrando...' : 'Registrar pago'}
                    </button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CajaPanel({
  data,
  cierres,
  nota,
  setNota,
  conteoMetodo,
  setConteoMetodo,
  cerrando,
  copiado,
  cierreAbiertoId,
  setCierreAbiertoId,
  onCerrar,
  onCopiar,
  onExportar,
  onExportarCierre,
  onCopiarCierre,
  onAnularCierre,
}) {
  const control = controlPorMetodo(data, conteoMetodo)
  const diferenciaTotal = totalDiferencia(control)
  const cierreActual = cierres.find((cierre) => cierre.fecha_desde === data?.desde && cierre.fecha_hasta === data?.hasta)

  return (
    <section className="fact-panel">
      <div className="fact-caja-head">
        <div>
          <div className="fact-section-title">
            <ClipboardCheck size={17} color="var(--primary)" />
            <h2>Cierre de caja</h2>
          </div>
          <p>{periodoCompleto(data?.desde, data?.hasta)} · {data?.pagos_count || 0} pagos</p>
        </div>
        <strong>{money(data?.total)}</strong>
      </div>

      {cierreActual && (
        <div className="fact-ok">
          <span><strong>Caja cerrada</strong> · {niceDateTime(cierreActual.created_at)}</span>
          <span>Diferencia: <strong>{money(cierreActual.diferencia_total)}</strong></span>
        </div>
      )}

      <div className="fact-control-grid">
        {control.length ? control.map((row) => (
          <div className="fact-control-card" key={row.id}>
            <small>{labelText(row.nombre)}</small>
            <strong>{money(row.esperado)}</strong>
            <label>
              Contado
              <input
                type="number"
                min="0"
                step="0.01"
                value={conteoMetodo[row.id] ?? ''}
                onChange={(e) => setConteoMetodo((current) => ({ ...current, [row.id]: e.target.value }))}
              />
            </label>
            <span className={Math.abs(row.diferencia) < 0.01 ? '' : 'danger'}>
              Diferencia: {money(row.diferencia)}
            </span>
          </div>
        )) : <EmptyState text="Sin pagos para cerrar." />}
      </div>

      <div className="fact-diff">
        <span>Diferencia total</span>
        <strong className={Math.abs(diferenciaTotal) < 0.01 ? '' : 'danger'}>{money(diferenciaTotal)}</strong>
      </div>

      <div className="fact-actions">
        <label>
          Nota del cierre
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: efectivo contado y transferencias revisadas" />
        </label>
        <button type="button" onClick={onExportar} disabled={!data?.pagos_count}><Download size={15} />CSV</button>
        <button type="button" onClick={onCopiar} disabled={!data?.pagos_count}><Copy size={15} />{copiado ? 'Copiado' : 'Copiar'}</button>
        <button className="btn-primary" type="button" onClick={onCerrar} disabled={cerrando || !data?.pagos_count || cierreActual}>
          <ClipboardCheck size={15} />{cierreActual ? 'Caja cerrada' : cerrando ? 'Cerrando...' : 'Cerrar caja'}
        </button>
      </div>

      <div className="fact-history">
        <h2>Historial de cierres</h2>
        {!cierres.length ? (
          <EmptyState text="Todavía no hay cierres de caja." />
        ) : cierres.map((cierre) => {
          const abierto = cierreAbiertoId === cierre.id
          return (
            <div className="fact-close-row" key={cierre.id}>
              <button type="button" onClick={() => setCierreAbiertoId(abierto ? null : cierre.id)}>
                <span>
                  <strong>{periodoCompleto(cierre.fecha_desde, cierre.fecha_hasta)}</strong>
                  <small>{cierre.nota || niceDateTime(cierre.created_at)}</small>
                </span>
                <span className={Math.abs(Number(cierre.diferencia_total || 0)) < 0.01 ? '' : 'danger'}>
                  {Math.abs(Number(cierre.diferencia_total || 0)) < 0.01 ? 'OK' : money(cierre.diferencia_total)}
                </span>
                <strong>{money(cierre.total)}</strong>
              </button>
              {abierto && (
                <div className="fact-close-detail">
                  <div className="fact-actions compact">
                    <button type="button" onClick={() => onExportarCierre(cierre)}><Download size={14} />CSV</button>
                    <button type="button" onClick={() => onCopiarCierre(cierre)}><Copy size={14} />Copiar</button>
                    <button type="button" className="danger-button" onClick={() => onAnularCierre(cierre)}><XCircle size={14} />Anular</button>
                  </div>
                  {cierreControlRows(cierre).map((row) => (
                    <div className="fact-close-control" key={row.id}>
                      <span>{labelText(row.nombre)}</span>
                      <span>{money(row.esperado)}</span>
                      <span>{money(row.contado)}</span>
                      <strong className={Math.abs(Number(row.diferencia || 0)) < 0.01 ? '' : 'danger'}>{money(row.diferencia)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Movimientos({ rows, onAnular }) {
  return (
    <section className="fact-panel">
      <div className="fact-section-title">
        <ReceiptText size={17} color="var(--primary)" />
        <h2>Movimientos</h2>
      </div>
      {!rows.length ? (
        <EmptyState text="Los pagos registrados aparecen acá." />
      ) : (
        <div className="fact-list movements">
          {rows.map((pago) => (
            <div className="fact-list-row movement" key={pago.id}>
              <span>{niceDateTime(pago.created_at)}</span>
              <span>
                <strong>{pago.cliente_nombre || 'Sin cliente'}</strong>
                <small>{pago.servicio || 'Sin servicio'} · {pago.barbero || 'Sin barbero'} · {labelText(pago.metodo)} · {labelText(pago.tipo)}</small>
              </span>
              <strong>{money(pago.monto)}</strong>
              <button type="button" className="danger-button" onClick={() => onAnular(pago)}>
                <XCircle size={14} />Anular
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Facturacion() {
  const [desde, setDesde] = useState(monthStart)
  const [hasta, setHasta] = useState(today)
  const [data, setData] = useState(null)
  const [cajaData, setCajaData] = useState(null)
  const [turnosCobro, setTurnosCobro] = useState([])
  const [cierres, setCierres] = useState([])
  const [conteoMetodo, setConteoMetodo] = useState({})
  const [cierreNota, setCierreNota] = useState('')
  const [vista, setVista] = useState('caja')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [resumenCopiado, setResumenCopiado] = useState(false)
  const [cierreAbiertoId, setCierreAbiertoId] = useState(null)
  const [pagoForm, setPagoForm] = useState({ turno_id: '', monto: '', metodo: 'efectivo', tipo: 'pago_total', nota: '' })

  const periodoLabel = useMemo(() => periodoCompleto(desde, hasta), [desde, hasta])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [resumen, caja, turnos, cierresCaja] = await Promise.all([
        facturacionApi.resumen({ desde, hasta }),
        pagosApi.caja({ desde, hasta }),
        pagosApi.turnos({ desde, hasta }),
        pagosApi.cierres({ limit: 10 }),
      ])
      setData(resumen)
      setCajaData(caja)
      setTurnosCobro(turnos)
      setCierres(cierresCaja)
      setCierreAbiertoId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!cajaData?.por_metodo) return
    setConteoMetodo((current) => {
      const next = {}
      for (const row of cajaData.por_metodo) next[row.id] = current[row.id] ?? Number(row.total || 0).toFixed(2)
      return next
    })
  }, [cajaData?.desde, cajaData?.hasta, cajaData?.por_metodo])

  async function registrarPago(event) {
    event.preventDefault()
    setRegistrando(true)
    setError('')
    try {
      await pagosApi.create(pagoForm)
      setPagoForm({ turno_id: '', monto: '', metodo: 'efectivo', tipo: 'pago_total', nota: '' })
      await cargar()
      setVista('caja')
    } catch (err) {
      setError(err.message)
    } finally {
      setRegistrando(false)
    }
  }

  async function cerrarCaja() {
    if (!cajaData?.pagos_count) return
    const diferencia = totalDiferencia(controlPorMetodo(cajaData, conteoMetodo))
    if (!window.confirm(`Cerrar caja de ${periodoLabel} por ${money(cajaData.total)} con diferencia de ${money(diferencia)}?`)) return
    setCerrando(true)
    setError('')
    try {
      const cierre = await pagosApi.cerrarCaja({
        fecha_desde: cajaData.desde,
        fecha_hasta: cajaData.hasta,
        conteo_metodo: conteoMetodo,
        nota: cierreNota,
      })
      setCierres((current) => [cierre, ...current])
      setCierreAbiertoId(cierre.id)
      setCierreNota('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCerrando(false)
    }
  }

  async function anularPago(pago) {
    const motivo = window.prompt(`Motivo para anular el pago de ${money(pago.monto)}`)
    if (motivo === null) return
    setError('')
    try {
      await pagosApi.anular(pago.id, motivo)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function anularCierre(cierre) {
    const motivo = window.prompt(`Motivo para anular el cierre de ${periodoCompleto(cierre.fecha_desde, cierre.fecha_hasta)}`)
    if (motivo === null) return
    if (!window.confirm('Este cierre se va a anular y el período va a quedar disponible para volver a cerrarse. ¿Continuar?')) return
    setError('')
    try {
      await pagosApi.anularCierre(cierre.id, motivo)
      setCierres((current) => current.filter((item) => item.id !== cierre.id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function copiarResumenCaja() {
    if (!cajaData?.pagos_count) return
    const resumen = buildCajaResumen(cajaData, cierreNota, conteoMetodo)
    try {
      await navigator.clipboard.writeText(resumen)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = resumen
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setResumenCopiado(true)
    window.setTimeout(() => setResumenCopiado(false), 1800)
  }

  function exportarCajaCsv() {
    const rows = [
      ['fecha', 'cliente', 'servicio', 'barbero', 'metodo', 'tipo', 'monto'],
      ...(cajaData?.pagos || []).map((pago) => [
        niceDateTime(pago.created_at),
        pago.cliente_nombre || 'Sin cliente',
        pago.servicio || 'Sin servicio',
        pago.barbero || 'Sin barbero',
        labelText(pago.metodo),
        labelText(pago.tipo),
        Number(pago.monto || 0).toFixed(2),
      ]),
    ]
    downloadCsv(`caja-${cajaData.desde}-${cajaData.hasta}.csv`, rows)
  }

  function exportarCierreCsv(cierre) {
    const rows = [
      ['periodo', 'metodo', 'esperado', 'contado', 'diferencia'],
      ...cierreControlRows(cierre).map((row) => [
        periodoCompleto(cierre.fecha_desde, cierre.fecha_hasta),
        labelText(row.nombre),
        Number(row.esperado || 0).toFixed(2),
        Number(row.contado || 0).toFixed(2),
        Number(row.diferencia || 0).toFixed(2),
      ]),
    ]
    downloadCsv(`cierre-${cierre.fecha_desde}-${cierre.fecha_hasta}.csv`, rows)
  }

  async function copiarCierre(cierre) {
    const lines = [
      `Cierre ${periodoCompleto(cierre.fecha_desde, cierre.fecha_hasta)}`,
      `Total: ${money(cierre.total)}`,
      `Pagos: ${cierre.pagos_count || 0}`,
      `Diferencia total: ${money(cierre.diferencia_total)}`,
      ...cierreControlRows(cierre).map((row) => `${labelText(row.nombre)} esperado: ${money(row.esperado)} / contado: ${money(row.contado)} / diferencia: ${money(row.diferencia)}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  const total = data?.total || 0
  const usaPagos = data?.fuente === 'pagos'
  const operaciones = usaPagos ? data?.pagos_count || 0 : data?.turnos_completados || 0
  const ticketPromedio = data?.ticket_promedio || 0
  const mejorBarbero = data?.mejor_barbero || data?.por_barbero?.[0]
  const movimientos = cajaData?.pagos || []
  const tabs = [
    { id: 'caja', label: 'Caja', sub: `${cajaData?.pagos_count || 0} pagos`, Icon: ClipboardCheck },
    { id: 'cobrar', label: 'Cobrar', sub: `${turnosCobro.filter((t) => t.estado_pago !== 'pagado').length} pendientes`, Icon: WalletCards },
    { id: 'analisis', label: 'Análisis', sub: `${operaciones} registros`, Icon: TrendingUp },
    { id: 'movimientos', label: 'Movimientos', sub: `${movimientos.length} pagos`, Icon: ReceiptText },
  ]

  return (
    <div className="fact-page">
      <header className="fact-header">
        <div>
          <h1>Facturación</h1>
          <p>{usaPagos ? 'Pagos registrados' : 'Turnos completados'} · {periodoLabel}</p>
        </div>
        <div className="fact-filters">
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
          <button className="btn-primary" type="button" onClick={cargar} disabled={loading}><RefreshCw size={15} />Actualizar</button>
        </div>
      </header>

      {error && <div className="fact-error">{error}</div>}

      <div className="fact-stats">
        <StatCard label="Caja barbería" value={loading ? '...' : money(total)} sub={usaPagos ? 'Pagos reales' : 'Total por turnos'} Icon={DollarSign} />
        <StatCard label={usaPagos ? 'Pagos' : 'Turnos completados'} value={loading ? '...' : operaciones} sub="Base de cálculo" Icon={CalendarCheck} />
        <StatCard label="Ticket promedio" value={loading ? '...' : money(ticketPromedio)} sub={usaPagos ? 'Por pago' : 'Por turno completado'} Icon={ReceiptText} />
        <StatCard label="Mayor aporte" value={loading ? '...' : (mejorBarbero?.nombre || '-')} sub={mejorBarbero ? money(mejorBarbero.total) : 'Sin datos'} Icon={TrendingUp} />
      </div>

      <Tabs items={tabs} active={vista} onChange={setVista} />

      {vista === 'caja' && (
        <CajaPanel
          data={cajaData}
          cierres={cierres}
          nota={cierreNota}
          setNota={setCierreNota}
          conteoMetodo={conteoMetodo}
          setConteoMetodo={setConteoMetodo}
          cerrando={cerrando}
          copiado={resumenCopiado}
          cierreAbiertoId={cierreAbiertoId}
          setCierreAbiertoId={setCierreAbiertoId}
          onCerrar={cerrarCaja}
          onCopiar={copiarResumenCaja}
          onExportar={exportarCajaCsv}
          onExportarCierre={exportarCierreCsv}
          onCopiarCierre={copiarCierre}
          onAnularCierre={anularCierre}
        />
      )}

      {vista === 'cobrar' && <CobrarPanel turnos={turnosCobro} pagoForm={pagoForm} setPagoForm={setPagoForm} registrando={registrando} onRegistrar={registrarPago} />}

      {vista === 'analisis' && (
        <div className="fact-grid">
          <Ranking title="Por barbero" Icon={Scissors} rows={data?.por_barbero || []} nameLabel="Barbero" countLabel={usaPagos ? 'Pagos' : 'Turnos'} countKey={usaPagos ? 'pagos' : 'turnos'} />
          <Ranking title="Por servicio" Icon={ReceiptText} rows={data?.por_servicio || []} nameLabel="Servicio" countLabel={usaPagos ? 'Pagos' : 'Turnos'} countKey={usaPagos ? 'pagos' : 'turnos'} />
          {usaPagos && <Ranking title="Por método" Icon={WalletCards} rows={data?.por_metodo || []} nameLabel="Método" />}
          {usaPagos && <Ranking title="Por tipo" Icon={ReceiptText} rows={data?.por_tipo || []} nameLabel="Tipo" />}
          <Ranking title="Por día" Icon={CalendarCheck} rows={data?.por_dia || []} nameLabel="Día" countLabel={usaPagos ? 'Pagos' : 'Turnos'} countKey={usaPagos ? 'pagos' : 'turnos'} />
        </div>
      )}

      {vista === 'movimientos' && <Movimientos rows={movimientos} onAnular={anularPago} />}
    </div>
  )
}
