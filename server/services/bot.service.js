const { enviarMensaje, notificarBarbero } = require("./whatsapp.service");
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

// ==============================
// MENSAJES REUTILIZABLES
// ==============================

async function pedirServicio(from, barberia_id, usuario) {
  const servicios = await obtenerServicios(barberia_id);
  const lista = servicios.length
    ? servicios.map(s => s.nombre)
    : ["Corte", "Barba", "Corte + barba"];

  usuario.serviciosList = lista;

  const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];
  let texto = "✂️ ¿Qué servicio querés?\n\n";
  lista.forEach((s, i) => { texto += `${emojis[i] || `${i+1}.`} ${s}\n`; });

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
  return await enviarMensaje(from, `📅 ¿Para qué fecha querés el turno?

Podés escribir:
• *mañana*
• *el lunes*, *el viernes*
• *15/04*`);
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
      `❌ ${usuario.barbero} no tiene horarios disponibles el ${fechaLegible(usuario.fecha || "")}\n\n¿Qué otro día te viene bien?`
    );
  }

  usuario.estado = "horario";

  let texto = `⏰ Horarios disponibles para el ${fechaLegible(usuario.fecha)}:\n\n`;
  horarios.forEach(h => (texto += `• ${h}\n`));
  texto += "\nEscribí el horario que querés 👇";

  return await enviarMensaje(from, texto);
}

// ==============================
// PROCESAMIENTO PRINCIPAL
// ==============================

async function procesarMensaje({ from, text, cliente, barberia, barberia_id }) {
  const userKey = `${from}_${barberia_id}`;

  if (!usuarios[userKey]) {
    usuarios[userKey] = {
      estado: "inicio",
      servicio: null,
      barbero: null,
      fecha: null,
      horario: null,
      turnos: null,
      serviciosList: null,
      barberosList: null
    };
  }

  const usuario = usuarios[userKey];
  const mensaje = text.toLowerCase();

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

  if (mensaje.includes("cancelar")) {
    const turnos = await obtenerTurnos(from, barberia_id);

    if (!turnos || turnos.length === 0) {
      return await enviarMensaje(from, "📭 No tenés turnos para cancelar.");
    }

    usuario.turnos = turnos;
    usuario.estado = "cancelar";

    let texto = "❌ Elegí el turno a cancelar:\n\n";
    turnos.forEach((t, i) => {
      texto += `${i + 1}️⃣ ${fechaLegible(t.fecha)} - ${String(t.hora).slice(0,5)}\n💈 ${t.barbero}\n\n`;
    });
    return await enviarMensaje(from, texto);
  }

  if (mensaje.includes("turno") && !["cancelar", "horario", "fecha", "confirmacion"].includes(usuario.estado)) {
    usuario.estado = "servicio";
    return await pedirServicio(from, barberia_id, usuario);
  }

  // ==============================
  // DETECCIÓN INTELIGENTE
  // ==============================

  let barberoDetectado = null;
  if (mensaje.includes("agus")) barberoDetectado = "Agus";
  if (mensaje.includes("lucas")) barberoDetectado = "Lucas";

  const fechaDetectada = parsearFecha(text);

  const matchHora = mensaje.match(/\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/) ||
                    mensaje.match(/\b(2[0-3]|1[0-9]|[7-9])\b/);
  const horaDetectada = matchHora ? matchHora[0] : null;

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

      return await enviarMensaje(from, `🔥 Te propongo este turno:

✂️ ${usuario.servicio}
💈 ${usuario.barbero}
📅 ${fechaLegible(usuario.fecha)}
⏰ ${usuario.horario}

¿Confirmamos?

1️⃣ Sí
2️⃣ No`);
    }

    return await mostrarHorarios(from, usuario, barberia_id);
  }

  // ==============================
  // FLUJO POR ESTADOS
  // ==============================

  if (usuario.estado === "inicio") {
    usuario.estado = "menu";
    return await enviarMensaje(from, `👋 Hola! Bienvenido a ${barberia.nombre} 💈

¿Qué querés hacer?

1️⃣ Sacar turno
2️⃣ Ver mis turnos
3️⃣ Cancelar turno`);
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
      let texto = "❌ Elegí el turno a cancelar:\n\n";
      turnos.forEach((t, i) => {
        texto += `${i + 1}️⃣ ${fechaLegible(t.fecha)} - ${String(t.hora).slice(0,5)}\n💈 ${t.barbero}\n\n`;
      });
      return await enviarMensaje(from, texto);
    }
    return await enviarMensaje(from, "😅 Elegí una opción válida (1, 2 o 3)");
  }

  if (usuario.estado === "cancelar") {
    const index = parseInt(mensaje) - 1;
    if (!usuario.turnos || !usuario.turnos[index]) {
      return await enviarMensaje(from, "❌ Opción inválida");
    }
    const turno = usuario.turnos[index];
    const ok = await eliminarTurno(turno.id);
    usuario.estado = "inicio";
    return await enviarMensaje(
      from,
      ok ? "✅ Turno cancelado correctamente" : "❌ Error al cancelar el turno"
    );
  }

  if (usuario.estado === "servicio") {
    const lista = usuario.serviciosList || [];
    const num = parseInt(mensaje);

    if (num >= 1 && num <= lista.length) {
      usuario.servicio = lista[num - 1];
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
      return await enviarMensaje(from, "❌ No entendí. Elegí un número o escribí el nombre");
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
    usuario.horario = mensaje;
    usuario.estado = "confirmacion";

    return await enviarMensaje(from, `📅 Dale, te reservo esto:

✂️ Servicio: ${usuario.servicio}
💈 Barbero: ${usuario.barbero}
📅 Fecha: ${fechaLegible(usuario.fecha)}
⏰ Hora: ${usuario.horario}

¿Confirmamos?

1️⃣ Sí
2️⃣ No`);
  }

  if (usuario.estado === "confirmacion") {
    if (mensaje === "1") {
      const disponible = await turnoDisponible(usuario.fecha, usuario.horario, usuario.barbero);

      if (!disponible) {
        usuario.estado = "horario";
        return await enviarMensaje(from, "⚠️ Ese horario ya fue tomado. ¿Elegís otro?");
      }

      const ok = await guardarTurno({
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        servicio: usuario.servicio,
        barbero: usuario.barbero,
        fecha: usuario.fecha,
        hora: usuario.horario,
        barberia_id
      });

      usuario.estado = "inicio";

      if (ok) {
        await notificarBarbero({
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          servicio: usuario.servicio,
          barbero: usuario.barbero,
          fecha: usuario.fecha,
          hora: usuario.horario,
          barberia_id
        });

        return await enviarMensaje(from, `🔥 Turno confirmado

📅 ${fechaLegible(usuario.fecha)}
⏰ ${usuario.horario}
💈 ${usuario.barbero}

¡Te esperamos!`);
      }

      return await enviarMensaje(from, "❌ Error al guardar turno");
    }

    if (mensaje === "2") {
      usuario.estado = "inicio";
      return await enviarMensaje(from, "❌ Turno cancelado. ¿En qué te puedo ayudar?");
    }

    return await enviarMensaje(from, "Respondé 1 o 2");
  }
}

module.exports = { procesarMensaje };