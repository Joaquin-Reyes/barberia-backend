const { supabaseAdmin } = require("../config/supabase");
const { businessDate, isDateString, monthStart } = require("../utils/business-time");

function parseDate(value) {
  return isDateString(value) ? value : null;
}

function asMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function addToGroup(map, key, fallbackName, amount) {
  const current = map.get(key) || {
    id: key,
    nombre: fallbackName,
    total: 0,
    turnos: 0,
    pagos: 0,
    ticket_promedio: 0,
  };

  current.total += amount;
  current.turnos += 1;
  current.pagos += 1;
  current.ticket_promedio = current.turnos ? current.total / current.turnos : 0;
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

async function resumenDesdePagos(barberiaId, desde, hasta) {
  const { data: turnos, error: turnosError } = await supabaseAdmin
    .from("turnos")
    .select("id, fecha, precio, estado, barbero, servicio")
    .eq("barberia_id", barberiaId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (turnosError) return { ok: false, error: turnosError };
  if (!turnos?.length) return { ok: true, data: null };

  const turnoIds = turnos.map((turno) => turno.id).filter(Boolean);
  const turnosPorId = new Map(turnos.map((turno) => [turno.id, turno]));
  let data = [];

  if (turnoIds.length) {
    const { data: pagos, error } = await supabaseAdmin
      .from("pagos")
      .select("id, turno_id, monto, metodo, tipo, servicio, barbero, created_at")
      .eq("barberia_id", barberiaId)
      .is("anulado_at", null)
      .in("turno_id", turnoIds)
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error };
    data = pagos || [];
  }

  const porBarbero = new Map();
  const porServicio = new Map();
  const porMetodo = new Map();
  const porTipo = new Map();
  const porProducto = new Map();
  const porDia = new Map();
  let total = 0;

  const turnosConPagos = new Set();

  for (const pago of data) {
    const turno = turnosPorId.get(pago.turno_id);
    if (!turno) continue;
    turnosConPagos.add(pago.turno_id);
    const amount = asMoney(pago.monto);
    total += amount;
    addToGroup(porBarbero, pago.barbero || turno.barbero || "sin_barbero", pago.barbero || turno.barbero || "Sin barbero", amount);
    addToGroup(porServicio, pago.servicio || turno.servicio || "sin_servicio", pago.servicio || turno.servicio || "Sin servicio", amount);
    addToGroup(porMetodo, pago.metodo || "otro", pago.metodo || "otro", amount);
    addToGroup(porTipo, pago.tipo || "pago_total", pago.tipo || "pago_total", amount);
    addToGroup(porDia, turno.fecha || "sin_fecha", turno.fecha || "Sin fecha", amount);
  }

  let legacyCount = 0;
  const legacyTurnoIds = [];
  for (const turno of turnos) {
    if (turnosConPagos.has(turno.id)) continue;
    if (turno.estado !== "completado") continue;
    const amount = asMoney(turno.precio);
    if (amount <= 0) continue;

    legacyCount += 1;
    legacyTurnoIds.push(turno.id);
    total += amount;
    addToGroup(porBarbero, turno.barbero || "sin_barbero", turno.barbero || "Sin barbero", amount);
    addToGroup(porServicio, turno.servicio || "sin_servicio", turno.servicio || "Sin servicio", amount);
    addToGroup(porTipo, "pago_historico", "Pago historico", amount);
    addToGroup(porDia, turno.fecha || "sin_fecha", turno.fecha || "Sin fecha", amount);
  }

  if (!data.length && !legacyCount) return { ok: true, data: null };

  const barberos = sortedGroups(porBarbero);
  const servicios = sortedGroups(porServicio);
  let totalProductos = 0;
  try {
    const facturadosTurnoIds = [...new Set([...data.map((pago) => pago.turno_id), ...legacyTurnoIds])];
    const productos = await getProductosPorTurnos(barberiaId, facturadosTurnoIds);
    for (const item of productos) {
      const amount = asMoney(item.subtotal);
      totalProductos += amount;
      addToGroup(porProducto, item.producto_id || item.nombre || "sin_producto", item.nombre || "Sin producto", amount);
    }
  } catch {
    totalProductos = 0;
  }

  return {
    ok: true,
    data: {
      desde,
      hasta,
      total,
      turnos_completados: turnos.filter((turno) => turno.estado === "completado").length,
      pagos_count: data.length,
      pagos_historicos_count: legacyCount,
      ticket_promedio: (data.length + legacyCount) ? total / (data.length + legacyCount) : 0,
      total_productos: totalProductos,
      mejor_barbero: barberos[0] || null,
      mejor_servicio: servicios[0] || null,
      por_barbero: barberos,
      por_servicio: servicios,
      por_producto: sortedGroups(porProducto),
      por_metodo: sortedGroups(porMetodo),
      por_tipo: sortedGroups(porTipo),
      por_dia: Array.from(porDia.values()).sort((a, b) => a.id.localeCompare(b.id)),
      fuente: "pagos",
    },
  };
}

async function getResumenFacturacion(req, res) {
  const defaultHasta = businessDate();
  const defaultDesde = monthStart(defaultHasta);
  const desde = parseDate(req.query.desde) || defaultDesde;
  const hasta = parseDate(req.query.hasta) || defaultHasta;

  if (desde > hasta) {
    return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });
  }

  const pagos = await resumenDesdePagos(req.user.barberia_id, desde, hasta);
  if (!pagos.ok) return res.status(500).json({ error: pagos.error.message });
  if (pagos.data) return res.json(pagos.data);

  const { data, error } = await supabaseAdmin
    .from("turnos")
    .select("id, fecha, precio, estado, barbero, servicio")
    .eq("barberia_id", req.user.barberia_id)
    .eq("estado", "completado")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const porBarbero = new Map();
  const porServicio = new Map();
  const porDia = new Map();
  let total = 0;

  for (const turno of data || []) {
    const amount = asMoney(turno.precio);
    total += amount;
    addToGroup(porBarbero, turno.barbero || "sin_barbero", turno.barbero || "Sin barbero", amount);
    addToGroup(porServicio, turno.servicio || "sin_servicio", turno.servicio || "Sin servicio", amount);
    addToGroup(porDia, turno.fecha, turno.fecha, amount);
  }

  const totalTurnos = data?.length || 0;
  const barberos = sortedGroups(porBarbero);
  const servicios = sortedGroups(porServicio);

  res.json({
    desde,
    hasta,
    total,
    turnos_completados: totalTurnos,
    pagos_count: 0,
    ticket_promedio: totalTurnos ? total / totalTurnos : 0,
    mejor_barbero: barberos[0] || null,
    mejor_servicio: servicios[0] || null,
    por_barbero: barberos,
    por_servicio: servicios,
    por_dia: Array.from(porDia.values()).sort((a, b) => a.id.localeCompare(b.id)),
    fuente: "turnos",
  });
}

module.exports = { getResumenFacturacion };
