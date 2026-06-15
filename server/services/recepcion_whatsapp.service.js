const { supabaseAdmin } = require("../config/supabase");
const { enviarMensaje, asyncLocalStorage } = require("./whatsapp.service");
const { obtenerHorariosDisponibles, formatearHora } = require("./agenda.service");

const sesiones = new Map();

function limpiarTelefono(valor) {
  return String(valor || "").replace("@c.us", "").replace(/\D/g, "");
}

function resolverDestinoWhatsapp(valor) {
  const texto = String(valor || "");
  return texto.includes("@") ? texto : limpiarTelefono(texto);
}

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tieneIntencionTurno(texto) {
  const normalizado = normalizarTexto(texto);
  return [
    "turno",
    "cita",
    "reserv",
    "horario",
    "agenda",
    "atender",
    "corte",
    "barba",
    "pestana",
    "lifting",
    "unas",
    "cejas"
  ].some((clave) => normalizado.includes(clave));
}

function crearSesion() {
  return {
    nombre: null,
    servicio: null,
    profesional: null,
    fecha_preferida: null,
    hora_preferida: null,
    horaPendiente: null,
    opcionesDisponibles: [],
    disponibilidadValidada: false,
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

function fechaISOArgentina(fecha = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(fecha);
}

function sumarDias(fecha, dias) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function resolverFechaPreferida(texto) {
  const normalizado = normalizarTexto(texto);
  const hoy = new Date(`${fechaISOArgentina()}T12:00:00-03:00`);

  if (normalizado.includes("hoy")) return fechaISOArgentina(hoy);
  if (normalizado.includes("manana")) return fechaISOArgentina(sumarDias(hoy, 1));

  const dias = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
  };
  const diaPedido = Object.keys(dias).find((dia) => normalizado.includes(dia));
  if (diaPedido) {
    const actual = hoy.getDay();
    let distancia = (dias[diaPedido] - actual + 7) % 7;
    if (distancia === 0) distancia = 7;
    return fechaISOArgentina(sumarDias(hoy, distancia));
  }

  const fechaNumerica = String(texto || "").match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!fechaNumerica) return null;

  const dia = Number(fechaNumerica[1]);
  const mes = Number(fechaNumerica[2]);
  let anio = fechaNumerica[3] ? Number(fechaNumerica[3]) : hoy.getFullYear();
  if (anio < 100) anio += 2000;

  let fecha = new Date(`${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T12:00:00-03:00`);
  if (Number.isNaN(fecha.getTime())) return null;
  if (!fechaNumerica[3] && fecha < hoy) {
    fecha = new Date(`${anio + 1}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T12:00:00-03:00`);
  }

  return fechaISOArgentina(fecha);
}

function extraerDatosLibres(texto, sesion, barberia) {
  const normalizado = normalizarTexto(texto);

  if (!sesion.nombre) {
    const nombreMatch = String(texto || "").match(/\b(?:soy|me llamo|mi nombre es)\s+([a-zA-Z\u00C0-\u017F\s]{2,40})/i);
    if (nombreMatch) sesion.nombre = nombreMatch[1].trim();
  }

  if (!sesion.hora_preferida && !(sesion.opcionesDisponibles || []).length) {
    sesion.hora_preferida = extraerHora(texto);
  }

  if (!sesion.fecha_preferida) {
    sesion.fecha_preferida = resolverFechaPreferida(texto);
  }

  if (!sesion.servicio) {
    const servicios = barberia.servicios || [];
    const servicioDetectado = detectarServicio(texto, servicios);
    if (servicioDetectado) sesion.servicio = servicioDetectado.nombre;
  }

  if (!sesion.profesional) {
    const profesionales = barberia.barberos || [];
    const profesionalDetectado = profesionales.find((barbero) => normalizado.includes(normalizarTexto(barbero.nombre)));
    if (profesionalDetectado) sesion.profesional = profesionalDetectado.nombre;
  }
}

