-- Simulación mínima del esquema auth de Supabase para verificar RLS en local
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create role authenticated;
create role anon;
grant usage on schema auth to authenticated, anon;
grant select on auth.users to authenticated;
grant usage on schema public to authenticated, anon;
