const { supabaseAdmin } = require("../config/supabase");
const { businessDate, businessDateRangeUtc, isDateString, monthStart } = require("../utils/business-time");

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

async function resumenDesdePagos(barberiaId, desde, hasta) {
  const range = businessDateRangeUtc(desde, hasta);
  const { data, error } = await supabaseAdmin
    .from("pagos")
    .select("id, monto, metodo, tipo, servicio, barbero, created_at")
    .eq("barberia_id", barberiaId)
    .is("anulado_at", null)
    .gte("created_at", range.start)
    .lt("created_at", range.endExclusive)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error };
  if (!data?.length) return { ok: true, data: null };

  const porBarbero = new Map();
  const porServicio = new Map();
  const porMetodo = new Map();
  const porTipo = new Map();
  const porDia = new Map();
  let total = 0;

  for (const pago of data) {
    const amount = asMoney(pago.monto);
    total += amount;
    addToGroup(porBarbero, pago.barbero || "sin_barbero", pago.barbero || "Sin barbero", amount);
    addToGroup(porServicio, pago.servicio || "sin_servicio", pago.servicio || "Sin servicio", amount);
    addToGroup(porMetodo, pago.metodo || "otro", pago.metodo || "otro", amount);
    addToGroup(porTipo, pago.tipo || "pago_total", pago.tipo || "pago_total", amount);
    const dia = businessDate(pago.created_at) || "sin_fecha";
    addToGroup(porDia, dia, dia, amount);
  }

  const barberos = sortedGroups(porBarbero);
  const servicios = sortedGroups(porServicio);

  return {
    ok: true,
    data: {
      desde,
      hasta,
      total,
      turnos_completados: data.length,
      pagos_count: data.length,
      ticket_promedio: data.length ? total / data.length : 0,
      mejor_barbero: barberos[0] || null,
      mejor_servicio: servicios[0] || null,
      por_barbero: barberos,
      por_servicio: servicios,
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
