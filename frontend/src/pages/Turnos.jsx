import { useState } from "react";

export default function Turnos() {
  const [turnos, setTurnos] = useState([
    {
      id: 1,
      nombre: "Joaquin",
      telefono: "123",
      servicio: "Corte",
      barbero: "Agus",
      fecha: "2026-03-27",
      hora: "10:00",
    },
    {
      id: 2,
      nombre: "Lucas",
      telefono: "456",
      servicio: "Barba",
      barbero: "Mateo",
      fecha: "2026-03-27",
      hora: "11:00",
    },
  ]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">

      {/* HEADER */}
      <h1 className="text-3xl font-bold mb-6">📅 Panel de Turnos</h1>

      {/* CREAR TURNO */}
      <div className="bg-neutral-900 p-4 rounded-2xl mb-6 shadow-lg">
        <h2 className="text-lg mb-3 font-semibold">➕ Crear turno</h2>

        <div className="grid grid-cols-6 gap-2">
          <input
            className="bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
            placeholder="Nombre"
          />
          <input
            className="bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
            placeholder="Teléfono"
          />
          <input
            className="bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
            placeholder="Servicio"
          />
          <input
            className="bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
            placeholder="Barbero"
          />
          <input
            type="date"
            className="bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
          />
          <input
            className="bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
            placeholder="Hora"
          />

          <button className="col-span-6 bg-blue-600 hover:bg-blue-700 py-2 rounded-xl">
            Crear
          </button>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="bg-neutral-900 p-4 rounded-2xl mb-4">
        <h2 className="mb-2">🔍 Buscar turnos</h2>
        <input
          className="w-full bg-neutral-800 border border-neutral-700 p-2 rounded-xl text-white"
          placeholder="Buscar..."
        />
      </div>

      {/* TABLA */}
      <div className="bg-neutral-900 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 text-left">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">Servicio</th>
              <th className="p-3">Barbero</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Hora</th>
              <th className="p-3">Acción</th>
            </tr>
          </thead>

          <tbody>
            {turnos.map((t) => (
              <tr
                key={t.id}
                className="border-t border-neutral-800 hover:bg-neutral-800 transition"
              >
                <td className="p-3">{t.nombre}</td>
                <td className="p-3">{t.telefono}</td>
                <td className="p-3">{t.servicio}</td>
                <td className="p-3">{t.barbero}</td>
                <td className="p-3">{t.fecha}</td>
                <td className="p-3">{t.hora}</td>
                <td className="p-3">
                  <button
                    onClick={() =>
                      setTurnos(turnos.filter((x) => x.id !== t.id))
                    }
                    className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg"
                  >
                    ✖
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}