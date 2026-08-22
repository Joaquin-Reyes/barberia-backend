const { supabaseAdmin } = require("../config/supabase");
const { enviarMensaje, asyncLocalStorage } = require("./whatsapp.service");

// ==============================
// HELPERS
// ==============================

function formatearHora(hora) {
  if (!hora) return "10:00";
  const str = String(hora);
  if (str.includes(":")) return str.slice(0, 5);
  return `${str.padStart(2, "0")}:00`;
}

function generarSlots(hora_inicio, hora_fin) {
  const slots = [];
  let horaActual = formatearHora(hora_inicio);
  const horaFin = formatearHora(hora_fin);

  while (horaActual < horaFin) {
    slots.push(horaActual);

    const [h, m] = horaActual.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + 30);
    horaActual = d.toTimeString().slice(0, 5);
  }

  return slots;
}

async function filtrarOcupados(slots, barberoNombre, barberia_id, fecha) {
  const { data: turnos } = await supabaseAdmin
    .from("turnos")
    .select("hora")
    .eq("barbero", barberoNombre)
    .eq("fecha", fecha)
    .eq("barberia_id", barberia_id);

  const ocupados = (turnos || []).map(t => formatearHora(t.hora));
  return slots.filter(h => !ocupados.includes(h));
}

// ==============================
// TURNOS
// ==============================

async function guardarTurno(turno) {
  const { error } = await supabaseAdmin.from("turnos").insert([{
    ...turno,
    hora: formatearHora(turno.hora),
    barberia_id: turno.barberia_id,
    recordatorio_24h: false,
    recordatorio_3h: false
  }]);

  if (error) {
    console.log("❌ Error guardando:", JSON.stringify(error, null, 2));
    return false;
  }
  return true;
}

