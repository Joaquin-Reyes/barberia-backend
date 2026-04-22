const { supabaseAdmin } = require("../config/supabase");
const { enviarMensaje, notificarBarbero, asyncLocalStorage } = require("./whatsapp.service");
const {
  obtenerTurnos,
  eliminarTurno,
  guardarTurno,
  obtenerHorariosDisponibles,
  turnoDisponible,
  obtenerServicios,
  obtenerBarberosList
} = require("./agenda.service");

// Estado de conversación en memoria (por usuario+barbería)
const usuarios = {};

// ==============================
// UTILS DE FECHA
// ==============================

function formatearFechaLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Formatea YYYY-MM-DD a DD/MM/YYYY para mostrar al usuario
function fechaLegible(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function parsearFecha(texto) {
  const norm = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const hoyDate = new Date();
  hoyDate.setHours(12, 0, 0, 0);

  if (norm === "hoy") return formatearFechaLocal(hoyDate);

  if (norm === "manana" || norm.includes("manana")) {
    const d = new Date(hoyDate);
    d.setDate(d.getDate() + 1);
    return formatearFechaLocal(d);
  }

  const diasMap = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3,
    jueves: 4, viernes: 5, sabado: 6
  };
  for (const [nombre, num] of Object.entries(diasMap)) {
    if (norm.includes(nombre)) {
      const d = new Date(hoyDate);
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== num) d.setDate(d.getDate() + 1);
      return formatearFechaLocal(d);
    }
  }

  const match = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (match) {
    const dia = parseInt(match[1]);
    const mes = parseInt(match[2]) - 1;
    let anio = match[3]
      ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]))
      : hoyDate.getFullYear();

    const fecha = new Date(anio, mes, dia, 12, 0, 0);
    if (isNaN(fecha.getTime())) return null;

    const ayer = new Date(hoyDate);
    ayer.setDate(ayer.getDate() - 1);
    if (fecha <= ayer) return null;

    return formatearFechaLocal(fecha);
  }

  return null;
}

