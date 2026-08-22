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

function getMetadataBarberoId(metadata = {}) {
  return (
    metadata.barbero_id ||
    metadata.barberoId ||
    metadata.barber_id ||
    metadata.barberId ||
    metadata.barbero?.id ||
    metadata.barber?.id ||
    null
  );
}

function buildUsuarioPayload({ id, email, rol, barberia_id }) {
  return { id, email, rol, barberia_id };
}

function withBarbero(usuario, barbero) {
  if (!usuario || !barbero) return usuario;
  return {
    ...usuario,
    barbero_id: barbero.id,
    nombre: usuario.nombre || barbero.nombre,
  };
}

function metadataError(res) {
  return res.status(400).json({ error: "No se pudo activar la cuenta. Pedile al admin que reenvíe la invitación." });
}

function metadataMatchesBarbero(metadata = {}, { rol, barberia_id, barbero_id }) {
  const metadataBarberoId = getMetadataBarberoId(metadata);
  return (
    metadata.rol === rol &&
    metadata.barberia_id === barberia_id &&
    metadataBarberoId === barbero_id
  );
}

async function getBarberoSeguro(barbero_id, barberia_id) {
  if (!barbero_id || !barberia_id) return null;

  const { data, error } = await supabaseAdmin
    .from("barberos")
    .select("id, nombre, barberia_id, usuario_id")
    .eq("id", barbero_id)
    .eq("barberia_id", barberia_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function vincularBarberoSeguro({ barbero, userId }) {
  if (!barbero || (barbero.usuario_id && barbero.usuario_id !== userId)) {
    return false;
  }

  const { error } = await supabaseAdmin
    .from("barberos")
    .update({ usuario_id: userId })
    .eq("id", barbero.id)
    .eq("barberia_id", barbero.barberia_id);

  if (error) throw error;
  return true;
}

async function activarCuenta(req, res) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Token inválido" });

  const metadata = user.user_metadata || {};
  const metadataBarberoId = getMetadataBarberoId(metadata);

  const { data: existente, error: existenteError } = await supabaseAdmin
    .from("usuarios")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existenteError) return res.status(500).json({ error: "Error activando cuenta" });

  const { rol, barberia_id } = metadata;
  const barbero_id = metadataBarberoId;
  const rolesValidos = ["admin", "barbero", "superadmin"];

  if (!rol || !rolesValidos.includes(rol) || !barberia_id) {
    console.log("⚠️ Metadata incompleta o invalida para activar usuario:", user.id);
    return metadataError(res);
  }

  if (rol === "barbero" && !barbero_id) {
    console.log("⚠️ Metadata de barbero sin barbero_id para user:", user.id);
    return metadataError(res);
  }

  let barberoValidado = null;
  try {
    if (rol === "barbero") {
      barberoValidado = await getBarberoSeguro(barbero_id, barberia_id);
      if (!barberoValidado) {
        console.log("⚠️ Metadata inconsistente: barbero no pertenece a barberia");
        return metadataError(res);
      }
    }
  } catch (err) {
    console.log("❌ Error validando barbero:", err.message);
    return res.status(500).json({ error: "Error activando cuenta" });
  }

  if (existente) {
    if (existente.barberia_id !== barberia_id || existente.rol !== rol) {
      console.log("⚠️ Intento de reactivar usuario con tenant/rol diferente:", user.id);
      return metadataError(res);
    }

    if (rol === "barbero") {
      try {
        const vinculado = await vincularBarberoSeguro({ barbero: barberoValidado, userId: user.id });
        if (!vinculado) {
          console.log("⚠️ Barbero ya vinculado a otro usuario:", barbero_id);
          return metadataError(res);
        }
      } catch (err) {
        console.log("❌ Error vinculando barbero existente:", err.message);
        return res.status(500).json({ error: "Error activando cuenta" });
      }
    }

    return res.json({ ok: true, usuario: withBarbero(existente, barberoValidado) });
  }

  if (barberoValidado?.usuario_id && barberoValidado.usuario_id !== user.id) {
    console.log("⚠️ Barbero ya vinculado a otro usuario antes de crear usuario:", barbero_id);
    return metadataError(res);
  }

  const { error: insertError } = await supabaseAdmin
    .from("usuarios")
    .insert(buildUsuarioPayload({ id: user.id, email: user.email, rol, barberia_id }));

  if (insertError) {
    console.log("❌ Error creando usuario:", insertError);
    return res.status(500).json({ error: "Error creando usuario" });
  }

  if (rol === "barbero") {
    try {
      const vinculado = await vincularBarberoSeguro({ barbero: barberoValidado, userId: user.id });
      if (!vinculado) {
        console.log("⚠️ Barbero ya vinculado a otro usuario:", barbero_id);
        return metadataError(res);
      }
    } catch (err) {
      console.log("❌ Error vinculando barbero:", err.message);
      return res.status(500).json({ error: "Error activando cuenta" });
    }
  }

  const { data: creado } = await supabaseAdmin.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  console.log("✅ Activación por metadata validada para", user.email);
  return res.json({ ok: true, usuario: withBarbero(creado, barberoValidado) });
}

module.exports = {
  adminLogin,
  barberoLogin,
  logout,
  activarCuenta,
  metadataMatchesBarbero,
};
