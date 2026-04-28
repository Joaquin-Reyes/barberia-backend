const { supabaseAdmin } = require("../config/supabase");

async function getTurnosBarbero(req, res) {
  const usuario_id = req.user.id;
  const barberia_id = req.user.barberia_id;

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

    // 2. Turnos de hoy filtrados por nombre del barbero
    const hoy = new Date().toISOString().split("T")[0];

    const { data: turnos, error: turnosError } = await supabaseAdmin
      .from("turnos")
      .select("id, hora, nombre, servicio, estado")
      .eq("barbero", barbero.nombre)
      .eq("fecha", hoy)
      .eq("barberia_id", barberia_id)
      .order("hora", { ascending: true });

    if (turnosError) {
      console.error("❌ Error obteniendo turnos:", turnosError);
      return res.status(500).json({ error: "Error obteniendo turnos" });
    }

    res.json({
      barbero_id: barbero.id,
      nombre: barbero.nombre,
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

    const hoy = new Date().toISOString().split("T")[0];
    const hora = new Date().toTimeString().slice(0, 5);

    const { error } = await supabaseAdmin.from("turnos").insert({
      nombre: nombre_cliente,
      telefono: "",
      servicio: servicio || "Sin especificar",
      precio: Number(precio) || 0,
      barbero: barbero.nombre,
      fecha: hoy,
      hora,
      barberia_id,
      estado: "completado",
      recordatorio_24h: false,
      recordatorio_3h: false,
    });

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
