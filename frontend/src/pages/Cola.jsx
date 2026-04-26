import { useEffect, useState, useRef } from "react";
import { supabase, getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

function formatHora(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function Cola({ user }) {
  const [barberos, setBarberos] = useState([]);
  const [colaEspera, setColaEspera] = useState([]);
  const [toast, setToast] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Modal agregar cliente
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nombreCliente, setNombreCliente] = useState("");
  const [agregando, setAgregando] = useState(false);
  const inputRef = useRef(null);

  // ==============================
  // CARGAR DATOS
  // ==============================

  async function cargarCola() {
    const token = await getAuthToken();
    try {
      const res = await fetch(`${API}/cola/${user.barberia_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar cola");
      const data = await res.json();
      setBarberos(data.barberos || []);
      setColaEspera(data.cola_espera || []);
    } catch (err) {
      console.error(err);
      mostrarToast("Error al cargar la cola", "error");
    } finally {
      setCargando(false);
    }
  }

  // ==============================
  // REALTIME
  // ==============================

  useEffect(() => {
    if (!user?.barberia_id) return;
    cargarCola();

    const channel = supabase
      .channel(`cola_espera_${user.barberia_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cola_espera",
          filter: `barberia_id=eq.${user.barberia_id}`,
        },
        () => {
          cargarCola();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.barberia_id]);

  // Foco al abrir modal
  useEffect(() => {
    if (modalAbierto) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [modalAbierto]);

  // ==============================
  // ACCIONES
  // ==============================

  async function terminar(barbero_id) {
    const token = await getAuthToken();
    try {
      const res = await fetch(`${API}/cola/terminar/${barbero_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (data.tipo === "turno_reservado") {
        mostrarToast(`Turno reservado: ${data.nombre_cliente}`);
      } else if (data.tipo === "cola_espera") {
        mostrarToast(`Siguiente: ${data.nombre_cliente}`);
      } else {
        mostrarToast("Sin clientes en espera");
      }
    } catch {
      mostrarToast("Error al procesar", "error");
    }
  }

  async function agregarCliente() {
    if (!nombreCliente.trim()) {
      mostrarToast("Escribí un nombre", "error");
      return;
    }
    setAgregando(true);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${API}/cola/agregar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          barberia_id: user.barberia_id,
          nombre_cliente: nombreCliente.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      setNombreCliente("");
      setModalAbierto(false);
      mostrarToast("Cliente agregado a la cola");
    } catch {
      mostrarToast("Error al agregar cliente", "error");
    } finally {
      setAgregando(false);
    }
  }

  // ==============================
  // UI HELPERS
  // ==============================

  function mostrarToast(mensaje, tipo = "success") {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }

  // ==============================
  // RENDER
  // ==============================

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      {/* TOPBAR */}
      <div style={{
        padding: "16px 24px",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <h1 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>Cola de espera</h1>
          <p style={{ fontSize: "12px", color: "#9ca3af", margin: "2px 0 0" }}>
            {colaEspera.length} cliente{colaEspera.length !== 1 ? "s" : ""} esperando
          </p>
        </div>
        <button
          style={{ background: "#16a34a", padding: "8px 16px", fontSize: "13px" }}
          onClick={() => setModalAbierto(true)}
        >
          + Agregar cliente
        </button>
      </div>

      {cargando ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          Cargando...
        </div>
      ) : (
        <div style={{ padding: "24px", overflowY: "auto" }}>

          {/* BARBEROS */}
          <div className="card" style={{ marginBottom: "20px" }}>
            <h2 style={{ marginBottom: 16 }}>Barberos</h2>
            {barberos.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af" }}>No hay barberos registrados.</p>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "12px",
              }}>
                {barberos.map((b) => {
                  const atendiendo = b.cliente_actual;
                  return (
                    <div
                      key={b.id}
                      style={{
                        border: `1px solid ${atendiendo ? "#bbf7d0" : "#e5e7eb"}`,
                        borderRadius: "10px",
                        padding: "16px",
                        background: atendiendo ? "#f0fdf4" : "#fafafa",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: atendiendo ? "#16a34a" : "#d1d5db",
                          flexShrink: 0,
                        }} />
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{b.nombre}</span>
                      </div>

                      {atendiendo ? (
                        <div>
                          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 2px" }}>
                            Atendiendo
                          </p>
                          <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                            {atendiendo.nombre_cliente}
                          </p>
                          <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
                            desde {formatHora(atendiendo.hora_llegada)}
                          </p>
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Libre</p>
                      )}

                      {atendiendo && (
                        <button
                          style={{
                            background: "#1d4ed8",
                            padding: "7px 12px",
                            fontSize: "12px",
                            marginTop: "auto",
                          }}
                          onClick={() => terminar(b.id)}
                        >
                          Termine
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* EN ESPERA */}
          <div className="card">
            <h2 style={{ marginBottom: 16 }}>En espera</h2>
            {colaEspera.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af" }}>
                No hay clientes esperando.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: "center" }}>#</th>
                    <th>Nombre</th>
                    <th>Hora de llegada</th>
                  </tr>
                </thead>
                <tbody>
                  {colaEspera.map((c) => (
                    <tr key={c.id}>
                      <td style={{ textAlign: "center", fontWeight: 700, color: "#6b7280" }}>
                        {c.posicion}
                      </td>
                      <td style={{ fontWeight: 500 }}>{c.nombre_cliente}</td>
                      <td style={{ fontSize: 13, color: "#6b7280" }}>
                        {formatHora(c.hora_llegada)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL AGREGAR CLIENTE */}
      {modalAbierto && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalAbierto(false); }}
        >
          <div style={{
            background: "#fff",
            borderRadius: 12,
            padding: "28px 24px",
            width: "100%",
            maxWidth: 360,
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>
              Agregar cliente a la cola
            </h2>
            <input
              ref={inputRef}
              placeholder="Nombre del cliente"
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarCliente()}
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={{ background: "#e5e7eb", color: "#374151", padding: "8px 16px", fontSize: 13 }}
                onClick={() => { setModalAbierto(false); setNombreCliente(""); }}
              >
                Cancelar
              </button>
              <button
                style={{ background: "#16a34a", padding: "8px 16px", fontSize: 13 }}
                onClick={agregarCliente}
                disabled={agregando}
              >
                {agregando ? "Agregando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
