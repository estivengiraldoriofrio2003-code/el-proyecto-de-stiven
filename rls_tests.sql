-- =====================================================================
-- Pruebas de seguridad y reglas de negocio sobre PostgreSQL
-- (simulación del esquema auth de Supabase — ver tests/harness_auth.sql)
--
-- Ejecución local:
--   psql -d iuc_test -f tests/harness_auth.sql
--   psql -d iuc_test -f src/sql/0001_schema.sql
--   psql -d iuc_test -f src/sql/0002_security.sql
--   psql -d iuc_test -f src/sql/0003_seed.sql
--   psql -d iuc_test -f tests/rls_tests.sql
--
-- Todo corre dentro de una transacción que se revierte al final.
-- =====================================================================
\set ON_ERROR_STOP off
\pset pager off
\timing off

begin;

-- IDs fijos de los usuarios de prueba
\set admin '''11111111-1111-1111-1111-111111111111'''
\set ana   '''22222222-2222-2222-2222-222222222222'''
\set juan  '''33333333-3333-3333-3333-333333333333'''

delete from public.deliveries;
delete from public.reservations;
delete from public.requests;
delete from public.audit_log;
delete from public.resources;
delete from public.locations;
delete from public.resource_categories;
delete from public.profiles;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'encargado@iuc.edu.co',
   '{"full_name":"Carlos Gómez","bootstrap_admin":"true"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'ana.martinez@iuc.edu.co',
   '{"full_name":"Ana Martínez"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'juan.perez@iuc.edu.co',
   '{"full_name":"Juan Pérez"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'intruso@iuc.edu.co',
   '{"full_name":"Intruso","bootstrap_admin":"true"}'::jsonb);

\echo ''
\echo 'T01 · Perfiles creados por el trigger (primer usuario = encargado)'
select email, role from public.profiles order by role desc, email;

\echo 'T02 · Segundo intento de bootstrap_admin NO escala privilegios'
select email, role from public.profiles where email = 'intruso@iuc.edu.co';

insert into public.locations (name, floor) values ('Piso 2', 2), ('Piso 3', 3);
insert into public.resource_categories (name, kind)
values ('Salas de cómputo', 'espacio'), ('Llaves', 'elemento');

insert into public.resources (code, name, category_id, location_id, status)
select 'SC-001', 'Sala de Cómputo A', c.id, l.id, 'disponible'
from public.resource_categories c, public.locations l
where c.kind = 'espacio' and l.floor = 2;

insert into public.resources (code, name, category_id, location_id, status, is_reservable)
select 'MANT-01', 'Sala en mantenimiento', c.id, l.id, 'mantenimiento', true
from public.resource_categories c, public.locations l
where c.kind = 'espacio' and l.floor = 3;

-- =====================================================================
-- Bloque A — PROFESOR (Ana)
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo 'T03 · Profesor crea su propia solicitud (debe FUNCIONAR)'
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose, status)
select '22222222-2222-2222-2222-222222222222', id, current_date, '09:00', '11:00',
       'Clase de Programación I', 'pendiente'
from public.resources where code = 'SC-001';

\echo 'T04 · Profesor intenta crear solicitud a nombre de otro (debe FALLAR)'
savepoint t04;
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose)
select '33333333-3333-3333-3333-333333333333', id, current_date, '12:00', '13:00', 'Suplantación'
from public.resources where code = 'SC-001';
rollback to savepoint t04;

\echo 'T05 · Profesor intenta crear solicitud ya aprobada (debe FALLAR)'
savepoint t05;
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose, status)
select '22222222-2222-2222-2222-222222222222', id, current_date, '12:00', '13:00',
       'Autoaprobación', 'aprobada'
from public.resources where code = 'SC-001';
rollback to savepoint t05;

\echo 'T06 · Profesor intenta autoascenderse a encargado (debe FALLAR)'
savepoint t06;
update public.profiles set role = 'encargado' where email = 'ana.martinez@iuc.edu.co';
rollback to savepoint t06;

\echo 'T07 · Profesor intenta aprobar una solicitud (debe FALLAR)'
savepoint t07;
select public.decide_request((select id from public.requests limit 1), 'aprobada', null);
rollback to savepoint t07;

\echo 'T08 · Profesor no puede crear recursos (debe FALLAR)'
savepoint t08;
insert into public.resources (code, name) values ('HACK-01', 'Recurso no autorizado');
rollback to savepoint t08;

\echo 'T09 · Profesor solo ve sus propias solicitudes'
select count(*) as solicitudes_visibles_ana from public.requests;

\echo 'T10 · Solicitudes auxiliares creadas por el profesor'
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose)
select '22222222-2222-2222-2222-222222222222', id, current_date, '10:00', '12:00', 'Clase solapada'
from public.resources where code = 'SC-001';

insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose)
select '22222222-2222-2222-2222-222222222222', id, current_date, '15:00', '16:00', 'Sala bloqueada'
from public.resources where code = 'MANT-01';

\echo 'T10b · Un profesor NO puede insertar solicitudes de OTROS (debe FALLAR)'
savepoint t10b;
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose)
select '33333333-3333-3333-3333-333333333333', id, current_date + 1, '09:00', '10:00', 'Intento ajeno'
from public.resources where code = 'SC-001';
rollback to savepoint t10b;

\echo 'T10c · Juan (otro profesor) crea su propia solicitud contigua'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose)
select '33333333-3333-3333-3333-333333333333', id, current_date, '11:00', '13:00', 'Franja contigua'
from public.resources where code = 'SC-001';

