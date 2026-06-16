const { supabaseAdmin } = require("../config/supabase");
const { enviarMensaje, asyncLocalStorage } = require("./whatsapp.service");
const { obtenerHorariosDisponibles, formatearHora } = require("./agenda.service");

const sesiones = new Map();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const IA_RECEPCION_ENABLED = process.env.WHATSAPP_RECEPCION_AI_ENABLED === "true";

function limpiarTelefono(valor) {
  return String(valor || "").replace("@c.us", "").replace(/\D/g, "");
}

function resolverDestinoWhatsapp(valor) {
  const texto = String(valor || "");
  return texto.includes("@") ? texto : limpiarTelefono(texto);
}

function iaRecepcionDisponible() {
  return IA_RECEPCION_ENABLED && Boolean(process.env.OPENAI_API_KEY);
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

function extraerMomentoDelDia(texto) {
  const normalizado = normalizarTexto(texto);
  if (normalizado.includes("tarde")) return "tarde";
  if (normalizado.includes("manana")) return "manana";
  return null;
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

function hoyArgentinaDate() {
  return new Date(`${fechaISOArgentina()}T12:00:00-03:00`);
}

function sumarDias(fecha, dias) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function resolverFechaPreferida(texto) {
  const normalizado = normalizarTexto(texto);
  const hoy = hoyArgentinaDate();

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

function normalizarNombrePropio(valor) {
  const nombre = String(valor || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!nombre) return null;

  const normalizado = normalizarTexto(nombre);
  const invalidos = ["null", "undefined", "na", "n/a", "corte", "barba", "turno", "hola"];
  if (invalidos.includes(normalizado)) return null;

  const palabras = nombre.split(" ").filter(Boolean);
  if (palabras.length === 1 && palabras[0].length < 3) return null;

  return nombre;
}

function normalizarFechaIA(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  return resolverFechaPreferida(texto);
}

function normalizarMomentoIA(valor) {
  const normalizado = normalizarTexto(valor);
  if (normalizado === "tarde") return "tarde";
  if (normalizado === "manana") return "manana";
  return null;
}

function normalizarExtraccionIA(extraccion, barberia) {
  if (!extraccion || typeof extraccion !== "object") return null;

  const nombre = normalizarNombrePropio(extraccion.nombre);
  const servicioDetectado = detectarServicio(extraccion.servicio, barberia.servicios || []);
  const profesionalDetectado = detectarProfesional(extraccion.profesional, barberia.barberos || []);
  const fecha = normalizarFechaIA(extraccion.fecha_preferida);
  const hora = extraerHora(extraccion.hora_preferida);
  const momento = normalizarMomentoIA(extraccion.momento_dia);

  return {
    nombre: nombre || null,
    servicio: servicioDetectado?.nombre || null,
    profesional: profesionalDetectado?.nombre || null,
    fecha_preferida: fecha || null,
    hora_preferida: hora || null,
    momento_dia: momento || null
  };
}

async function inferirCamposConIA({ mensaje, sesion, barberia }) {
  if (!iaRecepcionDisponible()) return null;

  const servicios = (barberia.servicios || []).map((servicio) => servicio.nombre);
  const barberos = (barberia.barberos || []).map((barbero) => barbero.nombre);
  const hoy = fechaISOArgentina();

  const promptSistema = [
    "Sos un extractor de datos para recepcion de turnos de una barberia.",
    "Devolve SOLO JSON valido, sin markdown ni explicaciones.",
    "Extrae unicamente si hay alta confianza.",
    `Hoy en Argentina es ${hoy}.`,
    "Campos permitidos: nombre, servicio, profesional, fecha_preferida, hora_preferida, momento_dia.",
    "fecha_preferida debe estar en formato YYYY-MM-DD cuando pueda resolverse.",
    "hora_preferida debe estar en formato HH:MM de 24 horas cuando exista.",
    "momento_dia solo puede ser manana o tarde.",
    "Si un campo no esta claro, devolvelo como null."
  ].join(" ");

  const promptUsuario = JSON.stringify({
    mensaje,
    sesion_actual: {
      nombre: sesion.nombre,
      servicio: sesion.servicio,
      profesional: sesion.profesional,
      fecha_preferida: sesion.fecha_preferida,
      hora_preferida: sesion.hora_preferida
    },
    servicios_disponibles: servicios,
    barberos_disponibles: barberos
  });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: promptSistema },
          { role: "user", content: promptUsuario }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[recepcion-ai] Error OpenAI:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const extraccion = normalizarExtraccionIA(JSON.parse(content), barberia);
    console.log("[recepcion-ai] extraccion ok:", JSON.stringify(extraccion));
    return extraccion;
  } catch (error) {
    console.error("[recepcion-ai] Fallo interpretando mensaje:", error.message);
    return null;
  }
}

function aplicarExtraccionIA(sesion, extraccion) {
  if (!extraccion) return;

  if (!sesion.nombre && extraccion.nombre) sesion.nombre = extraccion.nombre;
  if (!sesion.servicio && extraccion.servicio) sesion.servicio = extraccion.servicio;
  if (!sesion.profesional && extraccion.profesional) sesion.profesional = extraccion.profesional;
  if (!sesion.fecha_preferida && extraccion.fecha_preferida) sesion.fecha_preferida = extraccion.fecha_preferida;
  if (!sesion.hora_preferida && extraccion.hora_preferida) sesion.hora_preferida = extraccion.hora_preferida;
}

function solicitudListaParaGuardar(sesion) {
  return Boolean(
    normalizarNombrePropio(sesion.nombre) &&
    sesion.servicio &&
    sesion.fecha_preferida &&
    sesion.hora_preferida
  );
}

function extraerDatosLibres(texto, sesion, barberia) {
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
    const servicioDetectado = detectarServicio(texto, barberia.servicios || []);
    if (servicioDetectado) sesion.servicio = servicioDetectado.nombre;
  }

  if (!sesion.profesional) {
    const profesionalDetectado = detectarProfesional(texto, barberia.barberos || []);
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

function detectarProfesional(texto, barberos) {
  const normalizado = normalizarTexto(texto);
  if (!normalizado) return null;

  return (barberos || []).find((barbero) => {
    const nombre = normalizarTexto(barbero.nombre);
    return (
      normalizado.includes(nombre) ||
      nombre.startsWith(normalizado) ||
      normalizado.endsWith(` ${nombre}`) ||
      normalizado.includes(`con ${nombre}`)
    );
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

function filtrarOpcionesPorMomento(opciones, momento) {
  if (!momento) return opciones;

  return (opciones || []).filter((opcion) => {
    const [hora] = String(opcion.hora || "00:00").split(":").map(Number);
    if (momento === "manana") return hora < 13;
    if (momento === "tarde") return hora >= 13;
    return true;
  });
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
  const fechaAnterior = sesion.fecha_preferida;
  const extraccionIA = await inferirCamposConIA({ mensaje, sesion, barberia });
  console.log(`[recepcion] barberia=${barberia_id} ai=${extraccionIA ? "on" : iaRecepcionDisponible() ? "fallback" : "off"} from=${telefono} msg="${mensaje.slice(0, 80)}"`);
  aplicarExtraccionIA(sesion, extraccionIA);
  const fechaDetectadaEnMensaje = resolverFechaPreferida(mensaje);
  const horaDetectadaEnMensaje = extraerHora(mensaje);
  const momentoDetectadoEnMensaje = extraccionIA?.momento_dia || extraerMomentoDelDia(mensaje);
  const servicioDetectadoEnMensaje = detectarServicio(mensaje, barberia.servicios || []);
  const profesionalDetectadoEnMensaje = detectarProfesional(mensaje, barberia.barberos || []);
  const servicioInferido = extraccionIA?.servicio || servicioDetectadoEnMensaje?.nombre || null;
  const profesionalInferido = extraccionIA?.profesional || profesionalDetectadoEnMensaje?.nombre || null;
  const fechaInferida = extraccionIA?.fecha_preferida || fechaDetectadaEnMensaje;
  const horaInferida = extraccionIA?.hora_preferida || horaDetectadaEnMensaje;

  if (sesion.estado === "inicio" && !tieneIntencionTurno(mensaje)) {
    return { ignored: true, reason: "sin_intencion_turno" };
  }

  sesion.mensajes.push({
    from: "cliente",
    text: mensaje,
    at: new Date().toISOString()
  });

  if (fechaInferida && fechaInferida !== fechaAnterior) {
    sesion.fecha_preferida = fechaInferida;
    resetearDisponibilidad(sesion);
  }

  extraerDatosLibres(mensaje, sesion, barberia);
  let aclaracionDisponibilidad = null;

  if (sesion.estado === "inicio") {
    sesion.estado = "recopilando";
  } else if (!sesion.nombre) {
    if (!servicioInferido && !fechaInferida && !horaInferida && !profesionalInferido) {
      sesion.nombre = mensaje;
    }
  } else if (!sesion.servicio) {
    if (servicioInferido) {
      sesion.servicio = servicioInferido;
    } else {
      aclaracionDisponibilidad = `No llegue a identificar el servicio. Decime uno de estos: ${listarServicios(barberia)}.`;
    }
  } else if (!sesion.fecha_preferida) {
    sesion.fecha_preferida = fechaInferida;
  } else if (!sesion.hora_preferida) {
    const opcionElegida = elegirOpcionDisponible(mensaje, sesion.opcionesDisponibles || []);
    if (opcionElegida) {
      sesion.profesional = opcionElegida.barbero;
      sesion.hora_preferida = opcionElegida.hora;
      sesion.horaPendiente = null;
      sesion.disponibilidadValidada = true;
    } else {
      const horaDetectada = horaInferida;
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
        } else if (!horaDetectada && momentoDetectadoEnMensaje && (sesion.opcionesDisponibles || []).length) {
          const opcionesPorMomento = filtrarOpcionesPorMomento(sesion.opcionesDisponibles, momentoDetectadoEnMensaje);
          aclaracionDisponibilidad = opcionesPorMomento.length
            ? `Para ${momentoDetectadoEnMensaje === "tarde" ? "la tarde" : "la manana"} tengo estos horarios:\n\n${formatearOpcionesDisponibles(opcionesPorMomento)}\n\nDecime uno de esos horarios.`
            : `Para ${momentoDetectadoEnMensaje === "tarde" ? "la tarde" : "la manana"} no veo lugares libres en esa fecha. Si queres, te muestro otro dia.`;
        } else {
          aclaracionDisponibilidad = (sesion.opcionesDisponibles || []).length
            ? `Decime uno de los horarios disponibles o una franja como "por la tarde".`
            : `Decime un horario para esa fecha.`;
        }
      }
    }
  } else if (!sesion.notas && mensaje.length > 2) {
    sesion.notas = mensaje;
  }

  let pregunta = aclaracionDisponibilidad || siguientePregunta(sesion);

  if (!aclaracionDisponibilidad && sesion.nombre && !sesion.servicio && pregunta) {
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
      console.log("[recepcion] respuesta_intermedia:", JSON.stringify({
        nombre: sesion.nombre,
        servicio: sesion.servicio,
        profesional: sesion.profesional,
        fecha_preferida: sesion.fecha_preferida,
        hora_preferida: sesion.hora_preferida,
        pregunta
      }));
      await enviarMensaje(destino, pregunta);
      return { completed: false };
    }

    if (!solicitudListaParaGuardar(sesion)) {
      const preguntaFinal = !normalizarNombrePropio(sesion.nombre)
        ? "Antes de seguir, decime tu nombre y apellido."
        : !sesion.servicio
          ? `Decime que servicio queres hacerte. Tengo: ${listarServicios(barberia)}.`
          : !sesion.fecha_preferida
            ? "Decime para que dia queres el turno."
            : "Decime el horario que preferis.";

      sesiones.set(userKey, sesion);
      console.log("[recepcion] guardado_bloqueado:", JSON.stringify({
        nombre: sesion.nombre,
        servicio: sesion.servicio,
        fecha_preferida: sesion.fecha_preferida,
        hora_preferida: sesion.hora_preferida
      }));
      await enviarMensaje(destino, preguntaFinal);
      return { completed: false, blocked: true };
    }

    await guardarSolicitud({ barberia_id, telefono, sesion });
    sesion.solicitudGuardada = true;
    sesiones.set(userKey, sesion);
    console.log("[recepcion] solicitud_guardada:", JSON.stringify({
      nombre: sesion.nombre,
      servicio: sesion.servicio,
      profesional: sesion.profesional,
      fecha_preferida: sesion.fecha_preferida,
      hora_preferida: sesion.hora_preferida
    }));

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
