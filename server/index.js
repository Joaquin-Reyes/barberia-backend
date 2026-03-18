require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

// ==============================
// CONFIG
// ==============================

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_secreto";

// ⚠️ COMPLETAR CON TUS DATOS DE META
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

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
    console.log("❌ Error de verificación");
    res.sendStatus(403);
  }
});

// ==============================
// WEBHOOK RECEIVER (POST)
// ==============================

app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Evento recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (messages) {
      const message = messages[0];
      const from = message.from; // numero del cliente
      const text = message.text?.body;

      console.log("📱 De:", from);
      console.log("💬 Mensaje:", text);

      // ==============================
      // RESPUESTA AUTOMÁTICA (PRUEBA)
      // ==============================

      if (text) {
        await enviarMensaje(from, "👋 Hola! Recibí tu mensaje correctamente.");
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error.message);
    res.sendStatus(500);
  }
});

// ==============================
// ENVIAR MENSAJE WHATSAPP
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
        text: {
          body: mensaje,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Mensaje enviado a", numero);
  } catch (error) {
    console.error(
      "❌ Error enviando mensaje:",
      error.response?.data || error.message
    );
  }
}

// ==============================
// ENDPOINT MANUAL (TEST)
// ==============================

app.post("/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;

  if (!telefono || !mensaje) {
    return res.status(400).json({
      error: "Faltan datos",
    });
  }

  await enviarMensaje(telefono, mensaje);

  res.json({
    status: "ok",
  });
});

// ==============================
// START SERVER
// ==============================

app.listen(PORT, () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});