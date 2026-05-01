const {
  agregarCliente,
  terminarYAsignarSiguiente,
  obtenerEstadoCola,
} = require("../services/cola.service");
const { supabaseAdmin } = require("../config/supabase");

async function agregarClienteCola(req, res) {
  const { barberia_id, nombre_cliente } = req.body;

  if (!barberia_id || !nombre_cliente) {
    return res.status(400).json({ error: "Faltan datos: barberia_id y nombre_cliente son requeridos" });
  }

  const result = await agregarCliente(barberia_id, nombre_cliente);

  if (!result.ok) {
    return res.status(500).json({ error: "Error agregando cliente a la cola" });
  }

  return res.status(201).json(result.data);
}

async function terminarAtencion(req, res) {
  const { barbero_id } = req.params;

  if (!barbero_id) {
    return res.status(400).json({ error: "Falta barbero_id" });
  }

  const { data: barbero, error } = await supabaseAdmin
    .from("barberos")
    .select("id, usuario_id")
    .eq("id", barbero_id)
    .eq("barberia_id", req.user.barberia_id)
    .maybeSingle();

  if (error) {
    console.error("Error validando barbero:", error);
    return res.status(500).json({ error: "Error validando permisos" });
  }

  if (!barbero) {
    return res.status(404).json({ error: "Barbero no encontrado" });
  }

  if (req.user?.rol === "barbero" && barbero.usuario_id !== req.user.id) {
    return res.status(403).json({ error: "No podés operar sobre otro barbero" });
  }

  const result = await terminarYAsignarSiguiente(barbero_id);

  if (!result.ok) {
    return res.status(500).json({ error: "Error procesando fin de atención" });
  }

  return res.json(result.data);
}

async function obtenerCola(req, res) {
  const { barberia_id } = req.params;

  if (!barberia_id) {
    return res.status(400).json({ error: "Falta barberia_id" });
  }

  const result = await obtenerEstadoCola(barberia_id);

  if (!result.ok) {
    return res.status(500).json({ error: "Error obteniendo estado de la cola" });
  }

  return res.json(result.data);
}

module.exports = {
  agregarClienteCola,
  terminarAtencion,
  obtenerCola,
};
