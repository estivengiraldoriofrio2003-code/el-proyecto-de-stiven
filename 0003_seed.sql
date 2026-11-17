-- =====================================================================
-- 0003 — Datos iniciales
--
-- IMPORTANTE: los recursos aquí listados son un punto de partida
-- EDITABLE. El informe institucional dejó constancia de que el
-- inventario físico no fue levantado, por lo que las cantidades,
-- capacidades y ubicaciones marcadas como "pendiente de validación"
-- deben confirmarse con el encargado de sistemas antes de usarse en
-- producción. No se inventan cantidades institucionales definitivas.
-- =====================================================================

-- ------------------------- Configuración del sistema ------------------
insert into public.settings (key, value) values
  ('institution_name', 'Instituto Universitario de Caldas'),
  ('opening_time', '06:00'),
  ('closing_time', '18:00'),
  ('slot_minutes', '60'),
  ('password_reset_note',
   'La recuperación de contraseña la gestiona el encargado de sistemas e innovación tecnológica.')
on conflict (key) do nothing;

-- ------------------------------- Pisos -------------------------------
insert into public.locations (name, floor, building, notes) values
  ('Piso 1', 1, 'Edificio principal', 'Sala de recreación y televisores: pendiente de validación'),
  ('Piso 2', 2, 'Edificio principal', null),
  ('Piso 3', 3, 'Edificio principal', null),
  ('Piso 4', 4, 'Edificio principal', null),
  ('Piso 5', 5, 'Edificio principal', null),
  ('Piso 6', 6, 'Edificio principal', 'Piso informado en el documento institucional')
on conflict do nothing;

-- ----------------------------- Categorías ----------------------------
insert into public.resource_categories (name, kind, description) values
  ('Salas de cómputo', 'espacio', 'Salas de informática. Se reservan como espacio completo.'),
  ('Salas audiovisuales', 'espacio', 'Salas con dotación audiovisual.'),
  ('Salas de recreación', 'espacio', 'Espacios de recreación con programación.'),
  ('Otros espacios', 'espacio', 'Espacios que se incorporen posteriormente.'),
  ('Televisores', 'equipo', 'Televisores que se prestan o programan.'),
  ('Equipos audiovisuales', 'equipo', 'Proyectores, equipos de sonido y similares.'),
  ('Llaves', 'elemento', 'Llaves de acceso a las salas.'),
  ('Controles remotos', 'elemento', 'Controles de los equipos audiovisuales.')
on conflict do nothing;

-- ------------------------------ Recursos -----------------------------
-- Códigos y nombres son identificadores internos de la plataforma;
-- las cantidades reales quedan pendientes de validación institucional.
with cat as (
  select id, name from public.resource_categories
), loc as (
  select id, floor from public.locations
)
insert into public.resources (code, name, category_id, location_id, status, is_reservable, requires_delivery_item, notes)
select v.code, v.name, cat.id, loc.id, v.status::resource_status, v.reservable, v.delivery,
       'Registro inicial: cantidad, capacidad y ubicación pendientes de validación institucional.'
from (values
  ('SC-001', 'Sala de Cómputo A', 'Salas de cómputo', 2,  'disponible',      true,  true),
  ('SC-002', 'Sala de Cómputo B', 'Salas de cómputo', 2,  'disponible',      true,  true),
  ('SAV-010','Sala Audiovisual',  'Salas audiovisuales', 3, 'disponible',    true,  true),
  ('SR-020', 'Sala de Recreación','Salas de recreación', 1, 'disponible',    true,  true),
  ('TV-101', 'Televisor 1',       'Televisores', 1,  'disponible',          true,  true),
  ('TV-102', 'Televisor 2',       'Televisores', 4,  'disponible',          true,  true),
  ('KEY-001','Llave Sala de Cómputo A', 'Llaves', 2, 'disponible',          false, true),
  ('KEY-002','Llave Sala Audiovisual',  'Llaves', 3, 'disponible',          false, true),
  ('CTR-001','Control Sala Audiovisual','Controles remotos', 3, 'disponible', false, true)
) as v(code, name, category, floor, status, reservable, delivery)
join cat on cat.name = v.category
join loc on loc.floor = v.floor
on conflict (code) do nothing;

-- ---------------------- Horario institucional ------------------------
-- Lunes a viernes 06:00–18:00. Configurable por el encargado.
-- Los horarios reales no fueron suministrados: quedan como referencia.
insert into public.schedules (weekday, opens_at, closes_at, is_active, notes) values
  (1, '06:00', '18:00', true, 'Horario de referencia — pendiente de validación'),
  (2, '06:00', '18:00', true, 'Horario de referencia — pendiente de validación'),
  (3, '06:00', '18:00', true, 'Horario de referencia — pendiente de validación'),
  (4, '06:00', '18:00', true, 'Horario de referencia — pendiente de validación'),
  (5, '06:00', '18:00', true, 'Horario de referencia — pendiente de validación'),
  (6, '08:00', '13:00', false, 'Sábado desactivado por defecto')
on conflict (weekday) do nothing;

-- =====================================================================
-- NOTA SOBRE EL PRIMER ADMINISTRADOR
-- =====================================================================
-- El perfil se crea automáticamente con el trigger handle_new_user().
-- Para convertir la primera cuenta en encargado, usa el procedimiento
-- controlado desde el servidor (NO desde el navegador):
--
--   1. Crea el usuario con la Admin API (service_role) enviando
--      raw_user_meta_data = { "full_name": "...", "bootstrap_admin": "true" }
--      (solo funciona si aún no existe ningún encargado).
--
--   2. O bien, si el usuario ya existe, promuévelo una única vez desde
--      el SQL Editor de Supabase (entorno seguro, no navegador):
--
--      update public.profiles
--         set role = 'encargado'
--       where email = 'encargado@iuc.edu.co'
--         and not exists (select 1 from public.profiles where role = 'encargado');
--
-- Cualquier intento de un profesor de cambiar su rol es rechazado por el
-- trigger guard_profile_role() y por las políticas RLS.
