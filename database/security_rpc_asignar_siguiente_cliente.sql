-- Seguridad RPC cola: restringir ejecucion directa desde clientes.
-- La firma confirmada en produccion es public.asignar_siguiente_cliente(uuid).
-- No modifica la implementacion interna ni el modo de seguridad de la funcion.

revoke execute on function public.asignar_siguiente_cliente(uuid) from public;
revoke execute on function public.asignar_siguiente_cliente(uuid) from anon;
revoke execute on function public.asignar_siguiente_cliente(uuid) from authenticated;
grant execute on function public.asignar_siguiente_cliente(uuid) to service_role;