reset role;

-- =====================================================================
-- Bloque B — ENCARGADO
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo 'T11 · Encargado ve todas las solicitudes (2)'
select count(*) as solicitudes_visibles_encargado from public.requests;

\echo 'T12 · Encargado aprueba la primera solicitud (debe FUNCIONAR)'
select (public.decide_request(
  (select id from public.requests where purpose = 'Clase de Programación I'),
  'aprobada', 'Aprobada por disponibilidad'
)).status as resultado;

\echo 'T13 · Aprobar una solicitud SOLAPADA (debe FALLAR por conflicto)'
savepoint t13;
select public.decide_request(
  (select id from public.requests where purpose = 'Clase solapada'),
  'aprobada', null
);
rollback to savepoint t13;

\echo 'T14 · Insertar reserva solapada directamente en la tabla (debe FALLAR por exclusión)'
savepoint t14;
insert into public.reservations (resource_id, requester_id, reservation_date, start_time, end_time, status)
select id, '33333333-3333-3333-3333-333333333333', current_date, '10:30', '11:30', 'aprobada'
from public.resources where code = 'SC-001';
rollback to savepoint t14;

\echo 'T15 · Rechazo sin observación (debe FALLAR)'
savepoint t15;
select public.decide_request(
  (select id from public.requests where purpose = 'Clase solapada'),
  'rechazada', null
);
rollback to savepoint t15;

\echo 'T16 · Rechazo con observación (debe FUNCIONAR)'
select (public.decide_request(
  (select id from public.requests where purpose = 'Clase solapada'),
  'rechazada', 'Ya existe una reserva aprobada en ese horario.'
)).status as resultado;

\echo 'T17 · Aprobar recurso en mantenimiento (debe FALLAR)'
savepoint t17;
select public.decide_request(
  (select id from public.requests where purpose = 'Sala bloqueada'), 'aprobada', null
);
rollback to savepoint t17;

\echo 'T18 · Franja contigua 11:00–13:00 (debe PERMITIRSE)'
select (public.decide_request(
  (select id from public.requests where purpose = 'Franja contigua'), 'aprobada', 'Contigua'
)).status as resultado;

\echo 'T19 · Registrar entrega (debe FUNCIONAR)'
insert into public.deliveries (resource_id, recipient_id, delivered_by, delivered_at, status)
select r.id, '22222222-2222-2222-2222-222222222222',
       '11111111-1111-1111-1111-111111111111', now(), 'entregado'
from public.resources r where r.code = 'SC-001';
update public.resources set status = 'prestado' where code = 'SC-001';

\echo 'T20 · Registrar devolución con daños (debe FUNCIONAR y pasar a mantenimiento)'
select (public.register_return(
  (select id from public.deliveries limit 1), 'Con daños', 'Rayón en la puerta'
)).status as resultado_devolucion;
select status as estado_recurso_tras_danos from public.resources where code = 'SC-001';

\echo 'T21 · Doble devolución del mismo elemento (debe FALLAR)'
savepoint t21;
select public.register_return((select id from public.deliveries limit 1), 'Buen estado', null);
rollback to savepoint t21;

reset role;

-- =====================================================================
-- Bloque C — Cancelación y liberación de disponibilidad
-- =====================================================================
\echo ''

-- Capturamos el id de una solicitud AJENA antes de entrar como profesor,
-- para verificar que la función rechaza por autoría y no por ocultamiento RLS.
select id as juan_request from public.requests where purpose = 'Franja contigua' \gset

\echo 'T22 · Profesor cancela su solicitud aprobada'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select (public.cancel_request(
  (select id from public.requests where purpose = 'Clase de Programación I')
)).status as resultado_cancelacion;

\echo 'T23 · Profesor intenta cancelar la solicitud de otro (debe FALLAR por permisos)'
savepoint t23;
select public.cancel_request(:'juan_request'::uuid);
rollback to savepoint t23;
reset role;

\echo 'T24 · La franja liberada 09:00–11:00 se puede volver a aprobar'
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into public.requests (requester_id, resource_id, request_date, start_time, end_time, purpose)
select '33333333-3333-3333-3333-333333333333', id, current_date, '09:00', '11:00', 'Reutiliza franja'
from public.resources where code = 'SC-001';
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.resources set status = 'disponible' where code = 'SC-001';
select (public.decide_request(
  (select id from public.requests where purpose = 'Reutiliza franja'), 'aprobada', null
)).status as resultado_reutiliza;
reset role;

-- =====================================================================
-- Bloque D — Entregas y auditoría visibles por perfil
-- =====================================================================
\echo ''
\echo 'T25 · Profesor no ve entregas de otros (Ana = 1, su propia entrega)'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as entregas_visibles_ana from public.deliveries;
\echo 'T26 · Profesor no puede registrar devoluciones (debe FALLAR)'
savepoint t26;
select public.register_return((select id from public.deliveries limit 1), 'Buen estado', null);
rollback to savepoint t26;
reset role;

\echo 'T27 · Historial registrado automáticamente por los triggers'
select action, entity, previous_state, new_state from public.audit_log order by id;

\echo 'T28 · Profesor ve solo sus propios eventos de historial'
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as eventos_visibles_juan from public.audit_log;
reset role;

\echo 'T29 · Encargado ve todo el historial'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) as eventos_visibles_encargado from public.audit_log;
reset role;

\echo ''
\echo '== FIN DE PRUEBAS =='
rollback;
