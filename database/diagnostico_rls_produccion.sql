-- Diagnostico NO destructivo de RLS, policies, grants, funciones, triggers y views.
-- Ejecutar manualmente en Supabase SQL Editor.
-- Este archivo solo contiene consultas de lectura sobre catalogos PostgreSQL.

-- CONSULTA 1 - ESTADO RLS
with target_tables(tabla) as (
  values
    ('usuarios'),
    ('barberias'),
    ('turnos'),
    ('barberos'),
    ('servicios'),
    ('horarios_barbero'),
    ('excepciones_barbero'),
    ('productos'),
    ('turno_productos'),
    ('pagos'),
    ('cierres_caja'),
    ('clientes'),
    ('solicitudes_whatsapp'),
    ('cola_espera'),
    ('mensajes_procesados')
)
select
  n.nspname as schema,
  c.relname as tabla,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from target_tables tt
join pg_class c
  on c.relname = tt.tabla
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- CONSULTA 2 - TODAS LAS POLICIES
with target_tables(tabla) as (
  values
    ('usuarios'),
    ('barberias'),
    ('turnos'),
    ('barberos'),
    ('servicios'),
    ('horarios_barbero'),
    ('excepciones_barbero'),
    ('productos'),
    ('turno_productos'),
    ('pagos'),
    ('cierres_caja'),
    ('clientes'),
    ('solicitudes_whatsapp'),
    ('cola_espera'),
    ('mensajes_procesados')
)
select
  p.schemaname as schema,
  p.tablename as tabla,
  p.policyname as policy_name,
  p.permissive,
  p.roles,
  p.cmd as command,
  p.qual as using,
  p.with_check
from pg_policies p
join target_tables tt
  on tt.tabla = p.tablename
where p.schemaname = 'public'
order by p.tablename, p.policyname;

-- CONSULTA 3 - GRANTS SOBRE TABLAS
with target_tables(tabla) as (
  values
    ('usuarios'),
    ('barberias'),
    ('turnos'),
    ('barberos'),
    ('servicios'),
    ('horarios_barbero'),
    ('excepciones_barbero'),
    ('productos'),
    ('turno_productos'),
    ('pagos'),
    ('cierres_caja'),
    ('clientes'),
    ('solicitudes_whatsapp'),
    ('cola_espera'),
    ('mensajes_procesados')
),
target_roles(role_name) as (
  values ('anon'), ('authenticated'), ('public'), ('service_role')
),
target_privileges(privilege_type) as (
  values
    ('SELECT'),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('TRUNCATE'),
    ('REFERENCES'),
    ('TRIGGER')
)
select
  'public' as schema,
  tt.tabla,
  tr.role_name as grantee,
  tp.privilege_type,
  case
    when exists (
      select 1
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = tt.tabla
        and lower(g.grantee) = tr.role_name
        and g.privilege_type = tp.privilege_type
    ) then true
    else false
  end as granted
from target_tables tt
cross join target_roles tr
cross join target_privileges tp
where exists (
  select 1
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = tt.tabla
    and c.relkind in ('r', 'p')
)
order by tt.tabla, tr.role_name, tp.privilege_type;

-- CONSULTA 4 - FUNCIONES / RPC DEL SCHEMA PUBLIC
select
  n.nspname as schema,
  p.proname as nombre,
  pg_get_function_arguments(p.oid) as argumentos,
  pg_get_userbyid(p.proowner) as owner,
  case
    when p.prosecdef then 'SECURITY DEFINER'
    else 'SECURITY INVOKER'
  end as security_mode,
  case p.provolatile
    when 'i' then 'immutable'
    when 's' then 'stable'
    when 'v' then 'volatile'
  end as volatility,
  (
    select setting
    from unnest(coalesce(p.proconfig, array[]::text[])) as setting
    where setting ilike 'search_path=%'
    limit 1
  ) as search_path_config
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, pg_get_function_arguments(p.oid);

-- CONSULTA 5 - GRANTS DE EXECUTE SOBRE FUNCIONES / RPC
with target_roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
function_acl as (
  select
    n.nspname as schema,
    p.oid,
    p.proname as nombre,
    pg_get_function_arguments(p.oid) as argumentos,
    case
      when acl.grantee = 0 then 'PUBLIC'
      else pg_get_userbyid(acl.grantee)
    end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where n.nspname = 'public'
)
select
  fa.schema,
  fa.nombre,
  fa.argumentos,
  tr.role_name as grantee,
  coalesce(bool_or(fa.privilege_type = 'EXECUTE'), false) as can_execute,
  coalesce(bool_or(fa.is_grantable), false) as is_grantable
