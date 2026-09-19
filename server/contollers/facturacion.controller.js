const { supabaseAdmin } = require("../config/supabase");
const { randomBytes } = require("node:crypto");
const { businessDate, isDateString, monthStart } = require("../utils/business-time");

function createPerfLogger(res, operation, endpoint) {
  let id = "unknown";
  let startedAt = null;
  let queries = 0;

  try {
    id = randomBytes(2).toString("hex");
  } catch {}

  try {
    startedAt = process.hrtime.bigint();
  } catch {}

  const elapsedMs = (since) => {
    try {
      if (since === null) return null;
      const duration = Number(process.hrtime.bigint() - since) / 1e6;
      return Number.isFinite(duration) ? duration : null;
    } catch {
      return null;
    }
  };
  const formatMs = (duration) => {
    try {
      return duration === null ? "unknown" : duration.toFixed(1);
    } catch {
      return "unknown";
    }
  };
  const log = (label, duration) => {
    try {
      console.log(`[PERF] id=${id} ${operation} ${label}=${formatMs(duration)}ms`);
    } catch {}
  };

  try {
    if (typeof res.once === "function") {
      res.once("finish", () => {
        try {
          console.log(
            `[PERF] id=${id} ${operation} endpoint=${endpoint} total=${formatMs(elapsedMs(startedAt))}ms queries=${queries}`
          );
        } catch {}
      });
    }
  } catch {}

  return {
    async measure(label, work, queryCount = 0) {
      let stepStartedAt = null;
      try {
        stepStartedAt = process.hrtime.bigint();
        queries += queryCount;
      } catch {}
      try {
        return await work();
      } finally {
        log(label, elapsedMs(stepStartedAt));
      }
    },
    measureSync(label, work) {
      let stepStartedAt = null;
      try {
        stepStartedAt = process.hrtime.bigint();
      } catch {}
      try {
        return work();
      } finally {
        log(label, elapsedMs(stepStartedAt));
      }
    },
  };
}

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

async function resumenDesdePagos(barberiaId, desde, hasta, perf) {
  const { data: turnos, error: turnosError } = await perf.measure(
    "turnos",
    () => supabaseAdmin
      .from("turnos")
      .select("id, fecha, precio, estado, barbero, servicio")
      .eq("barberia_id", barberiaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true }),
    1
  );

  if (turnosError) return { ok: false, error: turnosError };
  if (!turnos?.length) return { ok: true, data: null };

  const turnoIds = turnos.map((turno) => turno.id).filter(Boolean);
  const turnosPorId = new Map(turnos.map((turno) => [turno.id, turno]));
  let data = [];

  if (turnoIds.length) {
    const { data: pagos, error } = await perf.measure(
      "pagos",
      () => supabaseAdmin
        .from("pagos")
        .select("id, turno_id, monto, metodo, tipo, servicio, barbero, created_at")
        .eq("barberia_id", barberiaId)
        .is("anulado_at", null)
        .in("turno_id", turnoIds)
        .order("created_at", { ascending: true }),
      1
    );

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

  let legacyCount = 0;
  const legacyTurnoIds = [];
  perf.measureSync("agruparResumen", () => {
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
  });

  if (!data.length && !legacyCount) return { ok: true, data: null };

  const barberos = sortedGroups(porBarbero);
  const servicios = sortedGroups(porServicio);
  let totalProductos = 0;
  try {
    const facturadosTurnoIds = [...new Set([...data.map((pago) => pago.turno_id), ...legacyTurnoIds])];
    const productos = await perf.measure(
      "productos",
      () => getProductosPorTurnos(barberiaId, facturadosTurnoIds),
      facturadosTurnoIds.length ? 1 : 0
    );
    perf.measureSync("agruparProductos", () => {
      for (const item of productos) {
        const amount = asMoney(item.subtotal);
        totalProductos += amount;
        addToGroup(porProducto, item.producto_id || item.nombre || "sin_producto", item.nombre || "Sin producto", amount);
      }
    });
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
  const perf = createPerfLogger(res, "resumenFacturacion", "GET /api/facturacion/resumen");
  const defaultHasta = businessDate();
  const defaultDesde = monthStart(defaultHasta);
  const desde = parseDate(req.query.desde) || defaultDesde;
  const hasta = parseDate(req.query.hasta) || defaultHasta;

  if (desde > hasta) {
    return res.status(400).json({ error: "La fecha desde no puede ser mayor a la fecha hasta" });
  }

  const pagos = await perf.measure(
    "armarResumenPagos",
    () => resumenDesdePagos(req.user.barberia_id, desde, hasta, perf)
  );
  if (!pagos.ok) return res.status(500).json({ error: pagos.error.message });
  if (pagos.data) return res.json(pagos.data);

  const { data, error } = await perf.measure(
    "turnosCompletadosFallback",
    () => supabaseAdmin
      .from("turnos")
      .select("id, fecha, precio, estado, barbero, servicio")
      .eq("barberia_id", req.user.barberia_id)
      .eq("estado", "completado")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true }),
    1
  );

  if (error) return res.status(500).json({ error: error.message });

  const porBarbero = new Map();
  const porServicio = new Map();
  const porDia = new Map();
  let total = 0;

  perf.measureSync("agruparFallback", () => {
    for (const turno of data || []) {
      const amount = asMoney(turno.precio);
      total += amount;
      addToGroup(porBarbero, turno.barbero || "sin_barbero", turno.barbero || "Sin barbero", amount);
      addToGroup(porServicio, turno.servicio || "sin_servicio", turno.servicio || "Sin servicio", amount);
      addToGroup(porDia, turno.fecha, turno.fecha, amount);
    }
  });

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
