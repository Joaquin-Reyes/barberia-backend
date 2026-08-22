const {
  agregarCliente,
  terminarYAsignarSiguiente,
  obtenerEstadoCola,
} = require("../services/cola.service");
const { supabaseAdmin } = require("../config/supabase");

async function agregarClienteCola(req, res) {
  const body = req.body || {};
  const camposPermitidos = ["barberia_id", "nombre_cliente"];
  const camposExtra = Object.keys(body).filter((campo) => !camposPermitidos.includes(campo));
  const { barberia_id } = body;
  const nombre_cliente = String(body.nombre_cliente || "").trim();

  if (!barberia_id || !nombre_cliente) {
    return res.status(400).json({ error: "Faltan datos: barberia_id y nombre_cliente son requeridos" });
  }

  if (camposExtra.length > 0) {
    return res.status(400).json({ error: "Campos no permitidos" });
  }

  if (nombre_cliente.length < 2 || nombre_cliente.length > 80) {
    return res.status(400).json({ error: "Nombre de cliente invalido" });
  }

  const { data: barberia, error: barberiaError } = await supabaseAdmin
    .from("barberias")
    .select("id, activo")
    .eq("id", barberia_id)
    .maybeSingle();

  if (barberiaError) {
    console.error("Error validando barberia:", barberiaError);
    return res.status(500).json({ error: "Error validando barberia" });
  }

  if (!barberia || barberia.activo === false) {
    return res.status(404).json({ error: "Barberia no encontrada" });
  }

  const result = await agregarCliente(barberia.id, nombre_cliente);

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

  if (req.user.rol !== "superadmin" && barberia_id !== req.user.barberia_id) {
    return res.status(404).json({ error: "Cola no encontrada" });
  }

  const tenantBarberiaId = req.user.rol === "superadmin" ? barberia_id : req.user.barberia_id;
  const result = await obtenerEstadoCola(tenantBarberiaId);

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
