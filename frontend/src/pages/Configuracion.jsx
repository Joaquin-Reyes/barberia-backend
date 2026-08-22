import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";
import { barberia as barberiaApi } from "../lib/api";

export default function Configuracion({ user }) {
  const barberiaId = user?.barberia_id;
  const [barberia, setBarberia] = useState(null);
  const [editando, setEditando] = useState(false);
  const [toast, setToast] = useState(null);

  const traerBarberia = useCallback(async () => {
    const { data } = await supabase
      .from("barberias")
      .select("*")
      .eq("id", barberiaId)
      .single();
    setBarberia(data || null);
  }, [barberiaId]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function cargar() {
      const { data } = await supabase
        .from("barberias")
        .select("*")
        .eq("id", barberiaId)
        .single();
      if (alive) setBarberia(data || null);
    }
    cargar();
    return () => { alive = false; };
  }, [barberiaId, user]);

  const mostrarToast = (mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  async function guardarBarberia() {
    try {
      const data = await barberiaApi.updateConfiguracion({
        nombre: barberia.nombre,
        telefono_admin: barberia.telefono_admin,
        whatsapp_number: barberia.whatsapp_number,
      });
      setBarberia(data);
      mostrarToast("Datos guardados correctamente");
      setEditando(false);
    } catch (err) {
      mostrarToast(err.message || "Error al guardar", "error");
    }
  }

  const labelStyle = {
    padding: "11px 0",
    color: "#64748B",
    fontSize: 13,
    width: 160,
    fontWeight: 500,
  };

  const valueStyle = {
    padding: "11px 0",
    fontSize: 13,
    color: "#0F172A",
  };

  const rowBorder = { borderTop: "1px solid #E2E8F0" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      <div className="topbar" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            Configuración
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            Datos generales de tu barbería
          </p>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Building2 size={14} color="#475569" />
              <h2 style={{ margin: 0 }}>Datos de la barbería</h2>
            </div>
            {!editando ? (
              <button
                onClick={() => setEditando(true)}
                style={{
                  background: "transparent",
                  color: "#2563EB",
                  border: "1px solid #BFDBFE",
                  padding: "5px 12px",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Pencil size={12} />
                Editar
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { setEditando(false); traerBarberia(); }}
                  style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0", padding: "5px 12px", fontSize: 13 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarBarberia}
                  style={{ background: "#16A34A", padding: "5px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}
                >
                  <CheckCircle2 size={13} />
                  Guardar
                </button>
              </div>
            )}
          </div>

          {barberia && (
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={labelStyle}>Nombre</td>
                  <td style={valueStyle}>
                    {editando ? (
                      <input
                        value={barberia.nombre || ""}
                        onChange={(e) => setBarberia({ ...barberia, nombre: e.target.value })}
                        style={{ width: "100%", margin: 0 }}
                      />
                    ) : barberia.nombre}
                  </td>
                </tr>
                <tr style={rowBorder}>
                  <td style={labelStyle}>Teléfono admin</td>
                  <td style={valueStyle}>
                    {editando ? (
                      <input
                        value={barberia.telefono_admin || ""}
                        onChange={(e) => setBarberia({ ...barberia, telefono_admin: e.target.value })}
                        style={{ width: "100%", margin: 0 }}
                      />
                    ) : (barberia.telefono_admin || <span style={{ color: "#94A3B8" }}>-</span>)}
                  </td>
                </tr>
                <tr style={rowBorder}>
                  <td style={labelStyle}>Número de WhatsApp</td>
                  <td style={valueStyle}>
                    {editando ? (
                      <input
                        value={barberia.whatsapp_number || ""}
                        onChange={(e) => setBarberia({ ...barberia, whatsapp_number: e.target.value })}
                        style={{ width: "100%", margin: 0 }}
                      />
                    ) : (barberia.whatsapp_number || <span style={{ color: "#94A3B8" }}>-</span>)}
                  </td>
                </tr>
                <tr style={rowBorder}>
                  <td style={labelStyle}>Estado</td>
                  <td style={valueStyle}>
                    <span className={`estado ${barberia.activo ? "completado" : "cancelado"}`} style={{ cursor: "default" }}>
                      {barberia.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
                <tr style={rowBorder}>
                  <td style={labelStyle}>Notificaciones</td>
                  <td style={valueStyle}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {["Recordatorio 24hs", "Recordatorio 3hs", "Confirmación al cliente", "Notificación al barbero"].map((n) => (
                        <span key={n} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                          <CheckCircle2 size={13} color="#16A34A" />
                          {n}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
