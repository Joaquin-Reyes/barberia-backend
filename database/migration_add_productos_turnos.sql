-- Productos vendidos junto al servicio del turno.
-- Ejecutar despues de migration_add_pagos_caja.sql.

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias(id) on delete cascade,
  nombre text not null,
  precio numeric(10,2) not null default 0 check (precio >= 0),
  costo numeric(10,2) check (costo is null or costo >= 0),
  stock numeric(10,2) not null default 0,
  stock_minimo numeric(10,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_productos_barberia_nombre
  on productos(barberia_id, nombre);

alter table productos enable row level security;

drop policy if exists productos_select_same_barberia on productos;
create policy productos_select_same_barberia
on productos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = productos.barberia_id
  )
);

drop policy if exists productos_admin_insert_same_barberia on productos;
create policy productos_admin_insert_same_barberia
on productos
for insert
to authenticated
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = productos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

drop policy if exists productos_admin_update_same_barberia on productos;
create policy productos_admin_update_same_barberia
on productos
for update
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = productos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = productos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

create table if not exists turno_productos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete cascade,
  producto_id uuid references productos(id) on delete set null,
  nombre text not null,
  precio_unitario numeric(10,2) not null default 0 check (precio_unitario >= 0),
  cantidad numeric(10,2) not null default 1 check (cantidad > 0),
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  creado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_turno_productos_barberia_turno
  on turno_productos(barberia_id, turno_id, created_at);

alter table turno_productos enable row level security;

drop policy if exists turno_productos_select_same_barberia on turno_productos;
create policy turno_productos_select_same_barberia
on turno_productos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = turno_productos.barberia_id
  )
);

drop policy if exists turno_productos_admin_insert_same_barberia on turno_productos;
create policy turno_productos_admin_insert_same_barberia
on turno_productos
for insert
to authenticated
with check (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = turno_productos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);

drop policy if exists turno_productos_admin_delete_same_barberia on turno_productos;
create policy turno_productos_admin_delete_same_barberia
on turno_productos
for delete
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = turno_productos.barberia_id
      and u.rol in ('admin', 'superadmin')
  )
);
