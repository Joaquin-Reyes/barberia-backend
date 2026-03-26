require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path"); // 👈 NUEVO
const session = require("express-session");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ==============================
// CONFIG
// ==============================

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_secreto";
const BARBEROS = {
  "Agus": "5491131952430",
  "Lucas": "5492222222222"
};

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ==============================
// SUPABASE
// ==============================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ==============================
// 🔒 DEDUPLICACIÓN MENSAJES
// ==============================

async function mensajeYaProcesado(id) {
  const { data } = await supabase
    .from("mensajes_procesados")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  return !!data;
}

async function guardarMensajeProcesado(id) {
  await supabase.from("mensajes_procesados").insert([{ id }]);
}

// ==============================
// TURNOS
// ==============================

async function guardarTurno(turno) {
  const { error } = await supabase.from("turnos").insert([{
    ...turno,
    recordatorio_24h: false,
    recordatorio_3h: false
  }]);

  if (error) {
    console.log("❌ Error guardando:", JSON.stringify(error, null, 2));
    return false;
  }
  return true;
}

async function turnoDisponible(hora, barbero) {
  const hoy = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("turnos")
    .select("*")
    .eq("hora", hora)
    .eq("barbero", barbero)
    .eq("fecha", hoy);

  return data.length === 0;
}

async function obtenerTurnos(telefono) {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("telefono", telefono)
    .order("fecha", { ascending: true });

  if (error) {
    console.log("❌ Error obteniendo turnos:", error);
    return null;
  }

  return data;
}

async function obtenerHorariosDisponibles(barbero) {
  const hoy = new Date().toISOString().split("T")[0];

  const horariosBase = ["10:00", "10:30", "11:00"];

  const { data } = await supabase
    .from("turnos")
    .select("hora")
    .eq("barbero", barbero)
    .eq("fecha", hoy);

  const ocupados = data.map(t => t.hora);

  return horariosBase.filter(h => !ocupados.includes(h));
}

async function eliminarTurno(id) {
  const { error } = await supabase
    .from("turnos")
    .delete()
    .eq("id", id);

  if (error) {
    console.log("❌ Error eliminando:", error);
    return false;
  }

  return true;
}

// ==============================
// 🔔 RECORDATORIOS (24h + 3h)
// ==============================

async function enviarRecordatorios() {
  const ahora = new Date();

  const { data, error } = await supabase.from("turnos").select("*");

  if (error) {
    console.log("❌ Error recordatorios:", error);
    return;
  }

  for (const turno of data) {
    const fechaTurno = new Date(`${turno.fecha}T${turno.hora}`);
    const diferencia = fechaTurno - ahora;

    if (
      diferencia > 23 * 60 * 60 * 1000 &&
      diferencia < 25 * 60 * 60 * 1000 &&
      !turno.recordatorio_24h
    ) {
      await enviarMensaje(
        turno.telefono,
        `⏰ Recordatorio de turno (mañana)

📅 ${turno.fecha}
⏰ ${turno.hora}
💈 ${turno.barbero}

Te esperamos! 🔥`
      );

      await supabase
        .from("turnos")
        .update({ recordatorio_24h: true })
        .eq("id", turno.id);
    }

    if (
      diferencia > 2 * 60 * 60 * 1000 &&
      diferencia < 3 * 60 * 60 * 1000 &&
      !turno.recordatorio_3h
    ) {
      await enviarMensaje(
        turno.telefono,
        `🔥 Tu turno es en pocas horas

📅 ${turno.fecha}
⏰ ${turno.hora}
💈 ${turno.barbero}

¡No te lo olvides! 💈`
      );

      await supabase
        .from("turnos")
        .update({ recordatorio_3h: true })
        .eq("id", turno.id);
    }
  }
}

// ==============================
// MEMORIA
// ==============================

const usuarios = {};

// ==============================
// MIDDLEWARES
// ==============================

app.use(cors());
app.use(express.json());

app.use(session({
  secret: "clave_super_secreta",
  resave: false,
  saveUninitialized: true,
}));

app.post("/barbero/login", (req, res) => {
  const { nombre } = req.body;

  if (!nombre) return res.status(400).json({ error: "Falta nombre" });

  req.session.barbero = nombre;

  res.json({ ok: true });
});

// 👇 PANEL ADMIN (NUEVO)
app.use("/admin/barbero.html", (req, res, next) => {
  if (req.session.barbero) return next();
  res.sendFile(path.join(__dirname, "admin/login-barbero.html"));
});

app.use("/admin", express.static(path.join(__dirname, "admin")));

