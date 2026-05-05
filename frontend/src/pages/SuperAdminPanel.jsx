import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Crown, Plus, Store } from "lucide-react";
import { getAuthToken } from "../lib/supabase";

const API = "https://barberia-backend-production-7dae.up.railway.app";

export default function SuperAdminPanel({ user, onLogout }) {
  const [barberias, setBarberias] = useState([]);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [configurando, setConfigurando] = useState(null); // id de la barbería que se está configurando
  const [whatsappForm, setWhatsappForm] = useState({
    whatsapp_mode: "cloud_api",
    phone_number_id: "",
    whatsapp_token: "",
    whatsapp_number: "",
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    traerBarberias();
  }, []);

  async function traerBarberias() {
    const token = await getAuthToken();
    const res = await fetch(`${API}/superadmin/barberias`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      console.error("Error trayendo barberias:", data);
      mostrarToast(data.error || "Error trayendo barberias", "error");
      return;
    }
    setBarberias(data || []);
  }

async function crearBarberia() {
  if (!nombre || !email) return;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${API}/superadmin/crear-barberia`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nombre, email }),
    });
    const data = await res.json();
    if (res.ok) {
      setNombre("");
      setEmail("");
      traerBarberias();
      mostrarToast("Barbería creada");
    } else {
      mostrarToast(data.error || "Error al crear", "error");
    }
  } catch (err) {
    mostrarToast("Error de conexión", "error");
  }
}

  async function toggleActiva(barberia) {
    const token = await getAuthToken();
    const res = await fetch(`${API}/superadmin/barberias/${barberia.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ activo: !barberia.activo }),
    });
    if (res.ok) traerBarberias();
    else mostrarToast("Error al cambiar estado", "error");
  }

  async function guardarWhatsapp(id) {
    const token = await getAuthToken();
    const res = await fetch(`${API}/superadmin/barberias/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        whatsapp_mode: whatsappForm.whatsapp_mode,
        phone_number_id: whatsappForm.phone_number_id,
        whatsapp_token: whatsappForm.whatsapp_token,
        whatsapp_number: whatsappForm.whatsapp_number,
      }),
    });

    if (res.ok) {
      mostrarToast("WhatsApp configurado");
      setConfigurando(null);
      setWhatsappForm({ whatsapp_mode: "cloud_api", phone_number_id: "", whatsapp_token: "", whatsapp_number: "" });
      traerBarberias();
    } else {
      mostrarToast("Error al guardar", "error");
    }
  }

  const mostrarToast = (mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">

      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown size={22} />
            Panel SuperAdmin
          </h1>
          <p className="text-sm text-neutral-400">{user.email} · {user.rol}</p>
        </div>
        <button onClick={onLogout} className="bg-neutral-800 px-4 py-1 rounded">
          Cerrar sesión
        </button>
      </div>

      {/* CREAR BARBERÍA */}
      <div className="mb-6 bg-neutral-900 p-4 rounded-xl">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus size={18} />
          Crear barbería + admin
        </h2>
        <div className="flex flex-col gap-3">
          <input
            placeholder="Nombre de la barbería"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input"
          />
          <input
            placeholder="Email del admin"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />

          <p className="text-xs text-neutral-400">
            El dueño recibirá un email para establecer su contraseña.
          </p>

          <button onClick={crearBarberia} className="bg-blue-600 py-2 rounded">
            Crear barbería
          </button>
        </div>
      </div>

      {/* LISTA DE BARBERÍAS */}
      <div className="bg-neutral-900 p-4 rounded-xl">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Store size={18} />
          Barberías
        </h2>
        <div className="space-y-3">
          {barberias.map((b) => (
            <div key={b.id} className="bg-neutral-800 p-3 rounded">

              {/* FILA PRINCIPAL */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{b.nombre}</p>
                  <p className="text-xs text-neutral-400">{b.id}</p>
                  {b.whatsapp_mode && (
                    <p className="text-xs text-blue-400 mt-1">
                      Modo: {b.whatsapp_mode === "wwebjs" ? "QR (wwebjs)" : b.whatsapp_mode}
                    </p>
                  )}
                  {b.whatsapp_number && (
                    <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                      <CheckCircle size={12} />
                      WhatsApp: {b.whatsapp_number}
                    </p>
                  )}
                  {!b.whatsapp_number && (
                    <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      WhatsApp no configurado
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (configurando === b.id) {
                        setConfigurando(null);
                      } else {
                        setConfigurando(b.id);
                        setWhatsappForm({
                          whatsapp_mode: b.whatsapp_mode === "wwebjs" ? "cloud_api" : (b.whatsapp_mode || "cloud_api"),
                          phone_number_id: b.phone_number_id || "",
                          whatsapp_token: b.whatsapp_token || "",
                          whatsapp_number: b.whatsapp_number || "",
                        });
                      }
                    }}
                    className="bg-neutral-600 px-3 py-1 rounded text-sm"
                  >
                    {configurando === b.id ? "Cerrar" : "WhatsApp"}
                  </button>
                  <button
                    onClick={() => toggleActiva(b)}
                    className={`px-3 py-1 rounded text-sm ${b.activo ? "bg-green-600" : "bg-red-600"}`}
                  >
                    {b.activo ? "Activa" : "Inactiva"}
                  </button>
                </div>
              </div>

              {/* FORMULARIO WHATSAPP INLINE */}
              {configurando === b.id && (
                <div className="mt-3 pt-3 border-t border-neutral-700 flex flex-col gap-2">
                  <p className="text-sm text-neutral-400 mb-1">Configuración WhatsApp</p>
                  <select
                    value={whatsappForm.whatsapp_mode}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, whatsapp_mode: e.target.value })}
                    className="input bg-neutral-700 text-white"
                  >
                    <option value="wwebjs" disabled>QR (whatsapp-web.js) - deshabilitado</option>
                    <option value="cloud_api">Cloud API (Meta)</option>
                  </select>
                  <input
                    placeholder="Phone Number ID"
                    value={whatsappForm.phone_number_id}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, phone_number_id: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="WhatsApp Token"
                    value={whatsappForm.whatsapp_token}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, whatsapp_token: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Número WhatsApp (ej: 5491112345678)"
                    value={whatsappForm.whatsapp_number}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, whatsapp_number: e.target.value })}
                    className="input"
                  />
                  <button
                    onClick={() => guardarWhatsapp(b.id)}
                    className="bg-green-600 py-2 rounded text-sm"
                  >
                    Guardar configuración
                  </button>
                </div>
              )}

            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
