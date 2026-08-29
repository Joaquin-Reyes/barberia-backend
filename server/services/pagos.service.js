const { supabaseAdmin } = require("../config/supabase");
const { businessDate } = require("../utils/business-time");

const METODOS = ["efectivo", "transferencia", "mercado_pago", "tarjeta", "otro"];

function asMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function tieneCierreCaja(barberiaId, fecha) {
  const { data, error } = await supabaseAdmin
    .from("cierres_caja")
    .select("id")
    .eq("barberia_id", barberiaId)
    .is("anulado_at", null)
    .lte("fecha_desde", fecha)
    .gte("fecha_hasta", fecha)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function validarPagoTurno({ barberia_id, turno_id, monto, metodo = "efectivo" }) {
  const amount = asMoney(monto);
  if (amount <= 0) return { ok: true, shouldCreate: false, reason: "monto_invalido" };
  if (!METODOS.includes(metodo)) return { ok: false, error: "metodo invalido", status: 400 };

  const fechaPago = businessDate();
  if (await tieneCierreCaja(barberia_id, fechaPago)) {
    return {
      ok: false,
      error: "La caja de hoy ya está cerrada. Anulá el cierre antes de registrar otro pago.",
      status: 409,
    };
  }

  if (!turno_id) return { ok: true, shouldCreate: true };

  const { data: pagoExistente, error: pagoExistenteError } = await supabaseAdmin
    .from("pagos")
    .select("id")
    .eq("barberia_id", barberia_id)
    .eq("turno_id", turno_id)
    .is("anulado_at", null)
    .limit(1)
    .maybeSingle();

  if (pagoExistenteError) throw pagoExistenteError;
  if (pagoExistente) return { ok: true, shouldCreate: false, reason: "pago_existente", pago: pagoExistente };

  return { ok: true, shouldCreate: true };
}

async function registrarPagoTurno({
  barberia_id,
  turno,
  monto,
  metodo = "efectivo",
  tipo = "pago_total",
  creado_por,
  nota,
}) {
  const amount = asMoney(monto);
  const validacion = await validarPagoTurno({ barberia_id, turno_id: turno?.id, monto: amount, metodo });
  if (!validacion.ok) return { created: false, error: validacion.error, status: validacion.status };
  if (!validacion.shouldCreate) return { created: false, reason: validacion.reason, pago: validacion.pago };

  const { data, error } = await supabaseAdmin
    .from("pagos")
    .insert({
      barberia_id,
      turno_id: turno.id,
      cliente_nombre: turno.nombre || null,
      servicio: turno.servicio || null,
      barbero: turno.barbero || null,
      monto: amount,
      metodo,
      tipo,
      nota: nota?.trim() || null,
      creado_por,
    })
    .select()
    .single();

  if (error) throw error;
  return { created: true, pago: data };
}

module.exports = {
  registrarPagoTurno,
  validarPagoTurno,
};
