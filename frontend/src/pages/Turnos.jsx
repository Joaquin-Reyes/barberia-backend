import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Search, Pencil, X } from "lucide-react";
import { supabase, turnoDisponible, getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

export default function Turnos({ user }) {
  const barberiaId = user?.barberia_id;
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

  const traerTurnos = useCallback(async () => {
    const { data } = await supabase
      .from("turnos").select("*")
      .eq("barberia_id", barberiaId)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });
    setTurnos(data || []);
  }, [barberiaId]);

  const traerBarberos = useCallback(async () => {
    const { data } = await supabase
      .from("barberos").select("*")
      .eq("barberia_id", barberiaId);
    setBarberos(data || []);
  }, [barberiaId]);

  const traerServicios = useCallback(async () => {
    const { data } = await supabase
      .from("servicios").select("*")
      .eq("barberia_id", barberiaId);
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

          <div className="table-container">
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
                  {(user.rol === "admin" || user.rol === "superadmin") && <th></th>}
                </tr>
              </thead>
              <tbody>
                {turnosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#94A3B8", padding: "32px 0", fontStyle: "italic" }}>
                      No hay turnos para mostrar
                    </td>
                  </tr>
                )}
                {turnosFiltrados.map((t) => {
                  const enEdicion = editando.id === t.id;
                  const valores = enEdicion ? editando.valores : null;
                  const inputStyle = { width: "100%", minWidth: 110, padding: "6px 8px", fontSize: 14 };

                  return (
                    <tr key={t.id} className="group">
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
                            style={{ ...inputStyle, minWidth: 96 }}
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

