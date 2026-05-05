const axios = require("axios");
const { AsyncLocalStorage } = require("async_hooks");
const { supabaseAdmin } = require("../config/supabase");

// Contexto por invocación: { barberia_id, mode }
// Usado por enviarMensaje para saber qué transporte usar sin cambiar sus call sites.
const asyncLocalStorage = new AsyncLocalStorage();
const isWwebjsEnabled = () => process.env.WWEBJS_ENABLED === "true";

async function _obtenerModo(barberia_id) {
  const { data } = await supabaseAdmin
    .from("barberias")
    .select("whatsapp_mode")
    .eq("id", barberia_id)
    .single();
  return data?.whatsapp_mode || "cloud_api";
}

async function _resolverChatId(client, numero) {
  const numLimpio = String(numero).replace("@c.us", "").replace(/\D/g, "");
  const numberId = await client.getNumberId(numLimpio);
  if (!numberId) throw new Error(`Número no registrado en WhatsApp: ${numLimpio}`);
  return numberId._serialized;
}

async function enviarMensaje(numero, mensaje, phone_number_id) {
  const ctx = asyncLocalStorage.getStore();

  if (ctx?.mode === "wwebjs") {
    if (!isWwebjsEnabled()) {
      console.warn("[wwebjs] WhatsApp Web deshabilitado, mensaje no enviado");
      return;
    }

    const { getClient } = require("./wwebjs.manager");
    const entry = getClient(ctx.barberia_id);
    if (entry?.status === "authenticated") {
      try {
        console.log(`[wwebjs] enviarMensaje → numero="${numero}"`);
        const chatId = await _resolverChatId(entry.client, numero);
        await entry.client.sendMessage(chatId, mensaje);
      } catch (err) {
        console.error(`[wwebjs] enviarMensaje error: ${err.message}`);
      }
    } else {
      console.warn(`[wwebjs] Cliente no listo para barberia ${ctx.barberia_id}, mensaje no enviado`);
    }
    return;
  }

  // cloud_api
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

async function enviarTemplateConfirmacion({ telefono, nombre, servicio, barbero, fecha, horario, precio, barberia_id }) {
  console.log(`[enviarTemplateConfirmacion] telefono="${telefono}" barberia_id="${barberia_id}"`);
  const mode = barberia_id ? await _obtenerModo(barberia_id) : "cloud_api";

  if (mode === "wwebjs") {
    if (!isWwebjsEnabled()) {
      console.warn(`[wwebjs] WhatsApp Web deshabilitado para barberia ${barberia_id}, confirmacion no enviada`);
      return;
    }

    const { getClient } = require("./wwebjs.manager");
    const entry = getClient(barberia_id);
    if (entry?.status === "authenticated") {
      const msg = `✅ *Tu turno está confirmado*\n\n💈 Barbero: ${barbero}\n📅 Fecha: ${fecha}\n🕐 Hora: ${horario}\n✂️ Servicio: ${servicio}\n💰 Total: $${precio}\n\n¡Te esperamos!`;
      const chatId = await _resolverChatId(entry.client, telefono);
      await entry.client.sendMessage(chatId, msg);
      console.log("✅ Confirmación wwebjs enviada a", telefono);
    } else {
      console.warn(`[wwebjs] Cliente no listo para barberia ${barberia_id}, confirmación no enviada`);
    }
    return;
  }

  // cloud_api
  try {
    const url = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: "turno_confirmado_v2",
          language: { code: "es" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: servicio },
                { type: "text", text: barbero },
                { type: "text", text: fecha },
                { type: "text", text: horario },
                { type: "text", text: String(precio) }
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("✅ Template confirmación enviado a", telefono);
  } catch (error) {
    console.error("❌ Error enviando template confirmación:", error.response?.data || error.message);
  }
}

async function notificarBarbero(datos) {
  console.log(`[notificarBarbero] barbero="${datos.barbero}" telefono="${datos.telefono}" barberia_id="${datos.barberia_id}"`);

  let barberia, barberiaError;
  try {
    const result = await supabaseAdmin
      .from("barberias")
      .select("whatsapp_mode, phone_number_id")
      .eq("id", datos.barberia_id)
      .single();
    barberia = result.data;
    barberiaError = result.error;
  } catch (err) {
    console.error("[notificarBarbero] Error consultando barberia:", err.message);
    return;
  }

  if (barberiaError) {
    console.error("[notificarBarbero] Supabase error al obtener barberia:", barberiaError.message);
  }

  const mode = barberia?.whatsapp_mode || "cloud_api";
  console.log(`[notificarBarbero] modo detectado="${mode}" phone_number_id="${barberia?.phone_number_id}"`);

  if (mode === "wwebjs") {
    if (!isWwebjsEnabled()) {
      console.warn(`[notificarBarbero] WhatsApp Web deshabilitado para barberia ${datos.barberia_id}, notificacion no enviada`);
      return;
    }

    try {
      const { getClient } = require("./wwebjs.manager");
      const entry = getClient(datos.barberia_id);
      console.log(`[notificarBarbero] wwebjs entry.status="${entry?.status}"`);
      if (entry?.status === "authenticated") {
        const telefonoBarbero = await _obtenerTelefonoBarbero(datos);
        console.log(`[notificarBarbero] telefonoBarbero resuelto="${telefonoBarbero}"`);
        if (!telefonoBarbero) {
          console.warn("[notificarBarbero] No hay número para el barbero:", datos.barbero);
          return;
        }
        const [y, m, d] = String(datos.fecha).split("-");
        const fechaFormateada = `${d}/${m}/${y}`;
        const horaFormateada = String(datos.hora).slice(0, 5);
        const msg = `🔔 *Nuevo turno reservado*\n\n💈 Barbero: ${datos.barbero}\n👤 Cliente: ${datos.nombre}\n📅 Fecha: ${fechaFormateada}\n🕐 Hora: ${horaFormateada}\n✂️ Servicio: ${datos.servicio}`;
        const chatId = await _resolverChatId(entry.client, telefonoBarbero);
        await entry.client.sendMessage(chatId, msg);
        console.log("✅ Notificación wwebjs enviada al barbero:", datos.barbero);
      } else {
        console.warn(`[notificarBarbero] Cliente no listo para barberia ${datos.barberia_id}, notificación no enviada`);
      }
    } catch (err) {
      console.error("[notificarBarbero] Error en rama wwebjs:", err.message, err.stack);
    }
    return;
  }

  // cloud_api
  const phone_number_id = barberia?.phone_number_id;
  if (!phone_number_id) {
    console.log("[notificarBarbero] Barbería sin phone_number_id configurado");
    return;
  }

  let telefonoBarbero;
  try {
    telefonoBarbero = datos.telefono || (await _obtenerTelefonoBarbero(datos));
    console.log(`[notificarBarbero] telefonoBarbero resuelto="${telefonoBarbero}"`);
  } catch (err) {
    console.error("[notificarBarbero] Error obteniendo teléfono del barbero:", err.message);
    return;
  }

  if (!telefonoBarbero) {
    console.log("[notificarBarbero] No hay número para el barbero:", datos.barbero);
    return;
  }

  const [y, m, d] = String(datos.fecha).split("-");
  const fechaFormateada = `${d}/${m}/${y}`;
  const horaFormateada = String(datos.hora).slice(0, 5);

  const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages`;
  console.log(`[notificarBarbero] Enviando template cloud_api a "${telefonoBarbero}" via phone_number_id="${phone_number_id}"`);
  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: telefonoBarbero,
        type: "template",
        template: {
          name: "nuevo_turno_barbero_v2",
          language: { code: "es_AR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: datos.barbero },
                { type: "text", text: datos.nombre },
                { type: "text", text: fechaFormateada },
                { type: "text", text: horaFormateada },
                { type: "text", text: datos.servicio }
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("✅ Plantilla enviada al barbero:", datos.barbero);
  } catch (error) {
    console.error("[notificarBarbero] Error enviando template cloud_api:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("[notificarBarbero] Detalle Meta API:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

async function _obtenerTelefonoBarbero(datos) {
  if (datos.telefono) return datos.telefono;
  const { data } = await supabaseAdmin
    .from("barberos")
    .select("telefono")
    .ilike("nombre", datos.barbero)
    .eq("barberia_id", datos.barberia_id);
  return data?.[0]?.telefono || null;
}

module.exports = { enviarMensaje, notificarBarbero, enviarTemplateConfirmacion, asyncLocalStorage };