function detectarServicio(texto, servicios) {
  const normalizado = normalizarTexto(texto);
  if (!normalizado) return null;

  return (servicios || []).find((servicio) => {
    const nombre = normalizarTexto(servicio.nombre);
    return normalizado.includes(nombre) || nombre.includes(normalizado);
  }) || null;
}

function listarServicios(barberia) {
  const nombres = (barberia.servicios || []).map((servicio) => servicio.nombre).filter(Boolean);
  if (nombres.length === 0) return "";
  return nombres.join(", ");
}

function resetearDisponibilidad(sesion) {
  sesion.hora_preferida = null;
  sesion.horaPendiente = null;
  sesion.opcionesDisponibles = [];
  sesion.disponibilidadValidada = false;
}

function siguientePregunta(sesion) {
  if (!sesion.nombre) return "Hola! Soy la recepcion automatica. Para dejarte la solicitud lista, decime tu nombre y apellido.";
  if (!sesion.servicio) return `Gracias ${sesion.nombre}. Que servicio queres hacerte?`;
  if (!sesion.fecha_preferida) return "Para que dia te gustaria el turno?";
  if (!sesion.hora_preferida) return null;
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
    supabaseAdmin.from("servicios").select("nombre, precio").eq("barberia_id", barberia_id),
    supabaseAdmin.from("barberos").select("id, nombre").eq("barberia_id", barberia_id)
  ]);

  return {
    ...(barberia || { id: barberia_id, nombre: "la barberia", whatsapp_mode: "wwebjs" }),
    servicios: servicios || [],
    barberos: barberos || []
  };
}

async function obtenerOpcionesDisponibles({ barberia_id, fecha, profesional }) {
  const { data: barberos, error } = await supabaseAdmin
    .from("barberos")
    .select("nombre")
    .eq("barberia_id", barberia_id)
    .order("nombre", { ascending: true });

  if (error) throw error;

  const candidatos = (barberos || [])
    .map((barbero) => barbero.nombre)
    .filter((nombre) => !profesional || normalizarTexto(nombre).includes(normalizarTexto(profesional)));

  const opcionesPorBarbero = await Promise.all(
    candidatos.map(async (nombre) => ({
      barbero: nombre,
      horarios: await obtenerHorariosDisponibles(nombre, barberia_id, fecha)
    }))
  );

  return opcionesPorBarbero
    .flatMap(({ barbero, horarios }) => horarios.map((hora) => ({ barbero, hora: formatearHora(hora) })))
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.barbero.localeCompare(b.barbero));
}

function formatearOpcionesDisponibles(opciones) {
  const agrupadas = opciones.reduce((acc, opcion) => {
    if (!acc[opcion.barbero]) acc[opcion.barbero] = [];
    acc[opcion.barbero].push(opcion.hora);
    return acc;
  }, {});

  return Object.entries(agrupadas)
    .map(([barbero, horarios]) => `*${barbero}*: ${horarios.slice(0, 8).join(", ")}${horarios.length > 8 ? "..." : ""}`)
    .join("\n");
}

