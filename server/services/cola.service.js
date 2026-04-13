const { supabaseAdmin } = require("../config/supabase");

// ==============================
// AGREGAR CLIENTE A LA COLA
// ==============================

async function agregarCliente(barberia_id, nombre_cliente) {
  const { data, error } = await supabaseAdmin
    .from("cola_espera")
    .insert({
      barberia_id,
      nombre_cliente,
      estado: "esperando",
      hora_llegada: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error agregando cliente a cola:", error);
    return { ok: false, error };
  }

  return { ok: true, data };
}

// ==============================
// TERMINAR ATENCIÓN Y ASIGNAR SIGUIENTE
//
// Requiere esta función en Supabase (SQL Editor):
//
// CREATE OR REPLACE FUNCTION asignar_siguiente_cliente(p_barbero_id uuid)
// RETURNS json
// LANGUAGE plpgsql
// AS $$
// DECLARE
//   v_barbero_nombre text;
//   v_barberia_id uuid;
//   v_turno_proximo record;
//   v_cliente_espera record;
// BEGIN
//   SELECT nombre, barberia_id INTO v_barbero_nombre, v_barberia_id
//   FROM barberos WHERE id = p_barbero_id;
//
//   UPDATE cola_espera
//   SET estado = 'terminado'
//   WHERE barbero_id = p_barbero_id AND estado = 'en_atencion';
//
//   SELECT * INTO v_turno_proximo
//   FROM turnos
//   WHERE barbero ILIKE v_barbero_nombre
//     AND barberia_id = v_barberia_id
//     AND fecha = TO_CHAR(NOW(), 'YYYY-MM-DD')
//     AND hora::time BETWEEN NOW()::time AND (NOW() + INTERVAL '15 minutes')::time
//   ORDER BY hora ASC
//   LIMIT 1;
//
//   IF FOUND THEN
//     RETURN json_build_object(
//       'tipo', 'turno_reservado',
//       'nombre_cliente', v_turno_proximo.nombre,
//       'turno_id', v_turno_proximo.id
//     );
//   END IF;
//
//   SELECT * INTO v_cliente_espera
//   FROM cola_espera
//   WHERE barberia_id = v_barberia_id AND estado = 'esperando'
//   ORDER BY hora_llegada ASC
//   LIMIT 1
//   FOR UPDATE SKIP LOCKED;
//
//   IF FOUND THEN
//     UPDATE cola_espera
//     SET estado = 'en_atencion', barbero_id = p_barbero_id
//     WHERE id = v_cliente_espera.id;
//
//     RETURN json_build_object(
//       'tipo', 'cola_espera',
//       'nombre_cliente', v_cliente_espera.nombre_cliente,
//       'cola_id', v_cliente_espera.id
//     );
//   END IF;
//
//   RETURN json_build_object('tipo', 'sin_clientes');
// END;
// $$;
// ==============================

async function terminarYAsignarSiguiente(barbero_id) {
  const { data, error } = await supabaseAdmin.rpc("asignar_siguiente_cliente", {
    p_barbero_id: barbero_id,
  });

  if (error) {
    console.error("❌ Error en asignar_siguiente_cliente RPC:", error);
    return { ok: false, error };
  }

  return { ok: true, data };
}

// ==============================
// OBTENER ESTADO DE LA COLA
// ==============================

async function obtenerEstadoCola(barberia_id) {
  const [{ data: barberos, error: errorBarberos }, { data: espera, error: errorEspera }] =
    await Promise.all([
      supabaseAdmin
        .from("barberos")
        .select("id, nombre")
        .eq("barberia_id", barberia_id),
      supabaseAdmin
        .from("cola_espera")
        .select("id, barbero_id, nombre_cliente, hora_llegada, estado")
        .eq("barberia_id", barberia_id)
        .eq("estado", "esperando")
        .order("hora_llegada", { ascending: true }),
    ]);

  if (errorBarberos) {
    console.error("❌ Error obteniendo barberos:", errorBarberos);
    return { ok: false, error: errorBarberos };
  }

  if (errorEspera) {
    console.error("❌ Error obteniendo cola:", errorEspera);
    return { ok: false, error: errorEspera };
  }

  // Para cada barbero, buscar su cliente actual en atención
  const { data: enAtencion, error: errorAtencion } = await supabaseAdmin
    .from("cola_espera")
    .select("id, barbero_id, nombre_cliente, hora_llegada")
    .eq("barberia_id", barberia_id)
    .eq("estado", "en_atencion");

  if (errorAtencion) {
    console.error("❌ Error obteniendo en_atencion:", errorAtencion);
    return { ok: false, error: errorAtencion };
  }

  const clienteActualPorBarbero = {};
  for (const c of enAtencion || []) {
    if (c.barbero_id) clienteActualPorBarbero[c.barbero_id] = c;
  }

  const barberosConCliente = (barberos || []).map((b) => ({
    ...b,
    cliente_actual: clienteActualPorBarbero[b.id] || null,
  }));

  const listaEspera = (espera || []).map((c, index) => ({
    ...c,
    posicion: index + 1,
  }));

  return {
    ok: true,
    data: {
      barberos: barberosConCliente,
      cola_espera: listaEspera,
    },
  };
}

module.exports = {
  agregarCliente,
  terminarYAsignarSiguiente,
  obtenerEstadoCola,
};
