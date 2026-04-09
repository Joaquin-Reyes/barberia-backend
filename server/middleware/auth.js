const { createClient } = require("@supabase/supabase-js");
const { supabaseAdmin } = require("../config/supabase");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token" });
    }

    // 🔥 Obtener usuario desde Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Token inválido" });
    }

    // 🔥 Buscar usuario en tu tabla usuarios
    const { data: usuarioDB, error: dbError } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("id", user.id)
      .single();

    if (dbError || !usuarioDB) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // 🔥 Guardamos el contexto
    req.user = usuarioDB;

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.sendStatus(500);
  }
}

module.exports = authMiddleware;