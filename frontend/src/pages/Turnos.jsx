import { useEffect, useState } from "react";
import { supabase, guardarTurno, turnoDisponible } from "../lib/supabase";

const API = "https://barberia-backend-production-8717.up.railway.app";

// 🎨 colores de estado
const estadoColores = {
  pendiente: "bg-yellow-100 text-yellow-800",
  confirmado: "bg-blue-100 text-blue-800",
  cancelado: "bg-red-100 text-red-800",
  completado: "bg-emerald-600 text-white",
};

export default function Turnos({ user, onLogout }) {
  const [turnos, setTurnos] = useState([]);
  const [barberos, setBarberos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [toast, setToast] = useState(null);

const getRowColor = (estado) => {
  switch (estado) {
    case "pendiente":
      return "#facc1550"; // amarillo más fuerte
    case "confirmado":
      return "#3b82f650"; // azul más fuerte
    case "completado":
      return "#22c55e80"; // verde más fuerte
    case "cancelado":
      return "#dc262650"; // rojo más fuerte
    default:
      return "transparent";
  }
};

  const [nuevo, setNuevo] = useState({
    nombre: "",
    telefono: "",
    servicio: "",
    barbero: "",
    fecha: "",
    hora: "",
  });

  const [busqueda, setBusqueda] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");

  useEffect(() => {
    traerTurnos();
    traerBarberos();
  }, []);

  useEffect(() => {
  if (!nuevo.barbero || !nuevo.fecha) return;

  async function cargarHorarios() {
    const { data } = await supabase
      .from("barberos")
      .select("*")
      .eq("nombre", nuevo.barbero)
      .single();

    if (data) {
      const generados = generarHorarios(
        data.hora_inicio,
        data.hora_fin
      );

      setHorarios(generados);
    }
  }

  cargarHorarios();
}, [nuevo.barbero, nuevo.fecha]);

  async function traerTurnos() {
    const { data } = await supabase
      .from("turnos")
      .select("*")
      .order("fecha", { ascending: true });

    setTurnos(data || []);
  }

 async function traerBarberos() {
  const { data, error } = await supabase.from("barberos").select("*");

  console.log("BARBEROS:", data);
  console.log("ERROR:", error);

  setBarberos(data || []);
}
  // 🔥 generar horarios dinámicos
  const generarHorarios = (inicio, fin) => {
    const horas = [];

    for (let h = inicio; h < fin; h++) {
      horas.push(`${h}:00`);
      horas.push(`${h}:30`);
    }

    return horas;
  };

  // 🔥 cuando cambia barbero
  const handleBarberoChange = async (barberoNombre) => {
    setNuevo({ ...nuevo, barbero: barberoNombre, hora: "" });

    const { data } = await supabase
      .from("barberos")
      .select("*")
      .eq("nombre", barberoNombre)
      .single();

    if (data) {
      const horariosGenerados = generarHorarios(
        data.hora_inicio,
        data.hora_fin
      );

      setHorarios(horariosGenerados);
    }
  };

  // 🔥 filtrar ocupados
  const horariosDisponibles = horarios.filter((h) => {
    return !turnos.some(
      (t) =>
        t.fecha === nuevo.fecha &&
        t.barbero === nuevo.barbero &&
        t.hora === h
    );
  });

  // 🔥 cambiar estado
async function cambiarEstado(id, nuevoEstado) {
  try {
    const res = await fetch(`${API}/turnos/${id}/estado`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    console.log("STATUS:", res.status);

    traerTurnos();
  } catch (error) {
    console.error("ERROR:", error);
  }
}

  // 🔥 PEGAR JUSTO ACÁ (DEBAJO)
const mostrarToast = (mensaje, tipo = "success") => {
  setToast({ mensaje, tipo });

  setTimeout(() => {
    setToast(null);
  }, 3000);
};

  const turnosFiltrados = turnos.filter((t) => {
    return (
      (user.tipo === "admin" || t.barbero === user.nombre) &&
      t.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
      (filtroFecha ? t.fecha === filtroFecha : true)
    );
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">

      {toast && (
  <div className={`toast ${toast.tipo}`}>
    {toast.mensaje}
  </div>
)}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">📅 Panel de Turnos</h1>
          <p className="text-sm text-neutral-400">
            {user.nombre} · {user.tipo}
          </p>
        </div>

        <button
          onClick={onLogout}
          className="bg-neutral-800 px-4 py-1 rounded"
        >
          Cerrar sesión
        </button>
      </div>

      {/* CREAR TURNO */}
      {user.tipo === "admin" && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">➕ Crear turno</h2>

         <div className="form-grid">
            <input
              placeholder="Nombre"
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              className="input"
            />
            <input
              placeholder="Teléfono"
              value={nuevo.telefono}
              onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              className="input"
            />
            <input
              placeholder="Servicio"
              value={nuevo.servicio}
              onChange={(e) => setNuevo({ ...nuevo, servicio: e.target.value })}
              className="input"
            />

            {/* 🔥 SELECT BARBEROS */}
            <select
              value={nuevo.barbero}
              onChange={(e) => handleBarberoChange(e.target.value)}
              className="input"
            >
              <option value="">Seleccionar barbero</option>
              {barberos.map((b) => (
                <option key={b.id} value={b.nombre}>
                  {b.nombre}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={nuevo.fecha}
              onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
              className="input"
            />

            {/* 🔥 HORARIOS DINÁMICOS */}
            <select
              value={nuevo.hora}
              onChange={(e) =>
                setNuevo({ ...nuevo, hora: e.target.value })
              }
              className="input"
            >
              <option value="">Seleccionar hora</option>

              {horariosDisponibles.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

   <div className="col-span-full flex justify-end mt-2">
  <button
    onClick={async () => {
      if (!nuevo.fecha || !nuevo.hora || !nuevo.barbero) {
        mostrarToast("Completá todos los campos ⚠️", "error");
        return;
      }

      const disponible = await turnoDisponible(
        nuevo.fecha,
        nuevo.hora,
        nuevo.barbero
      );

      if (!disponible) {
        mostrarToast("Ese horario ya está ocupado ❌", "error");
        return;
      }

      try {
  const res = await fetch(`${API}/admin/crear-turno`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nuevo),
  });

  const data = await res.json();

  if (res.ok) {
    mostrarToast("Turno creado correctamente 💈", "success");

    traerTurnos();
    setNuevo({
      nombre: "",
      telefono: "",
      servicio: "",
      barbero: "",
      fecha: "",
      hora: "",
    });
  } else {
    mostrarToast(data.error || "Error al crear turno ❌", "error");
  }
} catch (error) {
  console.error("ERROR:", error);
  mostrarToast("Error de conexión ❌", "error");
}
    }}
    className="bg-blue-600 w-full md:w-auto md:px-8 py-2 rounded"
  >
    Crear
  </button>
</div>
          </div>
        </div>
      )}

      {/* BUSCAR */}
      <div className="mb-4">
        <h2 className="font-semibold mb-2">🔍 Buscar turnos</h2>

        <div className="flex gap-2">
          <input
            placeholder="Buscar cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="input w-full"
          />

          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* TABLA */}
<div className="border border-neutral-700">

  {/* 🔥 NUEVO CONTENEDOR */}
  <div className="table-container">

    <table className="w-full text-sm">

      <thead className="bg-neutral-800">
        <tr>
          <th className="p-2 text-left">Nombre</th>
          <th className="p-2 text-left">Teléfono</th>
          <th className="p-2 text-left">Servicio</th>
          <th className="p-2 text-left">Barbero</th>
          <th className="p-2 text-left">Fecha</th>
          <th className="p-2 text-left">Hora</th>
          <th className="p-2 text-left">Estado</th>
          {user.tipo === "admin" && (
            <th className="p-2 text-left">Acción</th>
          )}
        </tr>
      </thead>

      <tbody>
        {turnosFiltrados.map((t) => (
          <tr
  key={t.id}
  style={{
    backgroundColor: getRowColor(t.estado),
  }}
>
            <td className="p-2">{t.nombre}</td>
            <td className="p-2">{t.telefono}</td>
            <td className="p-2">{t.servicio}</td>
            <td className="p-2">{t.barbero}</td>
            <td className="p-2">{t.fecha}</td>
            <td className="p-2">{t.hora}</td>

<td className="p-2">
 <span
  onClick={() => {
    const orden = ["pendiente", "confirmado", "completado"];
    const actual = t.estado || "pendiente";
    const index = orden.indexOf(actual);
    const siguiente = orden[(index + 1) % orden.length];

    cambiarEstado(t.id, siguiente);
  }}
  style={{
    backgroundColor:
      t.estado === "pendiente"
        ? "#facc15"
        : t.estado === "confirmado"
        ? "#3b82f6"
        : t.estado === "completado"
        ? "#16a34a"
        : t.estado === "cancelado"
        ? "#dc2626"
        : "#6b7280",
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

            {user.tipo === "admin" && (
              <td className="p-2">
                <button
                  onClick={async () => {
                    await supabase.from("turnos").delete().eq("id", t.id);
                    traerTurnos();
                  }}
                  className="bg-red-600 px-2 rounded"
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
  );
}