const { supabaseAdmin } = require("../config/supabase");
const { businessDate, businessDateRangeUtc, isDateString } = require("../utils/business-time");

const METODOS = ["efectivo", "transferencia", "mercado_pago", "tarjeta", "otro"];
const TIPOS = ["sena", "pago_total", "parcial", "ajuste"];

function parseDate(value) {
  return isDateString(value) ? value : null;
}

function asMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getBarberiaId(req) {
  return req.user?.barberia_id;
}

function addToGroup(map, key, fallbackName, amount) {
  const current = map.get(key) || {
    id: key,
    nombre: fallbackName,
    total: 0,
    pagos: 0,
    ticket_promedio: 0,
  };

  current.total += amount;
  current.pagos += 1;
  current.turnos = current.pagos;
  current.ticket_promedio = current.pagos ? current.total / current.pagos : 0;
  map.set(key, current);
}

function sortedGroups(map) {
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

async function getProductosPorTurnos(barberiaId, turnoIds = []) {
  const ids = [...new Set(turnoIds.filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await supabaseAdmin
    .from("turno_productos")
    .select("turno_id, producto_id, nombre, cantidad, subtotal")
    .eq("barberia_id", barberiaId)
    .in("turno_id", ids);

  if (error) throw error;
  return data || [];
}

function dateRangeFromQuery(query) {
  const defaultDesde = businessDate();
  const defaultHasta = defaultDesde;
  return {
    desde: parseDate(query.desde) || defaultDesde,
    hasta: parseDate(query.hasta) || defaultHasta,
  };
}

async function getTurnoDeBarberia(req, turnoId) {
  let query = supabaseAdmin
    .from("turnos")
    .select("id, barberia_id, nombre, servicio, barbero, precio, estado, fecha")
    .eq("id", turnoId)
    .eq("barberia_id", getBarberiaId(req));

  if (req.user?.rol === "barbero") query = query.eq("barbero", req.user.nombre);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function getProductosTurno(turnoId, barberiaId) {
  const { data, error } = await supabaseAdmin
    .from("turno_productos")
    .select("id, producto_id, nombre, precio_unitario, cantidad, subtotal, created_at")
    .eq("barberia_id", barberiaId)
    .eq("turno_id", turnoId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function tieneCierreCaja(barberiaId, fecha) {
  const { data, error } = await supabaseAdmin
    .from("cierres_caja")
    .select("id")
    .eq("barberia_id", barberiaId)
    .is("anulado_at", null)
    .lte("fecha_desde", fecha)
    .gte("fecha_hasta", fecha)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

function getEstadoPago(precio, totalPagado, pagos) {
  const activos = pagos.filter((p) => !p.anulado_at);
  if (totalPagado <= 0) return "sin_pagar";
  if (precio > 0 && totalPagado >= precio) return "pagado";
  if (activos.some((p) => p.tipo === "sena")) return "sena";
  return "parcial";
}

function buildResumenPagoTurno(turno, totalProductos, pagos = [], options = {}) {
  const totalCobrable = asMoney(turno.precio) + asMoney(totalProductos);
  const activos = pagos.filter((p) => !p.anulado_at);
  const totalPagadoReal = activos.reduce((sum, pago) => sum + asMoney(pago.monto), 0);
  const pagoHistorico = Boolean(options.legacyCompletados)
    && activos.length === 0
    && turno.estado === "completado"
    && totalCobrable > 0;
  const totalPagado = pagoHistorico ? totalCobrable : totalPagadoReal;

  return {
    total_servicio: asMoney(turno.precio),
    total_productos: asMoney(totalProductos),
    total_cobrable: totalCobrable,
    total_pagado: totalPagado,
    saldo: Math.max(totalCobrable - totalPagado, 0),
    estado_pago: pagoHistorico ? "pagado" : getEstadoPago(totalCobrable, totalPagado, pagos),
    pago_historico: pagoHistorico,
  };
}

async function getPagosTurno(req, res) {
  const turno = await getTurnoDeBarberia(req, req.params.turno_id);
  if (!turno) return res.status(404).json({ error: "Turno no encontrado" });

  const { data, error } = await supabaseAdmin
    .from("pagos")
    .select("*")
    .eq("barberia_id", getBarberiaId(req))
    .eq("turno_id", turno.id)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const pagos = data || [];
  const productos = await getProductosTurno(turno.id, getBarberiaId(req));
  const totalProductos = productos.reduce((sum, item) => sum + asMoney(item.subtotal), 0);
  const resumenPago = buildResumenPagoTurno(turno, totalProductos, pagos, {
    legacyCompletados: req.query.legacyCompletados === "1",
  });

  res.json({
    pagos,
    productos,
    ...resumenPago,
  });
}

async function listTurnosParaCobrar(req, res) {
  const { desde, hasta } = dateRangeFromQuery(req.query);
  if (desde > hasta) return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });

  let query = supabaseAdmin
    .from("turnos")
    .select("id, fecha, hora, nombre, servicio, barbero, precio, estado")
    .eq("barberia_id", getBarberiaId(req))
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false });

  if (req.query.todos !== "1") query = query.eq("estado", "completado");

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const ids = (data || []).map((turno) => turno.id);
  const pagosPorTurno = new Map();
  const productosPorTurno = new Map();
  if (ids.length) {
    const { data: pagos, error: pagosError } = await supabaseAdmin
      .from("pagos")
      .select("turno_id, monto")
      .eq("barberia_id", getBarberiaId(req))
      .in("turno_id", ids)
      .is("anulado_at", null);

    if (pagosError) return res.status(500).json({ error: pagosError.message });
    for (const pago of pagos || []) {
      pagosPorTurno.set(pago.turno_id, (pagosPorTurno.get(pago.turno_id) || 0) + asMoney(pago.monto));
    }

    const { data: productos, error: productosError } = await supabaseAdmin
      .from("turno_productos")
      .select("turno_id, subtotal")
      .eq("barberia_id", getBarberiaId(req))
      .in("turno_id", ids);

    if (productosError) return res.status(500).json({ error: productosError.message });
    for (const item of productos || []) {
      productosPorTurno.set(item.turno_id, (productosPorTurno.get(item.turno_id) || 0) + asMoney(item.subtotal));
    }
  }

  res.json((data || []).map((turno) => {
    const totalProductos = productosPorTurno.get(turno.id) || 0;
    const totalPagado = pagosPorTurno.get(turno.id) || 0;
    const pagos = totalPagado > 0 ? [{ monto: totalPagado }] : [];
    const resumenPago = buildResumenPagoTurno(turno, totalProductos, pagos, {
      legacyCompletados: req.query.legacyCompletados === "1",
    });

    return {
      ...turno,
      ...resumenPago,
    };
  }));
}

async function createPago(req, res) {
  const { turno_id, monto, metodo = "efectivo", tipo = "pago_total", nota } = req.body;

  if (!turno_id) return res.status(400).json({ error: "turno_id es requerido" });
  if (!Number.isFinite(Number(monto)) || Number(monto) <= 0) {
    return res.status(400).json({ error: "monto debe ser mayor a 0" });
  }
  if (!METODOS.includes(metodo)) return res.status(400).json({ error: "metodo invalido" });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: "tipo invalido" });

  const turno = await getTurnoDeBarberia(req, turno_id);
  if (!turno) return res.status(404).json({ error: "Turno no encontrado" });

  const fechaPago = businessDate();
  if (await tieneCierreCaja(getBarberiaId(req), fechaPago)) {
    return res.status(409).json({ error: "La caja de hoy ya está cerrada. Anulá el cierre antes de registrar otro pago." });
  }

  const { data, error } = await supabaseAdmin
    .from("pagos")
    .insert({
      barberia_id: getBarberiaId(req),
      turno_id: turno.id,
      cliente_nombre: turno.nombre || null,
      servicio: turno.servicio || null,
      barbero: turno.barbero || null,
      monto: Number(monto),
      metodo,
      tipo,
      nota: nota?.trim() || null,
      creado_por: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}

async function addProductoTurno(req, res) {
  const { turno_id, producto_id, cantidad = 1 } = req.body || {};
  const qty = Number(cantidad);

  if (!turno_id) return res.status(400).json({ error: "turno_id es requerido" });
  if (!producto_id) return res.status(400).json({ error: "producto_id es requerido" });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "cantidad debe ser mayor a 0" });

  const turno = await getTurnoDeBarberia(req, turno_id);
  if (!turno) return res.status(404).json({ error: "Turno no encontrado" });

  const fechaPago = businessDate();
  if (await tieneCierreCaja(getBarberiaId(req), fechaPago)) {
    return res.status(409).json({ error: "La caja de hoy ya está cerrada. Anulá el cierre antes de agregar productos." });
  }

  const { data: producto, error: productoError } = await supabaseAdmin
    .from("productos")
    .select("*")
    .eq("id", producto_id)
    .eq("barberia_id", getBarberiaId(req))
    .eq("activo", true)
    .maybeSingle();

  if (productoError) return res.status(500).json({ error: productoError.message });
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  if (Number(producto.stock || 0) < qty) return res.status(400).json({ error: "Stock insuficiente" });

  const subtotal = asMoney(producto.precio) * qty;
  const { data, error } = await supabaseAdmin
    .from("turno_productos")
    .insert({
      barberia_id: getBarberiaId(req),
      turno_id: turno.id,
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_unitario: asMoney(producto.precio),
      cantidad: qty,
      subtotal,
      creado_por: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin
    .from("productos")
    .update({ stock: Number(producto.stock || 0) - qty })
    .eq("id", producto.id)
    .eq("barberia_id", getBarberiaId(req));

  res.status(201).json(data);
}

async function removeProductoTurno(req, res) {
  const { data: item, error: itemError } = await supabaseAdmin
    .from("turno_productos")
    .select("*")
    .eq("id", req.params.item_id)
    .eq("barberia_id", getBarberiaId(req))
    .maybeSingle();

  if (itemError) return res.status(500).json({ error: itemError.message });
  if (!item) return res.status(404).json({ error: "Producto del turno no encontrado" });

  const fechaPago = businessDate();
  if (await tieneCierreCaja(getBarberiaId(req), fechaPago)) {
    return res.status(409).json({ error: "La caja de hoy ya está cerrada. Anulá el cierre antes de quitar productos." });
  }

  const { error } = await supabaseAdmin
    .from("turno_productos")
    .delete()
    .eq("id", item.id)
    .eq("barberia_id", getBarberiaId(req));

  if (error) return res.status(500).json({ error: error.message });

  const { data: producto } = await supabaseAdmin
    .from("productos")
    .select("stock")
    .eq("id", item.producto_id)
    .eq("barberia_id", getBarberiaId(req))
    .maybeSingle();

  if (producto) {
    await supabaseAdmin
      .from("productos")
      .update({ stock: Number(producto.stock || 0) + Number(item.cantidad || 0) })
      .eq("id", item.producto_id)
      .eq("barberia_id", getBarberiaId(req));
  }

  res.status(204).send();
}

async function anularPago(req, res) {
  const { id } = req.params;
  const { motivo } = req.body || {};

  const { data: pagoExistente, error: pagoError } = await supabaseAdmin
    .from("pagos")
    .select("id, created_at")
    .eq("id", id)
    .eq("barberia_id", getBarberiaId(req))
    .is("anulado_at", null)
    .maybeSingle();

  if (pagoError) return res.status(500).json({ error: pagoError.message });
  if (!pagoExistente) return res.status(404).json({ error: "Pago no encontrado" });

  const fechaPago = businessDate(pagoExistente.created_at);
  if (fechaPago && await tieneCierreCaja(getBarberiaId(req), fechaPago)) {
    return res.status(409).json({ error: "La caja de ese pago ya está cerrada. Anulá el cierre antes de anular el pago." });
  }

  const { data, error } = await supabaseAdmin
    .from("pagos")
    .update({
      anulado_at: new Date().toISOString(),
      anulado_motivo: motivo?.trim() || null,
      anulado_por: req.user.id,
    })
    .eq("id", id)
    .eq("barberia_id", getBarberiaId(req))
    .is("anulado_at", null)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Pago no encontrado" });
  res.json(data);
}

async function buildResumenCaja(req, desde, hasta) {
  const range = businessDateRangeUtc(desde, hasta);

  const { data, error } = await supabaseAdmin
    .from("pagos")
    .select("id, monto, metodo, tipo, created_at, cliente_nombre, servicio, barbero, turno_id")
    .eq("barberia_id", getBarberiaId(req))
    .is("anulado_at", null)
    .gte("created_at", range.start)
    .lt("created_at", range.endExclusive)
    .order("created_at", { ascending: true });

  if (error) return { error };

  const porMetodo = new Map();
  const porTipo = new Map();
  const porBarbero = new Map();
  const porServicio = new Map();
  const porProducto = new Map();
  const porDia = new Map();
  let total = 0;

  for (const pago of data || []) {
    const amount = asMoney(pago.monto);
    total += amount;
    addToGroup(porMetodo, pago.metodo || "otro", pago.metodo || "otro", amount);
    addToGroup(porTipo, pago.tipo || "pago_total", pago.tipo || "pago_total", amount);
    addToGroup(porBarbero, pago.barbero || "sin_barbero", pago.barbero || "Sin barbero", amount);
    addToGroup(porServicio, pago.servicio || "sin_servicio", pago.servicio || "Sin servicio", amount);
    const dia = businessDate(pago.created_at) || "sin_fecha";
    addToGroup(porDia, dia, dia, amount);
  }

  let totalProductos = 0;
  try {
    const productos = await getProductosPorTurnos(getBarberiaId(req), (data || []).map((pago) => pago.turno_id));
    for (const item of productos) {
      const amount = asMoney(item.subtotal);
      totalProductos += amount;
      addToGroup(porProducto, item.producto_id || item.nombre || "sin_producto", item.nombre || "Sin producto", amount);
    }
  } catch {
    totalProductos = 0;
  }

  return {
    resumen: {
      fuente: "pagos",
      desde,
      hasta,
      total,
      pagos_count: data?.length || 0,
      ticket_promedio: data?.length ? total / data.length : 0,
      total_productos: totalProductos,
      por_metodo: sortedGroups(porMetodo),
      por_tipo: sortedGroups(porTipo),
      por_barbero: sortedGroups(porBarbero),
      por_servicio: sortedGroups(porServicio),
      por_producto: sortedGroups(porProducto),
      por_dia: Array.from(porDia.values()).sort((a, b) => a.id.localeCompare(b.id)),
      pagos: data || [],
    },
  };
}

async function getResumenCaja(req, res) {
  const { desde, hasta } = dateRangeFromQuery(req.query);
  if (desde > hasta) return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });

  const { resumen, error } = await buildResumenCaja(req, desde, hasta);
  if (error) return res.status(500).json({ error: error.message });
  res.json(resumen);
}

function buildControlCaja(porMetodo, conteoMetodo = {}) {
  const control = porMetodo.map((row) => {
    const esperado = asMoney(row.total);
    const contado = asMoney(conteoMetodo[row.id]);
    return {
      id: row.id,
      nombre: row.nombre,
      esperado,
      contado,
      diferencia: contado - esperado,
    };
  });

  return {
    control,
    diferenciaTotal: control.reduce((sum, row) => sum + row.diferencia, 0),
  };
}

async function listCierresCaja(req, res) {
  const hasDesde = Boolean(req.query.desde);
  const hasHasta = Boolean(req.query.hasta);
  const { desde, hasta } = dateRangeFromQuery(req.query);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  if ((hasDesde || hasHasta) && desde > hasta) {
    return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });
  }

  let query = supabaseAdmin
    .from("cierres_caja")
    .select("*")
    .eq("barberia_id", getBarberiaId(req))
    .is("anulado_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (hasDesde || hasHasta) query = query.gte("fecha_desde", desde).lte("fecha_hasta", hasta);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}

async function createCierreCaja(req, res) {
  const fechaDesde = parseDate(req.body?.fecha_desde);
  const fechaHasta = parseDate(req.body?.fecha_hasta);
  const nota = req.body?.nota?.trim() || null;
  const conteoMetodo = req.body?.conteo_metodo && typeof req.body.conteo_metodo === "object"
    ? req.body.conteo_metodo
    : {};

  if (!fechaDesde || !fechaHasta) return res.status(400).json({ error: "fecha_desde y fecha_hasta son requeridas" });
  if (fechaDesde > fechaHasta) return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });

  const { resumen, error: resumenError } = await buildResumenCaja(req, fechaDesde, fechaHasta);
  if (resumenError) return res.status(500).json({ error: resumenError.message });

  const { control, diferenciaTotal } = buildControlCaja(resumen.por_metodo, conteoMetodo);

  const { data, error } = await supabaseAdmin
    .from("cierres_caja")
    .insert({
      barberia_id: getBarberiaId(req),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      total: resumen.total,
      pagos_count: resumen.pagos_count,
      por_metodo: resumen.por_metodo,
      por_tipo: resumen.por_tipo,
      conteo_metodo: control,
      diferencias_metodo: control,
      diferencia_total: diferenciaTotal,
      nota,
      cerrado_por: req.user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ya existe un cierre para ese periodo" });
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
}

async function anularCierreCaja(req, res) {
  const { data, error } = await supabaseAdmin
    .from("cierres_caja")
    .update({
      anulado_at: new Date().toISOString(),
      anulado_por: req.user.id,
      anulado_motivo: req.body?.motivo?.trim() || null,
    })
    .eq("id", req.params.id)
    .eq("barberia_id", getBarberiaId(req))
    .is("anulado_at", null)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Cierre no encontrado" });
  res.json(data);
}

module.exports = {
  anularCierreCaja,
  anularPago,
  addProductoTurno,
  createCierreCaja,
  createPago,
  getPagosTurno,
  getResumenCaja,
  listCierresCaja,
  listTurnosParaCobrar,
  removeProductoTurno,
};
