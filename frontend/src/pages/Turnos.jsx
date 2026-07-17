import { Fragment, useCallback, useEffect, useState } from "react";
import { Check, Plus, Search, Pencil, X, WalletCards, Trash2 } from "lucide-react";
import { supabase, turnoDisponible, getAuthToken } from "../lib/supabase";
import { pagos as pagosApi, productos as productosApi } from "../lib/api";

const API = "https://barberia-backend-production-7dae.up.railway.app";

const METODOS_PAGO = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["mercado_pago", "Mercado Pago"],
  ["tarjeta", "Tarjeta"],
  ["otro", "Otro"],
];

const TIPOS_PAGO = [
  ["pago_total", "Pago total"],
  ["sena", "Seña"],
  ["parcial", "Parcial"],
  ["ajuste", "Ajuste"],
];

function money(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function labelText(value) {
  return String(value || "-").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PagoBadge({ estado }) {
  const config = {
    pagado: ["Pagado", "#DCFCE7", "#166534", "#BBF7D0"],
    sena: ["Con seña", "#FEF3C7", "#92400E", "#FDE68A"],
    parcial: ["Parcial", "#DBEAFE", "#1E40AF", "#BFDBFE"],
    sin_pagar: ["Sin pagar", "#F1F5F9", "#475569", "#E2E8F0"],
  }[estado || "sin_pagar"];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: config[1],
        color: config[2],
        border: `1px solid ${config[3]}`,
        whiteSpace: "nowrap",
      }}
    >
      {config[0]}
    </span>
  );
}

