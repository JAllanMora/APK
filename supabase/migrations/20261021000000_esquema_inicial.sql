-- Fase 2: modelo de datos del generador de APKs.
--
-- Quién escribe qué:
--   * Navegador (rol authenticated, incluidos usuarios anónimos de Supabase Auth):
--       lee el catálogo, crea/edita SUS solicitudes, sube SUS imágenes y pide builds vía request_build().
--   * Servidor (service_role: GitHub Actions, Edge Function del webhook de EAS):
--       avanza el estado de los builds y guarda la URL del APK.
-- Nadie desde el navegador puede cambiar el estado de un build ni el identificador Android.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

-- Prefijo de los identificadores Android generados. Debe coincidir con ANDROID_NAMESPACE
-- (packages/template-config/src/package-id.ts). Cámbialo con una migración nueva, nunca después
-- de haber publicado APKs, o las apps ya instaladas no podrán actualizarse.
create function public.android_namespace()
returns text
language sql
immutable
as $$ select 'com.apkgen' $$;

-- Límite de builds por usuario en 24 h (protege la cuota de EAS y los minutos de Actions).
create function public.max_builds_per_day()
returns integer
language sql
immutable
as $$ select 5 $$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo de plantillas
-- ---------------------------------------------------------------------------

create table public.templates (
  id                      text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                    text not null,
  description             text,
  -- Carpeta de la plantilla dentro del repo (templates/<repo_path>).
  repo_path               text not null unique,
  preview_image_url       text,
  default_primary_color   text not null default '#1E88E5' check (default_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  default_secondary_color text not null default '#FFC107' check (default_secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active               boolean not null default true,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now()
);

comment on table public.templates is 'Catálogo de plantillas Expo disponibles en el selector de la web.';

-- ---------------------------------------------------------------------------
-- Solicitudes de app (datos del formulario)
-- ---------------------------------------------------------------------------

create table public.app_requests (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id     text not null references public.templates (id),
  business_name   text not null check (char_length(business_name) between 1 and 50),
  address         text check (char_length(address) <= 200),
  phone           text check (phone ~ '^\+?[0-9 ()-]{6,20}$'),
  headline        text not null check (char_length(headline) between 1 and 80),
  primary_color   text not null check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Rutas dentro del bucket brand-assets: "<owner_id>/<archivo>".
  icon_path       text,
  splash_path     text,
  -- applicationId único por app; lo asigna el trigger, el cliente no puede elegirlo.
  android_package text not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index app_requests_owner_idx on public.app_requests (owner_id, created_at desc);

comment on table public.app_requests is 'Datos capturados en el formulario para generar una app.';

create function public.app_requests_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_template public.templates;
begin
  -- Mismo algoritmo que androidPackageFor() en packages/template-config.
  new.android_package := public.android_namespace() || '.a' || left(replace(new.id::text, '-', ''), 16);

  -- Colores por defecto de la plantilla si el formulario no los envía.
  if new.primary_color is null or new.secondary_color is null then
    select * into v_template from public.templates where id = new.template_id;
    new.primary_color := coalesce(new.primary_color, v_template.default_primary_color);
    new.secondary_color := coalesce(new.secondary_color, v_template.default_secondary_color);
  end if;
  return new;
end;
$$;

create trigger app_requests_before_insert
  before insert on public.app_requests
  for each row execute function public.app_requests_before_insert();

create trigger app_requests_set_updated_at
  before update on public.app_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Builds (historial y estado de cada compilación)
-- ---------------------------------------------------------------------------

create type public.build_status as enum (
  'queued',      -- creado por request_build(), la web aún no dispara GitHub
  'dispatched',  -- la web envió repository_dispatch a GitHub Actions
  'building',    -- Actions lanzó `eas build` y guardó eas_build_id
  'completed',   -- webhook de EAS: APK listo en artifact_url
  'failed',
  'canceled'
);

create table public.builds (
  id             uuid primary key default gen_random_uuid(),
  app_request_id uuid not null references public.app_requests (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  status         public.build_status not null default 'queued',
  -- android.versionCode del APK; crece con cada build de la misma solicitud.
  version_code   integer not null check (version_code > 0),
  github_run_url text,
  eas_build_id   text unique,
  artifact_url   text,
  error_message  text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (app_request_id, version_code)
);

create index builds_owner_idx on public.builds (owner_id, created_at desc);
create index builds_request_idx on public.builds (app_request_id, created_at desc);
-- Como mucho un build en curso por solicitud (evita dobles clics y carreras).
create unique index builds_one_active_per_request
  on public.builds (app_request_id)
  where status in ('queued', 'dispatched', 'building');

comment on table public.builds is 'Cada intento de compilación de una solicitud, con su estado y el enlace al APK.';

create trigger builds_set_updated_at
  before update on public.builds
  for each row execute function public.set_updated_at();

-- Bitácora de cambios de estado: útil para depurar el webhook y el pipeline.
create table public.build_events (
  id         bigint generated always as identity primary key,
  build_id   uuid not null references public.builds (id) on delete cascade,
  status     public.build_status not null,
  message    text,
  created_at timestamptz not null default now()
);

create index build_events_build_idx on public.build_events (build_id, created_at);

create function public.builds_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.build_events (build_id, status, message)
    values (new.id, new.status, new.error_message);
  end if;
  return new;
end;
$$;

create trigger builds_log_status
  after insert or update on public.builds
  for each row execute function public.builds_log_status();

-- ---------------------------------------------------------------------------
-- request_build(): único camino para que el navegador cree un build
-- ---------------------------------------------------------------------------

create function public.request_build(p_app_request_id uuid)
returns public.builds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_build public.builds;
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión' using errcode = '42501';
  end if;

  perform 1 from public.app_requests where id = p_app_request_id and owner_id = v_uid;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;

  select count(*) into v_recent
  from public.builds
  where owner_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= public.max_builds_per_day() then
    raise exception 'Límite diario de compilaciones alcanzado' using errcode = 'P0001';
  end if;

  insert into public.builds (app_request_id, owner_id, version_code)
  values (
    p_app_request_id,
    v_uid,
    coalesce((select max(version_code) from public.builds where app_request_id = p_app_request_id), 0) + 1
  )
  returning * into v_build;

  return v_build;
exception
  when unique_violation then
    raise exception 'Ya hay una compilación en curso para esta app' using errcode = 'P0001';
end;
$$;

revoke execute on function public.request_build(uuid) from public, anon;
grant execute on function public.request_build(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.templates    enable row level security;
alter table public.app_requests enable row level security;
alter table public.builds       enable row level security;
alter table public.build_events enable row level security;

create policy "Catálogo visible para todos"
  on public.templates for select
  to anon, authenticated
  using (is_active);

create policy "Ver mis solicitudes"
  on public.app_requests for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Crear mis solicitudes"
  on public.app_requests for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (icon_path is null or icon_path like (select auth.uid())::text || '/%')
    and (splash_path is null or splash_path like (select auth.uid())::text || '/%')
    and exists (select 1 from public.templates t where t.id = template_id and t.is_active)
  );

create policy "Editar mis solicitudes"
  on public.app_requests for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (icon_path is null or icon_path like (select auth.uid())::text || '/%')
    and (splash_path is null or splash_path like (select auth.uid())::text || '/%')
  );

create policy "Borrar mis solicitudes"
  on public.app_requests for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- El navegador solo puede editar los campos del formulario (ni owner_id ni android_package).
revoke update on public.app_requests from anon, authenticated;
grant update (template_id, business_name, address, phone, headline, primary_color, secondary_color, icon_path, splash_path)
  on public.app_requests to authenticated;

create policy "Ver mis builds"
  on public.builds for select
  to authenticated
  using (owner_id = (select auth.uid()));
-- Sin políticas de insert/update/delete: los builds se crean con request_build()
-- y solo service_role (que ignora RLS) cambia su estado.

create policy "Ver eventos de mis builds"
  on public.build_events for select
  to authenticated
  using (exists (select 1 from public.builds b where b.id = build_id and b.owner_id = (select auth.uid())));

-- La web escucha cambios de estado con Supabase Realtime en lugar de hacer polling.
alter publication supabase_realtime add table public.builds;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Logos e imágenes subidas desde el formulario. Privado: el pipeline las lee con service_role.
  ('brand-assets', 'brand-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  -- Copia permanente de los APKs (los enlaces de EAS caducan). Público para que cualquiera descargue.
  ('apks', 'apks', true, 209715200, array['application/vnd.android.package-archive']);

create policy "Subir a mi carpeta de marca"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Ver mi carpeta de marca"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Reemplazar en mi carpeta de marca"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Borrar de mi carpeta de marca"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- El bucket apks no tiene políticas de escritura: solo service_role sube APKs.
