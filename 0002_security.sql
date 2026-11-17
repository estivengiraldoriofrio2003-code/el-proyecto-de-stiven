-- =====================================================================
-- 0002 — Seguridad: helpers, funciones transaccionales, auditoría y RLS
--
-- Principios:
--  * El rol vive en profiles.role y NINGÚN usuario puede modificarlo.
--  * El profesor solo ve y opera sobre sus propios registros.
--  * Aprobar/rechazar, entregar, devolver y administrar recursos es
--    exclusivo del perfil 'encargado'.
--  * Las operaciones críticas son funciones SECURITY DEFINER atómicas.
--  * Toda operación relevante se registra en audit_log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (SECURITY DEFINER para no depender de las políticas de profiles)
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_encargado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'encargado' and p.is_active
     from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.current_role_name() from public;
revoke all on function public.is_encargado() from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_encargado() to authenticated;
grant execute on function public.is_active_user() to authenticated;

-- ---------------------------------------------------------------------
-- Perfil automático al crear un usuario en auth.users
-- El primer usuario registrado se convierte en encargado SOLO si aún no
-- existe ninguno (procedimiento controlado de arranque).
-- Ningún profesor puede autoasignarse permisos: el valor por defecto es
-- siempre 'profesor'.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_exists boolean;
  assigned_role user_role := 'profesor';
begin
  select exists (select 1 from public.profiles where role = 'encargado') into admin_exists;

  -- Promoción de arranque: solo si es el primer perfil y se pidió explícitamente
  -- desde el servidor (raw_user_meta_data->>'bootstrap_admin' = 'true').
  if not admin_exists
     and coalesce(new.raw_user_meta_data ->> 'bootstrap_admin', 'false') = 'true' then
    assigned_role := 'encargado';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    assigned_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Protección del rol y de is_active
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin sesión (service_role / postgres) se permite cualquier cambio.
  if auth.uid() is null then
    return new;
  end if;

  if new.role <> old.role and not public.is_encargado() then
    raise exception 'No puedes modificar el perfil de usuario.'
      using errcode = '42501';
  end if;

  if new.role <> old.role and old.role = 'encargado' then
    raise exception 'No es posible cambiar el perfil del encargado de sistemas.'
      using errcode = '42501';
  end if;

  if new.id <> old.id then
    raise exception 'El identificador del perfil no se puede modificar.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Un profesor no puede desactivarse ni reactivarse a sí mismo.
create or replace function public.guard_profile_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.is_active <> old.is_active and not public.is_encargado() then
    raise exception 'Solo el encargado de sistemas puede activar o desactivar cuentas.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_active on public.profiles;
create trigger profiles_guard_active
  before update on public.profiles
  for each row execute function public.guard_profile_active();

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------
create or replace function public.audit_row(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_resource_label text,
  p_previous text,
  p_new text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := 'sistema';
  v_role user_role := null;
begin
  if auth.uid() is not null then
    select email, role into v_email, v_role from public.profiles where id = auth.uid();
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, entity, entity_id,
    resource_label, previous_state, new_state, notes
  ) values (
    auth.uid(), coalesce(v_email, 'sistema'), v_role, p_action, p_entity, p_entity_id,
    p_resource_label, p_previous, p_new, p_notes
  );
end;
$$;

-- Trigger de auditoría sobre solicitudes
create or replace function public.audit_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_action text;
begin
  select r.name || ' · ' || coalesce(l.name, '')
    into v_label
  from public.resources r
  left join public.locations l on l.id = r.location_id
  where r.id = coalesce(new.resource_id, old.resource_id);

  if tg_op = 'INSERT' then
    v_action := 'Creó solicitud';
    perform public.audit_row(v_action, 'solicitud', new.id::text, v_label, null, new.status::text);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'aprobada' and old.status <> 'aprobada' then
      v_action := 'Aprobó solicitud';
    elsif new.status = 'rechazada' and old.status <> 'rechazada' then
      v_action := 'Rechazó solicitud';
    elsif new.status = 'cancelada' and old.status <> 'cancelada' then
      v_action := 'Canceló solicitud';
    elsif new.status = 'finalizada' and old.status <> 'finalizada' then
      v_action := 'Finalizó solicitud';
    elsif new.start_time <> old.start_time
       or new.end_time <> old.end_time
       or new.request_date <> old.request_date then
      v_action := 'Modificó horario de solicitud';
    else
      v_action := 'Actualizó solicitud';
    end if;

    perform public.audit_row(
      v_action, 'solicitud', new.id::text, v_label, old.status::text, new.status::text, new.decision_note
    );
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists requests_audit on public.requests;
create trigger requests_audit
  after insert or update on public.requests
  for each row execute function public.audit_requests();

