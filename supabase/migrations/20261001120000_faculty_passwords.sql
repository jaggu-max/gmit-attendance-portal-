create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.faculty_credentials (
  section_code text not null,
  course_code text not null,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (section_code, course_code),
  foreign key (section_code, course_code)
    references public.subjects(section_code, course_code) on delete cascade
);

create table if not exists public.faculty_login_limits (
  section_code text not null references public.attendance_sections(section_code) on delete cascade,
  client_hash text not null,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  primary key (section_code, client_hash)
);

alter table public.faculty_credentials enable row level security;
alter table public.faculty_login_limits enable row level security;
revoke all on public.faculty_credentials, public.faculty_login_limits
  from public, anon, authenticated;
grant all on public.faculty_credentials, public.faculty_login_limits to service_role;

create or replace function public.gmit_set_faculty_password(
  p_section text,
  p_course_code text,
  p_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_section text := upper(trim(coalesce(p_section, '')));
  v_course text := upper(trim(coalesce(p_course_code, '')));
begin
  if p_password is null or length(p_password) < 12 or octet_length(p_password) > 72
     or p_password !~ '[a-z]' or p_password !~ '[A-Z]'
     or p_password !~ '[0-9]' or p_password !~ '[^A-Za-z0-9]' then
    return jsonb_build_object('success', false,
      'error', 'Use 12–128 characters with uppercase, lowercase, a number, and a symbol.');
  end if;

  perform 1 from public.attendance_sections
    where section_code = v_section for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid section.');
  end if;

  if not exists (
    select 1 from public.subjects
    where section_code = v_section and course_code = v_course
  ) then
    return jsonb_build_object('success', false, 'error', 'Subject not found.');
  end if;

  if exists (
    select 1 from public.faculty_credentials c
    where c.section_code = v_section and c.course_code <> v_course
      and extensions.crypt(p_password, c.password_hash) = c.password_hash
  ) then
    return jsonb_build_object('success', false,
      'error', 'Choose a different password for each subject in this section.');
  end if;

  insert into public.faculty_credentials (section_code, course_code, password_hash, updated_at)
  values (v_section, v_course, extensions.crypt(p_password, extensions.gen_salt('bf', 12)), now())
  on conflict (section_code, course_code) do update
    set password_hash = excluded.password_hash, updated_at = excluded.updated_at;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.gmit_authenticate_faculty(
  p_section text,
  p_password text,
  p_client_ip text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_section text := upper(trim(coalesce(p_section, '')));
  v_client_hash text := encode(extensions.digest(coalesce(p_client_ip, ''), 'sha256'), 'hex');
  v_limits public.faculty_login_limits%rowtype;
  v_match record;
begin
  select * into v_limits
  from public.faculty_login_limits
  where section_code = v_section and client_hash = v_client_hash
  for update;

  if found and v_limits.locked_until > now() then
    return jsonb_build_object('success', false, 'error', 'Invalid section or password. Try again later.');
  end if;

  select s.section_code, s.course_code, s.subject_name, s.teacher, s.conducted
    into v_match
  from public.faculty_credentials c
  join public.subjects s using (section_code, course_code)
  where c.section_code = v_section
    and p_password is not null
    and extensions.crypt(p_password, c.password_hash) = c.password_hash
  limit 1;

  if found then
    delete from public.faculty_login_limits
    where section_code = v_section and client_hash = v_client_hash;
    return jsonb_build_object(
      'success', true,
      'section', v_match.section_code,
      'courseCode', v_match.course_code,
      'subject', v_match.subject_name,
      'teacher', v_match.teacher,
      'conducted', v_match.conducted
    );
  end if;

  insert into public.faculty_login_limits (
    section_code, client_hash, failed_count, window_started_at, locked_until
  ) values (v_section, v_client_hash, 1, now(), null)
  on conflict (section_code, client_hash) do update set
    failed_count = case
      when public.faculty_login_limits.window_started_at < now() - interval '15 minutes' then 1
      else public.faculty_login_limits.failed_count + 1
    end,
    window_started_at = case
      when public.faculty_login_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.faculty_login_limits.window_started_at
    end,
    locked_until = case
      when public.faculty_login_limits.window_started_at < now() - interval '15 minutes' then null
      when public.faculty_login_limits.failed_count + 1 >= 5 then now() + interval '15 minutes'
      else public.faculty_login_limits.locked_until
    end
  returning * into v_limits;

  return jsonb_build_object('success', false, 'error',
    case when v_limits.locked_until > now()
      then 'Invalid section or password. Try again later.'
      else 'Invalid section or password.'
    end);
end;
$$;

revoke all on function public.gmit_set_faculty_password(text, text, text)
  from public, anon, authenticated;
revoke all on function public.gmit_authenticate_faculty(text, text, text)
  from public, anon, authenticated;
grant execute on function public.gmit_set_faculty_password(text, text, text)
  to service_role;
grant execute on function public.gmit_authenticate_faculty(text, text, text)
  to service_role;
