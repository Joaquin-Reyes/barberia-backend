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
  if (!turno?.id || amount <= 0) return { created: false, reason: "monto_invalido" };
  if (!METODOS.includes(metodo)) return { created: false, error: "metodo invalido", status: 400 };

  const fechaPago = businessDate();
  if (await tieneCierreCaja(barberia_id, fechaPago)) {
    return {
      created: false,
      error: "La caja de hoy ya está cerrada. Anulá el cierre antes de registrar otro pago.",
      status: 409,
    };
  }

  const { data: pagoExistente, error: pagoExistenteError } = await supabaseAdmin
    .from("pagos")
    .select("id")
    .eq("barberia_id", barberia_id)
    .eq("turno_id", turno.id)
    .is("anulado_at", null)
    .limit(1)
    .maybeSingle();

  if (pagoExistenteError) throw pagoExistenteError;
  if (pagoExistente) return { created: false, reason: "pago_existente", pago: pagoExistente };

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
};