function PagosPanel({ turno, onChanged, onToast }) {
  const [data, setData] = useState(null);
  const [productos, setProductos] = useState([]);
  const [productoForm, setProductoForm] = useState({ producto_id: "", cantidad: 1 });
  const [form, setForm] = useState({
    monto: turno?.precio || "",
    metodo: "efectivo",
    tipo: "pago_total",
    nota: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProducto, setSavingProducto] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!turno?.id) return;
    setLoading(true);
    setError("");
    try {
      const resumen = await pagosApi.byTurno(turno.id, { legacyCompletados: "1" });
      setData(resumen);
      setForm((prev) => ({
        ...prev,
        monto: resumen?.saldo > 0 ? String(resumen.saldo) : prev.monto || String(turno.precio || ""),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [turno?.id, turno?.precio]);

  useEffect(() => {
    setData(null);
    setForm({ monto: turno?.precio || "", metodo: "efectivo", tipo: "pago_total", nota: "" });
    cargar();
  }, [cargar, turno?.precio]);

  useEffect(() => {
    productosApi.list()
      .then((items) => setProductos((items || []).filter((item) => item.activo)))
      .catch(() => setProductos([]));
  }, []);

  function set(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function registrar(e) {
    e.preventDefault();
    setError("");
    if (cobroBloqueado) {
      setError("El turno ya figura saldado");
      return;
    }
    if (!Number(form.monto) || Number(form.monto) <= 0) {
      setError("Ingresá un monto válido");
      return;
    }

    setSaving(true);
    try {
      await pagosApi.create({
        turno_id: turno.id,
        monto: Number(form.monto),
        metodo: form.metodo,
        tipo: form.tipo,
        nota: form.nota || undefined,
      });
      setForm((prev) => ({ ...prev, nota: "" }));
      await cargar();
      onChanged?.();
      onToast?.("Pago registrado");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function anular(id) {
    setError("");
    try {
      await pagosApi.anular(id, "Anulado desde turnos");
      await cargar();
      onChanged?.();
      onToast?.("Pago anulado");
    } catch (err) {
      setError(err.message);
    }
  }

  async function agregarProducto(e) {
    e.preventDefault();
    setError("");
    if (!productoForm.producto_id) {
      setError("Seleccioná un producto");
      return;
    }
    if (!Number(productoForm.cantidad) || Number(productoForm.cantidad) <= 0) {
      setError("Ingresá una cantidad válida");
      return;
    }

    setSavingProducto(true);
    try {
      await pagosApi.addProductoTurno({
        turno_id: turno.id,
        producto_id: productoForm.producto_id,
        cantidad: Number(productoForm.cantidad),
      });
      setProductoForm({ producto_id: "", cantidad: 1 });
      await cargar();
      onChanged?.();
      onToast?.("Producto agregado al turno");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProducto(false);
    }
  }

  async function quitarProducto(itemId) {
    setError("");
    try {
      await pagosApi.removeProductoTurno(itemId);
      await cargar();
      onChanged?.();
      onToast?.("Producto quitado del turno");
    } catch (err) {
      setError(err.message);
    }
  }

  const pagos = data?.pagos || [];
  const productosTurno = data?.productos || [];
  const activos = pagos.filter((p) => !p.anulado_at);
  const cobroBloqueado = data?.pago_historico || (data && Number(data.saldo || 0) <= 0 && form.tipo !== "ajuste");
  const estadoLabel = {
    sin_pagar: "Sin pagar",
    sena: "Con seña",
    parcial: "Pago parcial",
    pagado: "Pagado",
  }[data?.estado_pago] || "Sin datos";

  return (
    <div className="turno-pagos-panel">
      <div className="turno-pagos-head">
        <div>
          <div className="turno-pagos-title">
            <WalletCards size={16} color="var(--primary)" />
            <h3>Pagos de {turno.nombre}</h3>
          </div>
          <p>{turno.servicio || "Sin servicio"} · {turno.barbero || "Sin barbero"}</p>
        </div>
        <PagoBadge estado={data?.estado_pago} />
      </div>

      <div className="turno-pagos-summary">
        <div>
          <span>Servicio</span>
          <strong>{loading ? "..." : money(data?.total_servicio ?? turno.precio)}</strong>
        </div>
        <div>
          <span>Productos</span>
          <strong>{loading ? "..." : money(data?.total_productos)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{loading ? "..." : money(data?.total_cobrable ?? turno.precio)}</strong>
        </div>
        <div>
          <span>Pagado</span>
          <strong>{loading ? "..." : money(data?.total_pagado)}</strong>
        </div>
        <div>
          <span>Saldo</span>
          <strong>{loading ? "..." : money(data?.saldo)}</strong>
        </div>
        <div>
          <span>Estado</span>
          <strong>{estadoLabel}</strong>
        </div>
      </div>

      <div className="turno-productos-box">
        <div className="turno-productos-head">
          <h4>Productos del turno</h4>
          <span>{money(data?.total_productos)}</span>
        </div>
        <form className="turno-productos-form" onSubmit={agregarProducto}>
          <label>
            Producto
            <select
              value={productoForm.producto_id}
              onChange={(e) => setProductoForm((current) => ({ ...current, producto_id: e.target.value }))}
            >
              <option value="">Seleccionar producto</option>
              {productos.map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.nombre} - {money(producto.precio)} · stock {Number(producto.stock || 0).toLocaleString("es-AR")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              step="1"
              value={productoForm.cantidad}
              onChange={(e) => setProductoForm((current) => ({ ...current, cantidad: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={savingProducto || !productoForm.producto_id}>
            {savingProducto ? "Agregando..." : "Agregar"}
          </button>
        </form>

        {productosTurno.length === 0 ? (
          <p className="turno-productos-empty">Sin productos agregados.</p>
        ) : (
          <div className="turno-productos-list">
            {productosTurno.map((item) => (
              <div className="turno-producto-row" key={item.id}>
                <span>
                  <strong>{item.nombre}</strong>
                  <small>{Number(item.cantidad || 0).toLocaleString("es-AR")} x {money(item.precio_unitario)}</small>
                </span>
                <strong>{money(item.subtotal)}</strong>
                <button type="button" className="turno-pago-delete" onClick={() => quitarProducto(item.id)} aria-label="Quitar producto">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="turno-pagos-form" onSubmit={registrar}>
        <label>
          Monto
          <input type="number" min="1" step="0.01" value={form.monto} onChange={(e) => set("monto", e.target.value)} />
        </label>
        <label>
          Método
          <select value={form.metodo} onChange={(e) => set("metodo", e.target.value)}>
            {METODOS_PAGO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Tipo
          <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
            {TIPOS_PAGO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Nota
          <input value={form.nota} onChange={(e) => set("nota", e.target.value)} placeholder="Opcional" />
        </label>
        <button type="submit" disabled={saving || cobroBloqueado}>{saving ? "Registrando..." : "Registrar pago"}</button>
      </form>

      {error && <div className="turno-pagos-error">{error}</div>}

      <div className="turno-pagos-list">
        {activos.length === 0 ? (
          <p>No hay pagos registrados.</p>
        ) : activos.map((pago) => (
          <div className="turno-pago-row" key={pago.id}>
            <span>
              <strong>{money(pago.monto)}</strong>
              <small>{labelText(pago.tipo)} · {labelText(pago.metodo)}</small>
            </span>
            <button type="button" className="turno-pago-delete" onClick={() => anular(pago.id)} aria-label="Anular pago">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Turnos({ user }) {
  const barberiaId = user?.barberia_id;
  const rolUsuario = user?.rol;
  const [turnos, setTurnos] = useState([]);
  const [barberos, setBarberos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [toast, setToast] = useState(null);
  const [nuevo, setNuevo] = useState({
    nombre: "", telefono: "", servicio: "", precio: 0, barbero: "", fecha: "", hora: "",
  });
  const [busqueda, setBusqueda] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [editando, setEditando] = useState({ id: null, valores: null });
  const [pagosPorTurno, setPagosPorTurno] = useState({});
  const [turnoPagosAbierto, setTurnoPagosAbierto] = useState(null);

  const cargarEstadosPago = useCallback(async (turnosBase = []) => {
    if (!turnosBase.length) {
      setPagosPorTurno({});
      return;
    }

    const fechas = turnosBase.map((t) => t.fecha).filter(Boolean).sort();
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];
    if (!desde || !hasta) return;

    if (!(rolUsuario === "admin" || rolUsuario === "superadmin")) return;

    try {
      const data = await pagosApi.turnos({ desde, hasta, todos: "1", legacyCompletados: "1" });
      const mapa = {};
      for (const item of data || []) mapa[item.id] = item;
      setPagosPorTurno(mapa);
    } catch (err) {
      console.warn("No se pudieron cargar estados de pago:", err);
    }
  }, [rolUsuario]);

  const traerTurnos = useCallback(async () => {
    const { data } = await supabase
      .from("turnos").select("*")
      .eq("barberia_id", barberiaId)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });
    const list = data || [];
    setTurnos(list);
    await cargarEstadosPago(list);
  }, [barberiaId, cargarEstadosPago]);

  const traerBarberos = useCallback(async () => {
    const { data } = await supabase
      .from("barberos").select("*")
      .eq("barberia_id", barberiaId)
      .order("nombre", { ascending: true });
    setBarberos(data || []);
  }, [barberiaId]);

  const traerServicios = useCallback(async () => {
    const { data } = await supabase
      .from("servicios").select("*")
      .eq("barberia_id", barberiaId)
      .order("nombre", { ascending: true });
    setServicios(data || []);
  }, [barberiaId]);

  const generarHorarios = (inicio, fin) => {
    const horas = [];
    const normalizar = (valor) => {
      const [h = "0", m = "0"] = String(valor || "").split(":");
      return Number(h) * 60 + Number(m);
    };
    const inicioMin = normalizar(inicio);
    const finMin = normalizar(fin);
    if (isNaN(inicioMin) || isNaN(finMin)) return horas;
    for (let min = inicioMin; min < finMin; min += 30) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      horas.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    return horas;
  };

  useEffect(() => {
    if (!user) return;
    async function cargarDatos() {
      await Promise.all([traerTurnos(), traerBarberos(), traerServicios()]);
    }
    cargarDatos();
  }, [traerBarberos, traerServicios, traerTurnos, user]);

  useEffect(() => {
    if (!nuevo.barbero || !nuevo.fecha || !user) return;
    async function cargarHorarios() {
      const { data: barberoData } = await supabase
        .from("barberos")
        .select("id")
        .eq("nombre", nuevo.barbero)
        .eq("barberia_id", barberiaId)
        .single();

      if (!barberoData) return;

      const fecha = new Date(nuevo.fecha + "T00:00:00");
      const diaSemana = fecha.getDay();

      const { data: horarioDia } = await supabase
        .from("horarios_barbero")
        .select("hora_inicio, hora_fin")
        .eq("barbero_id", barberoData.id)
        .eq("dia_semana", diaSemana)
        .single();

      if (horarioDia) {
        setHorarios(generarHorarios(horarioDia.hora_inicio, horarioDia.hora_fin));
      } else {
        setHorarios([]);
      }
    }
    cargarHorarios();
  }, [barberiaId, nuevo.barbero, nuevo.fecha, user]);

  const handleBarberoChange = (barberoNombre) => {
    setNuevo({ ...nuevo, barbero: barberoNombre, hora: "" });
    setHorarios([]);
  };

  const normHora = (h) => String(h || "").slice(0, 5).replace(/^(\d):/, "0$1:");
  const esMediaHora = (h) => ["00", "30"].includes(normHora(h).split(":")[1]);
  const compararTurnosPorHorario = (a, b) =>
    String(a.fecha || "").localeCompare(String(b.fecha || "")) ||
    normHora(a.hora).localeCompare(normHora(b.hora));

  const horariosDisponibles = horarios.filter((h) =>
    !turnos.some((t) => t.fecha === nuevo.fecha && t.barbero === nuevo.barbero && normHora(t.hora) === h)
  );

  async function cambiarEstado(id, nuevoEstado) {
    try {
      await fetch(`${API}/admin/turnos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      traerTurnos();
    } catch (error) {
      console.error("ERROR:", error);
    }
  }

  const mostrarToast = (mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const puedeAdministrarTurnos = user.rol === "admin" || user.rol === "superadmin";

  const turnosFiltrados = turnos.filter((t) =>
    (user.rol === "admin" || user.rol === "superadmin" || t.barbero === user.nombre) &&
    t.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
    (filtroFecha ? t.fecha === filtroFecha : true)
  ).sort(compararTurnosPorHorario);

  function iniciarEdicionFila(turno) {
    setEditando({
      id: turno.id,
      valores: {
        nombre: turno.nombre || "",
        telefono: turno.telefono || "",
        servicio: turno.servicio || "",
        barbero: turno.barbero || "",
        fecha: turno.fecha || "",
        hora: normHora(turno.hora),
        estado: turno.estado || "pendiente",
      },
    });
  }

  function actualizarEdicion(campo, valor) {
    setEditando((actual) => ({
      ...actual,
      valores: { ...actual.valores, [campo]: valor },
    }));
  }

  async function guardarEdicionFila() {
    const { id, valores } = editando;
    if (!id || !valores) return;
    const turno = turnos.find((t) => t.id === id);
    const horaNormalizada = normHora(valores.hora);

    if (!valores.nombre.trim() || !valores.fecha || !horaNormalizada) {
      mostrarToast("Completa nombre, fecha y hora", "error");
      return;
    }

    if (!esMediaHora(horaNormalizada)) {
      mostrarToast("Elegí una hora en punto o y media", "error");
      return;
    }

    const ocupado = turnos.some((t) =>
      t.id !== id &&
      t.fecha === valores.fecha &&
      t.barbero === valores.barbero &&
      normHora(t.hora) === horaNormalizada
    );
    if (ocupado) {
      mostrarToast("Ese horario ya esta ocupado", "error");
      return;
    }

    const servicioSeleccionado = servicios.find((s) => s.nombre === valores.servicio);
    const cambioAgenda = turno && (
      turno.fecha !== valores.fecha ||
      turno.barbero !== valores.barbero ||
      normHora(turno.hora) !== horaNormalizada
    );

    const cambios = {
      nombre: valores.nombre.trim(),
      telefono: valores.telefono.trim(),
      servicio: valores.servicio,
      precio: servicioSeleccionado ? servicioSeleccionado.precio : turno?.precio || 0,
      barbero: valores.barbero,
      fecha: valores.fecha,
      hora: horaNormalizada,
      estado: valores.estado,
      ...(cambioAgenda ? { recordatorio_24h: false, recordatorio_3h: false } : {}),
    };

    const { error } = await supabase.from("turnos").update(cambios).eq("id", id);
    if (error) {
      mostrarToast("No se pudo guardar el turno", "error");
      return;
    }

    mostrarToast("Turno actualizado");
    setEditando({ id: null, valores: null });
    traerTurnos();
  }

  async function eliminarTurno(turno) {
    if (!window.confirm(`Eliminar el turno de ${turno.nombre}?`)) return;
    await supabase.from("turnos").delete().eq("id", turno.id);
    traerTurnos();
  }

  const pendientes  = turnos.filter(t => t.estado === "pendiente").length;
  const confirmados = turnos.filter(t => t.estado === "confirmado").length;
  const completados = turnos.filter(t => t.estado === "completado").length;


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      {/* TOPBAR */}
      <div className="topbar" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            Turnos
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            {new Date().toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="estado pendiente" style={{ cursor: "default" }}>{pendientes} pendientes</span>
          <span className="estado confirmado" style={{ cursor: "default" }}>{confirmados} confirmados</span>
          <span className="estado completado" style={{ cursor: "default" }}>{completados} completados</span>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="page-content" style={{ flex: 1 }}>

        {/* CREAR TURNO */}
        {(user.rol === "admin" || user.rol === "superadmin") && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
              <Plus size={14} color="#475569" />
              <h2 style={{ margin: 0 }}>Crear turno</h2>
            </div>
            <div className="form-grid">
              <input
                placeholder="Nombre del cliente"
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
              <input
                placeholder="Teléfono"
                value={nuevo.telefono}
                onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              />
              <select
                value={nuevo.servicio}
                onChange={(e) => {
                  const seleccionado = servicios.find(s => s.nombre === e.target.value);
                  setNuevo({ ...nuevo, servicio: e.target.value, precio: seleccionado ? seleccionado.precio : 0 });
                }}
              >
                <option value="">Seleccionar servicio</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.nombre}>
                    {s.nombre} - ${s.precio.toLocaleString("es-AR")}
                  </option>
                ))}
              </select>
              <select value={nuevo.barbero} onChange={(e) => handleBarberoChange(e.target.value)}>
                <option value="">Seleccionar barbero</option>
                {barberos.map((b) => (
                  <option key={b.id} value={b.nombre}>{b.nombre}</option>
                ))}
              </select>
              <input
                type="date"
                value={nuevo.fecha}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
              />
              {nuevo.barbero ? (
                <select value={nuevo.hora} onChange={(e) => setNuevo({ ...nuevo, hora: e.target.value })}>
                  <option value="">Seleccionar hora</option>
                  {horariosDisponibles.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="time"
                  step="1800"
                  value={nuevo.hora}
                  onChange={(e) => setNuevo({ ...nuevo, hora: e.target.value })}
                />
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <button
                  style={{ width: "100%" }}
                  onClick={async () => {
                    if (!nuevo.fecha || !nuevo.hora) {
                      mostrarToast("Completa fecha y hora", "error");
                      return;
                    }
                    if (!esMediaHora(nuevo.hora)) {
                      mostrarToast("Elegí una hora en punto o y media", "error");
                      return;
                    }
                    const disponible = nuevo.barbero
                      ? await turnoDisponible(nuevo.fecha, nuevo.hora, nuevo.barbero)
                      : true;
                    if (!disponible) {
                      mostrarToast("Ese horario ya esta ocupado", "error");
                      return;
                    }
                    try {
                      const token = await getAuthToken();
                      const res = await fetch(`${API}/admin/crear-turno`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ ...nuevo }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        mostrarToast("Turno creado correctamente");
                        traerTurnos();
                        setNuevo({ nombre: "", telefono: "", servicio: "", precio: 0, barbero: "", fecha: "", hora: "" });
                      } else {
                        mostrarToast(data.error || "Error al crear turno", "error");
                      }
                    } catch {
                      mostrarToast("Error de conexión", "error");
                    }
                  }}
                >
                  Crear turno
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BUSCAR / TABLA */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Search size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Buscar turnos</h2>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              placeholder="Buscar por cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
            />
            {filtroFecha && (
              <button
                onClick={() => setFiltroFecha("")}
                style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0", padding: "8px 12px" }}
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="turnos-mobile-list">
            {turnosFiltrados.length === 0 ? (
              <div className="turno-mobile-empty">No hay turnos para mostrar</div>
            ) : turnosFiltrados.map((t) => {
              const enEdicion = editando.id === t.id;
              const valores = enEdicion ? editando.valores : null;
              const pagoInfo = pagosPorTurno[t.id];
              const pagoAbierto = turnoPagosAbierto === t.id;
              const precioActual = enEdicion
                ? (servicios.find((s) => s.nombre === valores.servicio)?.precio ?? t.precio)
                : (pagoInfo?.total_cobrable ?? t.precio);

              return (
                <div className="turno-mobile-card" key={t.id}>
                  {enEdicion ? (
                    <div className="turno-mobile-edit">
                      <input
                        autoFocus
                        value={valores.nombre}
                        onChange={(e) => actualizarEdicion("nombre", e.target.value)}
                        placeholder="Cliente"
                      />
                      <input
                        value={valores.telefono}
                        onChange={(e) => actualizarEdicion("telefono", e.target.value)}
                        placeholder="Telefono"
                      />
                      <select value={valores.servicio} onChange={(e) => actualizarEdicion("servicio", e.target.value)}>
                        <option value="">Sin servicio</option>
                        {servicios.map((s) => (
                          <option key={s.id} value={s.nombre}>
                            {s.nombre} - ${s.precio.toLocaleString("es-AR")}
                          </option>
                        ))}
                      </select>
                      <select value={valores.barbero} onChange={(e) => actualizarEdicion("barbero", e.target.value)}>
                        <option value="">Sin asignar</option>
                        {barberos.map((b) => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
                      </select>
                      <div className="turno-mobile-edit-row">
                        <input type="date" value={valores.fecha} onChange={(e) => actualizarEdicion("fecha", e.target.value)} />
                        <input type="time" step="1800" value={valores.hora} onChange={(e) => actualizarEdicion("hora", e.target.value)} />
                      </div>
                      <select value={valores.estado} onChange={(e) => actualizarEdicion("estado", e.target.value)}>
                        <option value="pendiente">pendiente</option>
                        <option value="confirmado">confirmado</option>
                        <option value="completado">completado</option>
                        <option value="cancelado">cancelado</option>
                      </select>
                      <div className="turno-mobile-actions">
                        <button onClick={guardarEdicionFila} aria-label="Guardar turno">
                          <Check size={14} /> Guardar
                        </button>
                        <button onClick={() => setEditando({ id: null, valores: null })} className="btn-delete" aria-label="Cancelar edicion">
                          <X size={14} /> Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="turno-mobile-head">
                        <div>
                          <strong>{t.nombre}</strong>
                          <span>{t.servicio || "Sin servicio"} - {t.barbero || "Sin asignar"}</span>
                        </div>
                        <span
                          className={`estado ${t.estado || "pendiente"}`}
                          onClick={() => {
                            const orden = ["pendiente", "confirmado", "completado"];
                            const index = orden.indexOf(t.estado || "pendiente");
                            cambiarEstado(t.id, orden[(index + 1) % orden.length]);
                          }}
                        >
                          {t.estado || "pendiente"}
                        </span>
                      </div>

                      <div className="turno-mobile-meta">
                        <span>{t.fecha}</span>
                        <span>{normHora(t.hora)}</span>
                        <span>{t.telefono || "Sin telefono"}</span>
                      </div>

                      {puedeAdministrarTurnos && (
                        <div className="turno-mobile-billing">
                          <div>
                            <small>Total</small>
                            <strong>{money(precioActual)}</strong>
                            {pagoInfo?.total_productos > 0 && <span>Incluye productos</span>}
                          </div>
                          <div>
                            <small>Pago</small>
                            <PagoBadge estado={pagoInfo?.estado_pago} />
                            {pagoInfo && <span>{money(pagoInfo.total_pagado)} / saldo {money(pagoInfo.saldo)}</span>}
                          </div>
                        </div>
                      )}

                      {puedeAdministrarTurnos && (
                        <div className="turno-mobile-actions">
                          <button
                            onClick={() => setTurnoPagosAbierto(pagoAbierto ? null : t.id)}
                            aria-label="Ver pagos del turno"
                          >
                            <WalletCards size={14} /> Pagos
                          </button>
                          <button onClick={() => iniciarEdicionFila(t)} aria-label="Editar turno">
                            <Pencil size={14} /> Editar
                          </button>
                          <button onClick={() => eliminarTurno(t)} className="btn-delete" aria-label="Eliminar turno">
                            <X size={14} /> Eliminar
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {puedeAdministrarTurnos && pagoAbierto && (
                    <PagosPanel
                      turno={t}
                      onChanged={() => {
                        cargarEstadosPago(turnos);
                        traerTurnos();
                      }}
                      onToast={mostrarToast}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="table-container turnos-table">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th className="col-mobile-hide">Teléfono</th>
                  <th>Servicio</th>
                  <th>Barbero</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Estado</th>
                  {puedeAdministrarTurnos && <th>Precio</th>}
                  {puedeAdministrarTurnos && <th>Pago</th>}
                  {puedeAdministrarTurnos && <th></th>}
                </tr>
              </thead>
              <tbody>
                {turnosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={puedeAdministrarTurnos ? 10 : 7} style={{ textAlign: "center", color: "#94A3B8", padding: "32px 0", fontStyle: "italic" }}>
                      No hay turnos para mostrar
                    </td>
                  </tr>
                )}
                {turnosFiltrados.map((t) => {
                  const enEdicion = editando.id === t.id;
                  const valores = enEdicion ? editando.valores : null;
                  const inputStyle = { width: "100%", minWidth: 0, maxWidth: "100%", padding: "6px 7px", fontSize: 13, margin: 0 };
                  const pagoInfo = pagosPorTurno[t.id];
                  const pagoAbierto = turnoPagosAbierto === t.id;

                  return (
                    <Fragment key={t.id}>
                    <tr className={`group${enEdicion ? " turno-row-editing" : ""}`}>
                      <td>
                        {enEdicion ? (
                          <input
                            autoFocus
                            value={valores.nombre}
                            onChange={(e) => actualizarEdicion("nombre", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarEdicionFila();
                              if (e.key === "Escape") setEditando({ id: null, valores: null });
                            }}
                            style={inputStyle}
                          />
                        ) : t.nombre}
                      </td>
                      <td className="col-mobile-hide" style={{ color: "#475569" }}>
                        {enEdicion ? (
                          <input
                            value={valores.telefono}
                            onChange={(e) => actualizarEdicion("telefono", e.target.value)}
                            style={inputStyle}
                          />
                        ) : (t.telefono || <span style={{ color: "#94A3B8" }}>Sin teléfono</span>)}
                      </td>
                      <td>
                        {enEdicion ? (
                          <select
                            value={valores.servicio}
                            onChange={(e) => actualizarEdicion("servicio", e.target.value)}
                            style={inputStyle}
                          >
                            <option value="">Sin servicio</option>
                            {servicios.map((s) => (
                              <option key={s.id} value={s.nombre}>
                                {s.nombre} - ${s.precio.toLocaleString("es-AR")}
                              </option>
                            ))}
                          </select>
                        ) : t.servicio}
                      </td>
                      <td>
                        {enEdicion ? (
                          <select
                            value={valores.barbero}
                            onChange={(e) => actualizarEdicion("barbero", e.target.value)}
                            style={inputStyle}
                          >
                            <option value="">Sin asignar</option>
                            {barberos.map((b) => (
                              <option key={b.id} value={b.nombre}>{b.nombre}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: t.barbero ? "#475569" : "#94A3B8" }}>
                            {t.barbero || "Sin asignar"}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "#475569", whiteSpace: "nowrap" }}>
                        {enEdicion ? (
                          <input
                            type="date"
                            value={valores.fecha}
                            onChange={(e) => actualizarEdicion("fecha", e.target.value)}
                            style={inputStyle}
                          />
                        ) : t.fecha}
                      </td>
                      <td style={{ color: "#475569" }}>
                        {enEdicion ? (
                          <input
                            type="time"
                            step="1800"
                            value={valores.hora}
                            onChange={(e) => actualizarEdicion("hora", e.target.value)}
                            style={inputStyle}
                          />
                        ) : normHora(t.hora)}
                      </td>
                      <td>
                        {enEdicion ? (
                          <select
                            value={valores.estado}
                            onChange={(e) => actualizarEdicion("estado", e.target.value)}
                            style={inputStyle}
                          >
                            <option value="pendiente">pendiente</option>
                            <option value="confirmado">confirmado</option>
                            <option value="completado">completado</option>
                            <option value="cancelado">cancelado</option>
                          </select>
                        ) : (
                          <span
                            className={`estado ${t.estado || "pendiente"}`}
                            onClick={() => {
                              const orden = ["pendiente", "confirmado", "completado"];
                              const index = orden.indexOf(t.estado || "pendiente");
                              cambiarEstado(t.id, orden[(index + 1) % orden.length]);
                            }}
                          >
                            {t.estado || "pendiente"}
                          </span>
                        )}
                      </td>
                      {puedeAdministrarTurnos && (
                        <td className={enEdicion ? "turno-edit-hide" : ""} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                          {money(enEdicion ? (servicios.find((s) => s.nombre === valores.servicio)?.precio ?? t.precio) : (pagoInfo?.total_cobrable ?? t.precio))}
                          {pagoInfo?.total_productos > 0 && (
                            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>
                              Incluye productos
                            </div>
                          )}
                        </td>
                      )}
                      {puedeAdministrarTurnos && (
                        <td className={enEdicion ? "turno-edit-hide" : ""}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <PagoBadge estado={pagoInfo?.estado_pago} />
                            {pagoInfo && (
                              <span style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>
                                {money(pagoInfo.total_pagado)} / saldo {money(pagoInfo.saldo)}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {puedeAdministrarTurnos && (
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {enEdicion ? (
                              <>
                                <button
                                  onClick={guardarEdicionFila}
                                  style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                                  aria-label="Guardar turno"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  onClick={() => setEditando({ id: null, valores: null })}
                                  className="btn-delete"
                                  style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                                  aria-label="Cancelar edición"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setTurnoPagosAbierto(pagoAbierto ? null : t.id)}
                                  style={{ padding: "5px 8px", display: "flex", alignItems: "center", background: pagoAbierto ? "#1D4ED8" : "#2563EB" }}
                                  aria-label="Ver pagos del turno"
                                  title="Ver pagos"
                                >
                                  <WalletCards size={13} />
                                </button>
                                <button
                                  onClick={() => iniciarEdicionFila(t)}
                                  style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                                  aria-label="Editar turno"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`¿Eliminar el turno de ${t.nombre}?`)) return;
                                    await supabase.from("turnos").delete().eq("id", t.id);
                                    traerTurnos();
                                  }}
                                  className="btn-delete"
                                  style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                                  aria-label="Eliminar turno"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {puedeAdministrarTurnos && pagoAbierto && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: "#F8FAFC" }}>
                          <PagosPanel
                            turno={t}
                            onChanged={() => {
                              cargarEstadosPago(turnos);
                              traerTurnos();
                            }}
                            onToast={mostrarToast}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