-- Trigger de auditoría sobre recursos
create or replace function public.audit_resources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := coalesce(new.name, old.name) || ' · ' || coalesce(new.code, old.code);
begin
  if tg_op = 'INSERT' then
    perform public.audit_row('Registró recurso', 'recurso', new.id::text, v_label, null, new.status::text);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status <> old.status then
      perform public.audit_row(
        case
          when new.status = 'mantenimiento' then 'Marcó recurso en mantenimiento'
          when new.status = 'fuera_servicio' then 'Retiró recurso del uso'
          when new.status = 'disponible' then 'Habilitó recurso'
          when new.status = 'prestado' then 'Marcó recurso como prestado'
          else 'Actualizó estado de recurso'
        end,
        'recurso', new.id::text, v_label, old.status::text, new.status::text
      );
    else
      perform public.audit_row('Actualizó recurso', 'recurso', new.id::text, v_label, old.status::text, new.status::text);
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists resources_audit on public.resources;
create trigger resources_audit
  after insert or update on public.resources
  for each row execute function public.audit_resources();

-- Trigger de auditoría sobre entregas
create or replace function public.audit_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  select r.name || ' · ' || coalesce(l.name, '')
    into v_label
  from public.resources r
  left join public.locations l on l.id = r.location_id
  where r.id = new.resource_id;

  if tg_op = 'INSERT' then
    perform public.audit_row('Registró entrega', 'entrega', new.id::text, v_label, null, new.status::text, new.notes);
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status <> old.status then
    perform public.audit_row(
      case
        when new.status = 'devuelto' then 'Registró devolución'
        when new.status = 'vencida' then 'Marcó entrega vencida'
        else 'Actualizó entrega'
      end,
      'entrega', new.id::text, v_label, old.status::text, new.status::text, new.notes
    );
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists deliveries_audit on public.deliveries;
create trigger deliveries_audit
  after insert or update on public.deliveries
  for each row execute function public.audit_deliveries();

-- ---------------------------------------------------------------------
-- decide_request: aprobación / rechazo atómico con revalidación
-- ---------------------------------------------------------------------
create or replace function public.decide_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests;
  v_resource public.resources;
  v_conflict boolean;
begin
  if not public.is_encargado() then
    raise exception 'Solo el encargado de sistemas puede aprobar o rechazar solicitudes.'
      using errcode = '42501';
  end if;

  if p_decision not in ('aprobada', 'rechazada') then
    raise exception 'Decisión no válida: %', p_decision using errcode = '22023';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Solo se pueden decidir solicitudes pendientes.' using errcode = '22023';
  end if;

  if p_decision = 'rechazada' then
    if p_note is null or length(btrim(p_note)) = 0 then
      raise exception 'Debes registrar una observación al rechazar la solicitud.'
        using errcode = '22023';
    end if;

    update public.requests
       set status = 'rechazada',
           decision_note = btrim(p_note),
           decided_by = auth.uid(),
           decided_at = now()
     where id = p_request_id
     returning * into v_request;

    return v_request;
  end if;

  -- Aprobación: validar recurso y conflictos
  select * into v_resource from public.resources where id = v_request.resource_id for update;
  if not found then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;
  if not v_resource.is_reservable then
    raise exception 'El recurso no admite reservas.' using errcode = '22023';
  end if;
  if v_resource.status in ('mantenimiento', 'fuera_servicio') then
    raise exception 'El recurso está en % y no se puede reservar.', v_resource.status
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.reservations r
    where r.resource_id = v_request.resource_id
      and r.reservation_date = v_request.request_date
      and r.status = 'aprobada'
      and r.start_time < v_request.end_time
      and v_request.start_time < r.end_time
  ) into v_conflict;

  if v_conflict then
    raise exception 'Existe otra reserva aprobada en ese horario para el mismo recurso.'
      using errcode = '23P01';
  end if;

  -- Marcar decisión primero (para que el trigger registre el cambio)
  update public.requests
     set status = 'aprobada',
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_request_id
   returning * into v_request;

  insert into public.reservations (
    request_id, resource_id, requester_id, reservation_date, start_time, end_time, status
  ) values (
    v_request.id, v_request.resource_id, v_request.requester_id,
    v_request.request_date, v_request.start_time, v_request.end_time, 'aprobada'
  );

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_request: cancelación por el dueño o por el encargado
-- ---------------------------------------------------------------------
create or replace function public.cancel_request(p_request_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests;
begin
  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  if not public.is_encargado() and v_request.requester_id <> auth.uid() then
    raise exception 'Solo puedes cancelar tus propias solicitudes.' using errcode = '42501';
  end if;

  if v_request.status not in ('pendiente', 'aprobada') then
    raise exception 'Esta solicitud ya no se puede cancelar (estado: %).', v_request.status
      using errcode = '22023';
  end if;

  update public.requests
     set status = 'cancelada'
   where id = p_request_id
   returning * into v_request;

  -- Regla 6: una reserva cancelada no bloquea la disponibilidad.
  update public.reservations
     set status = 'cancelada'
   where request_id = p_request_id;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------
-- register_return: devolución con estado propio
-- ---------------------------------------------------------------------
create or replace function public.register_return(
  p_delivery_id uuid,
  p_return_state text,
  p_notes text default null
)
returns public.deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.deliveries;
begin
  if not public.is_encargado() then
    raise exception 'Solo el encargado de sistemas puede registrar devoluciones.'
      using errcode = '42501';
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'La entrega no existe.' using errcode = 'P0002';
  end if;
  if v_delivery.returned_at is not null then
    raise exception 'Esta entrega ya fue devuelta.' using errcode = '22023';
  end if;

  update public.deliveries
     set returned_at = now(),
         return_state = coalesce(nullif(btrim(coalesce(p_return_state, '')), ''), 'Buen estado'),
         status = 'devuelto',
         notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
   where id = p_delivery_id
   returning * into v_delivery;

  update public.resources
     set status = case
       when p_return_state = 'Con daños' then 'mantenimiento'::resource_status
       else 'disponible'::resource_status
     end
   where id = v_delivery.resource_id
     and status = 'prestado';

  return v_delivery;
end;
$$;

revoke all on function public.decide_request(uuid, text, text) from public;
revoke all on function public.cancel_request(uuid) from public;
revoke all on function public.register_return(uuid, text, text) from public;
grant execute on function public.decide_request(uuid, text, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.register_return(uuid, text, text) to authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.locations           enable row level security;
alter table public.resource_categories enable row level security;
alter table public.resources           enable row level security;
alter table public.schedules           enable row level security;
alter table public.requests            enable row level security;
alter table public.reservations        enable row level security;
alter table public.deliveries          enable row level security;
alter table public.audit_log           enable row level security;
alter table public.settings            enable row level security;

-- ------------------------------- profiles ----------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_encargado());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_encargado())
  with check (id = auth.uid() or public.is_encargado());

