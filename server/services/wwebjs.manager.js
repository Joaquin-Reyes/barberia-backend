const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

// barberia_id → { client, qr, status }
const clients = new Map();

async function initializeAllClients() {
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
  if (clients.has(barberia_id)) return clients.get(barberia_id);

  const clientId = `barberia_${barberia_id}`;
  const dataPath = process.env.WWEBJS_AUTH_PATH || path.join(process.cwd(), '.wwebjs_auth');

  let client;
  try {
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
    console.error(`[wwebjs] Auth failure para barberia ${barberia_id}. Reconectando en 10s...`);
    try { client.destroy(); } catch (_) {}
    clients.delete(barberia_id);
    setTimeout(() => {
      console.log(`[wwebjs] Reconectando tras auth_failure barberia ${barberia_id}...`);
      initClient(barberia_id);
    }, 10000);
  });

  client.on('disconnected', (reason) => {
    entry.status = 'disconnected';
    console.log(`[wwebjs] Desconectado para barberia ${barberia_id}: ${reason}. Reconectando en 5s...`);
    try { client.destroy(); } catch (_) {}
    clients.delete(barberia_id);
    setTimeout(() => {
      console.log(`[wwebjs] Reconectando barberia ${barberia_id}...`);
      initClient(barberia_id);
    }, 5000);
  });

  // TODO: habilitar bot para wwebjs cuando se requiera

  client.initialize().catch((err) => {
    console.error(`[wwebjs] Error init barberia ${barberia_id}:`, err.message);
    entry.status = 'error';
    entry.errorMessage = err.message;
  });

  return entry;
}


function getClient(barberia_id) {
  return clients.get(barberia_id) || null;
}

module.exports = { initializeAllClients, initClient, getClient };
