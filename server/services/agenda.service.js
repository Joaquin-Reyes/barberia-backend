const { supabaseAdmin } = require("../config/supabase");
const { enviarMensaje } = require("./whatsapp.service");

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

  while (true) {
    slots.push(horaActual);
    if (horaActual >= horaFin) break;

    const [h, m] = horaActual.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + 60);
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

async function eliminarTurno(id) {
  const { error } = await supabaseAdmin
    .from("turnos")
    .delete()
    .eq("id", id);

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

async function turnoDisponible(fecha, hora, barbero) {
  const { data, error } = await supabaseAdmin
    .from("turnos")
    .select("*")
    .eq("hora", formatearHora(hora))
    .eq("barbero", barbero)
    .eq("fecha", fecha);

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

  // Cache de phone_number_id por barberia_id para no repetir queries
  const phoneNumberIdCache = {};

  async function getPhoneNumberId(barberia_id) {
    if (phoneNumberIdCache[barberia_id]) return phoneNumberIdCache[barberia_id];
    const { data: barberia } = await supabaseAdmin
      .from("barberias")
      .select("phone_number_id")
      .eq("id", barberia_id)
      .single();
    phoneNumberIdCache[barberia_id] = barberia?.phone_number_id || null;
    return phoneNumberIdCache[barberia_id];
  }

  for (const turno of data) {
    const fechaTurno = new Date(`${turno.fecha}T${turno.hora}`);
    const diferencia = fechaTurno - ahora;

    if (
      diferencia > 23 * 60 * 60 * 1000 &&
      diferencia < 25 * 60 * 60 * 1000 &&
      !turno.recordatorio_24h
    ) {
      const phone_number_id = await getPhoneNumberId(turno.barberia_id);
      if (!phone_number_id) {
        console.log("⚠️ Sin phone_number_id para barberia:", turno.barberia_id);
      } else {
        await enviarMensaje(
          turno.telefono,
          `⏰ Recordatorio de turno (mañana)

📅 ${turno.fecha}
⏰ ${turno.hora}
💈 ${turno.barbero}

Te esperamos! 🔥`,
          phone_number_id
        );
      }

      await supabaseAdmin
        .from("turnos")
        .update({ recordatorio_24h: true })
        .eq("id", turno.id);
    }

    if (
      diferencia > 2 * 60 * 60 * 1000 &&
      diferencia < 4 * 60 * 60 * 1000 &&
      !turno.recordatorio_3h
    ) {
      const phone_number_id = await getPhoneNumberId(turno.barberia_id);
      if (!phone_number_id) {
        console.log("⚠️ Sin phone_number_id para barberia:", turno.barberia_id);
      } else {
        await enviarMensaje(
          turno.telefono,
          `🔥 Tu turno es en pocas horas

📅 ${turno.fecha}
⏰ ${turno.hora}
💈 ${turno.barbero}

¡No te lo olvides! 💈`,
          phone_number_id
        );
      }

      await supabaseAdmin
        .from("turnos")
        .update({ recordatorio_3h: true })
        .eq("id", turno.id);
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
