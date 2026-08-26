const { supabaseAdmin } = require("../config/supabase");
const { isMissingColumnError, withoutField } = require("../utils/supabase-compat");

const APP_TIME_ZONE = "America/Argentina/Buenos_Aires";
const RANGOS_TURNOS = new Set(["hoy", "manana", "semana"]);

function fechaLocal(offsetDias = 0) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  const baseUtc = new Date(Date.UTC(Number(valores.year), Number(valores.month) - 1, Number(valores.day)));
  baseUtc.setUTCDate(baseUtc.getUTCDate() + offsetDias);
  return baseUtc.toISOString().slice(0, 10);
}

function horaLocal() {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function rangoFechas(rango = "hoy") {
  if (rango === "manana") {
    const manana = fechaLocal(1);
    return { desde: manana, hasta: manana };
  }

  if (rango === "semana") {
    return { desde: fechaLocal(0), hasta: fechaLocal(6) };
  }

  const hoy = fechaLocal(0);
  return { desde: hoy, hasta: hoy };
}

async function getTurnosBarbero(req, res) {
  const usuario_id = req.user.id;
  const barberia_id = req.user.barberia_id;
  const rango = RANGOS_TURNOS.has(req.query.rango) ? req.query.rango : "hoy";

  try {
    // 1. Buscar el registro de barbero vinculado al usuario logueado
    const { data: barbero, error: barberoError } = await supabaseAdmin
      .from("barberos")
      .select("id, nombre")
      .eq("usuario_id", usuario_id)
      .eq("barberia_id", barberia_id)
      .single();

    if (barberoError || !barbero) {
      return res.status(404).json({ error: "Barbero no encontrado para este usuario" });
    }

    const { desde, hasta } = rangoFechas(rango);

    let { data: turnos, error: turnosError } = await supabaseAdmin
      .from("turnos")
      .select("id, fecha, hora, nombre, servicio, estado")
      .eq("barberia_id", barberia_id)
      .or(`barbero_id.eq.${barbero.id},barbero.eq.${barbero.nombre}`)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });

    if (isMissingColumnError(turnosError, "barbero_id")) {
      console.log("⚠️ turnos.barbero_id no existe en DB; listando turnos por nombre de barbero");
      ({ data: turnos, error: turnosError } = await supabaseAdmin
        .from("turnos")
        .select("id, fecha, hora, nombre, servicio, estado")
        .eq("barberia_id", barberia_id)
        .eq("barbero", barbero.nombre)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true })
        .order("hora", { ascending: true }));
    }

    if (turnosError) {
      console.error("❌ Error obteniendo turnos:", turnosError);
      return res.status(500).json({ error: "Error obteniendo turnos" });
    }

    res.json({
      barbero_id: barbero.id,
      nombre: barbero.nombre,
      rango,
      desde,
      hasta,
      turnos: turnos || [],
    });
  } catch (err) {
    console.error("❌ Error en getTurnosBarbero:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function registrarAtencionCola(req, res) {
  const usuario_id = req.user.id;
  const barberia_id = req.user.barberia_id;
  const { nombre_cliente, servicio, precio } = req.body;

  if (!nombre_cliente) {
    return res.status(400).json({ error: "Falta nombre_cliente" });
  }

  try {
    const { data: barbero, error: barberoError } = await supabaseAdmin
      .from("barberos")
      .select("id, nombre")
      .eq("usuario_id", usuario_id)
      .eq("barberia_id", barberia_id)
      .single();

    if (barberoError || !barbero) {
      return res.status(404).json({ error: "Barbero no encontrado" });
    }

    const hoy = fechaLocal(0);
    const hora = horaLocal();

    const turnoInsert = {
      nombre: nombre_cliente,
      telefono: "",
      servicio: servicio || "Sin especificar",
      precio: Number(precio) || 0,
      barbero: barbero.nombre,
      barbero_id: barbero.id,
      fecha: hoy,
      hora,
      barberia_id,
      estado: "completado",
      recordatorio_24h: false,
      recordatorio_3h: false,
    };

    let { error } = await supabaseAdmin.from("turnos").insert(turnoInsert);

    if (isMissingColumnError(error, "barbero_id")) {
      console.log("⚠️ turnos.barbero_id no existe en DB; reintentando atención sin barbero_id");
      ({ error } = await supabaseAdmin
        .from("turnos")
        .insert(withoutField(turnoInsert, "barbero_id")));
    }

    if (error) {
      console.error("❌ Error registrando atención de cola:", error);
      return res.status(500).json({ error: "Error guardando" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error en registrarAtencionCola:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

module.exports = { getTurnosBarbero, registrarAtencionCola };
