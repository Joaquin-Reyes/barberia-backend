const axios = require("axios");
const { AsyncLocalStorage } = require("async_hooks");
const { supabaseAdmin } = require("../config/supabase");

// Contexto por invocación: { barberia_id, mode }
// Usado por enviarMensaje para saber qué transporte usar sin cambiar sus call sites.
const asyncLocalStorage = new AsyncLocalStorage();

async function enviarMensaje(numero, mensaje, phone_number_id) {
  const ctx = asyncLocalStorage.getStore();

  if (ctx?.mode === "wwebjs" && ctx?.barberia_id) {
    const { getClient } = require("./wwebjs.manager");
    const entry = getClient(ctx.barberia_id);
    if (entry?.status === "authenticated") {
      const chatId = numero.includes("@c.us") ? numero : `${numero}@c.us`;
      await entry.client.sendMessage(chatId, mensaje);
      return;
    }
  }

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

  // Ruta wwebjs: si hay cliente activo para esta barbería, usarlo
  const { getClient } = require("./wwebjs.manager");
  const entry = getClient(datos.barberia_id);

  if (entry?.status === "authenticated") {
    const telefonoBarbero = await _obtenerTelefonoBarbero(datos);
    if (!telefonoBarbero) return;

    const [y, m, d] = String(datos.fecha).split("-");
    const fechaFormateada = `${d}/${m}/${y}`;
    const horaFormateada = String(datos.hora).slice(0, 5);

    const msg = `💈 Nuevo turno!\n\nBarbero: ${datos.barbero}\nCliente: ${datos.nombre}\nFecha: ${fechaFormateada}\nHora: ${horaFormateada}\nServicio: ${datos.servicio}`;

    await entry.client.sendMessage(`${telefonoBarbero}@c.us`, msg);
    console.log("✅ Notificación wwebjs enviada al barbero:", datos.barbero);
    return;
  }

  // Ruta Cloud API (plantilla)
  const { data: barberia } = await supabaseAdmin
    .from("barberias")
    .select("phone_number_id")
    .eq("id", datos.barberia_id)
    .single();

  const phone_number_id = barberia?.phone_number_id;

  if (!phone_number_id) {
    console.log("❌ Barbería sin WhatsApp configurado");
    return;
  }

  const telefonoBarbero = datos.telefono || (await _obtenerTelefonoBarbero(datos));

  if (!telefonoBarbero) {
    console.log("⚠️ No hay número para el barbero:", datos.barbero);
    return;
  }

  const [y, m, d] = String(datos.fecha).split("-");
  const fechaFormateada = `${d}/${m}/${y}`;
  const horaFormateada = String(datos.hora).slice(0, 5);

  console.log("📤 Enviando plantilla a barbero:", telefonoBarbero);

  const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages`;

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
    console.error("❌ Error enviando plantilla al barbero:", error.response?.data || error.message);
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

async function enviarTemplateConfirmacion({ telefono, servicio, barbero, fecha, horario, precio, barberia_id }) {
  // Ruta wwebjs
  if (barberia_id) {
    const { getClient } = require("./wwebjs.manager");
    const entry = getClient(barberia_id);
    if (entry?.status === "authenticated") {
      const msg = `✅ ¡Turno confirmado!\n\n✂️ ${servicio}\n💈 ${barbero}\n📅 ${fecha}\n⏰ ${horario}\n💵 $${precio}`;
      await entry.client.sendMessage(`${telefono}@c.us`, msg);
      return;
    }
  }

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
}

module.exports = { enviarMensaje, notificarBarbero, enviarTemplateConfirmacion, asyncLocalStorage };
