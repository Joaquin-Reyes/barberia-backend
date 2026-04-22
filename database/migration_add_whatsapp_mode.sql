-- Agregar columna whatsapp_mode a la tabla barberias
-- Valores posibles: 'cloud_api' (default) | 'wwebjs'
ALTER TABLE barberias
  ADD COLUMN IF NOT EXISTS whatsapp_mode text NOT NULL DEFAULT 'cloud_api';

ALTER TABLE barberias
  ADD CONSTRAINT barberias_whatsapp_mode_check
  CHECK (whatsapp_mode IN ('cloud_api', 'wwebjs'));