function elegirOpcionDisponible(mensaje, opciones) {
  const hora = extraerHora(mensaje);
  if (!hora) return null;

  const normalizado = normalizarTexto(mensaje);
  const porHora = opciones.filter((opcion) => opcion.hora === hora);
  if (porHora.length === 0) return null;

  const porBarbero = porHora.find((opcion) => normalizado.includes(normalizarTexto(opcion.barbero)));
  return porBarbero || (porHora.length === 1 ? porHora[0] : null);
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
  if (error?.code === "23505") {
    const { data: repetida } = await supabaseAdmin
      .from("solicitudes_whatsapp")
      .select("id")
      .eq("barberia_id", barberia_id)
      .eq("telefono", telefono)
      .in("estado", ["pendiente", "en_revision"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (repetida?.id) {
      await supabaseAdmin
        .from("solicitudes_whatsapp")
        .update(payload)
        .eq("id", repetida.id);
      return repetida.id;
    }
  }
  if (error) throw error;
  return data.id;
}

async function procesarRecepcionWhatsapp({ barberia_id, from, text }) {
  const telefono = limpiarTelefono(from);
  if (!telefono) return { ignored: true, reason: "telefono_vacio" };

  const userKey = `${barberia_id}_${telefono}`;
  const barberia = await obtenerDatosBarberia(barberia_id);
  const sesion = sesiones.get(userKey) || crearSesion();
  const mensaje = String(text || "").trim();

  if (sesion.estado === "inicio" && !tieneIntencionTurno(mensaje)) {
    return { ignored: true, reason: "sin_intencion_turno" };
  }

  sesion.mensajes.push({
    from: "cliente",
    text: mensaje,
    at: new Date().toISOString()
  });

  const fechaDetectadaEnMensaje = resolverFechaPreferida(mensaje);
  if (fechaDetectadaEnMensaje && fechaDetectadaEnMensaje !== sesion.fecha_preferida) {
    sesion.fecha_preferida = fechaDetectadaEnMensaje;
    resetearDisponibilidad(sesion);
  }

  extraerDatosLibres(mensaje, sesion, barberia);
  let aclaracionDisponibilidad = null;

  if (sesion.estado === "inicio") {
    sesion.estado = "recopilando";
  } else if (!sesion.nombre) {
    sesion.nombre = mensaje;
  } else if (!sesion.servicio) {
    const servicioDetectado = detectarServicio(mensaje, barberia.servicios || []);
    if (servicioDetectado) {
      sesion.servicio = servicioDetectado.nombre;
    } else {
      aclaracionDisponibilidad = `No llegue a identificar el servicio. Decime uno de estos: ${listarServicios(barberia)}.`;
    }
  } else if (!sesion.fecha_preferida) {
    sesion.fecha_preferida = resolverFechaPreferida(mensaje);
  } else if (!sesion.hora_preferida) {
    const opcionElegida = elegirOpcionDisponible(mensaje, sesion.opcionesDisponibles || []);
    if (opcionElegida) {
      sesion.profesional = opcionElegida.barbero;
      sesion.hora_preferida = opcionElegida.hora;
      sesion.horaPendiente = null;
      sesion.disponibilidadValidada = true;
    } else {
      const horaDetectada = extraerHora(mensaje);
      const opcionPorBarberoPendiente = !horaDetectada && sesion.horaPendiente
        ? (sesion.opcionesDisponibles || []).find((opcion) =>
            opcion.hora === sesion.horaPendiente &&
            normalizarTexto(mensaje).includes(normalizarTexto(opcion.barbero))
          )
        : null;
      if (opcionPorBarberoPendiente) {
        sesion.profesional = opcionPorBarberoPendiente.barbero;
        sesion.hora_preferida = opcionPorBarberoPendiente.hora;
        sesion.horaPendiente = null;
        sesion.disponibilidadValidada = true;
      } else {
        const opcionesMismaHora = (sesion.opcionesDisponibles || []).filter((opcion) => opcion.hora === horaDetectada);
        if (opcionesMismaHora.length > 1) {
          sesion.horaPendiente = horaDetectada;
          aclaracionDisponibilidad = `A las ${horaDetectada} estan disponibles: ${opcionesMismaHora.map((opcion) => opcion.barbero).join(", ")}. Decime con cual barbero queres ese horario.`;
        } else if (horaDetectada && opcionesMismaHora.length === 0 && (sesion.opcionesDisponibles || []).length) {
          aclaracionDisponibilidad = `Ese horario no aparece disponible para la fecha elegida. Estas son las opciones:\n\n${formatearOpcionesDisponibles(sesion.opcionesDisponibles)}\n\nDecime uno de esos horarios.`;
        } else {
          sesion.hora_preferida = horaDetectada || mensaje;
          sesion.disponibilidadValidada = false;
        }
      }
    }
  } else if (!sesion.notas && mensaje.length > 2) {
    sesion.notas = mensaje;
  }

  let pregunta = aclaracionDisponibilidad || siguientePregunta(sesion);

  if (!aclaracionDisponibilidad && !sesion.servicio && pregunta) {
    const serviciosDisponibles = listarServicios(barberia);
    if (serviciosDisponibles) {
      pregunta = `Gracias ${sesion.nombre}. Que servicio queres hacerte? Tengo: ${serviciosDisponibles}.`;
    }
  }

  if (!pregunta && sesion.fecha_preferida && !sesion.hora_preferida) {
    const opciones = await obtenerOpcionesDisponibles({
      barberia_id,
      fecha: sesion.fecha_preferida,
      profesional: sesion.profesional
    });

    sesion.opcionesDisponibles = opciones;

    if (opciones.length === 0 && sesion.profesional) {
      sesion.profesional = null;
      sesion.opcionesDisponibles = await obtenerOpcionesDisponibles({
        barberia_id,
        fecha: sesion.fecha_preferida
      });
    }

    if (sesion.opcionesDisponibles.length === 0) {
      pregunta = "Para ese dia no veo horarios disponibles. Decime otra fecha y lo vuelvo a revisar.";
      sesion.fecha_preferida = null;
      sesion.opcionesDisponibles = [];
    } else {
      pregunta = `Estos son los horarios disponibles para ese dia:\n\n${formatearOpcionesDisponibles(sesion.opcionesDisponibles)}\n\nDecime el horario y, si queres, el barbero. Ej: 15:30 con Juan.`;
    }
  }

  if (!pregunta && sesion.fecha_preferida && sesion.hora_preferida && !sesion.disponibilidadValidada) {
    const opciones = await obtenerOpcionesDisponibles({
      barberia_id,
      fecha: sesion.fecha_preferida,
      profesional: sesion.profesional
    });
    const hora = formatearHora(sesion.hora_preferida);
    const opcionesMismaHora = opciones.filter((opcion) => opcion.hora === hora);

    if (opcionesMismaHora.length === 1) {
      sesion.profesional = opcionesMismaHora[0].barbero;
      sesion.hora_preferida = opcionesMismaHora[0].hora;
      sesion.disponibilidadValidada = true;
    } else if (opcionesMismaHora.length > 1) {
      sesion.hora_preferida = null;
      sesion.horaPendiente = hora;
      sesion.opcionesDisponibles = opciones;
      pregunta = `A las ${hora} estan disponibles: ${opcionesMismaHora.map((opcion) => opcion.barbero).join(", ")}. Decime con cual barbero queres ese horario.`;
    } else {
      sesion.hora_preferida = null;
      sesion.disponibilidadValidada = false;
      sesion.opcionesDisponibles = opciones;
      pregunta = opciones.length
        ? `Ese horario no esta disponible. Para esa fecha tengo:\n\n${formatearOpcionesDisponibles(opciones)}\n\nDecime uno de esos horarios.`
        : "Para ese dia no veo horarios disponibles. Decime otra fecha y lo vuelvo a revisar.";
      if (!opciones.length) sesion.fecha_preferida = null;
    }
  }

  sesiones.set(userKey, sesion);

  return asyncLocalStorage.run({ barberia_id, mode: "wwebjs" }, async () => {
    const destino = resolverDestinoWhatsapp(from);
    if (pregunta) {
      await enviarMensaje(destino, pregunta);
      return { completed: false };
    }

    await guardarSolicitud({ barberia_id, telefono, sesion });
    sesion.solicitudGuardada = true;
    sesiones.set(userKey, sesion);

    await enviarMensaje(
      destino,
      `Perfecto ${sesion.nombre}. Dejo tu solicitud preparada:\n\n${resumenSolicitud(sesion)}\n\nUna persona del local revisa disponibilidad y te confirma el turno.`
    );

    sesiones.delete(userKey);
    return { completed: true };
  });
}

module.exports = {
  procesarRecepcionWhatsapp
};
