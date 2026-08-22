const { supabaseAdmin } = require("../config/supabase");

const DIAS_VALIDOS = new Set([0, 1, 2, 3, 4, 5, 6]);

function horaValida(value) {
  return /^\d{2}:\d{2}$/.test(String(value || "").slice(0, 5));
}

async function validarBarberoTenant(barbero_id, barberia_id) {
  const { data, error } = await supabaseAdmin
    .from("barberos")
    .select("id")
    .eq("id", barbero_id)
    .eq("barberia_id", barberia_id)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function guardarHorariosBarbero(req, res) {
  const { barbero_id } = req.params;
  const barberia_id = req.user.barberia_id;
  const horarios = Array.isArray(req.body?.horarios) ? req.body.horarios : [];

  if (!(await validarBarberoTenant(barbero_id, barberia_id))) {
    return res.status(404).json({ error: "Barbero no encontrado" });
  }

  const filas = [];
  for (const item of horarios) {
    const dia_semana = Number(item.dia_semana);
    const hora_inicio = String(item.hora_inicio || "").slice(0, 5);
    const hora_fin = String(item.hora_fin || "").slice(0, 5);

    if (!DIAS_VALIDOS.has(dia_semana) || !horaValida(hora_inicio) || !horaValida(hora_fin)) {
      return res.status(400).json({ error: "Horario invalido" });
    }

    filas.push({ barbero_id, barberia_id, dia_semana, hora_inicio, hora_fin });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("horarios_barbero")
    .delete()
    .eq("barbero_id", barbero_id)
    .eq("barberia_id", barberia_id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  if (filas.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("horarios_barbero").insert(filas);
    if (insertError) return res.status(500).json({ error: insertError.message });
  }

  res.json({ ok: true });
}

async function guardarExcepcionBarbero(req, res) {
  const { barbero_id } = req.params;
  const barberia_id = req.user.barberia_id;
  const body = req.body || {};

  if (!(await validarBarberoTenant(barbero_id, barberia_id))) {
    return res.status(404).json({ error: "Barbero no encontrado" });
  }

  const fecha = String(body.fecha || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: "Fecha invalida" });
  }

  const trabaja = Boolean(body.trabaja);
  const hora_inicio = trabaja && body.hora_inicio ? String(body.hora_inicio).slice(0, 5) : null;
  const hora_fin = trabaja && body.hora_fin ? String(body.hora_fin).slice(0, 5) : null;

  if (trabaja && (!horaValida(hora_inicio) || !horaValida(hora_fin))) {
    return res.status(400).json({ error: "Horario invalido" });
  }

  const fila = {
    barbero_id,
    barberia_id,
    fecha,
    trabaja,
    hora_inicio,
    hora_fin,
    motivo: body.motivo ? String(body.motivo).trim() : null,
  };

  const { data: existente, error: selectError } = await supabaseAdmin
    .from("excepciones_barbero")
    .select("id")
    .eq("barbero_id", barbero_id)
    .eq("barberia_id", barberia_id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (selectError) return res.status(500).json({ error: selectError.message });

  const query = existente
    ? supabaseAdmin
      .from("excepciones_barbero")
      .update(fila)
      .eq("id", existente.id)
      .eq("barbero_id", barbero_id)
      .eq("barberia_id", barberia_id)
    : supabaseAdmin.from("excepciones_barbero").insert(fila);

  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}

async function eliminarExcepcionBarbero(req, res) {
  const { barbero_id, id } = req.params;
  const barberia_id = req.user.barberia_id;

  if (!(await validarBarberoTenant(barbero_id, barberia_id))) {
    return res.status(404).json({ error: "Barbero no encontrado" });
  }

  const { error } = await supabaseAdmin
    .from("excepciones_barbero")
    .delete()
    .eq("id", id)
    .eq("barbero_id", barbero_id)
    .eq("barberia_id", barberia_id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
}

module.exports = {
  eliminarExcepcionBarbero,
  guardarExcepcionBarbero,
  guardarHorariosBarbero,
};
