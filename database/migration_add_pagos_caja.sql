-- Pagos reales y cierres de caja para BarberApp.
-- Ejecutar en Supabase antes de usar /api/pagos.

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete cascade,
  cliente_nombre text,
  servicio text,
  barbero text,
  monto numeric(10,2) not null check (monto > 0),
  metodo text not null default 'efectivo'
    check (metodo in ('efectivo', 'transferencia', 'mercado_pago', 'tarjeta', 'otro')),
  tipo text not null default 'pago_total'
    check (tipo in ('sena', 'pago_total', 'parcial', 'ajuste')),
  nota text,
  creado_por uuid references usuarios(id) on delete set null,
  anulado_at timestamptz,
  anulado_por uuid references usuarios(id) on delete set null,
  anulado_motivo text,
  created_at timestamptz default now()
);

create index if not exists idx_pagos_barberia_created
  on pagos(barberia_id, created_at desc)
  where anulado_at is null;

create index if not exists idx_pagos_turno
  on pagos(turno_id, created_at asc);

alter table pagos enable row level security;

drop policy if exists pagos_select_same_barberia on pagos;
create policy pagos_select_same_barberia
on pagos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = pagos.barberia_id
  )
);

drop policy if exists pagos_operator_insert_same_barberia on pagos;
create policy pagos_operator_insert_same_barberia
on pagos
for insert
to authenticated
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = pagos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

drop policy if exists pagos_operator_update_same_barberia on pagos;
create policy pagos_operator_update_same_barberia
on pagos
for update
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = pagos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = pagos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

create table if not exists cierres_caja (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  total numeric(10,2) not null default 0,
  pagos_count integer not null default 0,
  por_metodo jsonb not null default '[]'::jsonb,
  por_tipo jsonb not null default '[]'::jsonb,
  conteo_metodo jsonb not null default '[]'::jsonb,
  diferencias_metodo jsonb not null default '[]'::jsonb,
  diferencia_total numeric(10,2) not null default 0,
  nota text,
  cerrado_por uuid references usuarios(id) on delete set null,
  anulado_at timestamptz,
  anulado_por uuid references usuarios(id) on delete set null,
  anulado_motivo text,
  created_at timestamptz default now(),
  constraint cierres_caja_periodo_valido check (fecha_desde <= fecha_hasta)
);

create index if not exists idx_cierres_caja_barberia_fecha
  on cierres_caja(barberia_id, fecha_desde desc, fecha_hasta desc);

create unique index if not exists idx_cierres_caja_periodo_activo
  on cierres_caja(barberia_id, fecha_desde, fecha_hasta)
  where anulado_at is null;

alter table cierres_caja enable row level security;

drop policy if exists cierres_caja_select_same_barberia on cierres_caja;
create policy cierres_caja_select_same_barberia
on cierres_caja
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = cierres_caja.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

drop policy if exists cierres_caja_insert_same_barberia on cierres_caja;
create policy cierres_caja_insert_same_barberia
on cierres_caja
for insert
to authenticated
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = cierres_caja.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

drop policy if exists cierres_caja_update_same_barberia on cierres_caja;
create policy cierres_caja_update_same_barberia
on cierres_caja
for update
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = cierres_caja.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = cierres_caja.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);