async function obtenerHorariosDisponibles(barberoNombre, barberia_id, fecha) {
  // 1. Obtener ID del barbero por nombre
  const { data: barberoData } = await supabaseAdmin
    .from("barberos")
    .select("id")
    .ilike("nombre", barberoNombre)
    .eq("barberia_id", barberia_id)
    .maybeSingle();

  if (!barberoData) {
    console.log("⚠️ Barbero no encontrado:", barberoNombre);
    return [];
  }

  const barbero_id = barberoData.id;

  // 2. Verificar excepción para esa fecha
  const { data: excepcion } = await supabaseAdmin
    .from("excepciones_barbero")
    .select("*")
    .eq("barbero_id", barbero_id)
    .eq("barberia_id", barberia_id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (excepcion) {
    if (!excepcion.trabaja) {
      console.log(`⚠️ ${barberoNombre} no trabaja el ${fecha} (excepción)`);
      return [];
    }
    // Trabaja con horario diferente al base
    if (excepcion.hora_inicio && excepcion.hora_fin) {
      const slots = generarSlots(excepcion.hora_inicio, excepcion.hora_fin);
      return await filtrarOcupados(slots, barberoNombre, barberia_id, fecha);
    }
  }

  // 3. Obtener horario base semanal
  // Usar T12:00:00 para evitar problemas de timezone al calcular el día
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();

  const { data: horario } = await supabaseAdmin
    .from("horarios_barbero")
    .select("hora_inicio, hora_fin")
    .eq("barbero_id", barbero_id)
    .eq("barberia_id", barberia_id)
    .eq("dia_semana", diaSemana)
    .maybeSingle();

  if (!horario) {
    console.log(`⚠️ ${barberoNombre} no trabaja los día ${diaSemana}`);
    return [];
  }

  // 4. Generar slots y filtrar ocupados
  const slots = generarSlots(horario.hora_inicio, horario.hora_fin);
  console.log("🧪 slots generados:", slots);

  return await filtrarOcupados(slots, barberoNombre, barberia_id, fecha);
}

async function eliminarTurno(id, barberia_id) {
  if (!barberia_id) {
    console.log("❌ eliminarTurno requiere barberia_id");
    return false;
  }

  const { error } = await supabaseAdmin
    .from("turnos")
    .delete()
    .eq("id", id)
    .eq("barberia_id", barberia_id);

  if (error) {
    console.log("❌ Error eliminando:", error);
    return false;
  }
  return true;
}

async function obtenerTurnos(telefono, barberia_id) {
  const { data, error } = await supabaseAdmin
    .from("turnos")
    .select("*")
    .eq("telefono", telefono)
    .eq("barberia_id", barberia_id)
    .order("fecha", { ascending: true });

  if (error) {
    console.log("❌ Error obteniendo turnos:", error);
    return [];
  }
  return data;
}

async function turnoDisponible(fecha, hora, barbero, barberia_id) {
  if (!barberia_id) {
    console.log("❌ turnoDisponible requiere barberia_id");
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("turnos")
    .select("*")
    .eq("hora", formatearHora(hora))
    .eq("barbero", barbero)
    .eq("fecha", fecha)
    .eq("barberia_id", barberia_id);

  if (error) {
    console.log("❌ Error verificando disponibilidad:", error);
    return false;
  }
  return data.length === 0;
}

// ==============================
// RECORDATORIOS
// ==============================

async function enviarRecordatorios() {
  const ahora = new Date();

  const { data, error } = await supabaseAdmin.from("turnos").select("*");

  if (error) {
    console.log("❌ Error recordatorios:", error);
    return;
  }

  // Cache por barberia_id: { phone_number_id, whatsapp_mode }
  const barberiaCache = {};

  async function getBarberiaInfo(barberia_id) {
    if (barberiaCache[barberia_id]) return barberiaCache[barberia_id];
    const { data: barberia } = await supabaseAdmin
      .from("barberias")
      .select("phone_number_id, whatsapp_mode")
      .eq("id", barberia_id)
      .single();
    barberiaCache[barberia_id] = {
      phone_number_id: barberia?.phone_number_id || null,
      whatsapp_mode: barberia?.whatsapp_mode || "cloud_api"
    };
    return barberiaCache[barberia_id];
  }

  async function enviarRecordatorio(turno, texto) {
    const { phone_number_id, whatsapp_mode } = await getBarberiaInfo(turno.barberia_id);

    if (whatsapp_mode === "wwebjs") {
      await asyncLocalStorage.run({ mode: "wwebjs", barberia_id: turno.barberia_id }, () =>
        enviarMensaje(turno.telefono, texto)
      );
      return;
    }

    // cloud_api
    if (!phone_number_id) {
      console.log("⚠️ Sin phone_number_id para barberia:", turno.barberia_id);
      return;
    }
    await enviarMensaje(turno.telefono, texto, phone_number_id);
  }

  for (const turno of data) {
    const fechaTurno = new Date(`${turno.fecha}T${turno.hora}-03:00`);
    const diferencia = fechaTurno - ahora;

    if (
      diferencia > 23 * 60 * 60 * 1000 &&
      diferencia < 25 * 60 * 60 * 1000 &&
      !turno.recordatorio_24h
    ) {
      const [y, m, d] = String(turno.fecha).split("-");
      const fechaFmt = `${d}/${m}/${y}`;
      const horaFmt = String(turno.hora).slice(0, 5);
      await enviarRecordatorio(
        turno,
        `⏰ *Recordatorio de turno*\n\n💈 Barbero: ${turno.barbero}\n📅 Mañana ${fechaFmt} a las ${horaFmt}\n\n¡Te esperamos! 🙌`
      );
      await supabaseAdmin
        .from("turnos")
        .update({ recordatorio_24h: true })
        .eq("id", turno.id)
        .eq("barberia_id", turno.barberia_id);
    }

    if (
      diferencia > 2 * 60 * 60 * 1000 &&
      diferencia < 4 * 60 * 60 * 1000 &&
      !turno.recordatorio_3h
    ) {
      const horaFmt3 = String(turno.hora).slice(0, 5);
      await enviarRecordatorio(
        turno,
        `🚨 *Tu turno es en 3 horas*\n\n💈 Barbero: ${turno.barbero}\n🕐 Hoy a las ${horaFmt3}\n\n¡No te lo olvides! ✂️`
      );
      await supabaseAdmin
        .from("turnos")
        .update({ recordatorio_3h: true })
        .eq("id", turno.id)
        .eq("barberia_id", turno.barberia_id);
    }
  }
}

async function obtenerServicios(barberia_id) {
  const { data, error } = await supabaseAdmin
    .from("servicios")
    .select("nombre, precio")
    .eq("barberia_id", barberia_id);
  if (error) return [];
  return data || [];
}

async function obtenerBarberosList(barberia_id) {
  const { data, error } = await supabaseAdmin
    .from("barberos")
    .select("nombre")
    .eq("barberia_id", barberia_id);
  if (error) return [];
  return data || [];
}

module.exports = {
  formatearHora,
  guardarTurno,
  obtenerHorariosDisponibles,
  eliminarTurno,
  obtenerTurnos,
  turnoDisponible,
  enviarRecordatorios,
  obtenerServicios,
  obtenerBarberosList
};
