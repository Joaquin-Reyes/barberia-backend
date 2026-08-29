const { supabaseAdmin } = require("../config/supabase");

async function listarBarberias(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from("barberias")
      .select("id, nombre, activo, whatsapp_mode, phone_number_id, whatsapp_number, created_at")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("❌ Error listando barberías:", error);
      return res.status(500).json({ error: "Error listando barberías" });
    }

    res.json(data || []);
  } catch (err) {
    console.error("💥 Error general listando barberías:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function crearBarberia(req, res) {
  const { nombre, email } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    const { data: barberia, error: errorBarberia } =
      await supabaseAdmin
        .from("barberias")
        .insert([{ nombre, whatsapp_mode: "cloud_api", activo: true }])
        .select()
        .single();

    if (errorBarberia) {
      console.error("❌ Error barbería:", errorBarberia);
      return res.status(500).json({ error: "Error creando barbería" });
    }

    const { data: authUser, error: errorAuth } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { barberia_id: barberia.id, rol: "admin" },
      });

    if (errorAuth) {
      console.error("❌ Error invitación:", errorAuth);
      return res.status(500).json({ error: "Error enviando invitación" });
    }

    const userId = authUser.user.id;

    const { error: errorUsuario } = await supabaseAdmin
      .from("usuarios")
      .insert([{
        id: userId,
        email,
        rol: "admin",
        barberia_id: barberia.id,
      }]);

    if (errorUsuario) {
      console.error("❌ Error usuario:", errorUsuario);
      return res.status(500).json({ error: "Error vinculando usuario" });
    }

    res.json({ ok: true, barberia, userId });

  } catch (err) {
    console.error("💥 Error general:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

async function actualizarBarberia(req, res) {
  const { id } = req.params;
  const campos = req.body;
  const camposPermitidos = ["activo", "whatsapp_mode", "phone_number_id", "whatsapp_token", "whatsapp_number"];

  if (!id || !campos || Object.keys(campos).length === 0) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const cambios = {};
  for (const campo of camposPermitidos) {
    if (Object.prototype.hasOwnProperty.call(campos, campo)) cambios[campo] = campos[campo];
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: "No hay campos validos para actualizar" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("barberias")
      .update(cambios)
      .eq("id", id)
      .select("id, nombre, activo, whatsapp_mode, phone_number_id, whatsapp_number, created_at")
      .single();

    if (error) {
      console.error("❌ Error actualizando barbería:", error);
      return res.status(500).json({ error: "Error actualizando barbería" });
    }

    res.json({ ok: true, barberia: data });
  } catch (err) {
    console.error("💥 Error general actualizando barbería:", err);
    res.status(500).json({ error: "Error interno" });
  }
}

module.exports = { listarBarberias, crearBarberia, actualizarBarberia };
