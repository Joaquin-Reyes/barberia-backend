const { supabase } = require("../config/supabase");
const { notificarBarbero } = require("../services/whatsapp.service");
const { formatearHora } = require("../services/agenda.service");

async function crearTurno(req, res) {
  const { nombre, telefono, servicio, precio, barbero, fecha, hora } = req.body;

  console.log("🧪 Endpoint ADMIN crear turno");
  console.log("🧪 Barbero recibido desde panel:", barbero);

  const barberia_id = req.user.barberia_id;
  const horaNormalizada = formatearHora(hora);

  if (!nombre || !telefono || !servicio || !barbero || !fecha || !hora) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    const { data: turnosExistentes, error: errorBusqueda } = await supabase
      .from("turnos")
      .select("*")
      .eq("hora", horaNormalizada)
      .eq("barbero", barbero)
      .eq("fecha", fecha);

    if (errorBusqueda) {
      console.log("❌ Error verificando turnos:", errorBusqueda);
      return res.status(500).json({ error: "Error verificando disponibilidad" });
    }

    if (turnosExistentes.length > 0) {
      return res.status(400).json({ error: "Horario ocupado" });
    }

    const { error: errorInsert } = await supabase.from("turnos").insert([{
      nombre,
      telefono,
      servicio,
      precio: precio || 0,
      barbero,
      fecha,
      hora: horaNormalizada,
      barberia_id,
      recordatorio_24h: false,
      recordatorio_3h: false
    }]);

    if (errorInsert) {
      console.log("❌ Error creando turno:", errorInsert);
      return res.status(500).json({ error: "Error guardando" });
    }

    const { data: barberoData, error: errorBarbero } = await supabase
      .from("barberos")
      .select("telefono, nombre")
      .ilike("nombre", barbero)
      .eq("barberia_id", barberia_id)
      .maybeSingle();

    console.log("📱 Telefono barbero encontrado:", barberoData?.telefono);

    if (errorBarbero) {
      console.log("❌ Error obteniendo barbero:", errorBarbero);
    }

    console.log("🧪 Llamando a notificarBarbero desde ADMIN");

    await notificarBarbero({
      nombre,
      servicio,
      barbero,
      fecha,
      hora,
      telefono: barberoData?.telefono,
      barberia_id
    });

    res.json({ ok: true });

  } catch (err) {
    console.log("❌ Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function listarTurnos(req, res) {
  const { fecha } = req.query;

  let query = supabase.from("turnos").select("*");
  if (fecha) query = query.eq("fecha", fecha);

  const { data, error } = await query.order("hora", { ascending: true });
  if (error) return res.status(500).json({ error });
  res.json(data);
}

async function actualizarEstadoTurno(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  const { error } = await supabase
    .from("turnos")
    .update({ estado })
    .eq("id", id);

  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
}

async function eliminarTurno(req, res) {
  const { id } = req.params;

  const { error } = await supabase
    .from("turnos")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
}

async function updateTurnoEstado(req, res) {
  console.log("🔥 PUT /turnos funcionando");
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ error: "Falta estado" });
    }

    const { data, error } = await supabase
      .from("turnos")
      .update({ estado })
      .eq("id", id)
      .select();

    if (error) {
      console.error("❌ Error Supabase:", error);
      return res.status(500).json({ error });
    }

    return res.json(data);

  } catch (err) {
    console.error("💥 CRASH EN PUT:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}

async function crearBarbero(req, res) {
  const { nombre, telefono } = req.body;
  const barberia_id = req.user.barberia_id;

  if (!nombre || !telefono) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    // Formatear teléfono: si el admin pone solo el número local (ej: "1123456789"),
    // se le agrega el prefijo "549" automáticamente para WhatsApp
    const telefonoFormateado = telefono.startsWith("549")
      ? telefono
      : "549" + telefono;

    const { data, error } = await supabase
      .from("barberos")
      .insert({
        nombre,
        telefono: telefonoFormateado,
        barberia_id,
      })
      .select()
      .single();

    if (error) {
      console.log("❌ Error creando barbero:", error);
      return res.status(500).json({ error: "Error guardando barbero" });
    }

    res.json(data);
  } catch (err) {
    console.log("❌ Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function listarBarberos(req, res) {
  const barberia_id = req.user.barberia_id;

  const { data, error } = await supabase
    .from("barberos")
    .select("*")
    .eq("barberia_id", barberia_id);

  if (error) {
    console.log("❌ Error trayendo barberos:", error);
    return res.status(500).json({ error });
  }

  res.json(data);
}

module.exports = {
  crearTurno,
  listarTurnos,
  actualizarEstadoTurno,
  eliminarTurno,
  updateTurnoEstado,
  crearBarbero,
  listarBarberos
};
