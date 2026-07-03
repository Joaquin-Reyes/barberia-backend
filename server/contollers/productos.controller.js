const { supabaseAdmin } = require("../config/supabase");

function asMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getBarberiaId(req) {
  return req.user?.barberia_id;
}

async function listProductos(req, res) {
  const { data, error } = await supabaseAdmin
    .from("productos")
    .select("*")
    .eq("barberia_id", getBarberiaId(req))
    .order("nombre", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}

async function createProducto(req, res) {
  const { nombre, precio, costo, stock, stock_minimo, activo = true } = req.body || {};

  if (!nombre?.trim()) return res.status(400).json({ error: "nombre es requerido" });
  if (!Number.isFinite(Number(precio)) || Number(precio) < 0) {
    return res.status(400).json({ error: "precio debe ser mayor o igual a 0" });
  }

  const { data, error } = await supabaseAdmin
    .from("productos")
    .insert({
      barberia_id: getBarberiaId(req),
      nombre: nombre.trim(),
      precio: asMoney(precio),
      costo: costo === "" || costo == null ? null : asMoney(costo),
      stock: Number.isFinite(Number(stock)) ? Number(stock) : 0,
      stock_minimo: Number.isFinite(Number(stock_minimo)) ? Number(stock_minimo) : 0,
      activo: Boolean(activo),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}

async function updateProducto(req, res) {
  const { nombre, precio, costo, stock, stock_minimo, activo } = req.body || {};
  const cambios = {};

  if (nombre != null) {
    if (!String(nombre).trim()) return res.status(400).json({ error: "nombre es requerido" });
    cambios.nombre = String(nombre).trim();
  }
  if (precio != null) {
    if (!Number.isFinite(Number(precio)) || Number(precio) < 0) {
      return res.status(400).json({ error: "precio debe ser mayor o igual a 0" });
    }
    cambios.precio = asMoney(precio);
  }
  if (costo !== undefined) cambios.costo = costo === "" || costo == null ? null : asMoney(costo);
  if (stock !== undefined) cambios.stock = Number.isFinite(Number(stock)) ? Number(stock) : 0;
  if (stock_minimo !== undefined) cambios.stock_minimo = Number.isFinite(Number(stock_minimo)) ? Number(stock_minimo) : 0;
  if (activo !== undefined) cambios.activo = Boolean(activo);

  const { data, error } = await supabaseAdmin
    .from("productos")
    .update(cambios)
    .eq("id", req.params.id)
    .eq("barberia_id", getBarberiaId(req))
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(data);
}

async function deleteProducto(req, res) {
  const { error } = await supabaseAdmin
    .from("productos")
    .update({ activo: false })
    .eq("id", req.params.id)
    .eq("barberia_id", getBarberiaId(req));

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
}

module.exports = {
  createProducto,
  deleteProducto,
  listProductos,
  updateProducto,
};
