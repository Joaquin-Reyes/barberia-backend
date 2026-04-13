const {
  agregarCliente,
  terminarYAsignarSiguiente,
  obtenerEstadoCola,
} = require("../services/cola.service");

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
