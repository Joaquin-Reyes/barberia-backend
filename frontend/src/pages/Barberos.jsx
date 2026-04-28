import { useEffect, useState } from "react";
import { Plus, X, Calendar, AlertCircle, Check, Users, Mail } from "lucide-react";
import { supabase, getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

const DIAS_SEMANA = [
  { dia: 1, nombre: "Lunes"     },
  { dia: 2, nombre: "Martes"    },
  { dia: 3, nombre: "Miércoles" },
  { dia: 4, nombre: "Jueves"    },
  { dia: 5, nombre: "Viernes"   },
  { dia: 6, nombre: "Sábado"    },
  { dia: 0, nombre: "Domingo"   },
];

const horarioDefault = () => {
  const h = {};
  DIAS_SEMANA.forEach(({ dia }) => {
    h[dia] = { trabaja: false, hora_inicio: "09:00", hora_fin: "19:00" };
  });
  return h;
};

export default function Barberos({ user }) {
  const [barberos, setBarberos] = useState([]);
  const [nuevo, setNuevo] = useState({ nombre: "", telefono: "", email: "" });
  const [toast, setToast] = useState(null);

  const [barberoSeleccionado, setBarberoSeleccionado] = useState(null);
  const [modalReenvio, setModalReenvio] = useState(null); // { id, nombre } | null
  const [emailReenvio, setEmailReenvio] = useState("");
  const [enviandoInvitacion, setEnviandoInvitacion] = useState(false);
  const [horarioSemanal, setHorarioSemanal] = useState(horarioDefault());
  const [guardandoHorario, setGuardandoHorario] = useState(false);

  const [excepciones, setExcepciones] = useState([]);
  const [nuevaExcepcion, setNuevaExcepcion] = useState({
    fecha: "", trabaja: false, hora_inicio: "", hora_fin: "", motivo: ""
  });

  useEffect(() => {
    if (!user) return;
    traerBarberos();
  }, [user]);

  async function traerBarberos() {
    const { data } = await supabase
      .from("barberos").select("*")
      .eq("barberia_id", user.barberia_id);
    setBarberos(data || []);
  }

  async function seleccionarBarbero(barbero) {
    if (barberoSeleccionado?.id === barbero.id) {
      setBarberoSeleccionado(null);
      return;
    }
    setBarberoSeleccionado(barbero);
    await Promise.all([cargarHorario(barbero.id), cargarExcepciones(barbero.id)]);
  }

  // ── HORARIO SEMANAL ──

  async function cargarHorario(barberoId) {
    const { data } = await supabase
      .from("horarios_barbero").select("*")
      .eq("barbero_id", barberoId);

    const base = horarioDefault();
    (data || []).forEach(h => {
      base[h.dia_semana] = {
        trabaja: true,
        hora_inicio: String(h.hora_inicio).slice(0, 5),
        hora_fin:    String(h.hora_fin).slice(0, 5),
      };
    });
    setHorarioSemanal(base);
  }

  async function guardarHorario() {
    if (!barberoSeleccionado) return;
    setGuardandoHorario(true);
    try {
      await supabase.from("horarios_barbero").delete().eq("barbero_id", barberoSeleccionado.id);
      const filas = DIAS_SEMANA
        .filter(({ dia }) => horarioSemanal[dia]?.trabaja)
        .map(({ dia }) => ({
          barbero_id:  barberoSeleccionado.id,
          barberia_id: user.barberia_id,
          dia_semana:  dia,
          hora_inicio: horarioSemanal[dia].hora_inicio,
          hora_fin:    horarioSemanal[dia].hora_fin,
        }));
      if (filas.length > 0) {
        const { error } = await supabase.from("horarios_barbero").insert(filas);
        if (error) throw error;
      }
      mostrarToast("Horario guardado correctamente");
    } catch (err) {
      console.error(err);
      mostrarToast("Error al guardar horario", "error");
    } finally {
      setGuardandoHorario(false);
    }
  }

  function toggleDia(dia) {
    setHorarioSemanal(prev => ({ ...prev, [dia]: { ...prev[dia], trabaja: !prev[dia].trabaja } }));
  }

  function actualizarHoraDia(dia, campo, valor) {
    setHorarioSemanal(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor } }));
  }

  // ── EXCEPCIONES ──

  async function cargarExcepciones(barberoId) {
    const { data } = await supabase
      .from("excepciones_barbero").select("*")
      .eq("barbero_id", barberoId)
      .order("fecha", { ascending: true });
    setExcepciones(data || []);
  }

  async function agregarExcepcion() {
    if (!nuevaExcepcion.fecha) { mostrarToast("Elegí una fecha", "error"); return; }

    const fila = {
      barbero_id:  barberoSeleccionado.id,
      barberia_id: user.barberia_id,
      fecha:       nuevaExcepcion.fecha,
      trabaja:     nuevaExcepcion.trabaja,
      hora_inicio: nuevaExcepcion.trabaja && nuevaExcepcion.hora_inicio ? nuevaExcepcion.hora_inicio : null,
      hora_fin:    nuevaExcepcion.trabaja && nuevaExcepcion.hora_fin    ? nuevaExcepcion.hora_fin    : null,
      motivo:      nuevaExcepcion.motivo || null,
    };

    const { error } = await supabase
      .from("excepciones_barbero").upsert(fila, { onConflict: "barbero_id,fecha" });

    if (error) { mostrarToast("Error al guardar excepción", "error"); return; }

    setNuevaExcepcion({ fecha: "", trabaja: false, hora_inicio: "", hora_fin: "", motivo: "" });
    await cargarExcepciones(barberoSeleccionado.id);
    mostrarToast("Excepción guardada");
  }

  async function eliminarExcepcion(id) {
    await supabase.from("excepciones_barbero").delete().eq("id", id);
    await cargarExcepciones(barberoSeleccionado.id);
    mostrarToast("Excepción eliminada");
  }

  async function reenviarInvitacion() {
    if (!emailReenvio) { mostrarToast("Ingresá un email", "error"); return; }
    setEnviandoInvitacion(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API}/admin/barberos/${modalReenvio.id}/reenviar-invitacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: emailReenvio }),
      });
      if (res.ok) {
        mostrarToast("Invitación reenviada correctamente");
        setModalReenvio(null);
        setEmailReenvio("");
      } else {
        const data = await res.json();
        mostrarToast(data.error || "Error al reenviar invitación", "error");
      }
    } catch {
      mostrarToast("Error de conexión", "error");
    } finally {
      setEnviandoInvitacion(false);
    }
  }

  const mostrarToast = (mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const esAdmin = user.rol === "admin" || user.rol === "superadmin";

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

      {/* ─── MODAL REENVIAR INVITACIÓN ─── */}
      {modalReenvio && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 16,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 360, margin: 0 }}>
            <h2 style={{ marginBottom: 4 }}>Reenviar acceso</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px" }}>
              {modalReenvio.nombre} — ingresá el email para reenviar la invitación.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
              Email
            </label>
            <input
              type="email"
              placeholder="email@ejemplo.com"
              value={emailReenvio}
              onChange={e => setEmailReenvio(e.target.value)}
              onKeyDown={e => e.key === "Enter" && reenviarInvitacion()}
              style={{ width: "100%", marginBottom: 20, boxSizing: "border-box" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={reenviarInvitacion}
                disabled={enviandoInvitacion}
                style={{ flex: 1, background: "#2563EB", padding: "11px 0" }}
              >
                {enviandoInvitacion ? "Enviando..." : "Enviar invitación"}
              </button>
              <button
                onClick={() => { setModalReenvio(null); setEmailReenvio(""); }}
                disabled={enviandoInvitacion}
                style={{ flex: 1, background: "#6b7280", padding: "11px 0" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOPBAR ─── */}
      <div style={topbarStyle}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            Barberos
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            {barberos.length} barbero{barberos.length !== 1 ? "s" : ""} registrado{barberos.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div style={{ padding: "24px", overflowY: "auto" }}>

        {/* ─── AGREGAR BARBERO ─── */}
        {esAdmin && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
              <Plus size={14} color="#475569" />
              <h2 style={{ margin: 0 }}>Agregar barbero</h2>
            </div>
            <div className="form-grid">
              <input
                placeholder="Nombre"
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
              <input
                placeholder="Teléfono (ej: 1123456789)"
                value={nuevo.telefono}
                onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              />
              <input
                placeholder="Email (para invitación de acceso)"
                type="email"
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              />
              <button
                style={{ background: "#16A34A" }}
                onClick={async () => {
                  if (!nuevo.nombre || !nuevo.telefono || !nuevo.email) {
                    mostrarToast("Completá nombre, teléfono y email", "error");
                    return;
                  }
                  try {
                    const token = await getAuthToken();
                    const res = await fetch(`${API}/admin/barberos`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify(nuevo),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      if (data.invite_warning) {
                        mostrarToast("Barbero creado, pero no se pudo enviar el email", "error");
                      } else {
                        mostrarToast("Barbero agregado — se envió invitación por email");
                      }
                      setNuevo({ nombre: "", telefono: "", email: "" });
                      traerBarberos();
                    } else {
                      mostrarToast("Error al crear barbero", "error");
                    }
                  } catch {
                    mostrarToast("Error de conexión", "error");
                  }
                }}
              >
                Agregar
              </button>
            </div>
          </div>
        )}

        {/* ─── LISTA DE BARBEROS ─── */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Users size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Lista de barberos</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Horario</th>
                  {esAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {barberos.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "#94A3B8", padding: "32px 0", fontStyle: "italic" }}>
                      No hay barberos registrados
                    </td>
                  </tr>
                )}
                {barberos.map((b) => {
                  const isSelected = barberoSeleccionado?.id === b.id;
                  return (
                    <tr
                      key={b.id}
                      style={{ background: isSelected ? "#EFF6FF" : undefined, cursor: "pointer" }}
                      onClick={() => seleccionarBarbero(b)}
                    >
                      <td>
                        <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? "#1D4ED8" : undefined }}>
                          {b.nombre}
                        </span>
                        {isSelected && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#2563EB",
                            background: "#DBEAFE",
                            border: "1px solid #BFDBFE",
                            padding: "1px 6px",
                            borderRadius: 999,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}>
                            editando
                          </span>
                        )}
                      </td>
                      <td style={{ color: "#475569" }}>{b.telefono}</td>
                      <td style={{ fontSize: 12, color: "#94A3B8" }}>
                        {isSelected ? "Expandido abajo" : "Clic para configurar"}
                      </td>
                      {esAdmin && (
                        <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => { setModalReenvio({ id: b.id, nombre: b.nombre }); setEmailReenvio(""); }}
                              title="Reenviar acceso"
                              style={{ padding: "5px 8px", display: "flex", alignItems: "center", background: "#1e40af", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                            >
                              <Mail size={13} />
                            </button>
                            <button
                              onClick={async () => {
                                if (barberoSeleccionado?.id === b.id) setBarberoSeleccionado(null);
                                await supabase.from("barberos").delete().eq("id", b.id);
                                traerBarberos();
                                mostrarToast("Barbero eliminado");
                              }}
                              className="btn-delete"
                              style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                            >
                              <X size={13} />
                            </button>
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

        {/* ─── PANEL DE CONFIGURACIÓN DEL BARBERO ─── */}
        {barberoSeleccionado && esAdmin && (
          <>
            {/* HORARIO SEMANAL */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <Calendar size={14} color="#475569" />
                <h2 style={{ margin: 0 }}>Horario semanal — {barberoSeleccionado.nombre}</h2>
              </div>
              <p style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16, marginTop: 0 }}>
                Marcá los días que trabaja y configurá la hora de entrada y salida.
              </p>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Trabaja</th>
                      <th>Día</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIAS_SEMANA.map(({ dia, nombre }) => (
                      <tr key={dia} style={{ opacity: horarioSemanal[dia]?.trabaja ? 1 : 0.4 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={horarioSemanal[dia]?.trabaja || false}
                            onChange={() => toggleDia(dia)}
                            style={{ cursor: "pointer", width: "auto", margin: 0 }}
                          />
                        </td>
                        <td style={{ fontWeight: 500 }}>{nombre}</td>
                        <td>
                          <input
                            type="time"
                            value={horarioSemanal[dia]?.hora_inicio || "09:00"}
                            disabled={!horarioSemanal[dia]?.trabaja}
                            onChange={(e) => actualizarHoraDia(dia, "hora_inicio", e.target.value)}
                            style={{ width: 110, margin: 0 }}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            value={horarioSemanal[dia]?.hora_fin || "19:00"}
                            disabled={!horarioSemanal[dia]?.trabaja}
                            onChange={(e) => actualizarHoraDia(dia, "hora_fin", e.target.value)}
                            style={{ width: 110, margin: 0 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  style={{
                    background: "#16A34A",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: guardandoHorario ? 0.7 : 1,
                  }}
                  onClick={guardarHorario}
                  disabled={guardandoHorario}
                >
                  <Check size={14} />
                  {guardandoHorario ? "Guardando..." : "Guardar horario"}
                </button>
              </div>
            </div>

            {/* EXCEPCIONES */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <AlertCircle size={14} color="#475569" />
                <h2 style={{ margin: 0 }}>Excepciones — {barberoSeleccionado.nombre}</h2>
              </div>
              <p style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16, marginTop: 0 }}>
                Fechas con horario especial o días no laborables (feriados, vacaciones, etc.)
              </p>

              {/* FORM NUEVA EXCEPCIÓN */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr auto",
                gap: 8,
                alignItems: "end",
                marginBottom: 20,
                padding: "16px",
                background: "#F8FAFC",
                borderRadius: 8,
                border: "1px solid #E2E8F0",
              }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={nuevaExcepcion.fecha}
                    onChange={(e) => setNuevaExcepcion({ ...nuevaExcepcion, fecha: e.target.value })}
                    style={{ width: "100%", margin: 0 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Motivo
                  </label>
                  <input
                    placeholder="ej: feriado, vacaciones"
                    value={nuevaExcepcion.motivo}
                    onChange={(e) => setNuevaExcepcion({ ...nuevaExcepcion, motivo: e.target.value })}
                    style={{ width: "100%", margin: 0 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 6, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <input
                      type="checkbox"
                      checked={nuevaExcepcion.trabaja}
                      onChange={(e) => setNuevaExcepcion({ ...nuevaExcepcion, trabaja: e.target.checked })}
                      style={{ cursor: "pointer", width: "auto", margin: 0 }}
                    />
                    Trabaja (horario especial)
                  </label>
                  {nuevaExcepcion.trabaja && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        type="time"
                        value={nuevaExcepcion.hora_inicio}
                        onChange={(e) => setNuevaExcepcion({ ...nuevaExcepcion, hora_inicio: e.target.value })}
                        style={{ flex: 1, margin: 0 }}
                      />
                      <input
                        type="time"
                        value={nuevaExcepcion.hora_fin}
                        onChange={(e) => setNuevaExcepcion({ ...nuevaExcepcion, hora_fin: e.target.value })}
                        style={{ flex: 1, margin: 0 }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <button
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                    onClick={agregarExcepcion}
                  >
                    <Plus size={13} />
                    Agregar
                  </button>
                </div>
              </div>

              {/* LISTA DE EXCEPCIONES */}
              {excepciones.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94A3B8", margin: 0, fontStyle: "italic" }}>
                  Sin excepciones cargadas.
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th>Horario especial</th>
                        <th>Motivo</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {excepciones.map((ex) => (
                        <tr key={ex.id}>
                          <td style={{ fontWeight: 500 }}>{ex.fecha}</td>
                          <td>
                            {ex.trabaja
                              ? <span className="estado completado" style={{ cursor: "default" }}>Trabaja</span>
                              : <span className="estado cancelado"  style={{ cursor: "default" }}>No trabaja</span>
                            }
                          </td>
                          <td style={{ color: "#475569" }}>
                            {ex.trabaja && ex.hora_inicio
                              ? `${String(ex.hora_inicio).slice(0, 5)} – ${String(ex.hora_fin).slice(0, 5)}`
                              : "—"
                            }
                          </td>
                          <td style={{ color: "#94A3B8" }}>{ex.motivo || "—"}</td>
                          <td>
                            <button
                              className="btn-delete"
                              style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                              onClick={() => eliminarExcepcion(ex.id)}
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
