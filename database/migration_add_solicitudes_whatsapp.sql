-- Bandeja aislada para el piloto de recepcion por WhatsApp.
-- No modifica la tabla turnos ni confirma reservas automaticamente.

CREATE TABLE IF NOT EXISTS solicitudes_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barberia_id uuid NOT NULL REFERENCES barberias(id) ON DELETE CASCADE,
  telefono text NOT NULL,
  nombre text,
  servicio text,
  profesional text,
  fecha_preferida text,
  hora_preferida text,
  notas text,
  resumen text,
  estado text NOT NULL DEFAULT 'pendiente',
  origen text NOT NULL DEFAULT 'whatsapp',
  mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_usada boolean NOT NULL DEFAULT false,
  requiere_humano boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'solicitudes_whatsapp_estado_check'
  ) THEN
    ALTER TABLE solicitudes_whatsapp
      ADD CONSTRAINT solicitudes_whatsapp_estado_check
      CHECK (estado IN ('pendiente', 'en_revision', 'resuelta', 'descartada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS solicitudes_whatsapp_barberia_estado_idx
  ON solicitudes_whatsapp (barberia_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS solicitudes_whatsapp_telefono_idx
  ON solicitudes_whatsapp (barberia_id, telefono);