from (
  select
    n.nspname as schema,
    p.proname as nombre,
    pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
) f
cross join target_roles tr
left join function_acl fa
  on fa.schema = f.schema
 and fa.nombre = f.nombre
 and fa.argumentos = f.argumentos
 and fa.grantee = tr.role_name
group by fa.schema, f.schema, fa.nombre, f.nombre, fa.argumentos, f.argumentos, tr.role_name
order by coalesce(fa.nombre, f.nombre), coalesce(fa.argumentos, f.argumentos), tr.role_name;

-- CONSULTA 6 - COLUMNAS DE TABLAS CON SELECT("*") SENSIBLE
with target_tables(tabla) as (
  values ('usuarios'), ('barberias'), ('barberos'), ('turnos')
)
select
  c.table_schema as schema,
  c.table_name as tabla,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
join target_tables tt
  on tt.tabla = c.table_name
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

-- CONSULTA 7 - TRIGGERS ASOCIADOS A TABLAS AUDITADAS
with target_tables(tabla) as (
  values
    ('usuarios'),
    ('barberias'),
    ('turnos'),
    ('barberos'),
    ('servicios'),
    ('horarios_barbero'),
    ('excepciones_barbero'),
    ('productos'),
    ('turno_productos'),
    ('pagos'),
    ('cierres_caja'),
    ('clientes'),
    ('solicitudes_whatsapp'),
    ('cola_espera'),
    ('mensajes_procesados')
)
select
  n.nspname as schema,
  c.relname as tabla,
  t.tgname as trigger,
  p.proname as funcion,
  p.oid::regprocedure::text as funcion_signature,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace n
  on n.oid = c.relnamespace
join pg_proc p
  on p.oid = t.tgfoid
join target_tables tt
  on tt.tabla = c.relname
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- CONSULTA 8 - VIEWS DEL SCHEMA PUBLIC QUE DEPENDEN DE TABLAS AUDITADAS
with target_tables(tabla) as (
  values
    ('usuarios'),
    ('barberias'),
    ('turnos'),
    ('barberos'),
    ('servicios'),
    ('horarios_barbero'),
    ('excepciones_barbero'),
    ('productos'),
    ('turno_productos'),
    ('pagos'),
    ('cierres_caja'),
    ('clientes'),
    ('solicitudes_whatsapp'),
    ('cola_espera'),
    ('mensajes_procesados')
),
view_dependencies as (
  select distinct
    vn.nspname as view_schema,
    vc.relname as view_name,
    tn.nspname as referenced_schema,
    tc.relname as referenced_table,
    vc.relkind,
    vc.reloptions
  from pg_class vc
  join pg_namespace vn
    on vn.oid = vc.relnamespace
  join pg_rewrite rw
    on rw.ev_class = vc.oid
  join pg_depend dep
    on dep.objid = rw.oid
  join pg_class tc
    on tc.oid = dep.refobjid
  join pg_namespace tn
    on tn.oid = tc.relnamespace
  join target_tables tt
    on tt.tabla = tc.relname
  where vn.nspname = 'public'
    and tn.nspname = 'public'
    and vc.relkind in ('v', 'm')
)
select
  vd.view_schema as schema,
  vd.view_name,
  case
    when vd.relkind = 'm' then 'materialized_view'
    else 'view'
  end as view_type,
  array_agg(distinct vd.referenced_table order by vd.referenced_table) as referenced_tables,
  coalesce(
    exists (
      select 1
      from unnest(coalesce(vd.reloptions, array[]::text[])) as option
      where option = 'security_invoker=true'
    ),
    false
  ) as security_invoker,
  coalesce(
    exists (
      select 1
      from unnest(coalesce(vd.reloptions, array[]::text[])) as option
      where option = 'security_barrier=true'
    ),
    false
  ) as security_barrier,
  vd.reloptions
from view_dependencies vd
group by vd.view_schema, vd.view_name, vd.relkind, vd.reloptions
order by vd.view_name;