// Normaliza cualquier formato de hora a "HH:MM"
// Acepta: "12:00", "12hs", "12h", "12", "14:30hs", "9"
function normalizarHora(texto) {
  const t = String(texto).trim().replace(/\s*h(oras?|s)?\s*$/i, "").trim();

  // Formato HH:MM
  const matchCompleto = t.match(/^(\d{1,2}):(\d{2})$/);
  if (matchCompleto) {
    const h = parseInt(matchCompleto[1]);
    const m = parseInt(matchCompleto[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Solo número
  const matchSolo = t.match(/^(\d{1,2})$/);
  if (matchSolo) {
    const h = parseInt(matchSolo[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  return null;
}

// ==============================
// MENSAJES REUTILIZABLES
// ==============================

async function mostrarMenu(from, barberia, clienteNombre) {
  const saludo = clienteNombre
    ? `👋 Hola ${clienteNombre}! Bienvenido a ${barberia.nombre} 💈`
    : `👋 Hola! Bienvenido a ${barberia.nombre} 💈`;

  return await enviarMensaje(from, `${saludo}

¿Qué querés hacer?

1️⃣ Sacar turno
2️⃣ Ver mis turnos
3️⃣ Cancelar turno`);
}

async function pedirServicio(from, barberia_id, usuario) {
  const servicios = await obtenerServicios(barberia_id);
  const lista = servicios.length
    ? servicios.map(s => s.nombre)
    : ["Corte", "Barba", "Corte + barba"];

  usuario.serviciosList = lista;
  usuario.serviciosData = servicios;

  const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];
  let texto = "✂️ ¿Qué servicio querés?\n\n";
  lista.forEach((s, i) => {
    const precio = servicios[i]?.precio ? ` — $${servicios[i].precio}` : "";
    texto += `${emojis[i] || `${i+1}.`} ${s}${precio}\n`;
  });

  return await enviarMensaje(from, texto);
}

async function pedirBarbero(from, barberia_id, usuario) {
  const barberos = await obtenerBarberosList(barberia_id);
  const lista = barberos.map(b => b.nombre);

  usuario.barberosList = lista;

  const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];
  let texto = "💈 ¿Con quién querés atenderte?\n\n";
  lista.forEach((b, i) => { texto += `${emojis[i] || `${i+1}.`} ${b}\n`; });
  texto += `${emojis[lista.length] || `${lista.length+1}.`} El que esté libre`;

  return await enviarMensaje(from, texto);
}

async function pedirFecha(from) {
  return await enviarMensaje(from, `📅 ¿Para qué fecha querés el turno?`);
}

async function mostrarHorarios(from, usuario, barberia_id) {
  const horarios = await obtenerHorariosDisponibles(
    usuario.barbero,
    barberia_id,
    usuario.fecha
  );

  if (!horarios || horarios.length === 0) {
    usuario.fecha = null;
    usuario.estado = "fecha";
    return await enviarMensaje(
      from,
      `❌ ${usuario.barbero} no tiene horarios disponibles para esa fecha.\n\n¿Qué otro día te viene bien?`
    );
  }

  usuario.estado = "horario";
  usuario.horariosDisponibles = horarios;

  let texto = `⏰ Horarios disponibles para el ${fechaLegible(usuario.fecha)}:\n\n`;
  horarios.forEach(h => (texto += `• ${h}\n`));
  texto += "\nEscribí el horario que querés 👇";

  return await enviarMensaje(from, texto);
}

async function mostrarConfirmacion(from, usuario) {
  const precioTexto = usuario.precio ? `\n💵 Precio: $${usuario.precio}` : "";
  return await enviarMensaje(from, `📋 Resumen de tu turno:

✂️ ${usuario.servicio}
💈 ${usuario.barbero}
📅 ${fechaLegible(usuario.fecha)}
⏰ ${usuario.horario}${precioTexto}

¿Confirmamos?

1️⃣ Sí, confirmar
2️⃣ No, cancelar`);
}

// ==============================
// PROCESAMIENTO PRINCIPAL
// ==============================

async function procesarMensaje({ from, text, cliente, barberia, barberia_id }) {
  return asyncLocalStorage.run({ barberia_id, mode: barberia.whatsapp_mode || "cloud_api" }, () =>
    _procesarMensajeInterno({ from, text, cliente, barberia, barberia_id })
  );
}

async function _procesarMensajeInterno({ from, text, cliente, barberia, barberia_id }) {
  const userKey = `${from}_${barberia_id}`;

  if (!usuarios[userKey]) {
    const nombreReal = cliente.nombre && cliente.nombre !== cliente.telefono ? cliente.nombre : null;
    usuarios[userKey] = {
      estado: "inicio",
      nombreCliente: nombreReal,
      servicio: null,
      precio: 0,
      barbero: null,
      fecha: null,
      horario: null,
      turnos: null,
      turnoACancelar: null,
      serviciosList: null,
      serviciosData: null,
      barberosList: null,
      horariosDisponibles: null
    };
  }

  const usuario = usuarios[userKey];
  const mensaje = text.toLowerCase().trim();

  // Si el cliente no tiene nombre real, pedirlo antes de cualquier otra cosa
  if (!usuario.nombreCliente && usuario.estado !== "nombre") {
    usuario.estado = "nombre";
    return await enviarMensaje(from, "¡Hola! ¿Cuál es tu nombre y apellido? 😊");
  }

  // ==============================
  // INTENCIONES GLOBALES
  // ==============================

  if (
    mensaje.includes("ver turnos") ||
    mensaje.includes("mis turnos") ||
    mensaje.includes("ver mis turnos")
  ) {
    const turnos = await obtenerTurnos(from, barberia_id);

    if (!turnos || turnos.length === 0) {
      return await enviarMensaje(from, "📭 No tenés turnos agendados.");
    }

    let texto = "📅 Tus turnos:\n\n";
    turnos.forEach((t, i) => {
      texto += `${i + 1}️⃣ ${fechaLegible(t.fecha)} - ${String(t.hora).slice(0,5)}\n💈 ${t.barbero}\n✂️ ${t.servicio}\n\n`;
    });
    return await enviarMensaje(from, texto);
  }

  if (mensaje.includes("cancelar") && !["cancelar", "cancelar_confirmacion"].includes(usuario.estado)) {
    const turnos = await obtenerTurnos(from, barberia_id);

    if (!turnos || turnos.length === 0) {
      return await enviarMensaje(from, "📭 No tenés turnos para cancelar.");
    }

    usuario.turnos = turnos;
    usuario.estado = "cancelar";

    let texto = "🗑️ ¿Cuál turno querés cancelar?\n\n";
    turnos.forEach((t, i) => {
      texto += `${i + 1}️⃣ ${fechaLegible(t.fecha)} - ${String(t.hora).slice(0,5)}\n💈 ${t.barbero}\n✂️ ${t.servicio}\n\n`;
    });
    return await enviarMensaje(from, texto);
  }

  if (mensaje.includes("turno") && !["cancelar", "cancelar_confirmacion", "horario", "fecha", "confirmacion"].includes(usuario.estado)) {
    usuario.estado = "servicio";
    return await pedirServicio(from, barberia_id, usuario);
  }

  if (["hola", "buenas", "buen dia", "buen día", "buenas tardes", "buenas noches", "menu", "menú"].some(s => mensaje.includes(s))) {
    usuario.estado = "menu";
    return await mostrarMenu(from, barberia, usuario.nombreCliente);
  }

  // ==============================
  // DETECCIÓN INTELIGENTE
  // ==============================

  // Detectar barbero dinámicamente de la lista real
  let barberoDetectado = null;
  const listaBarberos = usuario.barberosList?.length
    ? usuario.barberosList
    : (await obtenerBarberosList(barberia_id)).map(b => b.nombre);

  for (const nombre of listaBarberos) {
    if (mensaje.includes(nombre.toLowerCase())) {
      barberoDetectado = nombre;
      break;
    }
  }

  const fechaDetectada = parsearFecha(text);

  // Detectar hora: "12:00", "12hs", "12h", "12 hs", "14", etc.
  const matchHoraCompleta = mensaje.match(/\b(\d{1,2}:\d{2})\s*h(oras?|s)?\b/i) ||
                            mensaje.match(/\b(\d{1,2}:\d{2})\b/);
  const matchHoraSufijo = mensaje.match(/\b(\d{1,2})\s*h(oras?|s)?\b/i);
  // No interpretar números solos como hora cuando el estado usa números como selección de menú
  const estadosNumericos = ["menu", "servicio", "barbero", "cancelar", "cancelar_confirmacion", "confirmacion"];
  const matchHoraSola = !fechaDetectada && !estadosNumericos.includes(usuario.estado) && mensaje.match(/^\s*(\d{1,2})\s*$/);

  const horaRaw = matchHoraCompleta?.[0] || matchHoraSufijo?.[0] || matchHoraSola?.[0] || null;
  const horaDetectada = horaRaw ? normalizarHora(horaRaw) : null;

  if (barberoDetectado || fechaDetectada || horaDetectada) {
    if (!usuario.servicio) usuario.servicio = "Corte";
    if (barberoDetectado) usuario.barbero = barberoDetectado;
    if (fechaDetectada) usuario.fecha = fechaDetectada;

    if (!usuario.barbero) {
      usuario.estado = "barbero";
      return await pedirBarbero(from, barberia_id, usuario);
    }

    if (!usuario.fecha) {
      usuario.estado = "fecha";
      return await pedirFecha(from);
    }

    if (horaDetectada) {
      usuario.horario = horaDetectada;
      usuario.estado = "confirmacion";
      return await mostrarConfirmacion(from, usuario);
    }

    return await mostrarHorarios(from, usuario, barberia_id);
  }

  // ==============================
  // FLUJO POR ESTADOS
  // ==============================

  if (usuario.estado === "nombre") {
    const nombreIngresado = text.trim();
    if (!nombreIngresado) {
      return await enviarMensaje(from, "Por favor ingresá tu nombre y apellido. 😊");
    }
    if (cliente.id) {
      await supabaseAdmin.from("clientes").update({ nombre: nombreIngresado }).eq("id", cliente.id);
    } else {
      await supabaseAdmin.from("clientes").insert({ telefono: from, nombre: nombreIngresado, barberia_id });
    }
    usuario.nombreCliente = nombreIngresado;
    usuario.estado = "menu";
    return await mostrarMenu(from, barberia, nombreIngresado);
  }

  if (usuario.estado === "inicio") {
    usuario.estado = "menu";
    return await mostrarMenu(from, barberia, usuario.nombreCliente);
  }

  if (usuario.estado === "menu") {
    if (mensaje === "1") {
      usuario.estado = "servicio";
      return await pedirServicio(from, barberia_id, usuario);
    }
    if (mensaje === "2") {
      const turnos = await obtenerTurnos(from, barberia_id);
      if (!turnos || turnos.length === 0) {
        return await enviarMensaje(from, "📭 No tenés turnos agendados.");
      }
      let texto = "📅 Tus turnos:\n\n";
      turnos.forEach((t, i) => {
        texto += `${i + 1}️⃣ ${fechaLegible(t.fecha)} - ${String(t.hora).slice(0,5)}\n💈 ${t.barbero}\n✂️ ${t.servicio}\n\n`;
      });
      return await enviarMensaje(from, texto);
    }
    if (mensaje === "3") {
      const turnos = await obtenerTurnos(from, barberia_id);
      if (!turnos || turnos.length === 0) {
        return await enviarMensaje(from, "📭 No tenés turnos para cancelar.");
      }
      usuario.turnos = turnos;
      usuario.estado = "cancelar";
      let texto = "🗑️ ¿Cuál turno querés cancelar?\n\n";
      turnos.forEach((t, i) => {
        texto += `${i + 1}️⃣ ${fechaLegible(t.fecha)} - ${String(t.hora).slice(0,5)}\n💈 ${t.barbero}\n✂️ ${t.servicio}\n\n`;
      });
      return await enviarMensaje(from, texto);
    }
    return await enviarMensaje(from, "😅 Elegí una opción válida:\n\n1️⃣ Sacar turno\n2️⃣ Ver mis turnos\n3️⃣ Cancelar turno");
  }

  if (usuario.estado === "cancelar") {
    const index = parseInt(mensaje) - 1;
    if (isNaN(index) || !usuario.turnos || !usuario.turnos[index]) {
      return await enviarMensaje(from, "❌ Opción inválida. Elegí un número de la lista.");
    }
    const turno = usuario.turnos[index];
    usuario.turnoACancelar = turno;
    usuario.estado = "cancelar_confirmacion";
    return await enviarMensaje(
      from,
      `⚠️ ¿Seguro que querés cancelar este turno?

📅 ${fechaLegible(turno.fecha)} - ${String(turno.hora).slice(0,5)}
💈 ${turno.barbero}
✂️ ${turno.servicio}

1️⃣ Sí, cancelar
2️⃣ No, volver`
    );
  }

  if (usuario.estado === "cancelar_confirmacion") {
    if (mensaje === "1") {
      const ok = await eliminarTurno(usuario.turnoACancelar.id);
      usuario.estado = "menu";
      if (ok) {
        await enviarMensaje(from, "✅ Turno cancelado correctamente.");
        return await mostrarMenu(from, barberia, usuario.nombreCliente);
      }
      return await enviarMensaje(from, "❌ Error al cancelar el turno. Intentá de nuevo.");
    }
    if (mensaje === "2") {
      usuario.estado = "menu";
      return await mostrarMenu(from, barberia, usuario.nombreCliente);
    }
    return await enviarMensaje(from, "Respondé *1* para confirmar o *2* para volver.");
  }

  if (usuario.estado === "servicio") {
    const lista = usuario.serviciosList || [];
    const data = usuario.serviciosData || [];
    const num = parseInt(mensaje);

    if (num >= 1 && num <= lista.length) {
      usuario.servicio = lista[num - 1];
      usuario.precio = data[num - 1]?.precio || 0;
    } else {
      return await enviarMensaje(from, `Elegí un número del 1 al ${lista.length}`);
    }

    usuario.estado = "barbero";
    return await pedirBarbero(from, barberia_id, usuario);
  }

  if (usuario.estado === "barbero") {
    const lista = usuario.barberosList || [];
    const num = parseInt(mensaje);
    let barbero = null;

    if (num >= 1 && num <= lista.length) {
      barbero = lista[num - 1];
    } else if (num === lista.length + 1 || mensaje.includes("libre") || mensaje.includes("cualquiera")) {
      barbero = "Cualquiera";
    } else {
      const match = lista.find(b => mensaje.includes(b.toLowerCase()));
      if (match) barbero = match;
    }

    if (!barbero) {
      return await enviarMensaje(from, "❌ No entendí. Elegí un número o escribí el nombre.");
    }

    usuario.barbero = barbero;
    usuario.estado = "fecha";
    return await pedirFecha(from);
  }

  if (usuario.estado === "fecha") {
    const fecha = parsearFecha(text);

    if (!fecha) {
      return await enviarMensaje(
        from,
        `❌ No entendí la fecha. Probá con:\n• *mañana*\n• *el lunes*\n• *15/04*`
      );
    }

    usuario.fecha = fecha;
    return await mostrarHorarios(from, usuario, barberia_id);
  }

  if (usuario.estado === "horario") {
    const horaIngresada = normalizarHora(text);
    const disponibles = usuario.horariosDisponibles || [];

    if (!horaIngresada) {
      return await enviarMensaje(from, `❌ No entendí el horario. Escribí algo como *10:00* o *14hs*.`);
    }

    if (!disponibles.includes(horaIngresada)) {
      const lista = disponibles.map(h => `• ${h}`).join("\n");
      return await enviarMensaje(
        from,
        `❌ Ese horario no está disponible. Elegí uno de la lista:\n\n${lista}`
      );
    }

    usuario.horario = horaIngresada;
    usuario.estado = "confirmacion";
    return await mostrarConfirmacion(from, usuario);
  }

  if (usuario.estado === "confirmacion") {
    if (mensaje === "1") {
      const disponible = await turnoDisponible(usuario.fecha, usuario.horario, usuario.barbero);

      if (!disponible) {
        usuario.estado = "horario";
        const lista = (usuario.horariosDisponibles || []).map(h => `• ${h}`).join("\n");
        return await enviarMensaje(from, `⚠️ Ese horario justo fue tomado. Elegí otro:\n\n${lista}`);
      }

      const ok = await guardarTurno({
        nombre: usuario.nombreCliente,
        telefono: from,
        servicio: usuario.servicio,
        precio: usuario.precio || 0,
        barbero: usuario.barbero,
        fecha: usuario.fecha,
        hora: usuario.horario,
        barberia_id
      });

      if (ok) {
        await notificarBarbero({
          nombre: usuario.nombreCliente,
          telefono: from,
          servicio: usuario.servicio,
          barbero: usuario.barbero,
          fecha: usuario.fecha,
          hora: usuario.horario,
          barberia_id
        });

        const precioTexto = usuario.precio ? `\n💵 $${usuario.precio}` : "";
        usuario.estado = "inicio";

        return await enviarMensaje(from, `🔥 ¡Turno confirmado!

✂️ ${usuario.servicio}
💈 ${usuario.barbero}
📅 ${fechaLegible(usuario.fecha)}
⏰ ${usuario.horario}${precioTexto}

¡Te esperamos! 💈`);
      }

      usuario.estado = "inicio";
      return await enviarMensaje(from, "❌ Error al guardar el turno. Intentá de nuevo.");
    }

    if (mensaje === "2") {
      usuario.estado = "menu";
      return await mostrarMenu(from, barberia, usuario.nombreCliente);
    }

    return await enviarMensaje(from, "Respondé *1* para confirmar o *2* para cancelar.");
  }

  // Catch-all: mensaje no reconocido en cualquier estado
  return await enviarMensaje(from, `No entendí ese mensaje. 😅\n\nEscribí *menu* para ver las opciones.`);
}

module.exports = { procesarMensaje };
