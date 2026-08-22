const { supabaseAdmin } = require("../config/supabase");

function asPrecio(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validarServicio({ nombre, precio }, parcial = false) {
  if ((!parcial || nombre !== undefined) && !String(nombre || "").trim()) {
    return "nombre es requerido";
  }

  if (!parcial || precio !== undefined) {
    const parsed = asPrecio(precio);
    if (parsed == null || parsed < 0) return "precio debe ser mayor o igual a 0";
  }

  return null;
}

async function listServicios(req, res) {
  const { data, error } = await supabaseAdmin
    .from("servicios")
    .select("*")
    .eq("barberia_id", req.user.barberia_id)
    .order("nombre", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}

async function createServicio(req, res) {
  const { nombre, precio } = req.body || {};
  const validation = validarServicio({ nombre, precio });
  if (validation) return res.status(400).json({ error: validation });

  const { data, error } = await supabaseAdmin
    .from("servicios")
    .insert({
      barberia_id: req.user.barberia_id,
      nombre: String(nombre).trim(),
      precio: asPrecio(precio),
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}

async function updateServicio(req, res) {
  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, "barberia_id")) {
    return res.status(400).json({ error: "Campo no permitido" });
  }

  const validation = validarServicio(body, true);
  if (validation) return res.status(400).json({ error: validation });

  const cambios = {};
  if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim();
  if (body.precio !== undefined) cambios.precio = asPrecio(body.precio);

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: "No hay campos validos para actualizar" });
  }

  const { data, error } = await supabaseAdmin
    .from("servicios")
    .update(cambios)
    .eq("id", req.params.id)
    .eq("barberia_id", req.user.barberia_id)
    .select("*")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Servicio no encontrado" });
  res.json(data);
}

async function deleteServicio(req, res) {
  const { error } = await supabaseAdmin
    .from("servicios")
    .delete()
    .eq("id", req.params.id)
    .eq("barberia_id", req.user.barberia_id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
}

module.exports = {
  createServicio,
  deleteServicio,
  listServicios,
  updateServicio,
};
