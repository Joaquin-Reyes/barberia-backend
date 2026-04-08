import { useEffect, useState } from "react";
import { supabase, turnoDisponible } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

const getRowColor = (estado) => {
  switch (estado) {
    case "pendiente": return "#facc1550";
    case "confirmado": return "#3b82f650";
    case "completado": return "#22c55e80";
    case "cancelado": return "#dc262650";
    default: return "transparent";
  }
};

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

  useEffect(() => {
    if (!user) return;
    traerTurnos();
    traerBarberos();
    traerServicios();
  }, [user]);

  useEffect(() => {
    if (!nuevo.barbero || !nuevo.fecha || !user) return;
    async function cargarHorarios() {
      // Obtener el barbero para conseguir su ID
      const { data: barberoData } = await supabase
        .from("barberos")
        .select("id")
        .eq("nombre", nuevo.barbero)
        .eq("barberia_id", user.barberia_id)
        .single();

      if (!barberoData) return;

      // Determinar el día de la semana de la fecha seleccionada
      const fecha = new Date(nuevo.fecha + "T00:00:00");
      const diaSemana = fecha.getDay(); // 0=Domingo, 1=Lunes, ...

      // Buscar el horario del barbero para ese día
      const { data: horarioDia } = await supabase
        .from("horarios_barbero")
        .select("hora_inicio, hora_fin")
        .eq("barbero_id", barberoData.id)
        .eq("dia_semana", diaSemana)
        .single();

      if (horarioDia) {
        setHorarios(generarHorarios(horarioDia.hora_inicio, horarioDia.hora_fin));
      } else {
        setHorarios([]); // El barbero no trabaja ese día
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

  const pendientes = turnos.filter(t => t.estado === "pendiente").length;
  const confirmados = turnos.filter(t => t.estado === "confirmado").length;
  const completados = turnos.filter(t => t.estado === "completado").length;

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
          <h1 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>Turnos</h1>
          <p style={{ fontSize: "12px", color: "#9ca3af", margin: "2px 0 0" }}>
            {new Date().toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: "999px" }}>
            {pendientes} pendientes
          </span>
          <span style={{ fontSize: "12px", background: "#dbeafe", color: "#1e40af", padding: "4px 10px", borderRadius: "999px" }}>
            {confirmados} confirmados
          </span>
          <span style={{ fontSize: "12px", background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: "999px" }}>
            {completados} completados
          </span>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ padding: "24px", flex: 1, overflowY: "auto" }}>

        {/* CREAR TURNO */}
        {(user.rol === "admin" || user.rol === "superadmin") && (
          <div className="card" style={{ marginBottom: "20px" }}>
            <h2>➕ Crear turno</h2>
            <div className="form-grid">
              <input
                placeholder="Nombre"
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
              <input
                placeholder="Teléfono"
                value={nuevo.telefono}
                onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              />

              {/* SELECT SERVICIOS CON PRECIO AUTOMÁTICO */}
              <select
                value={nuevo.servicio}
                onChange={(e) => {
                  const seleccionado = servicios.find(s => s.nombre === e.target.value);
                  setNuevo({
                    ...nuevo,
                    servicio: e.target.value,
                    precio: seleccionado ? seleccionado.precio : 0,
                  });
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
                      mostrarToast("Completá todos los campos ⚠️", "error");
                      return;
                    }
                    const disponible = await turnoDisponible(nuevo.fecha, nuevo.hora, nuevo.barbero);
                    if (!disponible) {
                      mostrarToast("Ese horario ya está ocupado ❌", "error");
                      return;
                    }
                    try {
                      const token = localStorage.getItem("token");
                      const res = await fetch(`${API}/admin/crear-turno`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ ...nuevo }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        mostrarToast("Turno creado correctamente 💈", "success");
                        traerTurnos();
                        setNuevo({ nombre: "", telefono: "", servicio: "", precio: 0, barbero: "", fecha: "", hora: "" });
                      } else {
                        mostrarToast(data.error || "Error al crear turno ❌", "error");
                      }
                    } catch (error) {
                      mostrarToast("Error de conexión ❌", "error");
                    }
                  }}
                >
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BUSCAR */}
        <div className="card">
          <h2>🔍 Buscar turnos</h2>
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <input
              placeholder="Buscar cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
            />
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
                  {(user.rol === "admin" || user.rol === "superadmin") && <th>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {turnosFiltrados.map((t) => (
                  <tr key={t.id} style={{ backgroundColor: getRowColor(t.estado) }}>
                    <td>{t.nombre}</td>
                    <td>{t.telefono}</td>
                    <td>{t.servicio}</td>
                    <td>{t.barbero}</td>
                    <td>{t.fecha}</td>
                    <td>{t.hora}</td>
                    <td>
                      <span
                        onClick={() => {
                          const orden = ["pendiente", "confirmado", "completado"];
                          const index = orden.indexOf(t.estado || "pendiente");
                          cambiarEstado(t.id, orden[(index + 1) % orden.length]);
                        }}
                        style={{
                          background: t.estado === "pendiente" ? "#facc15"
                            : t.estado === "confirmado" ? "#3b82f6"
                            : t.estado === "completado" ? "#16a34a"
                            : t.estado === "cancelado" ? "#dc2626" : "#6b7280",
                          color: "white",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
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
                          style={{ padding: "4px 10px" }}
                        >
                          ✖
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