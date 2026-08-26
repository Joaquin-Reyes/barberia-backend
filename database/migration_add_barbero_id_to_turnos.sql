-- Vincula turnos con barberos por id sin romper datos historicos basados en nombre.

alter table turnos
  add column if not exists barbero_id uuid references barberos(id) on delete set null;

update turnos t
set barbero_id = b.id
from barberos b
where t.barbero_id is null
  and t.barberia_id = b.barberia_id
  and lower(trim(t.barbero)) = lower(trim(b.nombre));

create index if not exists idx_turnos_barberia_barbero_id_fecha_hora
  on turnos(barberia_id, barbero_id, fecha, hora);
