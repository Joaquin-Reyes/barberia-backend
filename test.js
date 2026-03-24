import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uqqhiwnfjpfqikcfykfr.supabase.co'
const supabaseKey = 'sb_publishable_uXKYHvjtcAT1Nym4ahffBg_Uw81drxy'

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('turnos').insert([
    {
      nombre: "Test",
      telefono: "123",
      servicio: "Corte",
      barbero: "Lucas",
      fecha: "2026-03-25",
      hora: "10:00"
    }
  ])

  if (error) {
    console.log("❌ Error:", error)
  } else {
    console.log("✅ Insertado:", data)
  }
}

test()