process.on("uncaughtException", (err) => {
  console.error("ERROR GLOBAL:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("PROMISE ERROR:", err);
});

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path"); // 👈 NUEVO
const session = require("express-session");
const { createClient } = require("@supabase/supabase-js");
const authMiddleware = require("./middleware/auth");

const app = express();

// ==============================
// CONFIG
// ==============================

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_secreto";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;


// ==============================
// SUPABASE
// ==============================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
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
    barberia_id: turno.barberia_id, // 👈 ACA
    recordatorio_24h: false,
    recordatorio_3h: false
  }]);

  if (error) {
    console.log("❌ Error guardando:", JSON.stringify(error, null, 2));
    return false;
  }
  return true;
}

async function obtenerHorariosDisponibles(barbero, barberia_id) {
  const hoy = new Date().toISOString().split("T")[0];

  // ⛔ fallback seguro (NO rompe nunca)
  let hora_inicio = "10:00";
  let hora_fin = "20:00";

  try {
    const { data } = await supabase
  .from("barberos")
  .select("*")
  .ilike("nombre", barbero)
  .eq("barberia_id", barberia_id)
  .maybeSingle();

    if (data) {
      hora_inicio = data.hora_inicio;
      hora_fin = data.hora_fin;
    }
  } catch (error) {
    console.log("⚠️ Error obteniendo barbero:", error);
  }

  // generar horarios
  const horariosBase = [];
  const formatearHora = (hora) => {
  if (!hora) return "10:00";

  const str = String(hora);

  // si viene tipo 09:00:00 → cortar
  if (str.includes(":")) {
    return str.slice(0, 5);
  }

  // si viene como número → convertir
  return `${str.padStart(2, "0")}:00`;
};

let horaActual = formatearHora(hora_inicio);
const horaFin = formatearHora(hora_fin);

  while (true) {
  horariosBase.push(horaActual);

  if (horaActual >= horaFin) break;

  const [h, m] = horaActual.split(":").map(Number);
  const date = new Date();
  date.setHours(h, m + 30);

  horaActual = date.toTimeString().slice(0, 5);
}

  // filtrar ocupados
  const { data: turnos } = await supabase
    .from("turnos")
.select("hora")
.eq("barbero", barbero)
.eq("fecha", hoy)
.eq("barberia_id", barberia_id);

  const ocupados = (turnos || []).map(t =>
  String(t.hora).slice(0, 5)
);

if (horariosBase.length === 0) {
  console.log("⚠️ No se generaron horarios base");
  return ["10:00", "10:30", "11:00"];
}

  console.log("🧪 horariosBase:", horariosBase);
console.log("🧪 ocupados:", ocupados);

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

async function obtenerTurnos(telefono, barberia_id) {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("telefono", telefono)
    .eq("barberia_id", barberia_id)// 👈 ACA
    .order("fecha", { ascending: true });

  if (error) {
    console.log("❌ Error obteniendo turnos:", error);
    return [];
  }

  return data;
}

async function turnoDisponible(fecha, hora, barbero) {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("hora", hora)
    .eq("barbero", barbero)
    .eq("fecha", fecha);

  if (error) {
    console.log("❌ Error verificando disponibilidad:", error);
    return false;
  }

  return data.length === 0;
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

// ==============================
// TEST AUTH (DEBUG)
// ==============================

app.get("/test", authMiddleware, (req, res) => {
  console.log("USER:", req.user);

  res.json({
    ok: true,
    user: req.user,
  });
});

const ADMIN_PASSWORD = "1234";

app.post("/admin/login", (req, res) => {
  console.log("BODY:", req.body);

  const { password } = req.body;

  console.log("PASSWORD RECIBIDA:", password);

  if (password === ADMIN_PASSWORD) {
    req.session.auth = true;
    return res.json({ ok: true });
  }

  res.status(401).json({ error: "Password incorrecta" });
});

app.post("/barbero/login", (req, res) => {
  const { nombre } = req.body;

  if (!nombre) return res.status(400).json({ error: "Falta nombre" });

  req.session.barbero = nombre;

  res.json({ ok: true });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// 👇 PANEL ADMIN (NUEVO)
// 🔐 PROTEGER PANEL BARBERO
app.use("/admin/barbero.html", (req, res, next) => {
  if (req.session.barbero) return next();
  return res.sendFile(path.join(__dirname, "admin/login-barbero.html"));
});

// 👇👇👇 NUEVO ENDPOINT
app.post("/admin/crear-turno", authMiddleware, async (req, res) => {
  const { nombre, telefono, servicio, barbero, fecha, hora } = req.body;

  console.log("🧪 Endpoint ADMIN crear turno");
  console.log("🧪 Barbero recibido desde panel:", barbero);

  const barberia_id = req.user.barberia_id;

  if (!nombre || !telefono || !servicio || !barbero || !fecha || !hora) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    // 🔹 Verificar si está ocupado
    const { data: turnosExistentes, error: errorBusqueda } = await supabase
      .from("turnos")
      .select("*")
      .eq("hora", hora)
      .eq("barbero", barbero)
      .eq("fecha", fecha);

    if (errorBusqueda) {
      console.log("❌ Error verificando turnos:", errorBusqueda);
      return res.status(500).json({ error: "Error verificando disponibilidad" });
    }

    if (turnosExistentes.length > 0) {
      return res.status(400).json({ error: "Horario ocupado" });
    }

    // 🔹 Guardar turno
    const { error: errorInsert } = await supabase.from("turnos").insert([{
      nombre,
      telefono,
      servicio,
      barbero,
      fecha,
      hora,
      barberia_id, // 👈 ACA
      recordatorio_24h: false,
      recordatorio_3h: false
    }]);

    if (errorInsert) {
      console.log("❌ Error creando turno:", errorInsert);
      return res.status(500).json({ error: "Error guardando" });
    }

    // 🔹 Obtener teléfono del barbero (case insensitive)
    const { data: barberoData, error: errorBarbero } = await supabase
      .from("barberos")
      .select("telefono, nombre")
      .ilike("nombre", barbero)
      .single();

    console.log("📱 Telefono barbero encontrado:", barberoData?.telefono);

    if (errorBarbero) {
      console.log("❌ Error obteniendo barbero:", errorBarbero);
    }

    // 🔹 Notificar al barbero
    console.log("🧪 Llamando a notificarBarbero desde ADMIN");

    await notificarBarbero({
      nombre,
      servicio,
      barbero,
      fecha,
      hora,
      telefono: barberoData?.telefono
    });

    res.json({ ok: true });

  } catch (err) {
    console.log("❌ Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// 👑 SUPERADMIN - CREAR BARBERÍA + ADMIN
app.post("/superadmin/crear-barberia", async (req, res) => {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    const { data: authUser, error: errorAuth } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (errorAuth) {
      console.error("❌ Error auth:", errorAuth);
      return res.status(500).json({ error: "Error creando usuario" });
    }

    const userId = authUser.user.id;

    const { data: barberia, error: errorBarberia } =
      await supabaseAdmin
        .from("barberias")
        .insert([{ nombre }])
        .select()
        .single();

    if (errorBarberia) {
      console.error("❌ Error barbería:", errorBarberia);
      return res.status(500).json({ error: "Error creando barbería" });
    }

    const { error: errorUsuario } = await supabaseAdmin
      .from("usuarios")
      .insert([
        {
          id: userId,
          email,
          rol: "admin",
          barberia_id: barberia.id,
        },
      ]);

    if (errorUsuario) {
      console.error("❌ Error usuario:", errorUsuario);
      return res.status(500).json({ error: "Error vinculando usuario" });
    }

    res.json({
      ok: true,
      barberia,
      userId,
    });

  } catch (err) {
    console.error("💥 Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// 🔐 PROTEGER PANEL ADMIN (PERO EXCLUIR BARBERO)
app.use("/admin", (req, res, next) => {
  // 👇 IMPORTANTE: dejar pasar barbero
  if (req.path === "/barbero.html") return next();

  if (req.session.auth) return next();
  return res.sendFile(path.join(__dirname, "admin/login.html"));
});

// 📁 SERVIR ARCHIVOS
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

app.put("/admin/turnos/:id", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const { error } = await supabase
    .from("turnos")
    .update({ estado })
    .eq("id", id);

  if (error) return res.status(500).json({ error });

  res.json({ ok: true });
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

// 👉 Cambiar estado del turno
app.put("/turnos/:id/estado", async (req, res) => {
  console.log("🔥 PUT /turnos funcionando");
  try {
    const { id } = req.params;
    const { estado } = req.body;

    // validar
    if (!estado) {
      return res.status(400).json({ error: "Falta estado" });
    }

    const { data, error } = await supabase
      .from("turnos")
      .update({ estado })
      .eq("id", id)
      .select();

    if (error) {
      console.error("❌ Error Supabase:", error);
      return res.status(500).json({ error });
    }

    return res.json(data);

  } catch (err) {
    console.error("💥 CRASH EN PUT:", err);
    return res.status(500).json({ error: "Error interno" });
  }
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

    // ==============================
    // 🔥 DETECTAR BARBERÍA
    // ==============================
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!phoneNumberId) {
      console.log("❌ No vino phone_number_id");
      return;
    }

    const { data: barberia, error } = await supabase
      .from("barberias")
      .select("*")
      .eq("phone_number_id", phoneNumberId)
      .single();

    if (error || !barberia) {
      console.log("❌ Barbería no encontrada:", phoneNumberId);
      return;
    }

    const barberia_id = barberia.id;

    console.log("✅ Barbería detectada:", barberia.nombre);

    // ==============================
    // 📩 MENSAJE
    // ==============================
    if (!value?.messages || value.messages.length === 0) return;

    const message = value.messages[0];

    if (!message.text) return;

    const messageId = message.id;

    if (await mensajeYaProcesado(messageId)) return;
    await guardarMensajeProcesado(messageId);

    const from = message.from;
    const text = message.text.body;

    // ==============================
    // 👤 CLIENTE (MULTI-BARBERÍA)
    // ==============================
    let { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("telefono", from)
      .eq("barberia_id", barberia_id)
      .maybeSingle();

    if (!cliente) {
      const { data: nuevoCliente } = await supabase
        .from("clientes")
        .insert({
          telefono: from,
          nombre: from,
          barberia_id: barberia_id
        })
        .select()
        .single();

      cliente = nuevoCliente;
    }

    console.log("👤 Cliente:", cliente.telefono);

    // ==============================
    // 🧠 ESTADO POR BARBERÍA
    // ==============================
    const userKey = `${from}_${barberia_id}`;

    if (!usuarios[userKey]) {
      usuarios[userKey] = {
        estado: "inicio",
        servicio: null,
        barbero: null,
        horario: null,
        turnos: null
      };
    }

    const usuario = usuarios[userKey];
    const mensaje = text.toLowerCase();
    

    // ==============================
// 🔥 INTENCIÓN: QUIERE TURNO
// ==============================
if (mensaje.includes("turno")) {
  usuario.estado = "servicio";

  return await enviarMensaje(from, `🔥 Perfecto, vamos a agendar

¿Qué servicio querés?

1️⃣ Corte
2️⃣ Barba
3️⃣ Corte + barba`);
}

    // ==============================
    // 🤖 FLUJO BOT
    // ==============================

    if (usuario.estado === "inicio") {
      usuario.estado = "menu";

      return await enviarMensaje(from, `👋 Hola! Bienvenido a ${barberia.nombre} 💈

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
        const turnos = await obtenerTurnos(from, barberia_id);

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
        const turnos = await obtenerTurnos(from, barberia_id);

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

      const horarios = await obtenerHorariosDisponibles(
        usuario.barbero,
        barberia_id
      );

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
      const hoy = new Date().toISOString().split("T")[0];

      if (mensaje === "1") {
        const disponible = await turnoDisponible(
          hoy,
          usuario.horario,
          usuario.barbero
        );

        if (!disponible) {
          usuario.estado = "horario";
          return await enviarMensaje(from, "⚠️ Ese horario ya está ocupado. Elegí otro.");
        }

        const ok = await guardarTurno({
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          servicio: usuario.servicio,
          barbero: usuario.barbero,
          fecha: hoy,
          hora: usuario.horario,
          barberia_id: barberia_id
        });

        usuario.estado = "inicio";

        if (ok) {
          await notificarBarbero({
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            servicio: usuario.servicio,
            barbero: usuario.barbero,
            fecha: hoy,
            hora: usuario.horario,
            barberia_id: barberia_id
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
    console.log("📨 enviarMensaje llamado con:", numero);

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
async function notificarBarbero(datos) {
  let telefono = datos.telefono;

  console.log("🔔 NOTIFICANDO BARBERO...");

  // 🔥 Si no viene teléfono, lo busca solo
  if (!telefono) {
    const { data: barberoData, error } = await supabase
      .from("barberos")
      .select("telefono")
      .ilike("nombre", datos.barbero);

    if (error) {
      console.log("❌ Error buscando teléfono:", error);
    }

    telefono = barberoData?.[0]?.telefono;
  }

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

  await enviarMensaje(telefono, mensaje);
}

// ==============================
// START
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});

// ==============================
// 🔁 CRON RECORDATORIOS (1 HORA)
// ==============================

setInterval(async () => {
  try {
    console.log("⏳ Revisando recordatorios...");
    await enviarRecordatorios();
  } catch (error) {
    console.error("❌ Error en recordatorios:", error);
  }
}, 60 * 60 * 1000);