const path = require('path');
const fs = require('fs');

// barberia_id → { client, qr, status }
const clients = new Map();
const isEnabled = () => process.env.WHATSAPP_ENABLED === 'true' && process.env.WWEBJS_ENABLED === 'true';
const shouldAutoReconnect = () => process.env.WWEBJS_AUTO_RECONNECT === 'true';

async function initializeAllClients() {
  if (!isEnabled()) {
    console.log('[wwebjs] Deshabilitado. No se inicializan clientes WhatsApp Web.');
    return;
  }

  try {
    const { supabaseAdmin } = require('../config/supabase');

    const { data: barberias, error } = await supabaseAdmin
      .from('barberias')
      .select('id')
      .eq('whatsapp_mode', 'wwebjs');

    if (error || !barberias?.length) return;

    for (const b of barberias) {
      initClient(b.id);
    }
  } catch (err) {
    console.error('[wwebjs] Error en initializeAllClients:', err.message);
  }
}

function initClient(barberia_id) {
  if (!isEnabled()) {
    return {
      client: null,
      qr: null,
      status: 'disabled',
      readyAt: null,
      errorMessage: 'WhatsApp Web esta deshabilitado en este servidor'
    };
  }

  if (clients.has(barberia_id)) return clients.get(barberia_id);

  const clientId = `barberia_${barberia_id}`;
  const dataPath = process.env.WWEBJS_AUTH_PATH || path.join(process.cwd(), '.wwebjs_auth');

  let client;
  try {
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const puppeteerConfig = {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    client = new Client({
      authStrategy: new LocalAuth({ clientId, dataPath }),
      puppeteer: puppeteerConfig
    });
  } catch (err) {
    console.error(`[wwebjs] No se pudo crear el cliente para barberia ${barberia_id}:`, err.message);
    return null;
  }

  const entry = { client, qr: null, status: 'initializing', readyAt: null };
  clients.set(barberia_id, entry);

  client.on('qr', (qr) => {
    entry.qr = qr;
    entry.status = 'qr_pending';
    console.log(`[wwebjs] QR generado para barberia ${barberia_id} | status=${entry.status} | qr_length=${entry.qr?.length ?? 0}`);
  });

  client.on('authenticated', () => {
    entry.status = 'authenticated';
    entry.qr = null;
  });

  client.on('ready', () => {
    entry.status = 'authenticated';
    entry.qr = null;
    entry.readyAt = Math.floor(Date.now() / 1000);
    console.log(`[wwebjs] Cliente listo para barberia ${barberia_id}`);
  });

  client.on('auth_failure', () => {
    entry.status = 'auth_failure';
    console.error(`[wwebjs] Auth failure para barberia ${barberia_id}.`);
    try { client.destroy(); } catch (_) {}
    clients.delete(barberia_id);
    if (!shouldAutoReconnect()) return;
    setTimeout(() => {
      console.log(`[wwebjs] Reconectando tras auth_failure barberia ${barberia_id}...`);
      initClient(barberia_id);
    }, 10000);
  });

  client.on('disconnected', (reason) => {
    entry.status = 'disconnected';
    console.log(`[wwebjs] Desconectado para barberia ${barberia_id}: ${reason}.`);
    try { client.destroy(); } catch (_) {}
    clients.delete(barberia_id);
    if (!shouldAutoReconnect()) return;
    setTimeout(() => {
      console.log(`[wwebjs] Reconectando barberia ${barberia_id}...`);
      initClient(barberia_id);
    }, 5000);
  });

  const processedMessages = new Set();
  async function handleIncomingMessage(message, eventName) {
    if (process.env.WHATSAPP_RECEPCION_PILOT_ENABLED !== 'true') {
      console.log('[wwebjs] recepcion piloto desactivada por env WHATSAPP_RECEPCION_PILOT_ENABLED');
      return;
    }
    if (!message?.body || message.fromMe) return;
    if (!message.from || !message.from.endsWith('@c.us')) return;

    const messageId = message.id?._serialized || `${message.from}:${message.timestamp}:${message.body}`;
    if (processedMessages.has(messageId)) return;
    processedMessages.add(messageId);
    setTimeout(() => processedMessages.delete(messageId), 10 * 60 * 1000);

    const preview = String(message.body).slice(0, 80);
    console.log(`[wwebjs] mensaje directo recibido event=${eventName} barberia=${barberia_id} from=${message.from} body="${preview}"`);

    try {
      const { procesarRecepcionWhatsapp } = require('./recepcion_whatsapp.service');
      const resultado = await procesarRecepcionWhatsapp({
        barberia_id,
        from: message.from,
        text: message.body
      });
      if (resultado?.ignored) {
        console.log(`[wwebjs] recepcion ignorada: ${resultado.reason}`);
      } else {
        console.log(`[wwebjs] recepcion procesada completed=${Boolean(resultado?.completed)}`);
      }
    } catch (err) {
      console.error(`[wwebjs] Error procesando recepcion barberia ${barberia_id}:`, err.message);
    }
  }

  client.on('message', (message) => {
    handleIncomingMessage(message, 'message');
  });

  client.on('message_create', (message) => {
    handleIncomingMessage(message, 'message_create');
  });

  // Eliminar lock files de Chromium que quedan de procesos anteriores
  const profilePath = path.join(dataPath, `session-${clientId}`);
  for (const lockFile of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(profilePath, lockFile);
    try { fs.unlinkSync(lockPath); console.log(`[wwebjs] Lock eliminado: ${lockFile}`); } catch (_) {}
  }

  client.initialize().catch((err) => {
    console.error(`[wwebjs] Error init barberia ${barberia_id}:`, err.message);
    entry.status = 'error';
    entry.errorMessage = err.message;
    clients.delete(barberia_id);
    if (!shouldAutoReconnect()) return;
    setTimeout(() => {
      console.log(`[wwebjs] Reintentando init barberia ${barberia_id}...`);
      initClient(barberia_id);
    }, 15000);
  });

  return entry;
}


function getClient(barberia_id) {
  return clients.get(barberia_id) || null;
}

module.exports = { initializeAllClients, initClient, getClient };
