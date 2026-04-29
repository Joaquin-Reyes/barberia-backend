const { supabaseAdmin } = require("../config/supabase");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function adminLogin(req, res) {
  console.log("BODY:", req.body);
  const { password } = req.body;
  console.log("PASSWORD RECIBIDA:", password);

  if (password === ADMIN_PASSWORD) {
    req.session.auth = true;
    return res.json({ ok: true });
  }

  res.status(401).json({ error: "Password incorrecta" });
}

function barberoLogin(req, res) {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta nombre" });
  req.session.barbero = nombre;
  res.json({ ok: true });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}

async function activarCuenta(req, res) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Token inválido" });

  const { data: existente } = await supabaseAdmin
    .from("usuarios")
    .select("id, barbero_id")
    .eq("id", user.id)
    .maybeSingle();

  const { rol, barberia_id, nombre, barbero_id } = user.user_metadata || {};

  if (existente) {
    // Ya existe — asegurar que barberos.usuario_id esté vinculado
    const bId = existente.barbero_id || barbero_id;
    if (bId) {
      await supabaseAdmin
        .from("barberos")
        .update({ usuario_id: user.id })
        .eq("id", bId);
    }
    return res.json({ ok: true });
  }

  // Si la metadata tiene los datos necesarios, crear el usuario directamente
  if (rol && barberia_id) {
    const { error: insertError } = await supabaseAdmin
      .from("usuarios")
      .insert({ id: user.id, email: user.email, rol, barberia_id, nombre, barbero_id });

    if (insertError) {
      console.log("❌ Error creando usuario:", insertError);
      return res.status(500).json({ error: "Error creando usuario" });
    }

    if (barbero_id) {
      await supabaseAdmin
        .from("barberos")
        .update({ usuario_id: user.id })
        .eq("id", barbero_id);
    }

    return res.json({ ok: true });
  }

  // Fallback: metadata vacía — buscar barbero por email en la tabla barberos
  // (puede pasar cuando Supabase no actualiza metadata para usuarios ya existentes)
  console.log("⚠️ Metadata incompleta para user", user.id, "| metadata:", user.user_metadata, "| intentando fallback por email");

  // Caso 1: el barbero ya tiene usuario_id = user.id pero nunca se creó el registro en usuarios
  const { data: barberoYaVinculado } = await supabaseAdmin
    .from("barberos")
    .select("id, nombre, barberia_id")
    .eq("usuario_id", user.id)
    .maybeSingle();

  if (barberoYaVinculado) {
    const { error: insertError } = await supabaseAdmin
      .from("usuarios")
      .insert({ id: user.id, email: user.email, rol: "barbero", barberia_id: barberoYaVinculado.barberia_id, nombre: barberoYaVinculado.nombre, barbero_id: barberoYaVinculado.id });
    if (insertError) {
      console.log("❌ Error creando usuario (fallback vinculado):", insertError);
      return res.status(500).json({ error: "Error creando usuario" });
    }
    console.log("✅ Activación por barbero ya vinculado para", user.email, "→", barberoYaVinculado.nombre);
    return res.json({ ok: true });
  }

  // Caso 2: buscar barbero sin vincular
  const { data: barberoMatch } = await supabaseAdmin
    .from("barberos")
    .select("id, nombre, barberia_id")
    .is("usuario_id", null)
    .limit(50);

  // Buscar en Supabase Auth si el email del usuario coincide con algún barbero pendiente
  // Para eso necesitamos un campo email en barberos — por ahora buscamos por nombre en el meta
  // o retornamos error con información útil
  if (!barberoMatch || barberoMatch.length === 0) {
    console.log("❌ No se encontraron barberos sin vincular");
    return res.status(400).json({ error: "Metadata de invitación incompleta y no hay barberos pendientes de activación" });
  }

  // Si hay exactamente 1 barbero sin vincular, lo asignamos a este usuario
  if (barberoMatch.length === 1) {
    const b = barberoMatch[0];
    const { error: insertError } = await supabaseAdmin
      .from("usuarios")
      .insert({ id: user.id, email: user.email, rol: "barbero", barberia_id: b.barberia_id, nombre: b.nombre, barbero_id: b.id });

    if (insertError) {
      console.log("❌ Error creando usuario (fallback):", insertError);
      return res.status(500).json({ error: "Error creando usuario" });
    }

    await supabaseAdmin
      .from("barberos")
      .update({ usuario_id: user.id })
      .eq("id", b.id);

    console.log("✅ Activación por fallback exitosa para", user.email, "→ barbero", b.nombre);
    return res.json({ ok: true });
  }

  console.log("❌ Metadata incompleta y hay múltiples barberos sin vincular, no se puede determinar cuál es");
  return res.status(400).json({ error: "Metadata de invitación incompleta" });
}

module.exports = { adminLogin, barberoLogin, logout, activarCuenta };
