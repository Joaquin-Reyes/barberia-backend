import { useCallback, useEffect, useState } from "react";
import { supabase, getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";
const RANGOS_TURNOS = [
  { id: "hoy", label: "Hoy" },
  { id: "manana", label: "Mañana" },
  { id: "semana", label: "Semana" },
];
const METODOS_PAGO = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["mercado_pago", "Mercado Pago"],
  ["tarjeta", "Tarjeta"],
  ["otro", "Otro"],
];

function formatHora(str) {
  if (!str) return "";
  if (str.includes("T")) {
    return new Date(str).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  return str.slice(0, 5);
}

function formatFecha(str) {
  if (!str) return "";
  const [year, month, day] = str.split("-").map(Number);
  if (!year || !month || !day) return str;
  return new Date(year, month - 1, day).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

async function parseApiError(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

export default function PanelBarbero({ user }) {
  const [barberoId, setBarberoId] = useState(null);
  const [proximoCliente, setProximoCliente] = useState(null);
  const [turnos, setTurnos] = useState([]);
  const [rangoTurnos, setRangoTurnos] = useState("hoy");
  const [cargando, setCargando] = useState(true);
  const [cargandoTurnos, setCargandoTurnos] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalCola, setModalCola] = useState(null); // { nombre_cliente } | null
  const [servicioCola, setServicioCola] = useState("");
  const [precioCola, setPrecioCola] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");

  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const cargarDatos = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      mostrarToast("Sesión expirada. Volvé a ingresar.", "error");
      setCargando(false);
      return;
    }

    setCargandoTurnos(true);
    try {
      const fetchTurnos = async (rango) => {
        const res = await fetch(`${API}/barbero/turnos?rango=${rango}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await parseApiError(res, "Error al cargar turnos"));
        return res.json();
      };

      const data = await fetchTurnos(rangoTurnos);
      const turnosListado = data.turnos || [];
      setTurnos(turnosListado);

      let bId = data.barbero_id || null;
      if (bId) {
        setBarberoId(bId);
      }

      let turnosHoy = turnosListado;
      if (rangoTurnos !== "hoy") {
        const dataHoy = await fetchTurnos("hoy");
        turnosHoy = dataHoy.turnos || [];
        if (!bId && dataHoy.barbero_id) {
          setBarberoId(dataHoy.barbero_id);
          bId = dataHoy.barbero_id;
        }
      }

      // Prioridad 1: turno pendiente cuya hora ya llegó
      const ahora = new Date();
      const turnoDue = turnosHoy
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
          servicio: turnoDue.servicio,
          precio: turnoDue.precio,
        });
        return;
      }

      // Prioridad 2: cliente actual en cola de espera
      const colaRes = await fetch(`${API}/cola/${user.barberia_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      } else {
        throw new Error(await parseApiError(colaRes, "Error al cargar cola"));
      }

      setProximoCliente(null);
    } catch (err) {
      console.error(err);
      mostrarToast(err.message || "Error al cargar datos", "error");
    } finally {
      setCargando(false);
      setCargandoTurnos(false);
    }
  }, [mostrarToast, rangoTurnos, user?.barberia_id]);

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
  }, [cargarDatos, user?.barberia_id, user?.id]);

  function terminar() {
    if (!barberoId || !proximoCliente) return;
    if (proximoCliente.tipo === "cola_espera" || proximoCliente.tipo === "turno_reservado") {
      setServicioCola(proximoCliente.servicio || "");
      setPrecioCola(proximoCliente.precio ? String(proximoCliente.precio) : "");
      setMetodoPago("efectivo");
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
        const body = { estado: "completado" };
        if (datosServicio) {
          body.servicio = datosServicio.servicio;
          body.precio = datosServicio.precio;
          body.metodo_pago = datosServicio.metodo_pago;
        }

        const res = await fetch(`${API}/admin/turnos/${proximoCliente.turno_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await parseApiError(res, "Error completando turno"));
        setTurnos((prev) =>
          prev.map((t) =>
            t.id === proximoCliente.turno_id ? { ...t, ...body } : t
          )
        );
        mostrarToast("Turno completado");
        return;
      }

      // Si es cola de espera y se proporcionaron datos, registrar en turnos
      if (proximoCliente?.tipo === "cola_espera" && datosServicio) {
        const res = await fetch(`${API}/barbero/registrar-atencion`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre_cliente: proximoCliente.nombre_cliente,
            servicio: datosServicio.servicio,
            precio: datosServicio.precio,
            metodo_pago: datosServicio.metodo_pago,
          }),
        });
        if (!res.ok) throw new Error(await parseApiError(res, "Error registrando atención"));
      }

      const res = await fetch(`${API}/cola/terminar/${barberoId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await parseApiError(res, "Error terminando atención"));
      mostrarToast("Atención terminada");
    } catch (err) {
      mostrarToast(err.message || "Error al procesar", "error");
    } finally {
      setTerminando(false);
      cargarDatos();
    }
  }

  async function confirmarModalCola(registrar) {
    if (registrar) {
      const servicio = servicioCola.trim();
      const precio = Number(precioCola);
      if (!servicio) {
        mostrarToast("Ingresá el servicio realizado", "error");
        return;
      }
      if (!Number.isFinite(precio) || precio <= 0) {
        mostrarToast("Ingresá un precio válido", "error");
        return;
      }
      setModalCola(null);
      await ejecutarTerminar({ servicio, precio: precioCola, metodo_pago: metodoPago });
    } else {
      setModalCola(null);
      await ejecutarTerminar(null);
    }
  }

  const tituloTurnos = RANGOS_TURNOS.find((r) => r.id === rangoTurnos)?.label || "Hoy";
  const puedeTerminar = Boolean(barberoId && proximoCliente);

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
              min="1"
              step="1"
              placeholder="0"
              value={precioCola}
              onChange={e => setPrecioCola(e.target.value)}
              style={{ width: "100%", marginBottom: 20, boxSizing: "border-box" }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
              Método de pago
            </label>
            <select
              value={metodoPago}
              onChange={e => setMetodoPago(e.target.value)}
              style={{ width: "100%", marginBottom: 20, boxSizing: "border-box" }}
            >
              {METODOS_PAGO.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => confirmarModalCola(true)}
                disabled={terminando}
                style={{ flex: 1, background: "#16a34a", padding: "11px 0" }}
              >
                {terminando ? "Guardando..." : "Facturar y terminar"}
              </button>
              <button
                onClick={() => setModalCola(null)}
                disabled={terminando}
                type="button"
                style={{ flex: "0 0 auto", background: "#ffffff", color: "#475569", border: "1px solid #cbd5e1", padding: "11px 12px" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div className="topbar">
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Mi Panel</h1>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>
            {user?.nombre || user?.email}
          </p>
        </div>
      </div>

      {cargando ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          Cargando...
        </div>
      ) : (
        <div className="page-content">

          {/* CARD TURNO ACTUAL */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Tu próximo cliente</h2>
            {renderCardInfo()}
            <button
              onClick={terminar}
              disabled={terminando || !puedeTerminar}
              style={{ background: "#16a34a", padding: "12px 24px", fontSize: 14, width: "100%", opacity: puedeTerminar ? 1 : 0.55, cursor: puedeTerminar ? "pointer" : "not-allowed" }}
            >
              {terminando ? "Procesando..." : "Terminé"}
            </button>
          </div>

          {/* TURNOS */}
          <div className="card">
            <div className="barber-turnos-head">
              <div>
                <h2 style={{ margin: 0 }}>Turnos</h2>
                <p>{tituloTurnos}</p>
              </div>
              <div className="barber-range-tabs" role="tablist" aria-label="Rango de turnos">
                {RANGOS_TURNOS.map((rango) => (
                  <button
                    key={rango.id}
                    type="button"
                    onClick={() => setRangoTurnos(rango.id)}
                    className={rangoTurnos === rango.id ? "active" : ""}
                    aria-pressed={rangoTurnos === rango.id}
                  >
                    {rango.label}
                  </button>
                ))}
              </div>
            </div>

            {cargandoTurnos ? (
              <p style={{ fontSize: 13, color: "#9ca3af" }}>Actualizando turnos...</p>
            ) : turnos.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af" }}>
                No tenés turnos reservados en este rango.
              </p>
            ) : (
              <div className="barber-turnos-list">
                {turnos.map((t) => (
                  <div className="barber-turno-card" key={t.id}>
                    <div>
                      <strong>{t.nombre}</strong>
                      <span>{t.servicio || "Sin servicio"}</span>
                    </div>
                    <div className="barber-turno-meta">
                      <span>{formatFecha(t.fecha)}</span>
                      <strong>{formatHora(t.hora)}</strong>
                      <span className={`estado ${t.estado}`}>{t.estado}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
