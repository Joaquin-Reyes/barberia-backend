const { supabaseAdmin } = require("../config/supabase");
const { notificarBarbero, enviarTemplateConfirmacion } = require("../services/whatsapp.service");
const { formatearHora } = require("../services/agenda.service");
const wwebjsManager = require("../services/wwebjs.manager");

async function crearTurno(req, res) {
  const { nombre, telefono, servicio, precio, barbero, fecha, hora } = req.body;

  console.log("🧪 Endpoint ADMIN crear turno");
  console.log("🧪 Barbero recibido desde panel:", barbero);

  const barberia_id = req.user.barberia_id;
  const horaNormalizada = formatearHora(hora);

  if (!nombre || !telefono || !fecha || !hora) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    const { data: turnosExistentes, error: errorBusqueda } = await supabaseAdmin
      .from("turnos")
      .select("*")
      .eq("hora", horaNormalizada)
      .eq("barbero", barbero)
      .eq("fecha", fecha);

    if (errorBusqueda) {
      console.log("❌ Error verificando turnos:", errorBusqueda);
      return res.status(500).json({ error: "Error verificando disponibilidad" });
    }

    if (turnosExistentes.length > 0) {
      return res.status(400).json({ error: "Horario ocupado" });
    }

    const { error: errorInsert } = await supabaseAdmin.from("turnos").insert([{
      nombre,
      telefono,
      servicio,
      precio: precio || 0,
      barbero,
      fecha,
      hora: horaNormalizada,
      barberia_id,
      recordatorio_24h: false,
      recordatorio_3h: false
    }]);

    if (errorInsert) {
      console.log("❌ Error creando turno:", errorInsert);
      return res.status(500).json({ error: "Error guardando" });
    }

    if (barbero) {
      const { data: barberoData, error: errorBarbero } = await supabaseAdmin
        .from("barberos")
        .select("telefono, nombre")
        .ilike("nombre", barbero)
        .eq("barberia_id", barberia_id)
        .maybeSingle();

      console.log("📱 Telefono barbero encontrado:", barberoData?.telefono);

      if (errorBarbero) {
        console.log("❌ Error obteniendo barbero:", errorBarbero);
      }

      await notificarBarbero({
        nombre,
        servicio,
        barbero,
        fecha,
        hora,
        telefono: barberoData?.telefono,
        barberia_id
      });
    }

    if (telefono) {
      try {
        const [y, m, d] = String(fecha).split("-");
        await enviarTemplateConfirmacion({
          telefono,
          servicio,
          barbero,
          fecha: `${d}/${m}/${y}`,
          horario: String(horaNormalizada).slice(0, 5),
          precio: precio || 0,
          barberia_id
        });
        console.log("✅ Template confirmacion enviado al cliente:", telefono);
      } catch (errTemplate) {
        console.error("❌ Error enviando template al cliente:", errTemplate.response?.data || errTemplate.message);
      }
    }

    res.json({ ok: true });

  } catch (err) {
    console.log("❌ Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function listarTurnos(req, res) {
  const { fecha } = req.query;

  let query = supabaseAdmin.from("turnos").select("*");
  if (fecha) query = query.eq("fecha", fecha);

  const { data, error } = await query.order("hora", { ascending: true });
  if (error) return res.status(500).json({ error });
  res.json(data);
}

async function actualizarEstadoTurno(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  const { error } = await supabaseAdmin
    .from("turnos")
    .update({ estado })
    .eq("id", id);

  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
}

async function eliminarTurno(req, res) {
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from("turnos")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
}

async function crearBarbero(req, res) {
  const { nombre, telefono, email } = req.body;
  const barberia_id = req.user.barberia_id;

  if (!nombre || !telefono || !email) {
    return res.status(400).json({ error: "Faltan datos: nombre, teléfono y email son requeridos" });
  }

  try {
    const telefonoFormateado = telefono.startsWith("549") ? telefono : "549" + telefono;

    const { data, error } = await supabaseAdmin
      .from("barberos")
      .insert({ nombre, telefono: telefonoFormateado, barberia_id })
      .select()
      .single();

    if (error) {
      console.log("❌ Error creando barbero:", error);
      return res.status(500).json({ error: "Error guardando barbero" });
    }

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { rol: "barbero", barberia_id, nombre, barbero_id: data.id },
    });

    if (inviteError) {
      console.log("⚠️ Error enviando invitación:", inviteError.message);
      return res.json({ ...data, invite_warning: "Barbero creado pero no se pudo enviar el email de invitación" });
    }

    const authUserId = inviteData?.user?.id;
    if (authUserId) {
      const { error: updateError } = await supabaseAdmin
        .from("barberos")
        .update({ usuario_id: authUserId })
        .eq("id", data.id);

      if (updateError) {
        console.log("⚠️ No se pudo vincular usuario_id al barbero:", updateError.message);
      } else {
        data.usuario_id = authUserId;
      }
    }

    res.json(data);
  } catch (err) {
    console.log("❌ Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function eliminarBarbero(req, res) {
  const { id } = req.params;
  const barberia_id = req.user.barberia_id;

  if (req.user.rol !== "admin" && req.user.rol !== "superadmin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }

  try {
    const { data: barbero, error: barberoError } = await supabaseAdmin
      .from("barberos")
      .select("id, usuario_id, barberia_id")
      .eq("id", id)
      .eq("barberia_id", barberia_id)
      .single();

    if (barberoError || !barbero) {
      return res.status(404).json({ error: "Barbero no encontrado" });
    }

    let authUserId = barbero.usuario_id;

    if (!authUserId) {
      const { data: usersData, error: listUsersError } =
        await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

      if (listUsersError) {
        console.log("⚠️ No se pudieron listar usuarios Auth:", listUsersError.message);
      } else {
        const authUser = usersData?.users?.find((user) =>
          user.user_metadata?.barbero_id === id &&
          user.user_metadata?.barberia_id === barberia_id
        );
        authUserId = authUser?.id || null;
      }
    }

    await supabaseAdmin
      .from("horarios_barbero")
      .delete()
      .eq("barbero_id", id)
      .eq("barberia_id", barberia_id);

    await supabaseAdmin
      .from("excepciones_barbero")
      .delete()
      .eq("barbero_id", id)
      .eq("barberia_id", barberia_id);

    const { error: deleteBarberoError } = await supabaseAdmin
      .from("barberos")
      .delete()
      .eq("id", id)
      .eq("barberia_id", barberia_id);

    if (deleteBarberoError) {
      console.log("❌ Error eliminando barbero:", deleteBarberoError);
      return res.status(500).json({ error: "Error eliminando barbero" });
    }

    if (authUserId) {
      const { error: deleteUsuarioError } = await supabaseAdmin
        .from("usuarios")
        .delete()
        .eq("id", authUserId)
        .eq("barberia_id", barberia_id);

      if (deleteUsuarioError) {
        console.log("⚠️ Error eliminando usuario de tabla usuarios:", deleteUsuarioError.message);
      }

      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);

      if (deleteAuthError) {
        console.log("⚠️ Error eliminando usuario de Auth:", deleteAuthError.message);
        return res.json({
          ok: true,
          auth_warning: "Barbero eliminado, pero no se pudo eliminar el usuario de Auth",
        });
      }
    } else {
      return res.json({
        ok: true,
        auth_warning: "Barbero eliminado. No se encontró un usuario de Auth vinculado para borrar",
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.log("❌ Error general eliminando barbero:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function reenviarInvitacion(req, res) {
  const { id } = req.params;
  const { email } = req.body;
  const barberia_id = req.user.barberia_id;

  if (!email) return res.status(400).json({ error: "Falta email" });

  try {
    const { data: barbero, error: barberoError } = await supabaseAdmin
      .from("barberos")
      .select("id, nombre, barberia_id")
      .eq("id", id)
      .eq("barberia_id", barberia_id)
      .single();

    if (barberoError || !barbero) {
      return res.status(404).json({ error: "Barbero no encontrado" });
    }

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { rol: "barbero", barberia_id: barbero.barberia_id, nombre: barbero.nombre, barbero_id: barbero.id },
    });

    if (inviteError) {
      console.log("⚠️ Email de invitación falló (puede ser usuario ya confirmado):", inviteError.message);
      // No retornar 500 todavía — el usuario puede ya estar en Auth, intentar activación directa
    }

    // Siempre intentar activación directa (idempotente)
    const activado = await activarBarberoDirecto({ barbero, email });

    if (inviteError && !activado) {
      return res.status(500).json({ error: `No se pudo enviar invitación ni activar la cuenta: ${inviteError.message}` });
    }

    res.json({ ok: true });
  } catch (err) {
    console.log("❌ Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function activarBarberoDirecto({ barbero, email }) {
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!authUser) return false;

    const { data: existente } = await supabaseAdmin
      .from("usuarios")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (existente) return true; // ya activado

    const { error: insertErr } = await supabaseAdmin.from("usuarios").insert({
      id: authUser.id,
      email: authUser.email,
      rol: "barbero",
      barberia_id: barbero.barberia_id,
    });

    if (insertErr) {
      console.log("⚠️ activarBarberoDirecto: insert en usuarios falló:", insertErr.message);
      return false;
    }

    await supabaseAdmin
      .from("barberos")
      .update({ usuario_id: authUser.id })
      .eq("id", barbero.id);

    console.log("✅ Activación directa exitosa para", email);
    return true;
  } catch (err) {
    console.log("⚠️ activarBarberoDirecto falló (no crítico):", err.message);
    return false;
  }
}

async function listarBarberos(req, res) {
  const barberia_id = req.user.barberia_id;

  const { data, error } = await supabaseAdmin
    .from("barberos")
    .select("*")
    .eq("barberia_id", barberia_id);

  if (error) {
    console.log("❌ Error trayendo barberos:", error);
    return res.status(500).json({ error });
  }

  res.json(data);
}

async function getWhatsappQR(req, res) {
  if (process.env.WWEBJS_ENABLED !== "true") {
    return res.status(503).json({
      status: "disabled",
      error: "WhatsApp Web esta deshabilitado temporalmente"
    });
  }

  const barberia_id = req.user.barberia_id;

  const { data: barberia } = await supabaseAdmin
    .from("barberias")
    .select("whatsapp_mode")
    .eq("id", barberia_id)
    .single();

  if (!barberia || barberia.whatsapp_mode !== "wwebjs") {
    return res.status(400).json({ error: "Esta barbería no usa whatsapp-web.js" });
  }

  let entry = wwebjsManager.getClient(barberia_id);

  if (!entry) {
    entry = wwebjsManager.initClient(barberia_id);
  }

  if (!entry) {
    return res.status(503).json({ status: "error", error: "No se pudo inicializar el cliente WhatsApp" });
  }

  if (entry.status === "authenticated") {
    return res.json({ status: "authenticated" });
  }

  if (entry.status === "error") {
    return res.status(503).json({ status: "error", error: entry.errorMessage || "Chromium no disponible" });
  }

  if (entry.status === "qr_pending" && entry.qr) {
    const QRCode = require("qrcode");
    const qrBase64 = await QRCode.toDataURL(entry.qr);
    return res.json({ status: "qr_pending", qr: qrBase64 });
  }

  return res.json({ status: entry.status });
}

module.exports = {
  crearTurno,
  listarTurnos,
  actualizarEstadoTurno,
  eliminarTurno,
  crearBarbero,
  listarBarberos,
  eliminarBarbero,
  reenviarInvitacion,
  getWhatsappQR
};
