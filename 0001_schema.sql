-- =====================================================================
-- Sistema de Reservas y Recursos Tecnológicos
-- Instituto Universitario de Caldas
-- 0001 — Esquema base: tablas, relaciones, restricciones e índices
--
-- Ejecutar en el SQL Editor de Supabase o con:
--   supabase db push   (CLI, carpeta supabase/migrations)
-- El script es idempotente: se puede ejecutar sobre una base existente
-- sin destruir información.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumeraciones
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('profesor', 'encargado');
  end if;
  if not exists (select 1 from pg_type where typname = 'resource_kind') then
    create type resource_kind as enum ('espacio', 'equipo', 'elemento');
  end if;
  if not exists (select 1 from pg_type where typname = 'resource_status') then
    create type resource_status as enum ('disponible', 'en_uso', 'mantenimiento', 'fuera_servicio', 'prestado');
  end if;
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type request_status as enum ('pendiente', 'aprobada', 'rechazada', 'cancelada', 'finalizada');
  end if;
  if not exists (select 1 from pg_type where typname = 'reservation_status') then
    create type reservation_status as enum ('aprobada', 'cancelada', 'finalizada');
  end if;
  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type delivery_status as enum ('pendiente', 'entregado', 'devuelto', 'vencida');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. Perfiles (1:1 con auth.users)
--    El rol NUNCA se puede cambiar desde el cliente (ver RLS + trigger).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        user_role not null default 'profesor',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 3)
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));

-- ---------------------------------------------------------------------
-- 2. Ubicaciones (pisos / edificios)
-- ---------------------------------------------------------------------
create table if not exists public.locations (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  floor     smallint not null default 1,
  building  text not null default 'Edificio principal',
  notes     text,
  created_at timestamptz not null default now(),
  constraint locations_floor_range check (floor between 1 and 12),
  constraint locations_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists locations_name_floor_key
  on public.locations (lower(name), floor);

-- ---------------------------------------------------------------------
-- 3. Categorías de recursos
-- ---------------------------------------------------------------------
create table if not exists public.resource_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        resource_kind not null,
  description text,
  created_at  timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists resource_categories_name_key
  on public.resource_categories (lower(name));

-- ---------------------------------------------------------------------
-- 4. Recursos (espacios, equipos y elementos de acceso)
--    Las salas se reservan completas: no hay inventario de computadores.
-- ---------------------------------------------------------------------
create table if not exists public.resources (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null,
  name                  text not null,
  category_id           uuid references public.resource_categories (id) on delete restrict,
  location_id           uuid references public.locations (id) on delete restrict,
  status                resource_status not null default 'disponible',
  is_reservable         boolean not null default true,
  requires_delivery_item boolean not null default false,
  capacity              integer,
  notes                 text,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint resources_code_key unique (code),
  constraint resources_code_not_blank check (length(btrim(code)) > 0),
  constraint resources_name_not_blank check (length(btrim(name)) > 0),
  constraint resources_capacity_positive check (capacity is null or capacity >= 0)
);

create index if not exists resources_category_idx on public.resources (category_id);
create index if not exists resources_location_idx on public.resources (location_id);
create index if not exists resources_status_idx on public.resources (status);

-- ---------------------------------------------------------------------
-- 5. Horarios institucionales (franjas configurables)
--    No se inventan políticas: si no se conocen, queda configurable.
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  weekday     smallint not null,             -- 1 = lunes … 7 = domingo
  opens_at    time not null,
  closes_at   time not null,
  is_active   boolean not null default true,
  notes       text,
  constraint schedules_weekday_range check (weekday between 1 and 7),
  constraint schedules_time_order check (closes_at > opens_at),
  constraint schedules_weekday_key unique (weekday)
);

-- ---------------------------------------------------------------------
-- 6. Solicitudes
-- ---------------------------------------------------------------------
create table if not exists public.requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete restrict,
  resource_id   uuid not null references public.resources (id) on delete restrict,
  request_date  date not null,
  start_time    time not null,
  end_time      time not null,
  purpose       text not null,
  status        request_status not null default 'pendiente',
  decision_note text,
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint requests_range_valid check (end_time > start_time),
  constraint requests_purpose_not_blank check (length(btrim(purpose)) >= 3),
  constraint requests_rejection_needs_note
    check (status <> 'rechazada' or (decision_note is not null and length(btrim(decision_note)) > 0))
);

create index if not exists requests_requester_idx on public.requests (requester_id);
create index if not exists requests_resource_date_idx on public.requests (resource_id, request_date);
create index if not exists requests_status_idx on public.requests (status);

-- ---------------------------------------------------------------------
-- 7. Reservas (registro efectivo del uso aprobado)
--    La restricción de exclusión impide solapes a nivel de PostgreSQL.
-- ---------------------------------------------------------------------
create table if not exists public.reservations (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid references public.requests (id) on delete set null,
  resource_id      uuid not null references public.resources (id) on delete restrict,
  requester_id     uuid not null references public.profiles (id) on delete restrict,
  reservation_date date not null,
  start_time       time not null,
  end_time         time not null,
  status           reservation_status not null default 'aprobada',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint reservations_range_valid check (end_time > start_time)
);

-- Una sola reserva aprobada por franja y recurso (regla 4 del informe).
-- Requiere btree_gist; si ya está activa la extensión la sentencia es inocua.
create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_no_overlap'
  ) then
    alter table public.reservations
      add constraint reservations_no_overlap
      exclude using gist (
        resource_id with =,
        reservation_date with =,
        tsrange(
          ('2000-01-01'::date + start_time),
          ('2000-01-01'::date + end_time)
        ) with &&
      )
      where (status = 'aprobada');
  end if;
end
$$;

create index if not exists reservations_resource_date_idx
  on public.reservations (resource_id, reservation_date);
create index if not exists reservations_requester_idx on public.reservations (requester_id);

-- ---------------------------------------------------------------------
-- 8. Entregas y devoluciones
--    El ciclo tiene estados propios, independientes de la reserva.
-- ---------------------------------------------------------------------
create table if not exists public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid references public.reservations (id) on delete set null,
  resource_id     uuid not null references public.resources (id) on delete restrict,
  recipient_id    uuid not null references public.profiles (id) on delete restrict,
  delivered_by    uuid references public.profiles (id) on delete set null,
  delivered_at    timestamptz,
  due_at          timestamptz,
  returned_at     timestamptz,
  item_state      text,
  return_state    text,
  status          delivery_status not null default 'pendiente',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint deliveries_return_after_delivery
    check (returned_at is null or delivered_at is null or returned_at >= delivered_at),
  constraint deliveries_due_after_delivery
    check (due_at is null or delivered_at is null or due_at >= delivered_at)
);

create index if not exists deliveries_resource_idx on public.deliveries (resource_id);
create index if not exists deliveries_recipient_idx on public.deliveries (recipient_id);
create index if not exists deliveries_status_idx on public.deliveries (status);

-- ---------------------------------------------------------------------
-- 9. Historial de operaciones (trazabilidad permanente)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id              bigserial primary key,
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_email     text not null default 'sistema',
  actor_role      user_role,
  action          text not null,
  entity          text not null,
  entity_id       text,
  resource_label  text,
  previous_state  text,
  new_state       text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create index if not exists audit_log_entity_idx on public.audit_log (entity);

-- ---------------------------------------------------------------------
-- 10. Configuración institucional
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11. Trigger genérico de updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'resources', 'requests', 'reservations', 'deliveries']
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = format('%s_set_updated_at', t)
    ) then
      execute format(
        'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
        format('%s_set_updated_at', t), t
      );
    end if;
  end loop;
end
$$;
