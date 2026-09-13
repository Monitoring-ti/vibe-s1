-- =============================================================================
-- Charlas de Seguridad — Esquema SQL para Supabase (PostgreSQL)
-- =============================================================================
-- Tablas: profiles, processing_jobs, uploaded_documents, safety_talks,
--         participants, talk_participants, extraction_evidence,
--         validation_issues, generated_reports
--
-- Incluye: enums, índices, relaciones FK, triggers, políticas RLS y seed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensiones
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos enumerados (enums)
-- -----------------------------------------------------------------------------
create type user_rol as enum ('admin', 'usuario');

create type job_estado as enum (
  'pendiente',
  'procesando',
  'requiere_revision',
  'completado',
  'error'
);

create type document_estado as enum (
  'pendiente',
  'procesando',
  'procesado',
  'error'
);

create type validation_tipo as enum (
  'nombre_no_encontrado',
  'horario_superpuesto',
  'campo_faltante',
  'confianza_baja',
  'firma_ilegible'
);

create type validation_severidad as enum ('advertencia', 'error');

-- -----------------------------------------------------------------------------
-- Tabla: profiles
-- -----------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null default '',
  email        text not null default '',
  rol          user_rol not null default 'usuario',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: processing_jobs
-- -----------------------------------------------------------------------------
create table if not exists processing_jobs (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references profiles (id) on delete cascade,
  estado              job_estado not null default 'pendiente',
  total_documentos    int not null default 0,
  documentos_procesados int not null default 0,
  error_mensaje       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: uploaded_documents
-- -----------------------------------------------------------------------------
create table if not exists uploaded_documents (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null references processing_jobs (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  nombre_archivo text not null,
  tamano_bytes bigint not null,
  mime_type   text not null default 'application/pdf',
  storage_path text not null,
  estado      document_estado not null default 'pendiente',
  error_mensaje text,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: safety_talks
-- -----------------------------------------------------------------------------
create table if not exists safety_talks (
  id                uuid primary key default uuid_generate_v4(),
  document_id       uuid not null references uploaded_documents (id) on delete cascade,
  job_id            uuid not null references processing_jobs (id) on delete cascade,
  user_id           uuid not null references profiles (id) on delete cascade,
  nombre_curso      text not null default '',
  descripcion       text not null default 'Charla de Seguridad',
  fecha_inicio      date,
  hora_inicio       time,
  duracion_minutos  int not null default 20,
  hora_finalizacion time,
  tipo_entrenamiento text default '',
  modalidad         text default '',
  idioma            text default '',
  creado_por        text default '',
  comentarios       text default '',
  confianza_general float not null default 0,
  requiere_revision boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: participants
-- -----------------------------------------------------------------------------
create table if not exists participants (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references profiles (id) on delete set null,
  nombre_normalizado text not null,
  nombre_detectado  text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: talk_participants
-- -----------------------------------------------------------------------------
create table if not exists talk_participants (
  id                uuid primary key default uuid_generate_v4(),
  talk_id           uuid not null references safety_talks (id) on delete cascade,
  participant_id    uuid references participants (id) on delete set null,
  nombre_detectado  text not null default '',
  firma_detectada   boolean not null default false,
  confianza_nombre  float not null default 0,
  confianza_firma   float not null default 0,
  pagina_evidencia   int,
  requiere_revision boolean not null default false,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: extraction_evidence
-- -----------------------------------------------------------------------------
create table if not exists extraction_evidence (
  id          uuid primary key default uuid_generate_v4(),
  talk_id     uuid not null references safety_talks (id) on delete cascade,
  tipo_dato   text not null,
  valor_extraido text,
  pagina      int,
  confianza   float,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: validation_issues
-- -----------------------------------------------------------------------------
create table if not exists validation_issues (
  id          uuid primary key default uuid_generate_v4(),
  talk_id     uuid not null references safety_talks (id) on delete cascade,
  tipo        validation_tipo not null,
  descripcion text not null default '',
  severidad   validation_severidad not null default 'advertencia',
  resuelto    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: generated_reports
-- -----------------------------------------------------------------------------
create table if not exists generated_reports (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null references processing_jobs (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  archivo_path text not null,
  nombre_archivo text not null,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- ÍNDICES
-- =============================================================================
create index idx_profiles_email on profiles (email);
create index idx_profiles_rol on profiles (rol);

create index idx_processing_jobs_user on processing_jobs (user_id);
create index idx_processing_jobs_estado on processing_jobs (estado);
create index idx_processing_jobs_created on processing_jobs (created_at desc);

create index idx_uploaded_documents_job on uploaded_documents (job_id);
create index idx_uploaded_documents_user on uploaded_documents (user_id);
create index idx_uploaded_documents_estado on uploaded_documents (estado);

create index idx_safety_talks_document on safety_talks (document_id);
create index idx_safety_talks_job on safety_talks (job_id);
create index idx_safety_talks_user on safety_talks (user_id);
create index idx_safety_talks_fecha on safety_talks (fecha_inicio);

create index idx_participants_user on participants (user_id);
create index idx_participants_nombre on participants (nombre_normalizado);

create index idx_talk_participants_talk on talk_participants (talk_id);
create index idx_talk_participants_participant on talk_participants (participant_id);

create index idx_extraction_evidence_talk on extraction_evidence (talk_id);
create index idx_validation_issues_talk on validation_issues (talk_id);
create index idx_validation_issues_resuelto on validation_issues (resuelto);

create index idx_generated_reports_job on generated_reports (job_id);
create index idx_generated_reports_user on generated_reports (user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-actualizar updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger trg_processing_jobs_updated_at
  before update on processing_jobs
  for each row execute function update_updated_at();

create trigger trg_safety_talks_updated_at
  before update on safety_talks
  for each row execute function update_updated_at();

-- Auto-crear profile al registrarse
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, nombre_completo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Habilitar RLS en todas las tablas
alter table profiles enable row level security;
alter table processing_jobs enable row level security;
alter table uploaded_documents enable row level security;
alter table safety_talks enable row level security;
alter table participants enable row level security;
alter table talk_participants enable row level security;
alter table extraction_evidence enable row level security;
alter table validation_issues enable row level security;
alter table generated_reports enable row level security;

-- Helper: verificar si el usuario es admin
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and rol = 'admin'
  );
$$ language sql security definer stable;

-- -----------------------------------------------------------------------------
-- profiles: cada usuario ve su propio perfil; admin ve todos
-- -----------------------------------------------------------------------------
create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles_update_own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- processing_jobs: cada usuario solo los suyos
-- -----------------------------------------------------------------------------
create policy "jobs_select_own" on processing_jobs
  for select using (user_id = auth.uid() or is_admin());

create policy "jobs_insert_own" on processing_jobs
  for insert with check (user_id = auth.uid());

create policy "jobs_update_own" on processing_jobs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "jobs_delete_own" on processing_jobs
  for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- uploaded_documents: cada usuario solo los suyos
-- -----------------------------------------------------------------------------
create policy "docs_select_own" on uploaded_documents
  for select using (user_id = auth.uid() or is_admin());

create policy "docs_insert_own" on uploaded_documents
  for insert with check (user_id = auth.uid());

create policy "docs_update_own" on uploaded_documents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "docs_delete_own" on uploaded_documents
  for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- safety_talks: cada usuario solo los suyos
-- -----------------------------------------------------------------------------
create policy "talks_select_own" on safety_talks
  for select using (user_id = auth.uid() or is_admin());

create policy "talks_insert_own" on safety_talks
  for insert with check (user_id = auth.uid());

create policy "talks_update_own" on safety_talks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "talks_delete_own" on safety_talks
  for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- participants: cada usuario solo los suyos
-- -----------------------------------------------------------------------------
create policy "participants_select_own" on participants
  for select using (user_id = auth.uid() or user_id is null or is_admin());

create policy "participants_insert_own" on participants
  for insert with check (user_id = auth.uid() or user_id is null);

create policy "participants_update_own" on participants
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- talk_participants: acceso via talk_id -> user_id
-- -----------------------------------------------------------------------------
create policy "tp_select_own" on talk_participants
  for select using (
    exists (
      select 1 from safety_talks st
      where st.id = talk_participants.talk_id
      and (st.user_id = auth.uid() or is_admin())
    )
  );

create policy "tp_insert_own" on talk_participants
  for insert with check (
    exists (
      select 1 from safety_talks st
      where st.id = talk_participants.talk_id
      and st.user_id = auth.uid()
    )
  );

create policy "tp_update_own" on talk_participants
  for update using (
    exists (
      select 1 from safety_talks st
      where st.id = talk_participants.talk_id
      and st.user_id = auth.uid()
    )
  );

create policy "tp_delete_own" on talk_participants
  for delete using (
    exists (
      select 1 from safety_talks st
      where st.id = talk_participants.talk_id
      and st.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- extraction_evidence: acceso via talk_id -> user_id
-- -----------------------------------------------------------------------------
create policy "ee_select_own" on extraction_evidence
  for select using (
    exists (
      select 1 from safety_talks st
      where st.id = extraction_evidence.talk_id
      and (st.user_id = auth.uid() or is_admin())
    )
  );

create policy "ee_insert_own" on extraction_evidence
  for insert with check (
    exists (
      select 1 from safety_talks st
      where st.id = extraction_evidence.talk_id
      and st.user_id = auth.uid()
    )
  );

create policy "ee_delete_own" on extraction_evidence
  for delete using (
    exists (
      select 1 from safety_talks st
      where st.id = extraction_evidence.talk_id
      and st.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- validation_issues: acceso via talk_id -> user_id
-- -----------------------------------------------------------------------------
create policy "vi_select_own" on validation_issues
  for select using (
    exists (
      select 1 from safety_talks st
      where st.id = validation_issues.talk_id
      and (st.user_id = auth.uid() or is_admin())
    )
  );

create policy "vi_insert_own" on validation_issues
  for insert with check (
    exists (
      select 1 from safety_talks st
      where st.id = validation_issues.talk_id
      and st.user_id = auth.uid()
    )
  );

create policy "vi_update_own" on validation_issues
  for update using (
    exists (
      select 1 from safety_talks st
      where st.id = validation_issues.talk_id
      and st.user_id = auth.uid()
    )
  );

create policy "vi_delete_own" on validation_issues
  for delete using (
    exists (
      select 1 from safety_talks st
      where st.id = validation_issues.talk_id
      and st.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- generated_reports: cada usuario solo los suyos
-- -----------------------------------------------------------------------------
create policy "reports_select_own" on generated_reports
  for select using (user_id = auth.uid() or is_admin());

create policy "reports_insert_own" on generated_reports
  for insert with check (user_id = auth.uid());

create policy "reports_delete_own" on generated_reports
  for delete using (user_id = auth.uid());

-- =============================================================================
-- SEED: Nómina autorizada (8 personas)
-- =============================================================================
-- Se insertan con user_id = NULL (son globales, no pertenecen a un usuario)
insert into participants (nombre_normalizado, nombre_detectado, activo, user_id)
values
  ('CACERES MENDOZA MAURICIO AUGUSTO', 'CACERES MENDOZA, MAURICIO AUGUSTO', true, null),
  ('CONTRERAS TORDECILLA GUILLERMO ENRIQUE', 'CONTRERAS TORDECILLA, GUILLERMO ENRIQUE', true, null),
  ('CORTES CORTES DIEGO ALBERTO', 'CORTES CORTES, DIEGO ALBERTO', true, null),
  ('FLORES CHAPARRO SANTIAGO JONATHAN', 'FLORES CHAPARRO, SANTIAGO JONATHAN', true, null),
  ('MAUREIRA ASTUDILLO JAVIER ORLANDO', 'MAUREIRA ASTUDILLO, JAVIER ORLANDO', true, null),
  ('PEREZ ACUNA VILMA ROSSANA', 'PEREZ ACUÑA, VILMA ROSSANA', true, null),
  ('VILLALOBOS NUNEZ DANIEL MAURICIO', 'VILLALOBOS NUÑEZ, DANIEL MAURICIO', true, null),
  ('ZAVALA ARAYA CRISTIAN FELIPE', 'ZAVALA ARAYA, CRISTIAN FELIPE', true, null)
on conflict do nothing;

-- =============================================================================
-- FIN DEL ESQUEMA
-- =============================================================================
