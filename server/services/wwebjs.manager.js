const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

// barberia_id → { client, qr, status }
const clients = new Map();

async function initializeAllClients() {
  const { supabaseAdmin } = require('../config/supabase');

  const { data: barberias, error } = await supabaseAdmin
    .from('barberias')
    .select('id')
    .eq('whatsapp_mode', 'wwebjs');

  if (error || !barberias?.length) return;

  for (const b of barberias) {
    initClient(b.id);
  }
}

function initClient(barberia_id) {
  if (clients.has(barberia_id)) return clients.get(barberia_id);

  const clientId = `barberia_${barberia_id}`;
  const dataPath = path.join(process.cwd(), '.wwebjs_auth');

  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });

  const entry = { client, qr: null, status: 'initializing' };
  clients.set(barberia_id, entry);

  client.on('qr', (qr) => {
    entry.qr = qr;
    entry.status = 'qr_pending';
    console.log(`[wwebjs] QR generado para barberia ${barberia_id}`);
  });

  client.on('authenticated', () => {
    entry.status = 'authenticated';
    entry.qr = null;
  });

  client.on('ready', () => {
    entry.status = 'authenticated';
    entry.qr = null;
    console.log(`[wwebjs] Cliente listo para barberia ${barberia_id}`);
  });

  client.on('auth_failure', () => {
    entry.status = 'auth_failure';
    console.error(`[wwebjs] Auth failure para barberia ${barberia_id}`);
  });

  client.on('disconnected', (reason) => {
    entry.status = 'disconnected';
    clients.delete(barberia_id);
    console.log(`[wwebjs] Desconectado para barberia ${barberia_id}: ${reason}`);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe || msg.isGroupMsg) return;
    await handleIncomingMessage(barberia_id, msg);
  });

  client.initialize().catch((err) => {
    console.error(`[wwebjs] Error init barberia ${barberia_id}:`, err.message);
    clients.delete(barberia_id);
  });

  return entry;
}

async function handleIncomingMessage(barberia_id, msg) {
  const { supabaseAdmin } = require('../config/supabase');
  const { mensajeYaProcesado, guardarMensajeProcesado } = require('./deduplicacion.service');
  const { procesarMensaje } = require('./bot.service');

  const messageId = msg.id._serialized;

  if (await mensajeYaProcesado(messageId)) return;
  await guardarMensajeProcesado(messageId);

  const from = msg.from.replace('@c.us', '');
  const text = msg.body;

  const { data: barberia } = await supabaseAdmin
    .from('barberias')
    .select('*')
    .eq('id', barberia_id)
    .single();

  if (!barberia) return;

  let { data: cliente } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('telefono', from)
    .eq('barberia_id', barberia_id)
    .maybeSingle();

  if (!cliente) {
    cliente = { telefono: from, nombre: null, barberia_id };
  }

  await procesarMensaje({ from, text, cliente, barberia, barberia_id });
}

function getClient(barberia_id) {
  return clients.get(barberia_id) || null;
}

module.exports = { initializeAllClients, initClient, getClient };
