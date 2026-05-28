const { supabaseAdmin } = require("../config/supabase");
const { enviarMensaje, asyncLocalStorage } = require("./whatsapp.service");

const sesiones = new Map();

function limpiarTelefono(valor) {
  return String(valor || "").replace("@c.us", "").replace(/\D/g, "");
}

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function crearSesion() {
  return {
    nombre: null,
    servicio: null,
    profesional: null,
    fecha_preferida: null,
    hora_preferida: null,
    notas: null,
    mensajes: [],
    estado: "inicio",
    solicitudGuardada: false
  };
}

function extraerHora(texto) {
  const match = String(texto || "").match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|hrs|horas)?\b/i);
  if (!match) return null;

  const hora = Number(match[1]);
  const minutos = match[2] ? Number(match[2]) : 0;
  if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) return null;

  return `${String(hora).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function extraerFechaPreferida(texto) {
  const normalizado = normalizarTexto(texto);
  const fechaNumerica = String(texto || "").match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (fechaNumerica) return fechaNumerica[0];

  const claves = ["hoy", "manana", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const clave = claves.find((item) => normalizado.includes(item));
  if (clave) return clave === "manana" ? "manana" : clave;

  if (normalizado.includes("tarde")) return "por la tarde";
  if (normalizado.includes("manana")) return "manana";
  return null;
}

function extraerDatosLibres(texto, sesion, barberia) {
  const normalizado = normalizarTexto(texto);

  if (!sesion.nombre) {
    const nombreMatch = String(texto || "").match(/\b(?:soy|me llamo|mi nombre es)\s+([a-zA-Z\u00C0-\u017F\s]{2,40})/i);
    if (nombreMatch) sesion.nombre = nombreMatch[1].trim();
  }

  if (!sesion.hora_preferida) {
    sesion.hora_preferida = extraerHora(texto);
  }

  if (!sesion.fecha_preferida) {
    sesion.fecha_preferida = extraerFechaPreferida(texto);
  }

  if (!sesion.servicio) {
    const servicios = barberia.servicios || [];
    const servicioDetectado = servicios.find((servicio) => normalizado.includes(normalizarTexto(servicio.nombre)));
    if (servicioDetectado) sesion.servicio = servicioDetectado.nombre;
  }

  if (!sesion.profesional) {
    const profesionales = barberia.barberos || [];
    const profesionalDetectado = profesionales.find((barbero) => normalizado.includes(normalizarTexto(barbero.nombre)));
    if (profesionalDetectado) sesion.profesional = profesionalDetectado.nombre;
  }
}

function siguientePregunta(sesion) {
  if (!sesion.nombre) return "Hola! Soy la recepcion automatica. Para dejarte la solicitud lista, decime tu nombre y apellido.";
  if (!sesion.servicio) return `Gracias ${sesion.nombre}. Que servicio queres hacerte?`;
  if (!sesion.fecha_preferida) return "Para que dia te gustaria el turno?";
  if (!sesion.hora_preferida) return "En que horario preferis venir?";
  return null;
}

function resumenSolicitud(sesion) {
  const partes = [
    `Cliente: ${sesion.nombre || "Sin nombre"}`,
    `Servicio: ${sesion.servicio || "Sin servicio"}`,
    `Profesional: ${sesion.profesional || "Sin preferencia"}`,
    `Fecha preferida: ${sesion.fecha_preferida || "Sin fecha"}`,
    `Hora preferida: ${sesion.hora_preferida || "Sin hora"}`
  ];
  if (sesion.notas) partes.push(`Notas: ${sesion.notas}`);
  return partes.join("\n");
}

async function obtenerDatosBarberia(barberia_id) {
  const [{ data: barberia }, { data: servicios }, { data: barberos }] = await Promise.all([
    supabaseAdmin.from("barberias").select("id, nombre, whatsapp_mode").eq("id", barberia_id).single(),
    supabaseAdmin.from("servicios").select("nombre").eq("barberia_id", barberia_id),
    supabaseAdmin.from("barberos").select("nombre").eq("barberia_id", barberia_id)
  ]);

  return {
    ...(barberia || { id: barberia_id, nombre: "la barberia", whatsapp_mode: "wwebjs" }),
    servicios: servicios || [],
    barberos: barberos || []
  };
}

async function guardarSolicitud({ barberia_id, telefono, sesion }) {
  const resumen = resumenSolicitud(sesion);
  const payload = {
    barberia_id,
    telefono,
    nombre: sesion.nombre,
    servicio: sesion.servicio,
    profesional: sesion.profesional,
    fecha_preferida: sesion.fecha_preferida,
    hora_preferida: sesion.hora_preferida,
    notas: sesion.notas,
    resumen,
    mensajes: sesion.mensajes,
    estado: "pendiente",
    updated_at: new Date().toISOString()
  };

  const { data: existente } = await supabaseAdmin
    .from("solicitudes_whatsapp")
    .select("id")
    .eq("barberia_id", barberia_id)
    .eq("telefono", telefono)
    .in("estado", ["pendiente", "en_revision"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente?.id) {
    const { error } = await supabaseAdmin
      .from("solicitudes_whatsapp")
      .update(payload)
      .eq("id", existente.id);
    if (error) throw error;
    return existente.id;
  }

  const { data, error } = await supabaseAdmin
    .from("solicitudes_whatsapp")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function procesarRecepcionWhatsapp({ barberia_id, from, text }) {
  const telefono = limpiarTelefono(from);
  const userKey = `${barberia_id}_${telefono}`;
  const barberia = await obtenerDatosBarberia(barberia_id);
  const sesion = sesiones.get(userKey) || crearSesion();
  const mensaje = String(text || "").trim();

  sesion.mensajes.push({
    from: "cliente",
    text: mensaje,
    at: new Date().toISOString()
  });

  extraerDatosLibres(mensaje, sesion, barberia);

  if (sesion.estado === "inicio") {
    sesion.estado = "recopilando";
  } else if (!sesion.nombre) {
    sesion.nombre = mensaje;
  } else if (!sesion.servicio) {
    sesion.servicio = mensaje;
  } else if (!sesion.fecha_preferida) {
    sesion.fecha_preferida = mensaje;
  } else if (!sesion.hora_preferida) {
    sesion.hora_preferida = extraerHora(mensaje) || mensaje;
  } else if (!sesion.notas && mensaje.length > 2) {
    sesion.notas = mensaje;
  }

  const pregunta = siguientePregunta(sesion);
  sesiones.set(userKey, sesion);

  return asyncLocalStorage.run({ barberia_id, mode: "wwebjs" }, async () => {
    if (pregunta) {
      await enviarMensaje(telefono, pregunta);
      return { completed: false };
    }

    await guardarSolicitud({ barberia_id, telefono, sesion });
    sesion.solicitudGuardada = true;
    sesiones.set(userKey, sesion);

    await enviarMensaje(
      telefono,
      `Perfecto ${sesion.nombre}. Dejo tu solicitud preparada:\n\n${resumenSolicitud(sesion)}\n\nUna persona del local revisa disponibilidad y te confirma el turno.`
    );

    return { completed: true };
  });
}

module.exports = {
  procesarRecepcionWhatsapp
};
