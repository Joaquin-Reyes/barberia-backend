import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Scissors, CheckCircle2, X, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Configuracion({ user }) {
  const barberiaId = user?.barberia_id;
  const [servicios, setServicios] = useState([]);
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: "", precio: "" });
  const [editandoServicio, setEditandoServicio] = useState(null); // { id, nombre, precio }
  const [barberia, setBarberia] = useState(null);
  const [editando, setEditando] = useState(false);
  const [toast, setToast] = useState(null);

  const traerServicios = useCallback(async () => {
    const { data } = await supabase
      .from("servicios").select("*")
      .eq("barberia_id", barberiaId);
    setServicios(data || []);
  }, [barberiaId]);

  const traerBarberia = useCallback(async () => {
    const { data } = await supabase
      .from("barberias").select("*")
      .eq("id", barberiaId)
      .single();
    setBarberia(data || null);
  }, [barberiaId]);

  useEffect(() => {
    if (!user) return;
    async function cargarDatos() {
      await Promise.all([traerServicios(), traerBarberia()]);
    }
    cargarDatos();
  }, [traerBarberia, traerServicios, user]);

  const mostrarToast = (mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  async function guardarServicio() {
    if (!editandoServicio.nombre || !editandoServicio.precio) {
      mostrarToast("Completá nombre y precio", "error");
      return;
    }
    const { error } = await supabase
      .from("servicios")
      .update({
        nombre: editandoServicio.nombre,
        precio: parseFloat(editandoServicio.precio),
      })
      .eq("id", editandoServicio.id);

    if (!error) {
      mostrarToast("Servicio actualizado");
      setEditandoServicio(null);
      traerServicios();
    } else {
      mostrarToast("Error al guardar", "error");
    }
  }

  async function guardarBarberia() {
    const { error } = await supabase
      .from("barberias")
      .update({
        nombre:           barberia.nombre,
        telefono_admin:   barberia.telefono_admin,
        whatsapp_number:  barberia.whatsapp_number,
      })
      .eq("id", user.barberia_id);

    if (!error) {
      mostrarToast("Datos guardados correctamente");
      setEditando(false);
    } else {
      mostrarToast("Error al guardar", "error");
    }
  }

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

      {/* ─── TOPBAR ─── */}
      <div style={topbarStyle}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            Configuración
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            Datos y servicios de tu barbería
          </p>
        </div>
      </div>

      {/* ─── CONTENIDO ─── */}
      <div style={{ padding: "24px", overflowY: "auto" }}>

        {/* DATOS DE LA BARBERÍA */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
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
                {/* Nombre */}
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
                {/* Teléfono */}
                <tr style={rowBorder}>
                  <td style={labelStyle}>Teléfono admin</td>
                  <td style={valueStyle}>
                    {editando ? (
                      <input
                        value={barberia.telefono_admin || ""}
                        onChange={(e) => setBarberia({ ...barberia, telefono_admin: e.target.value })}
                        style={{ width: "100%", margin: 0 }}
                      />
                    ) : (barberia.telefono_admin || <span style={{ color: "#94A3B8" }}>—</span>)}
                  </td>
                </tr>
                {/* WhatsApp */}
                <tr style={rowBorder}>
                  <td style={labelStyle}>Número de WhatsApp</td>
                  <td style={valueStyle}>
                    {editando ? (
                      <input
                        value={barberia.whatsapp_number || ""}
                        onChange={(e) => setBarberia({ ...barberia, whatsapp_number: e.target.value })}
                        style={{ width: "100%", margin: 0 }}
                      />
                    ) : (barberia.whatsapp_number || <span style={{ color: "#94A3B8" }}>—</span>)}
                  </td>
                </tr>
                {/* Estado */}
                <tr style={rowBorder}>
                  <td style={labelStyle}>Estado</td>
                  <td style={valueStyle}>
                    <span className={`estado ${barberia.activo ? "completado" : "cancelado"}`} style={{ cursor: "default" }}>
                      {barberia.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
                {/* Notificaciones */}
                <tr style={rowBorder}>
                  <td style={labelStyle}>Notificaciones</td>
                  <td style={valueStyle}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {["Recordatorio 24hs", "Recordatorio 3hs", "Confirmación al cliente", "Notificación al barbero"].map(n => (
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

        {/* AGREGAR SERVICIO */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Plus size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Agregar servicio</h2>
          </div>
          <div className="form-grid">
            <input
              placeholder="Nombre del servicio (ej: Corte)"
              value={nuevoServicio.nombre}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
            />
            <input
              placeholder="Precio"
              type="number"
              value={nuevoServicio.precio}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
            />
            <button
              style={{ background: "#16A34A" }}
              onClick={async () => {
                if (!nuevoServicio.nombre || !nuevoServicio.precio) {
                  mostrarToast("Completá nombre y precio", "error");
                  return;
                }
                const { error } = await supabase.from("servicios").insert({
                  nombre:      nuevoServicio.nombre,
                  precio:      parseFloat(nuevoServicio.precio),
                  barberia_id: user.barberia_id,
                });
                if (!error) {
                  mostrarToast("Servicio agregado correctamente");
                  setNuevoServicio({ nombre: "", precio: "" });
                  traerServicios();
                } else {
                  mostrarToast("Error al guardar", "error");
                }
              }}
            >
              Agregar
            </button>
          </div>
        </div>

        {/* SERVICIOS CONFIGURADOS */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Scissors size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Servicios configurados</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Precio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {servicios.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#94A3B8", padding: "28px 0", fontStyle: "italic" }}>
                      No hay servicios cargados todavía
                    </td>
                  </tr>
                )}
                {servicios.map((s) => {
                  const enEdicion = editandoServicio?.id === s.id;
                  return (
                    <tr key={s.id} style={{ background: enEdicion ? "#F8FAFC" : undefined }}>
                      {/* Nombre */}
                      <td>
                        {enEdicion ? (
                          <input
                            autoFocus
                            value={editandoServicio.nombre}
                            onChange={(e) => setEditandoServicio({ ...editandoServicio, nombre: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")  guardarServicio();
                              if (e.key === "Escape") setEditandoServicio(null);
                            }}
                            style={{ margin: 0, width: "100%" }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{s.nombre}</span>
                        )}
                      </td>

                      {/* Precio */}
                      <td>
                        {enEdicion ? (
                          <input
                            type="number"
                            value={editandoServicio.precio}
                            onChange={(e) => setEditandoServicio({ ...editandoServicio, precio: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")  guardarServicio();
                              if (e.key === "Escape") setEditandoServicio(null);
                            }}
                            style={{ margin: 0, width: 120 }}
                          />
                        ) : (
                          <span style={{ color: "#16A34A", fontWeight: 600 }}>
                            ${s.precio.toLocaleString("es-AR")}
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td>
                        {enEdicion ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={guardarServicio}
                              style={{ background: "#16A34A", padding: "5px 8px", display: "flex", alignItems: "center", gap: 4 }}
                            >
                              <CheckCircle2 size={13} />
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditandoServicio(null)}
                              style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0", padding: "5px 8px", display: "flex", alignItems: "center" }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => setEditandoServicio({ id: s.id, nombre: s.nombre, precio: s.precio })}
                              style={{ background: "transparent", color: "#2563EB", border: "1px solid #BFDBFE", padding: "5px 8px", display: "flex", alignItems: "center" }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={async () => {
                                if (!window.confirm(`¿Eliminar el servicio "${s.nombre}"?`)) return;
                                await supabase.from("servicios").delete().eq("id", s.id);
                                traerServicios();
                                mostrarToast("Servicio eliminado");
                              }}
                              className="btn-delete"
                              style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
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
