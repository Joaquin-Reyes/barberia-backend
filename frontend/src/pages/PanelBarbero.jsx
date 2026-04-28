import { useEffect, useState } from "react";
import { supabase, getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

function formatHora(str) {
  if (!str) return "";
  if (str.includes("T")) {
    return new Date(str).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  return str.slice(0, 5);
}

export default function PanelBarbero({ user }) {
  const [barberoId, setBarberoId] = useState(null);
  const [proximoCliente, setProximoCliente] = useState(null);
  const [turnosHoy, setTurnosHoy] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [terminando, setTerminando] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalCola, setModalCola] = useState(null); // { nombre_cliente } | null
  const [servicioCola, setServicioCola] = useState("");
  const [precioCola, setPrecioCola] = useState("");

  async function cargarDatos() {
    const token = await getAuthToken();
    try {
      const [colaRes, turnosRes] = await Promise.all([
        fetch(`${API}/cola/${user.barberia_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API}/barbero/turnos`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      let bId = null;
      let turnos = [];
      if (turnosRes.ok) {
        const data = await turnosRes.json();
        turnos = data.turnos || [];
        setTurnosHoy(turnos);
        if (data.barbero_id) {
          setBarberoId(data.barbero_id);
          bId = data.barbero_id;
        }
      }

      // Prioridad 1: turno pendiente cuya hora ya llegó
      const ahora = new Date();
      const turnoDue = turnos
        .filter((t) => t.estado === "pendiente" && t.hora)
        .filter((t) => {
          const [h, m] = t.hora.slice(0, 5).split(":").map(Number);
          const horaTurno = new Date();
          horaTurno.setHours(h, m, 0, 0);
          return horaTurno <= ahora;
        })
        .sort((a, b) => a.hora.localeCompare(b.hora))[0];

      if (turnoDue) {
        setProximoCliente({
          tipo: "turno_reservado",
          nombre_cliente: turnoDue.nombre,
          hora: turnoDue.hora,
          turno_id: turnoDue.id,
        });
        return;
      }

      // Prioridad 2: cliente actual en cola de espera
      if (colaRes.ok) {
        const data = await colaRes.json();
        const miBarbero = (data.barberos || []).find((b) => b.id === bId);
        const clienteActual = miBarbero?.cliente_actual;
        if (clienteActual) {
          setProximoCliente({
            tipo: "cola_espera",
            nombre_cliente: clienteActual.nombre_cliente,
          });
          return;
        }
      }

      setProximoCliente(null);
    } catch (err) {
      console.error(err);
      mostrarToast("Error al cargar datos", "error");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!user?.barberia_id) return;
    cargarDatos();

    const channel = supabase
      .channel(`panel_barbero_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cola_espera",
          filter: `barberia_id=eq.${user.barberia_id}`,
        },
        () => cargarDatos()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "turnos",
          filter: `barberia_id=eq.${user.barberia_id}`,
        },
        () => cargarDatos()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.barberia_id]);

  function terminar() {
    if (!barberoId || !proximoCliente) return;
    if (proximoCliente.tipo === "cola_espera") {
      setServicioCola("");
      setPrecioCola("");
      setModalCola({ nombre_cliente: proximoCliente.nombre_cliente });
    } else {
      ejecutarTerminar(null);
    }
  }

  async function ejecutarTerminar(datosServicio) {
    setTerminando(true);
    const token = await getAuthToken();
    try {
      // Si es turno reservado, marcarlo como completado
      if (proximoCliente?.tipo === "turno_reservado" && proximoCliente.turno_id) {
        await fetch(`${API}/admin/turnos/${proximoCliente.turno_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ estado: "completado" }),
        });
        setTurnosHoy((prev) =>
          prev.map((t) =>
            t.id === proximoCliente.turno_id ? { ...t, estado: "completado" } : t
          )
        );
      }

      // Si es cola de espera y se proporcionaron datos, registrar en turnos
      if (proximoCliente?.tipo === "cola_espera" && datosServicio) {
        await fetch(`${API}/barbero/registrar-atencion`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre_cliente: proximoCliente.nombre_cliente,
            servicio: datosServicio.servicio,
            precio: datosServicio.precio,
          }),
        });
      }

      const res = await fetch(`${API}/cola/terminar/${barberoId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
    } catch {
      mostrarToast("Error al procesar", "error");
    } finally {
      setTerminando(false);
      await cargarDatos();
    }
  }

  async function confirmarModalCola(registrar) {
    setModalCola(null);
    if (registrar) {
      await ejecutarTerminar({ servicio: servicioCola, precio: precioCola });
    } else {
      await ejecutarTerminar(null);
    }
  }

  function mostrarToast(mensaje, tipo = "success") {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }

  function renderCardInfo() {
    if (!proximoCliente || proximoCliente.tipo === "sin_clientes") {
      return (
        <p style={{ fontSize: 15, color: "#9ca3af", margin: "0 0 20px" }}>
          Sin clientes por el momento
        </p>
      );
    }

    if (proximoCliente.tipo === "turno_reservado") {
      return (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Atendiendo &mdash; turno reservado
          </p>
          <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#1e3a8a" }}>
            {proximoCliente.nombre_cliente}
          </p>
          {proximoCliente.hora && (
            <p style={{ fontSize: 13, color: "#3b82f6", margin: 0 }}>
              {formatHora(proximoCliente.hora)}
            </p>
          )}
        </div>
      );
    }

    // cola_espera
    return (
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Cola de espera
        </p>
        <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#14532d" }}>
          {proximoCliente.nombre_cliente}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      {/* MODAL REGISTRO COLA */}
      {modalCola && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 16,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 360, margin: 0 }}>
            <h2 style={{ marginBottom: 4 }}>Registrar servicio</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px" }}>
              {modalCola.nombre_cliente}
            </p>

            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
              Servicio
            </label>
            <input
              type="text"
              placeholder="Ej: Corte + barba"
              value={servicioCola}
              onChange={e => setServicioCola(e.target.value)}
              style={{ width: "100%", marginBottom: 12, boxSizing: "border-box" }}
              autoFocus
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
              Precio
            </label>
            <input
              type="number"
              placeholder="0"
              value={precioCola}
              onChange={e => setPrecioCola(e.target.value)}
              style={{ width: "100%", marginBottom: 20, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => confirmarModalCola(true)}
                disabled={terminando}
                style={{ flex: 1, background: "#16a34a", padding: "11px 0" }}
              >
                {terminando ? "Guardando..." : "Registrar y terminar"}
              </button>
              <button
                onClick={() => confirmarModalCola(false)}
                disabled={terminando}
                style={{ flex: 1, background: "#6b7280", padding: "11px 0" }}
              >
                Solo terminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div style={{
        padding: "16px 24px",
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
      }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Mi Panel</h1>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>
          {user?.nombre || user?.email}
        </p>
      </div>

      {cargando ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          Cargando...
        </div>
      ) : (
        <div style={{ padding: 24, overflowY: "auto" }}>

          {/* CARD TURNO ACTUAL */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Tu próximo cliente</h2>
            {renderCardInfo()}
            <button
              onClick={terminar}
              disabled={terminando || !barberoId}
              style={{ background: "#16a34a", padding: "12px 24px", fontSize: 14, width: "100%" }}
            >
              {terminando ? "Procesando..." : "Terminé"}
            </button>
          </div>

          {/* TURNOS DEL DÍA */}
          <div className="card">
            <h2 style={{ marginBottom: 16 }}>Turnos de hoy</h2>
            {turnosHoy.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af" }}>
                No tenés turnos reservados para hoy.
              </p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Cliente</th>
                      <th>Servicio</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnosHoy.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>{formatHora(t.hora)}</td>
                        <td>{t.nombre}</td>
                        <td style={{ fontSize: 13, color: "#6b7280" }}>{t.servicio}</td>
                        <td>
                          <span className={`estado ${t.estado}`}>{t.estado}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
