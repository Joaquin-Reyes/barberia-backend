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

async function getTotalPagadoTurno(turnoId, barberiaId) {
  const { data, error } = await supabaseAdmin
    .from("pagos")
    .select("monto")
    .eq("barberia_id", barberiaId)
    .eq("turno_id", turnoId)
    .is("anulado_at", null);

  if (error) throw error;
  return (data || []).reduce((sum, pago) => sum + asMoney(pago.monto), 0);
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

function pagoSuperaSaldo({ tipo, precio, totalPagado, monto }) {
  if (tipo === "ajuste") return false;
  const precioNumber = asMoney(precio);
  if (precioNumber <= 0) return false;
  return asMoney(totalPagado) + asMoney(monto) > precioNumber;
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
  const totalPagado = pagos.filter((p) => !p.anulado_at).reduce((sum, pago) => sum + asMoney(pago.monto), 0);
  const precio = asMoney(turno.precio);

  res.json({
    pagos,
    total_pagado: totalPagado,
    saldo: Math.max(precio - totalPagado, 0),
    estado_pago: getEstadoPago(precio, totalPagado, pagos),
  });
}

async function listTurnosParaCobrar(req, res) {
  const { desde, hasta } = dateRangeFromQuery(req.query);
  if (desde > hasta) return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });

  const { data, error } = await supabaseAdmin
    .from("turnos")
    .select("id, fecha, hora, nombre, servicio, barbero, precio, estado")
    .eq("barberia_id", getBarberiaId(req))
    .eq("estado", "completado")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const ids = (data || []).map((turno) => turno.id);
  const pagosPorTurno = new Map();
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
  }

  res.json((data || []).map((turno) => {
    const totalPagado = pagosPorTurno.get(turno.id) || 0;
    const precio = asMoney(turno.precio);
    return {
      ...turno,
      total_pagado: totalPagado,
      saldo: Math.max(precio - totalPagado, 0),
      estado_pago: totalPagado <= 0 ? "sin_pagar" : totalPagado >= precio ? "pagado" : "parcial",
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

  const totalPagado = await getTotalPagadoTurno(turno.id, getBarberiaId(req));
  const precio = asMoney(turno.precio);
  if (pagoSuperaSaldo({ tipo, precio, totalPagado, monto })) {
    return res.status(400).json({
      error: "El pago supera el saldo pendiente",
      detalle: `Saldo pendiente: ${Math.max(precio - totalPagado, 0)}`,
    });
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

  return {
    resumen: {
      fuente: "pagos",
      desde,
      hasta,
      total,
      pagos_count: data?.length || 0,
      ticket_promedio: data?.length ? total / data.length : 0,
      por_metodo: sortedGroups(porMetodo),
      por_tipo: sortedGroups(porTipo),
      por_barbero: sortedGroups(porBarbero),
      por_servicio: sortedGroups(porServicio),
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
  createCierreCaja,
  createPago,
  getPagosTurno,
  getResumenCaja,
  listCierresCaja,
  listTurnosParaCobrar,
  pagoSuperaSaldo,
};
