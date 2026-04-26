import { useEffect, useState } from "react";
import { Plus, Search, Pencil, X } from "lucide-react";
import { supabase, turnoDisponible, getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

export default function Turnos({ user, onLogout }) {
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
  const [editando, setEditando] = useState({ id: null, campo: null, valor: "" });

  useEffect(() => {
    if (!user) return;
    traerTurnos();
    traerBarberos();
    traerServicios();
  }, [user]);

  useEffect(() => {
    if (!nuevo.barbero || !nuevo.fecha || !user) return;
    async function cargarHorarios() {
      const { data: barberoData } = await supabase
        .from("barberos")
        .select("id")
        .eq("nombre", nuevo.barbero)
        .eq("barberia_id", user.barberia_id)
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
  }, [nuevo.barbero, nuevo.fecha]);

  async function traerTurnos() {
    const { data } = await supabase
      .from("turnos").select("*")
      .eq("barberia_id", user.barberia_id)
      .order("fecha", { ascending: true });
    setTurnos(data || []);
  }

  async function traerBarberos() {
    const { data } = await supabase
      .from("barberos").select("*")
      .eq("barberia_id", user.barberia_id);
    setBarberos(data || []);
  }

  async function traerServicios() {
    const { data } = await supabase
      .from("servicios").select("*")
      .eq("barberia_id", user.barberia_id);
    setServicios(data || []);
  }

  const generarHorarios = (inicio, fin) => {
    const horas = [];
    const h1 = typeof inicio === "number" ? inicio : parseInt(inicio);
    const h2 = typeof fin === "number" ? fin : parseInt(fin);
    if (isNaN(h1) || isNaN(h2)) return horas;
    for (let h = h1; h < h2; h++) {
      horas.push(`${String(h).padStart(2, "0")}:00`);
    }
    return horas;
  };

  const handleBarberoChange = (barberoNombre) => {
    setNuevo({ ...nuevo, barbero: barberoNombre, hora: "" });
    setHorarios([]);
  };

  const normHora = (h) => String(h || "").slice(0, 5).replace(/^(\d):/, "0$1:");

  const horariosDisponibles = horarios.filter((h) =>
    !turnos.some((t) => t.fecha === nuevo.fecha && t.barbero === nuevo.barbero && normHora(t.hora) === h)
  );

  async function cambiarEstado(id, nuevoEstado) {
    try {
      await fetch(`${API}/turnos/${id}/estado`, {
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

  const turnosFiltrados = turnos.filter((t) =>
    (user.rol === "admin" || user.rol === "superadmin" || t.barbero === user.nombre) &&
    t.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
    (filtroFecha ? t.fecha === filtroFecha : true)
  );

  async function guardarEdicion() {
    const { id, campo, valor } = editando;
    if (!id || !campo) return;
    await supabase.from("turnos").update({ [campo]: valor }).eq("id", id);
    setEditando({ id: null, campo: null, valor: "" });
    traerTurnos();
  }

  const pendientes  = turnos.filter(t => t.estado === "pendiente").length;
  const confirmados = turnos.filter(t => t.estado === "confirmado").length;
  const completados = turnos.filter(t => t.estado === "completado").length;

  /* ─── Estilos compartidos ─── */
  const topbarStyle = {
    padding: "14px 24px",
    background: "#ffffff",
    borderBottom: "1px solid #E2E8F0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      {/* ─── TOPBAR ─── */}
      <div style={topbarStyle}>
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

      {/* ─── CONTENIDO ─── */}
      <div style={{ padding: "24px", flex: 1, overflowY: "auto" }}>

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
                    {s.nombre} — ${s.precio.toLocaleString("es-AR")}
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
              <select value={nuevo.hora} onChange={(e) => setNuevo({ ...nuevo, hora: e.target.value })}>
                <option value="">Seleccionar hora</option>
                {horariosDisponibles.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <div style={{ gridColumn: "1 / -1" }}>
                <button
                  style={{ width: "100%" }}
                  onClick={async () => {
                    if (!nuevo.fecha || !nuevo.hora || !nuevo.barbero || !nuevo.servicio) {
                      mostrarToast("Completá todos los campos", "error");
                      return;
                    }
                    const disponible = await turnoDisponible(nuevo.fecha, nuevo.hora, nuevo.barbero);
                    if (!disponible) {
                      mostrarToast("Ese horario ya está ocupado", "error");
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
                  <th>Teléfono</th>
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
                {turnosFiltrados.map((t) => (
                  <tr key={t.id} className="group">
                    {/* Nombre editable */}
                    <td>
                      {editando.id === t.id && editando.campo === "nombre" ? (
                        <input
                          autoFocus
                          value={editando.valor}
                          onChange={(e) => setEditando({ ...editando, valor: e.target.value })}
                          onBlur={guardarEdicion}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardarEdicion();
                            if (e.key === "Escape") setEditando({ id: null, campo: null, valor: "" });
                          }}
                          style={{ width: "100%", padding: "4px 6px", fontSize: 14 }}
                        />
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {t.nombre}
                          <span
                            className="opacity-0 group-hover:opacity-100"
                            style={{ cursor: "pointer", transition: "opacity 0.15s", color: "#94A3B8" }}
                            onClick={() => setEditando({ id: t.id, campo: "nombre", valor: t.nombre })}
                          >
                            <Pencil size={11} />
                          </span>
                        </span>
                      )}
                    </td>

                    <td style={{ color: "#475569" }}>{t.telefono}</td>

                    {/* Servicio editable */}
                    <td>
                      {editando.id === t.id && editando.campo === "servicio" ? (
                        <select
                          autoFocus
                          defaultValue=""
                          onBlur={() => setEditando({ id: null, campo: null, valor: "" })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditando({ id: null, campo: null, valor: "" });
                          }}
                          onChange={async (e) => {
                            const seleccionado = servicios.find(s => s.nombre === e.target.value);
                            if (!seleccionado) return;
                            await supabase.from("turnos").update({
                              servicio: seleccionado.nombre,
                              precio: seleccionado.precio,
                            }).eq("id", t.id);
                            setEditando({ id: null, campo: null, valor: "" });
                            traerTurnos();
                          }}
                          style={{ width: "100%", padding: "4px 6px", fontSize: 14 }}
                        >
                          <option value="" disabled>{t.servicio}</option>
                          {servicios.map((s) => (
                            <option key={s.id} value={s.nombre}>
                              {s.nombre} — ${s.precio.toLocaleString("es-AR")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {t.servicio}
                          <span
                            className="opacity-0 group-hover:opacity-100"
                            style={{ cursor: "pointer", transition: "opacity 0.15s", color: "#94A3B8" }}
                            onClick={() => setEditando({ id: t.id, campo: "servicio", valor: t.servicio })}
                          >
                            <Pencil size={11} />
                          </span>
                        </span>
                      )}
                    </td>

                    <td style={{ color: "#475569" }}>{t.barbero}</td>
                    <td style={{ color: "#475569", whiteSpace: "nowrap" }}>{t.fecha}</td>
                    <td style={{ color: "#475569" }}>{t.hora}</td>

                    {/* Badge de estado — usa CSS classes del design system */}
                    <td>
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
                    </td>

                    {(user.rol === "admin" || user.rol === "superadmin") && (
                      <td>
                        <button
                          onClick={async () => {
                            await supabase.from("turnos").delete().eq("id", t.id);
                            traerTurnos();
                          }}
                          className="btn-delete"
                          style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                        >
                          <X size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
