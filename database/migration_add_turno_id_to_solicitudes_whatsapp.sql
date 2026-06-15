ALTER TABLE solicitudes_whatsapp
  ADD COLUMN IF NOT EXISTS turno_id uuid REFERENCES turnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS solicitudes_whatsapp_turno_id_idx
  ON solicitudes_whatsapp (turno_id);