// ==============================
// ADMIN ENDPOINTS (NUEVO)
// ==============================

app.get("/admin/turnos", async (req, res) => {
  const { fecha } = req.query;

  let query = supabase.from("turnos").select("*");

  if (fecha) {
    query = query.eq("fecha", fecha);
  }

  const { data, error } = await query.order("hora", { ascending: true });

  if (error) return res.status(500).json({ error });

  res.json(data);
});

app.delete("/admin/turnos/:id", async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("turnos")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error });

  res.json({ ok: true });
});

// 👇👇👇 NUEVO ENDPOINT
app.post("/admin/crear-turno", async (req, res) => {
  const { nombre, telefono, servicio, barbero, fecha, hora } = req.body;

  if (!nombre || !telefono || !servicio || !barbero || !fecha || !hora) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  // Verificar si está ocupado
  const { data } = await supabase
    .from("turnos")
    .select("*")
    .eq("hora", hora)
    .eq("barbero", barbero)
    .eq("fecha", fecha);

  if (data.length > 0) {
    return res.status(400).json({ error: "Horario ocupado" });
  }

  // Guardar turno
  const { error } = await supabase.from("turnos").insert([{
    nombre,
    telefono,
    servicio,
    barbero,
    fecha,
    hora,
    recordatorio_24h: false,
    recordatorio_3h: false
  }]);

  if (error) {
    console.log("❌ Error creando turno:", error);
    return res.status(500).json({ error: "Error guardando" });
  }

  // 👇 NOTIFICAR AL BARBERO
  await notificarBarbero({
  nombre,
  servicio,
  barbero,
  fecha,
  hora
});

  res.json({ ok: true });
});

app.get("/barbero/turnos", async (req, res) => {
  const barbero = req.session.barbero;
  const { fecha } = req.query;

  if (!barbero) return res.status(401).json({ error: "No autorizado" });

  let query = supabase
    .from("turnos")
    .select("*")
    .eq("barbero", barbero);

  if (fecha) {
    query = query.eq("fecha", fecha);
  }

  const { data, error } = await query.order("hora", { ascending: true });

  if (error) return res.status(500).json({ error });

  res.json(data);
});

// ==============================
// TEST
// ==============================

app.get("/", (req, res) => {
  res.send("🚀 Servidor funcionando");
});

