-- Fase 3A.2: RLS para lecturas directas frontend multi-tenant.
-- No modifica datos ni schema funcional. El backend con service-role sigue bypasseando RLS.

alter table usuarios enable row level security;
alter table barberias enable row level security;
alter table turnos enable row level security;
alter table barberos enable row level security;
alter table servicios enable row level security;
alter table horarios_barbero enable row level security;
alter table excepciones_barbero enable row level security;

-- Limpiar policies conocidas/versionadas para evitar OR permisivos accidentales.
drop policy if exists "Usuario ve su propio registro" on usuarios;
drop policy if exists usuarios_select_own on usuarios;
drop policy if exists usuarios_update_own on usuarios;
drop policy if exists usuarios_insert_authenticated on usuarios;
drop policy if exists usuarios_delete_own on usuarios;

drop policy if exists "Usuario ve su barbería" on barberias;
drop policy if exists barberias_select_same_tenant on barberias;
drop policy if exists barberias_update_same_tenant on barberias;
drop policy if exists barberias_insert_authenticated on barberias;
drop policy if exists barberias_delete_same_tenant on barberias;

drop policy if exists "Panel lee turnos" on turnos;
drop policy if exists "Panel escribe turnos" on turnos;
drop policy if exists turnos_select_same_tenant on turnos;
drop policy if exists turnos_insert_same_tenant on turnos;
drop policy if exists turnos_update_same_tenant on turnos;
drop policy if exists turnos_delete_same_tenant on turnos;
drop policy if exists turnos_admin_insert_same_barberia on turnos;
drop policy if exists turnos_admin_update_same_barberia on turnos;
drop policy if exists turnos_admin_delete_same_barberia on turnos;

drop policy if exists "Panel lee barberos" on barberos;
drop policy if exists "Panel escribe barberos" on barberos;
drop policy if exists barberos_select_same_tenant on barberos;
drop policy if exists barberos_insert_same_tenant on barberos;
drop policy if exists barberos_update_same_tenant on barberos;
drop policy if exists barberos_delete_same_tenant on barberos;
drop policy if exists barberos_admin_insert_same_barberia on barberos;
drop policy if exists barberos_admin_update_same_barberia on barberos;
drop policy if exists barberos_admin_delete_same_barberia on barberos;

drop policy if exists "Panel lee servicios" on servicios;
drop policy if exists "Panel escribe servicios" on servicios;
drop policy if exists servicios_select_same_tenant on servicios;
drop policy if exists servicios_insert_same_tenant on servicios;
drop policy if exists servicios_update_same_tenant on servicios;
drop policy if exists servicios_delete_same_tenant on servicios;
drop policy if exists servicios_admin_insert_same_barberia on servicios;
drop policy if exists servicios_admin_update_same_barberia on servicios;
drop policy if exists servicios_admin_delete_same_barberia on servicios;

drop policy if exists "Panel lee horarios" on horarios_barbero;
drop policy if exists "Panel escribe horarios" on horarios_barbero;
drop policy if exists horarios_barbero_select_same_tenant on horarios_barbero;
drop policy if exists horarios_barbero_insert_same_tenant on horarios_barbero;
drop policy if exists horarios_barbero_update_same_tenant on horarios_barbero;
drop policy if exists horarios_barbero_delete_same_tenant on horarios_barbero;

drop policy if exists "Panel lee excepciones" on excepciones_barbero;
drop policy if exists "Panel escribe excepciones" on excepciones_barbero;
drop policy if exists excepciones_barbero_select_same_tenant on excepciones_barbero;
drop policy if exists excepciones_barbero_insert_same_tenant on excepciones_barbero;
drop policy if exists excepciones_barbero_update_same_tenant on excepciones_barbero;
drop policy if exists excepciones_barbero_delete_same_tenant on excepciones_barbero;

create policy usuarios_select_own
on usuarios
for select
to authenticated
using (id = auth.uid());

create policy barberias_select_same_tenant
on barberias
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = barberias.id
  )
);

create policy turnos_select_same_tenant
on turnos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = turnos.barberia_id
  )
);

create policy barberos_select_same_tenant
on barberos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = barberos.barberia_id
  )
);

create policy servicios_select_same_tenant
on servicios
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    where u.id = auth.uid()
      and u.barberia_id = servicios.barberia_id
  )
);

create policy horarios_barbero_select_same_tenant
on horarios_barbero
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    join barberos b
      on b.id = horarios_barbero.barbero_id
     and b.barberia_id = horarios_barbero.barberia_id
    where u.id = auth.uid()
      and u.barberia_id = horarios_barbero.barberia_id
  )
);

create policy excepciones_barbero_select_same_tenant
on excepciones_barbero
for select
to authenticated
using (
  exists (
    select 1
    from usuarios u
    join barberos b
      on b.id = excepciones_barbero.barbero_id
     and b.barberia_id = excepciones_barbero.barberia_id
    where u.id = auth.uid()
      and u.barberia_id = excepciones_barbero.barberia_id
  )
);
