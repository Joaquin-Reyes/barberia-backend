const { supabaseAdmin } = require("../config/supabase");

const CAMPOS_CONFIGURACION = ["nombre", "telefono_admin", "whatsapp_number"];
const CAMPOS_PROHIBIDOS = [
  "id",
  "barberia_id",
  "rol",
  "activo",
  "estado",
  "plan",
  "phone_number_id",
  "whatsapp_token",
  "whatsapp_mode",
  "created_at",
  "updated_at",
];

function limpiarTexto(value) {
  return String(value || "").trim();
}

async function actualizarConfiguracion(req, res) {
  const body = req.body || {};
  const barberia_id = req.user.barberia_id;

  if (CAMPOS_PROHIBIDOS.some((campo) => Object.prototype.hasOwnProperty.call(body, campo))) {
    return res.status(400).json({ error: "Campo no permitido" });
  }

  const cambios = {};
  for (const campo of CAMPOS_CONFIGURACION) {
    if (Object.prototype.hasOwnProperty.call(body, campo)) {
      cambios[campo] = limpiarTexto(body[campo]);
    }
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: "No hay campos validos para actualizar" });
  }

  if (Object.prototype.hasOwnProperty.call(cambios, "nombre") && !cambios.nombre) {
    return res.status(400).json({ error: "Nombre requerido" });
  }

  const { data, error } = await supabaseAdmin
    .from("barberias")
    .update(cambios)
    .eq("id", barberia_id)
    .select("*")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message || "Error actualizando barberia" });
  if (!data) return res.status(404).json({ error: "Barberia no encontrada" });
  res.json(data);
}

module.exports = {
  actualizarConfiguracion,
};