-- Solo el encargado puede insertar perfiles manualmente (el trigger usa DEFINER).
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_encargado());

-- ------------------------------- catálogos ---------------------------
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated using (public.current_role_name() is not null);

drop policy if exists locations_admin on public.locations;
create policy locations_admin on public.locations
  for all to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

drop policy if exists categories_select on public.resource_categories;
create policy categories_select on public.resource_categories
  for select to authenticated using (public.current_role_name() is not null);

drop policy if exists categories_admin on public.resource_categories;
create policy categories_admin on public.resource_categories
  for all to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select to authenticated using (public.current_role_name() is not null);

drop policy if exists schedules_admin on public.schedules;
create policy schedules_admin on public.schedules
  for all to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated using (public.current_role_name() is not null);

drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings
  for all to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

-- ------------------------------- resources ---------------------------
-- Todos los usuarios autenticados consultan el inventario.
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources
  for select to authenticated using (public.current_role_name() is not null);

drop policy if exists resources_insert on public.resources;
create policy resources_insert on public.resources
  for insert to authenticated with check (public.is_encargado());

drop policy if exists resources_update on public.resources;
create policy resources_update on public.resources
  for update to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

-- Sin DELETE físico: la eliminación es lógica (estado fuera_servicio).
drop policy if exists resources_delete on public.resources;
create policy resources_delete on public.resources
  for delete to authenticated using (false);

-- ------------------------------- requests ----------------------------
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select to authenticated
  using (requester_id = auth.uid() or public.is_encargado());

-- Un profesor solo crea solicitudes a su nombre y siempre en estado pendiente.
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests
  for insert to authenticated
  with check (
    public.is_active_user()
    and requester_id = auth.uid()
    and status = 'pendiente'
    and decided_by is null
    and decided_at is null
  );

-- Solo el encargado modifica solicitudes directamente; el profesor usa cancel_request().
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests
  for update to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests
  for delete to authenticated using (false);

-- ------------------------------ reservations -------------------------
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations
  for select to authenticated
  using (requester_id = auth.uid() or public.is_encargado());

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations
  for insert to authenticated with check (public.is_encargado());

drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations
  for update to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

-- ------------------------------- deliveries --------------------------
drop policy if exists deliveries_select on public.deliveries;
create policy deliveries_select on public.deliveries
  for select to authenticated
  using (recipient_id = auth.uid() or public.is_encargado());

drop policy if exists deliveries_insert on public.deliveries;
create policy deliveries_insert on public.deliveries
  for insert to authenticated with check (public.is_encargado());

drop policy if exists deliveries_update on public.deliveries;
create policy deliveries_update on public.deliveries
  for update to authenticated
  using (public.is_encargado()) with check (public.is_encargado());

-- -------------------------------- audit_log --------------------------
-- El encargado ve todo; el profesor solo sus propias operaciones.
-- No hay políticas de INSERT/UPDATE/DELETE: se escribe vía SECURITY DEFINER.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated
  using (public.is_encargado() or actor_id = auth.uid());

-- =====================================================================
-- Permisos de tabla (RLS sigue aplicando)
-- =====================================================================
grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.locations, public.resource_categories, public.schedules, public.settings to authenticated;
grant insert, update, delete on public.locations, public.resource_categories, public.schedules, public.settings to authenticated;
grant select, insert, update on public.resources to authenticated;
grant select, insert, update on public.requests to authenticated;
grant select, insert, update on public.reservations to authenticated;
grant select, insert, update on public.deliveries to authenticated;
grant select on public.audit_log to authenticated;