// ==============================
// WEBHOOK VERIFY
// ==============================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ==============================
// WEBHOOK
// ==============================

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages || value.messages.length === 0) return;

    const message = value.messages[0];

    if (!message.text) return;

    const messageId = message.id;

    if (await mensajeYaProcesado(messageId)) return;
    await guardarMensajeProcesado(messageId);

    const from = message.from;
    const text = message.text.body;

    if (!usuarios[from]) {
      usuarios[from] = {
        estado: "inicio",
        servicio: null,
        barbero: null,
        horario: null,
        turnos: null
      };
    }

    const usuario = usuarios[from];
    const mensaje = text.toLowerCase();

    if (usuario.estado === "inicio") {
      usuario.estado = "menu";

      return await enviarMensaje(from, `👋 Hola! Bienvenido a Agus Barber 💈

¿Qué querés hacer?

1️⃣ Sacar turno
2️⃣ Ver mis turnos
3️⃣ Cancelar turno`);
    }

    if (usuario.estado === "menu") {
      if (mensaje === "1") {
        usuario.estado = "servicio";

        return await enviarMensaje(from, `✂️ ¿Qué te hacemos hoy?

1️⃣ Corte
2️⃣ Barba
3️⃣ Corte + barba`);
      }

      if (mensaje === "2") {
        const turnos = await obtenerTurnos(from);

        if (!turnos || turnos.length === 0) {
          return await enviarMensaje(from, "📭 No tenés turnos agendados.");
        }

        let texto = "📅 Tus turnos:\n\n";

        turnos.forEach((t, i) => {
          texto += `${i + 1}️⃣ ${t.fecha} - ${t.hora}\n💈 ${t.barbero}\n✂️ ${t.servicio}\n\n`;
        });

        return await enviarMensaje(from, texto);
      }

      if (mensaje === "3") {
        const turnos = await obtenerTurnos(from);

        if (!turnos || turnos.length === 0) {
          return await enviarMensaje(from, "📭 No tenés turnos para cancelar.");
        }

        usuario.turnos = turnos;
        usuario.estado = "cancelar";

        let texto = "❌ Elegí el turno a cancelar:\n\n";

        turnos.forEach((t, i) => {
          texto += `${i + 1}️⃣ ${t.fecha} - ${t.hora}\n💈 ${t.barbero}\n\n`;
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

      if (ok) {
        return await enviarMensaje(from, "✅ Turno cancelado correctamente");
      } else {
        return await enviarMensaje(from, "❌ Error al cancelar el turno");
      }
    }

    if (usuario.estado === "servicio") {
      if (mensaje === "1") usuario.servicio = "Corte";
      else if (mensaje === "2") usuario.servicio = "Barba";
      else if (mensaje === "3") usuario.servicio = "Corte + barba";
      else return await enviarMensaje(from, "Elegí 1, 2 o 3");

      usuario.estado = "barbero";

      return await enviarMensaje(from, `💈 ¿Con quién querés atenderte?

1️⃣ Agus
2️⃣ Lucas
3️⃣ El que esté libre`);
    }

    if (usuario.estado === "barbero") {
      if (mensaje === "1") usuario.barbero = "Agus";
      else if (mensaje === "2") usuario.barbero = "Lucas";
      else if (mensaje === "3") usuario.barbero = "Cualquiera";
      else return await enviarMensaje(from, "Elegí 1, 2 o 3");

      const horarios = await obtenerHorariosDisponibles(usuario.barbero);

      if (horarios.length === 0) {
        usuario.estado = "menu";
        return await enviarMensaje(from, "❌ No hay horarios disponibles hoy");
      }

      usuario.estado = "horario";

      let texto = "⏰ Horarios disponibles:\n\n";

      horarios.forEach(h => {
        texto += `• ${h}\n`;
      });

      texto += "\nEscribí el horario que querés 👇";

      return await enviarMensaje(from, texto);
    }

    if (usuario.estado === "horario") {
      usuario.horario = mensaje;
      usuario.estado = "confirmacion";

      return await enviarMensaje(from, `📅 Dale, te reservo esto:

✂️ Servicio: ${usuario.servicio}
💈 Barbero: ${usuario.barbero}
⏰ Hora: ${usuario.horario}

Confirmamos?

1️⃣ Sí
2️⃣ No`);
    }

    if (usuario.estado === "confirmacion") {
      if (mensaje === "1") {
        const disponible = await turnoDisponible(
          usuario.horario,
          usuario.barbero
        );

        if (!disponible) {
          usuario.estado = "horario";
          return await enviarMensaje(from, "⚠️ Ese horario ya está ocupado. Elegí otro.");
        }

        const hoy = new Date().toISOString().split("T")[0];

        const ok = await guardarTurno({
          nombre: from,
          telefono: from,
          servicio: usuario.servicio,
          barbero: usuario.barbero,
          fecha: hoy,
          hora: usuario.horario
        });

        usuario.estado = "inicio";

         // 👇👇👇 ACÁ VA
    if (ok) {
      await notificarBarbero({
        nombre: from,
        servicio: usuario.servicio,
        barbero: usuario.barbero,
        fecha: hoy,
        hora: usuario.horario
      });
    }

        if (ok) {
          return await enviarMensaje(from, `🔥 Turno confirmado

📅 ${hoy}
⏰ ${usuario.horario}
💈 ${usuario.barbero}

Te esperamos!`);
        } else {
          return await enviarMensaje(from, "❌ Error al guardar turno");
        }
      }

      if (mensaje === "2") {
        usuario.estado = "inicio";

        return await enviarMensaje(from, `❌ Turno cancelado

Cuando quieras, escribime 👍`);
      }

      return await enviarMensaje(from, "Respondé 1 o 2");
    }

  } catch (error) {
    console.error("❌ Error en webhook:", error.message);
  }
});

// ==============================
// MENSAJES
// ==============================

async function enviarMensaje(numero, mensaje) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: mensaje }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Mensaje enviado a", numero);
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
  }
}

// 👇👇👇 PEGAR ESTO JUSTO ABAJO
async function notificarBarbero(turno) {
  const numeroBarbero = BARBEROS[turno.barbero];

  if (!numeroBarbero) {
    console.log("⚠️ No hay número para el barbero:", turno.barbero);
    return;
  }

  const mensaje = `📅 Nuevo turno asignado

👤 ${turno.nombre}
✂️ ${turno.servicio}
⏰ ${turno.hora}
📅 ${turno.fecha}`;

  await enviarMensaje(numeroBarbero, mensaje);
}

// ==============================
// START
// ==============================

app.listen(PORT, () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});

// ==============================
// 🔁 CRON RECORDATORIOS (1 HORA)
// ==============================

setInterval(() => {
  console.log("⏳ Revisando recordatorios...");
  enviarRecordatorios();
}, 60 * 60 * 1000);