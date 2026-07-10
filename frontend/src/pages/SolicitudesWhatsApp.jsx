import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Check, ClipboardList, RefreshCw, Search, X } from "lucide-react";
import { getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

const estados = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  resuelta: "Resuelta",
  descartada: "Descartada",
};

function formatoFecha(valor) {
  if (!valor) return "";
  return new Date(valor).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function camposFaltantes(solicitud) {
  const campos = [
    ["nombre", "cliente"],
    ["telefono", "telefono"],
    ["servicio", "servicio"],
    ["profesional", "profesional"],
    ["fecha_preferida", "fecha"],
    ["hora_preferida", "hora"],
  ];

  return campos
    .filter(([campo]) => !String(solicitud[campo] || "").trim())
    .map(([, etiqueta]) => etiqueta);
}

function puedeAgendar(solicitud) {
  return camposFaltantes(solicitud).length === 0 && !solicitud.turno_id;
}

export default function SolicitudesWhatsApp({ user }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [estado, setEstado] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardandoTurnoId, setGuardandoTurnoId] = useState(null);
  const [toast, setToast] = useState(null);

  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const cargarSolicitudes = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API}/admin/solicitudes-whatsapp?estado=${estado}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las solicitudes");
      setSolicitudes(data || []);
    } catch (error) {
      mostrarToast(error.message || "Error cargando solicitudes", "error");
    } finally {
      setCargando(false);
    }
  }, [estado, mostrarToast, user]);

  useEffect(() => {
    cargarSolicitudes();
  }, [cargarSolicitudes]);

  async function actualizarEstado(id, nuevoEstado) {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API}/admin/solicitudes-whatsapp/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar");
      mostrarToast("Solicitud actualizada");
      cargarSolicitudes();
    } catch (error) {
      mostrarToast(error.message || "No se pudo actualizar", "error");
    }
  }

  async function guardarTurno(solicitud) {
    setGuardandoTurnoId(solicitud.id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API}/admin/solicitudes-whatsapp/${solicitud.id}/crear-turno`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el turno");
      mostrarToast(data.warning || "Turno agendado y guardado correctamente");
      cargarSolicitudes();
    } catch (error) {
      mostrarToast(error.message || "No se pudo guardar el turno", "error");
    } finally {
      setGuardandoTurnoId(null);
    }
  }

  const filtradas = solicitudes.filter((solicitud) => {
    const texto = [
      solicitud.nombre,
      solicitud.telefono,
      solicitud.servicio,
      solicitud.profesional,
      solicitud.fecha_preferida,
      solicitud.hora_preferida,
    ].join(" ").toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      <div className="topbar" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#0F172A" }}>
            Solicitudes WhatsApp
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            Bandeja previa a la confirmación de turnos
          </p>
        </div>
        <button
          onClick={cargarSolicitudes}
          disabled={cargando}
          style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36 }}
        >
          <RefreshCw size={14} />
          {cargando ? "Actualizando" : "Actualizar"}
        </button>
      </div>

      <div className="page-content" style={{ flex: 1 }}>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Search size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Filtrar solicitudes</h2>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ minWidth: 150 }}>
              <option value="pendiente">Pendientes</option>
              <option value="en_revision">En revisión</option>
              <option value="resuelta">Resueltas</option>
              <option value="descartada">Descartadas</option>
              <option value="todas">Todas</option>
            </select>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, teléfono o servicio"
              style={{ flex: 1, minWidth: 220 }}
            />
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <ClipboardList size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Solicitudes recibidas</h2>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Preferencia</th>
                  <th>Estado</th>
                  <th>Ingreso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "#94A3B8", padding: "32px 0" }}>
                      No hay solicitudes para mostrar
                    </td>
                  </tr>
                )}

                {filtradas.map((solicitud) => {
                  const faltantes = camposFaltantes(solicitud);
                  const listaParaAgendar = puedeAgendar(solicitud);
                  const guardando = guardandoTurnoId === solicitud.id;

                  return (
                  <tr key={solicitud.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{solicitud.nombre || "Sin nombre"}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>{solicitud.telefono}</div>
                      {solicitud.turno_id && (
                        <div style={{ fontSize: 11, color: "#16A34A", marginTop: 2 }}>Turno registrado</div>
                      )}
                    </td>
                    <td>
                      <div>{solicitud.servicio || "Sin servicio"}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>
                        {solicitud.profesional || "Sin profesional asignado"}
                      </div>
                    </td>
                    <td>
                      <div>{solicitud.fecha_preferida || "Sin fecha"}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>{solicitud.hora_preferida || "Sin hora"}</div>
                      {!solicitud.turno_id && faltantes.length > 0 && (
                        <div style={{ fontSize: 11, color: "#DC2626", marginTop: 3 }}>
                          Faltan: {faltantes.join(", ")}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`estado ${solicitud.estado === "descartada" ? "cancelado" : solicitud.estado === "resuelta" ? "completado" : "pendiente"}`}>
                        {estados[solicitud.estado] || solicitud.estado}
                      </span>
                    </td>
                    <td style={{ color: "#64748B", whiteSpace: "nowrap" }}>{formatoFecha(solicitud.created_at)}</td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <button
                          onClick={() => guardarTurno(solicitud)}
                          disabled={guardando || !listaParaAgendar}
                          style={{
                            padding: "7px 10px",
                            minWidth: 132,
                            minHeight: 36,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            background: solicitud.turno_id ? "#DCFCE7" : listaParaAgendar ? "#16A34A" : "#E2E8F0",
                            color: solicitud.turno_id ? "#166534" : listaParaAgendar ? "#FFFFFF" : "#64748B",
                            border: solicitud.turno_id ? "1px solid #BBF7D0" : listaParaAgendar ? "1px solid #15803D" : "1px solid #CBD5E1",
                            opacity: guardando ? 0.75 : 1,
                            cursor: guardando || !listaParaAgendar ? "not-allowed" : "pointer",
                          }}
                          aria-label="Agendar turno"
                          title={
                            solicitud.turno_id
                              ? "Turno ya agendado"
                              : faltantes.length
                                ? `Faltan datos: ${faltantes.join(", ")}`
                                : "Agendar y guardar turno"
                          }
                        >
                          {solicitud.turno_id ? <Check size={14} /> : <CalendarCheck size={14} />}
                          {solicitud.turno_id ? "Agendado" : guardando ? "Agendando" : "Agendar turno"}
                        </button>
                        <button
                          onClick={() => actualizarEstado(solicitud.id, "en_revision")}
                          style={{ padding: "6px 9px", background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" }}
                          aria-label="Marcar en revisión"
                        >
                          <ClipboardList size={13} />
                        </button>
                        <button
                          onClick={() => actualizarEstado(solicitud.id, "descartada")}
                          className="btn-delete"
                          style={{ padding: "6px 9px" }}
                          aria-label="Descartar solicitud"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </td>
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
