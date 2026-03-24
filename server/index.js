require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");

// 🔥 SUPABASE
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ==============================
// CONFIG
// ==============================

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_secreto";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// 🔥 SUPABASE CONFIG
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ==============================
// FUNCIONES SUPABASE
// ==============================

async function guardarTurno(turno) {
  const { error } = await supabase.from("turnos").insert([turno]);

  if (error) {
    console.log("❌ Error guardando:", error);
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

// ==============================
// MEMORIA (USUARIOS)
// ==============================

const usuarios = {};

// ==============================
// MIDDLEWARES
// ==============================

app.use(cors());
app.use(express.json());

// ==============================
// TEST SERVER
// ==============================

app.get("/", (req, res) => {
  res.send("🚀 Servidor funcionando");
});

// ==============================
// WEBHOOK VERIFICATION (GET)
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
// WEBHOOK RECEIVER (POST)
// ==============================

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages) return res.sendStatus(200);

    const message = messages[0];
    const from = message.from;
    const text = message.text?.body;

    console.log("📱 De:", from);
    console.log("💬 Mensaje:", text);

    // ==============================
    // INICIALIZAR USUARIO
    // ==============================

    if (!usuarios[from]) {
      usuarios[from] = {
        estado: "inicio",
        servicio: null,
        barbero: null,
        horario: null,
        ultimoMensajeId: null,
        ultimoTimestamp: 0
      };
    }

    const usuario = usuarios[from];

    // ==============================
    // ANTI DUPLICADO
    // ==============================

    if (usuario.ultimoMensajeId === message.id) {
      console.log("🔁 Mensaje duplicado ignorado");
      return res.sendStatus(200);
    }

    usuario.ultimoMensajeId = message.id;

    const timestamp = Number(message.timestamp);

    if (timestamp <= usuario.ultimoTimestamp) {
      console.log("⏱️ Mensaje viejo ignorado");
      return res.sendStatus(200);
    }

    usuario.ultimoTimestamp = timestamp;

    const mensaje = text?.toLowerCase();

    // ==============================
    // LÓGICA DEL BOT
    // ==============================

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

      return await enviarMensaje(from, "😅 Elegí una opción válida (1, 2 o 3)");
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

      usuario.estado = "horario";

      return await enviarMensaje(from, `⏰ Estos son los horarios disponibles:

10:00
10:30
11:00

Escribí el horario que querés 👇`);
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

        // 🔥 VALIDAR DISPONIBILIDAD
        const disponible = await turnoDisponible(
          usuario.horario,
          usuario.barbero
        );

        if (!disponible) {
          usuario.estado = "horario";
          return await enviarMensaje(from, "⚠️ Ese horario ya está ocupado. Elegí otro.");
        }

        // 🔥 GUARDAR EN SUPABASE
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

    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error en webhook:", error.message);
    res.sendStatus(500);
  }
});

// ==============================
// ENVIAR MENSAJE
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

// ==============================
// START SERVER
// ==============================

app.listen(PORT, () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});