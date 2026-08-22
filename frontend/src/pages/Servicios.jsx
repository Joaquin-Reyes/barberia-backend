import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Package, Pencil, Plus, Scissors, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { productos as productosApi, servicios as serviciosApi } from "../lib/api";

export default function Servicios({ user }) {
  const barberiaId = user?.barberia_id;
  const [servicios, setServicios] = useState([]);
  const [productos, setProductos] = useState([]);
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: "", precio: "" });
  const [nuevoProducto, setNuevoProducto] = useState({ nombre: "", precio: "", costo: "", stock: "", stock_minimo: "" });
  const [editandoServicio, setEditandoServicio] = useState(null);
  const [editandoProducto, setEditandoProducto] = useState(null);
  const [toast, setToast] = useState(null);

  const traerServicios = useCallback(async () => {
    const { data } = await supabase
      .from("servicios")
      .select("*")
      .eq("barberia_id", barberiaId)
      .order("nombre", { ascending: true });
    setServicios(data || []);
  }, [barberiaId]);

  const traerProductos = useCallback(async () => {
    try {
      const data = await productosApi.list();
      setProductos(data || []);
    } catch {
      setProductos([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function cargar() {
      const [{ data: serviciosData }, productosData] = await Promise.all([
        supabase
          .from("servicios")
          .select("*")
          .eq("barberia_id", barberiaId)
          .order("nombre", { ascending: true }),
        productosApi.list().catch(() => []),
      ]);
      if (!alive) return;
      setServicios(serviciosData || []);
      setProductos(productosData || []);
    }
    cargar();
    return () => { alive = false; };
  }, [barberiaId, user]);

  const mostrarToast = (mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  async function guardarServicio() {
    if (!editandoServicio.nombre || !editandoServicio.precio) {
      mostrarToast("Completá nombre y precio", "error");
      return;
    }

    try {
      await serviciosApi.update(editandoServicio.id, {
        nombre: editandoServicio.nombre,
        precio: parseFloat(editandoServicio.precio),
      });
      mostrarToast("Servicio actualizado");
      setEditandoServicio(null);
      traerServicios();
    } catch (err) {
      mostrarToast(err.message || "Error al guardar", "error");
    }
  }

  async function guardarProducto() {
    if (!editandoProducto.nombre || editandoProducto.precio === "") {
      mostrarToast("Completá nombre y precio", "error");
      return;
    }

    try {
      await productosApi.update(editandoProducto.id, {
        nombre: editandoProducto.nombre,
        precio: parseFloat(editandoProducto.precio),
        costo: editandoProducto.costo,
        stock: editandoProducto.stock,
        stock_minimo: editandoProducto.stock_minimo,
        activo: editandoProducto.activo,
      });
      mostrarToast("Producto actualizado");
      setEditandoProducto(null);
      traerProductos();
    } catch (err) {
      mostrarToast(err.message || "Error al guardar", "error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      <div className="topbar" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            Servicios
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            Servicios del turno y productos para sumar al cliente
          </p>
        </div>
      </div>

      <div className="page-content">
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
                try {
                  await serviciosApi.create({
                    nombre: nuevoServicio.nombre,
                    precio: parseFloat(nuevoServicio.precio),
                  });
                  mostrarToast("Servicio agregado correctamente");
                  setNuevoServicio({ nombre: "", precio: "" });
                  traerServicios();
                } catch (err) {
                  mostrarToast(err.message || "Error al guardar", "error");
                }
              }}
            >
              Agregar
            </button>
          </div>
        </div>

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
                      <td>
                        {enEdicion ? (
                          <input
                            autoFocus
                            value={editandoServicio.nombre}
                            onChange={(e) => setEditandoServicio({ ...editandoServicio, nombre: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarServicio();
                              if (e.key === "Escape") setEditandoServicio(null);
                            }}
                            style={{ margin: 0, width: "100%" }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{s.nombre}</span>
                        )}
                      </td>
                      <td>
                        {enEdicion ? (
                          <input
                            type="number"
                            value={editandoServicio.precio}
                            onChange={(e) => setEditandoServicio({ ...editandoServicio, precio: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarServicio();
                              if (e.key === "Escape") setEditandoServicio(null);
                            }}
                            style={{ margin: 0, width: 120 }}
                          />
                        ) : (
                          <span style={{ color: "#16A34A", fontWeight: 600 }}>
                            ${Number(s.precio || 0).toLocaleString("es-AR")}
                          </span>
                        )}
                      </td>
                      <td>
                        {enEdicion ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={guardarServicio} style={{ background: "#16A34A", padding: "5px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                              <CheckCircle2 size={13} />
                              Guardar
                            </button>
                            <button onClick={() => setEditandoServicio(null)} style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0", padding: "5px 8px", display: "flex", alignItems: "center" }}>
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
                                try {
                                  await serviciosApi.delete(s.id);
                                  traerServicios();
                                  mostrarToast("Servicio eliminado");
                                } catch (err) {
                                  mostrarToast(err.message || "Error al eliminar", "error");
                                }
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

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Plus size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Agregar producto</h2>
          </div>
          <div className="form-grid">
            <input placeholder="Nombre del producto" value={nuevoProducto.nombre} onChange={(e) => setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })} />
            <input placeholder="Precio venta" type="number" value={nuevoProducto.precio} onChange={(e) => setNuevoProducto({ ...nuevoProducto, precio: e.target.value })} />
            <input placeholder="Costo opcional" type="number" value={nuevoProducto.costo} onChange={(e) => setNuevoProducto({ ...nuevoProducto, costo: e.target.value })} />
            <input placeholder="Stock" type="number" value={nuevoProducto.stock} onChange={(e) => setNuevoProducto({ ...nuevoProducto, stock: e.target.value })} />
            <input placeholder="Stock mínimo" type="number" value={nuevoProducto.stock_minimo} onChange={(e) => setNuevoProducto({ ...nuevoProducto, stock_minimo: e.target.value })} />
            <button
              style={{ background: "#16A34A" }}
              onClick={async () => {
                if (!nuevoProducto.nombre || nuevoProducto.precio === "") {
                  mostrarToast("Completá nombre y precio", "error");
                  return;
                }
                try {
                  await productosApi.create(nuevoProducto);
                  mostrarToast("Producto agregado correctamente");
                  setNuevoProducto({ nombre: "", precio: "", costo: "", stock: "", stock_minimo: "" });
                  traerProductos();
                } catch (err) {
                  mostrarToast(err.message || "Error al guardar", "error");
                }
              }}
            >
              Agregar
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Package size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Productos configurados</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Costo</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "#94A3B8", padding: "28px 0", fontStyle: "italic" }}>
                      No hay productos cargados todavía
                    </td>
                  </tr>
                )}
                {productos.map((p) => {
                  const enEdicion = editandoProducto?.id === p.id;
                  const stockBajo = Number(p.stock || 0) <= Number(p.stock_minimo || 0);
                  return (
                    <tr key={p.id} style={{ background: enEdicion ? "#F8FAFC" : undefined }}>
                      <td>
                        {enEdicion ? (
                          <input autoFocus value={editandoProducto.nombre} onChange={(e) => setEditandoProducto({ ...editandoProducto, nombre: e.target.value })} style={{ margin: 0, width: "100%" }} />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                        )}
                      </td>
                      <td>
                        {enEdicion ? (
                          <input type="number" value={editandoProducto.precio} onChange={(e) => setEditandoProducto({ ...editandoProducto, precio: e.target.value })} style={{ margin: 0, width: 110 }} />
                        ) : (
                          <span style={{ color: "#16A34A", fontWeight: 600 }}>${Number(p.precio || 0).toLocaleString("es-AR")}</span>
                        )}
                      </td>
                      <td>
                        {enEdicion ? (
                          <input type="number" value={editandoProducto.costo ?? ""} onChange={(e) => setEditandoProducto({ ...editandoProducto, costo: e.target.value })} style={{ margin: 0, width: 110 }} />
                        ) : p.costo != null ? `$${Number(p.costo || 0).toLocaleString("es-AR")}` : <span style={{ color: "#94A3B8" }}>-</span>}
                      </td>
                      <td>
                        {enEdicion ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input type="number" value={editandoProducto.stock} onChange={(e) => setEditandoProducto({ ...editandoProducto, stock: e.target.value })} style={{ margin: 0, width: 90 }} />
                            <input type="number" title="Stock mínimo" value={editandoProducto.stock_minimo} onChange={(e) => setEditandoProducto({ ...editandoProducto, stock_minimo: e.target.value })} style={{ margin: 0, width: 90 }} />
                          </div>
                        ) : (
                          <span style={{ color: stockBajo ? "#D97706" : "#475569", fontWeight: stockBajo ? 600 : 400 }}>
                            {Number(p.stock || 0).toLocaleString("es-AR")}
                            {stockBajo && " bajo"}
                          </span>
                        )}
                      </td>
                      <td>
                        {enEdicion ? (
                          <select value={editandoProducto.activo ? "true" : "false"} onChange={(e) => setEditandoProducto({ ...editandoProducto, activo: e.target.value === "true" })} style={{ margin: 0 }}>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                        ) : (
                          <span className={`estado ${p.activo ? "completado" : "cancelado"}`} style={{ cursor: "default" }}>
                            {p.activo ? "Activo" : "Inactivo"}
                          </span>
                        )}
                      </td>
                      <td>
                        {enEdicion ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={guardarProducto} style={{ background: "#16A34A", padding: "5px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                              <CheckCircle2 size={13} />
                              Guardar
                            </button>
                            <button onClick={() => setEditandoProducto(null)} style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0", padding: "5px 8px", display: "flex", alignItems: "center" }}>
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setEditandoProducto({ ...p })} style={{ background: "transparent", color: "#2563EB", border: "1px solid #BFDBFE", padding: "5px 8px", display: "flex", alignItems: "center" }}>
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={async () => {
                                if (!window.confirm(`¿Desactivar el producto "${p.nombre}"?`)) return;
                                await productosApi.delete(p.id);
                                traerProductos();
                                mostrarToast("Producto desactivado");
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
