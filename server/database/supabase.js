import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uqqhiwnfjpfqikcfykfr.supabase.co'
const supabaseKey = 'sb_publishable_uXKYHvjtcAT1Nym4ahffBg_Uw81drxy'

export const supabase = createClient(supabaseUrl, supabaseKey)

// 👉 FUNCIÓN PARA GUARDAR
export async function guardarTurno(turno) {
  const { error } = await supabase
    .from('turnos')
    .insert([turno])

  if (error) {
    console.log("Error guardando:", error)
    return false
  }

  return true
}

// 👉 FUNCIÓN PARA VALIDAR DISPONIBILIDAD
export async function turnoDisponible(fecha, hora, barbero) {
  const { data } = await supabase
    .from('turnos')
    .select('*')
    .eq('fecha', fecha)
    .eq('hora', hora)
    .eq('barbero', barbero)

  return data.length === 0
}