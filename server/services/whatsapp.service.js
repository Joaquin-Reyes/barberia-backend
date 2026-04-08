const axios = require("axios");
const { supabase } = require("../config/supabase");

async function enviarMensaje(numero, mensaje, phone_number_id) {
  try {
    console.log("📨 enviarMensaje llamado con:", numero);

    const url = `https://graph.facebook.com/v18.0/${phone_number_id || process.env.PHONE_NUMBER_ID}/messages`;

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
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Mensaje enviado a", numero);
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
  }
}

async function notificarBarbero(datos) {
  console.log("🔔 NOTIFICANDO BARBERO...");

  const { data: barberia } = await supabase
    .from("barberias")
    .select("phone_number_id")
    .eq("id", datos.barberia_id)
    .single();

  const phone_number_id = barberia?.phone_number_id;

  if (!phone_number_id) {
    console.log("❌ Barbería sin WhatsApp configurado");
    return;
  }

  const { data: barberoData } = await supabase
    .from("barberos")
    .select("telefono")
    .ilike("nombre", datos.barbero)
    .eq("barberia_id", datos.barberia_id);

  const telefono = barberoData?.[0]?.telefono;

  if (!telefono) {
    console.log("⚠️ No hay número para el barbero:", datos.barbero);
    return;
  }

  const mensaje = `📅 Nuevo turno asignado

👤 ${datos.nombre}
✂️ ${datos.servicio}
⏰ ${datos.hora}
📅 ${datos.fecha}`;

  console.log("📤 Enviando mensaje a:", telefono);

  await enviarMensaje(telefono, mensaje, phone_number_id);
}

module.exports = { enviarMensaje, notificarBarbero };
