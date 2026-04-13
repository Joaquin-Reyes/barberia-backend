const { supabaseAdmin } = require("../config/supabase");
const { mensajeYaProcesado, guardarMensajeProcesado } = require("../services/deduplicacion.service");
const { procesarMensaje } = require("../services/bot.service");

const VERIFY_TOKEN = "mi_token_secreto";

function verify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
}

async function handleMessage(req, res) {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Detectar barbería por phone_number_id
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const { data: barberia, error } = await supabaseAdmin
      .from("barberias")
      .select("*")
      .eq("phone_number_id", phoneNumberId)
      .single();

    if (error || !barberia) return;

    const barberia_id = barberia.id;
    console.log("✅ Barbería detectada:", barberia.nombre);

    // Validar que haya mensajes
    if (!value?.messages || value.messages.length === 0) return;

    const message = value.messages[0];
    if (!message.text) return;

    // Deduplicación
    const messageId = message.id;
    if (await mensajeYaProcesado(messageId)) return;
    await guardarMensajeProcesado(messageId);

    const from = message.from;
    const text = message.text.body;

    // Obtener o crear cliente
    let { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("*")
      .eq("telefono", from)
      .eq("barberia_id", barberia_id)
      .maybeSingle();

    if (!cliente) {
      cliente = { telefono: from, nombre: null, barberia_id };
    }

    console.log("👤 Cliente:", cliente.telefono);

    await procesarMensaje({ from, text, cliente, barberia, barberia_id });

  } catch (error) {
    console.error("❌ Error en webhook:", error.message);
  }
}

module.exports = { verify, handleMessage };
