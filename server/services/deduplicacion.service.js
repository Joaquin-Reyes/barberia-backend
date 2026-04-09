const { supabaseAdmin } = require("../config/supabase");

async function mensajeYaProcesado(id) {
  const { data } = await supabaseAdmin
    .from("mensajes_procesados")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  return !!data;
}

async function guardarMensajeProcesado(id) {
  await supabaseAdmin.from("mensajes_procesados").insert([{ id }]);
}

module.exports = { mensajeYaProcesado, guardarMensajeProcesado };
