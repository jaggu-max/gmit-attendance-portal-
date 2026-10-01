create table if not exists public.attendance_sections (
  section_code text primary key check (section_code = upper(section_code))
);

insert into public.attendance_sections (section_code)
values ('3A'), ('3B'), ('5A'), ('5B'), ('7A'), ('7B')
on conflict (section_code) do nothing;

create table if not exists public.students (
  usn text primary key check (usn = upper(usn)),
  section_code text not null references public.attendance_sections(section_code),
  full_name text not null,
  serial_no integer not null default 0,
  unique (usn, section_code)
);

create table if not exists public.subjects (
  section_code text not null references public.attendance_sections(section_code),
  course_code text not null check (course_code = upper(course_code)),
  subject_name text not null,
  teacher text not null,
  conducted integer not null default 0 check (conducted >= 0),
  primary key (section_code, course_code)
);

create table if not exists public.student_attendance (
  usn text not null,
  section_code text not null,
  course_code text not null,
  attended integer not null default 0 check (attended >= 0),
  primary key (usn, section_code, course_code),
  foreign key (usn, section_code)
    references public.students(usn, section_code) on delete cascade,
  foreign key (section_code, course_code)
    references public.subjects(section_code, course_code) on delete cascade
);

create table if not exists public.attendance_sessions (
  session_id text primary key,
  section_code text not null,
  course_code text not null,
  class_date date not null,
  session_number integer not null check (session_number > 0),
  state jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (section_code, course_code)
    references public.subjects(section_code, course_code) on delete cascade
);

create index if not exists attendance_sessions_class_idx
  on public.attendance_sessions (section_code, course_code, class_date, active);

create table if not exists public.attendance_events (
  log_id bigint generated always as identity primary key,
  session_id text not null references public.attendance_sessions(session_id),
  operation text not null check (operation in ('submit', 'edit', 'undo')),
  state jsonb not null default '{}'::jsonb,
  previous_state jsonb not null default '{}'::jsonb,
  conducted_before integer not null,
  conducted_after integer not null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_events_session_idx
  on public.attendance_events (session_id, log_id desc);

alter table public.attendance_sections enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.student_attendance enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_events enable row level security;

revoke all on public.attendance_sections, public.students, public.subjects,
  public.student_attendance, public.attendance_sessions, public.attendance_events
  from anon, authenticated;
grant all on public.attendance_sections, public.students, public.subjects,
  public.student_attendance, public.attendance_sessions, public.attendance_events
  to service_role;
grant usage, select on sequence public.attendance_events_log_id_seq to service_role;

create or replace function public.gmit_attendance_status(
  p_attended integer,
  p_conducted integer,
  p_minimum integer default 75
) returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  v_started boolean := p_conducted > 0;
  v_percentage numeric(6, 2);
  v_status text;
  v_can_miss integer;
  v_needed integer;
  v_buffer_message text;
  v_recovery_message text;
begin
  v_percentage := case when v_started then round(p_attended::numeric / p_conducted * 100, 2) else 100 end;
  v_status := case
    when not v_started then 'NOT_STARTED'
    when v_percentage >= 90 then 'EXCELLENT'
    when v_percentage >= p_minimum then 'ON_TRACK'
    when v_percentage >= 50 then 'AT_RISK'
    else 'CRITICAL'
  end;
  v_can_miss := case when p_conducted = 0 then 0
    else greatest(0, floor(p_attended::numeric / (p_minimum::numeric / 100) - p_conducted)::integer)
  end;
  v_buffer_message := case
    when p_conducted = 0 then 'No classes conducted yet.'
    when v_can_miss > 0 then 'You can miss approximately ' || v_can_miss ||
      ' upcoming class' || case when v_can_miss > 1 then 'es' else '' end ||
      ' and remain at or above 75%.'
    else 'Missing the next class may take attendance below 75%.'
  end;
  if p_conducted = 0 then
    v_needed := 0;
    v_recovery_message := 'Attendance will be calculated when classes begin.';
  elsif v_percentage >= p_minimum then
    v_needed := 0;
    v_recovery_message := 'You are already at or above the minimum requirement.';
  else
    v_needed := greatest(0, ceil(((p_minimum::numeric / 100) * p_conducted - p_attended) /
      (1 - p_minimum::numeric / 100))::integer);
    v_recovery_message := 'Attend the next ' || v_needed || ' class' ||
      case when v_needed > 1 then 'es' else '' end ||
      ' consecutively to reach approximately 75%.';
  end if;
  return jsonb_build_object(
    'attended', p_attended,
    'conducted', p_conducted,
    'percentage', v_percentage,
    'minimumRequired', p_minimum,
    'status', v_status,
    'isStarted', v_started,
    'buffer', jsonb_build_object('canMiss', v_can_miss, 'message', v_buffer_message),
    'recovery', jsonb_build_object('needed', v_needed, 'message', v_recovery_message)
  );
end;
$$;

create or replace function public.gmit_attendance_api(
  p_action text,
  p_params jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(coalesce(p_action, ''));
  v_section text := upper(trim(coalesce(p_params->>'section', '')));
  v_course text := upper(trim(coalesce(p_params->>'courseCode', '')));
  v_usn text := upper(trim(coalesce(p_params->>'usn', '')));
  v_date date;
  v_date_text text := nullif(trim(coalesce(p_params->>'date', '')), '');
  v_subject public.subjects%rowtype;
  v_student public.students%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_latest_event public.attendance_events%rowtype;
  v_state jsonb := '{}'::jsonb;
  v_old_state jsonb := '{}'::jsonb;
  v_mark text;
  v_present integer := 0;
  v_absent integer := 0;
  v_conducted integer;
  v_conducted_before integer;
  v_conducted_after integer;
  v_session_number integer;
  v_session_id text;
  v_log_id bigint;
  v_row record;
  v_subjects jsonb;
  v_students jsonb;
  v_history jsonb;
  v_result jsonb;
  v_minimum constant integer := 75;
begin
  if v_date_text is not null then
    begin
      v_date := v_date_text::date;
    exception when others then
      return jsonb_build_object('success', false, 'error', 'Invalid date.');
    end;
  end if;

  if v_action = 'health' then
    select coalesce(jsonb_agg(section_code order by section_code), '[]'::jsonb)
      into v_result from public.attendance_sections;
    return jsonb_build_object('success', true, 'app', 'GMIT Attendance API',
      'status', 'online', 'sections', v_result);
  elsif v_action = 'sections' then
    select coalesce(jsonb_object_agg(s.section_code, jsonb_build_object(
      'available', true,
      'rows', (select count(*) from public.students st where st.section_code = s.section_code),
      'columns', (select count(*) from public.subjects su where su.section_code = s.section_code) + 3
    )), '{}'::jsonb)
      into v_result from public.attendance_sections s;
    return jsonb_build_object('success', true, 'sections', v_result);
  elsif v_action = 'student' then
    select * into v_student from public.students
      where section_code = v_section and usn = v_usn;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Student not found.',
        'section', v_section, 'usn', v_usn);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'courseCode', su.course_code,
      'subject', su.subject_name,
      'teacher', su.teacher,
      'attended', coalesce(sa.attended, 0),
      'conducted', su.conducted,
      'percentage', (public.gmit_attendance_status(coalesce(sa.attended, 0), su.conducted, v_minimum)->>'percentage')::numeric,
      'minimumRequired', v_minimum,
      'status', public.gmit_attendance_status(coalesce(sa.attended, 0), su.conducted, v_minimum)->>'status',
      'isStarted', su.conducted > 0,
      'buffer', public.gmit_attendance_status(coalesce(sa.attended, 0), su.conducted, v_minimum)->'buffer',
      'recovery', public.gmit_attendance_status(coalesce(sa.attended, 0), su.conducted, v_minimum)->'recovery'
    ) order by su.course_code), '[]'::jsonb)
      into v_subjects
      from public.subjects su
      left join public.student_attendance sa
        on sa.usn = v_student.usn and sa.section_code = su.section_code and sa.course_code = su.course_code
      where su.section_code = v_section;
    select coalesce(sum(coalesce(sa.attended, 0)) filter (where su.conducted > 0), 0)::integer,
           coalesce(sum(su.conducted), 0)::integer
      into v_present, v_conducted
      from public.subjects su
      left join public.student_attendance sa
        on sa.usn = v_student.usn and sa.section_code = su.section_code and sa.course_code = su.course_code
      where su.section_code = v_section;
    v_result := public.gmit_attendance_status(v_present, v_conducted, v_minimum);
    if v_conducted = 0 then
      v_result := v_result || jsonb_build_object('percentage', 0);
    end if;
    return jsonb_build_object('success', true, 'minimumRequired', v_minimum,
      'student', jsonb_build_object('usn', v_student.usn, 'name', v_student.full_name,
        'section', v_student.section_code),
      'overall', v_result - 'buffer' - 'recovery', 'subjects', v_subjects);
  elsif v_action in ('subjects', 'authorizesubject', 'facultysubjects', 'students') then
    if v_action = 'facultysubjects' then
      if trim(coalesce(p_params->>'teacher', '')) = '' then
        return jsonb_build_object('success', false, 'error', 'Teacher required.');
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'section', su.section_code, 'courseCode', su.course_code,
        'subject', su.subject_name, 'teacher', su.teacher, 'conducted', su.conducted
      ) order by su.section_code, su.course_code), '[]'::jsonb)
        into v_result from public.subjects su
        where lower(trim(su.teacher)) = lower(trim(p_params->>'teacher'));
      return jsonb_build_object('success', true,
        'teacher', lower(trim(p_params->>'teacher')), 'subjects', v_result);
    end if;
    if not exists (select 1 from public.attendance_sections where section_code = v_section) then
      return jsonb_build_object('success', false, 'error', 'Invalid section.');
    end if;
    if v_action = 'subjects' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'courseCode', su.course_code, 'subject', su.subject_name,
        'teacher', su.teacher, 'conducted', su.conducted
      ) order by su.course_code), '[]'::jsonb)
        into v_subjects from public.subjects su where su.section_code = v_section;
      select count(*)::integer into v_present from public.students st where st.section_code = v_section;
      return jsonb_build_object('success', true, 'section', v_section,
        'subjects', v_subjects, 'studentCount', v_present);
    elsif v_action = 'authorizesubject' then
      select * into v_subject from public.subjects
        where section_code = v_section and course_code = v_course;
      if not found then
        return jsonb_build_object('success', false, 'error', 'Subject not found for this section.');
      end if;
      select count(*)::integer into v_present from public.students st where st.section_code = v_section;
      return jsonb_build_object('success', true, 'section', v_section,
        'courseCode', v_subject.course_code, 'subject', v_subject.subject_name,
        'teacher', v_subject.teacher, 'conducted', v_subject.conducted,
        'studentCount', v_present);
    else
      select * into v_subject from public.subjects
        where section_code = v_section and course_code = v_course;
      if not found then
        return jsonb_build_object('success', false, 'error', 'Subject not found.');
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'serial', st.serial_no,
        'usn', st.usn,
        'name', st.full_name,
        'attended', coalesce(sa.attended, 0),
        'conducted', v_subject.conducted,
        'percentage', (public.gmit_attendance_status(coalesce(sa.attended, 0), v_subject.conducted, v_minimum)->>'percentage')::numeric,
        'minimumRequired', v_minimum,
        'status', public.gmit_attendance_status(coalesce(sa.attended, 0), v_subject.conducted, v_minimum)->>'status',
        'isStarted', v_subject.conducted > 0,
        'recovery', public.gmit_attendance_status(coalesce(sa.attended, 0), v_subject.conducted, v_minimum)->'recovery'
      ) order by st.serial_no, st.usn), '[]'::jsonb)
        into v_students
        from public.students st
        left join public.student_attendance sa
          on sa.usn = st.usn and sa.section_code = v_section and sa.course_code = v_course
        where st.section_code = v_section;
      return jsonb_build_object('success', true, 'section', v_section,
        'courseCode', v_subject.course_code, 'subject', v_subject.subject_name,
        'teacher', v_subject.teacher, 'conducted', v_subject.conducted,
        'students', v_students);
    end if;
  elsif v_action = 'attendance' then
    select * into v_subject from public.subjects
      where section_code = v_section and course_code = v_course;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Subject not found.');
    end if;
    if nullif(trim(coalesce(p_params->>'sessionId', '')), '') is not null then
      select * into v_session from public.attendance_sessions
        where session_id = p_params->>'sessionId' and active
          and section_code = v_section and course_code = v_course;
    elsif nullif(trim(coalesce(p_params->>'logId', '')), '') is not null then
      begin
        v_log_id := (p_params->>'logId')::bigint;
      exception when others then
        v_log_id := null;
      end;
      select s.* into v_session from public.attendance_sessions s
        join public.attendance_events e on e.session_id = s.session_id
        where e.log_id = v_log_id and s.active
          and s.section_code = v_section and s.course_code = v_course
        order by e.log_id desc limit 1;
    else
      select * into v_session from public.attendance_sessions
        where section_code = v_section and course_code = v_course
          and class_date = v_date and active
        order by created_at desc limit 1;
    end if;
    if not found then
      return jsonb_build_object('success', true, 'submitted', false,
        'section', v_section, 'courseCode', v_subject.course_code,
        'subject', v_subject.subject_name, 'teacher', v_subject.teacher,
        'date', v_date, 'attendance', '{}'::jsonb);
    end if;
    select * into v_latest_event from public.attendance_events
      where session_id = v_session.session_id order by log_id desc limit 1;
    return jsonb_build_object('success', true, 'submitted', true,
      'section', v_section, 'courseCode', v_subject.course_code,
      'subject', v_subject.subject_name, 'teacher', v_subject.teacher,
      'date', v_session.class_date, 'sessionNumber', v_session.session_number,
      'sessionId', v_session.session_id, 'logId', v_latest_event.log_id,
      'conducted', v_subject.conducted, 'attendance', v_session.state);
  elsif v_action = 'history' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'logId', e.log_id,
      'timestamp', e.created_at,
      'date', s.class_date,
      'sessionNumber', s.session_number,
      'classLabel', 'Class ' || s.session_number,
      'sessionId', s.session_id,
      'section', s.section_code,
      'courseCode', s.course_code,
      'subject', su.subject_name,
      'teacher', su.teacher,
      'operation', e.operation,
      'present', (select count(*) from jsonb_each_text(s.state) m where m.value = 'P'),
      'absent', (select count(*) from jsonb_each_text(s.state) m where m.value <> 'P'),
      'total', (select count(*) from jsonb_each(s.state)),
      'conducted', su.conducted,
      'undone', false
    ) order by s.class_date desc, s.session_number desc), '[]'::jsonb)
      into v_history
      from public.attendance_sessions s
      join public.subjects su on su.section_code = s.section_code and su.course_code = s.course_code
      join lateral (
        select ev.* from public.attendance_events ev
          where ev.session_id = s.session_id
          order by ev.log_id desc limit 1
      ) e on true
      where s.active
        and (v_section = '' or s.section_code = v_section)
        and (v_course = '' or s.course_code = v_course);
    return jsonb_build_object('success', true, 'history', v_history);
  elsif v_action in ('submitattendance', 'updateattendance', 'undoattendance', 'deleteattendance') then
    if v_section = '' or v_course = '' or v_date is null then
      return jsonb_build_object('success', false,
        'error', 'section, courseCode and date are required.');
    end if;
    select * into v_subject from public.subjects
      where section_code = v_section and course_code = v_course
      for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Subject not found.');
    end if;
    v_conducted_before := v_subject.conducted;

    if v_action = 'submitattendance' then
      if jsonb_typeof(p_params->'attendance') <> 'object'
         or p_params->'attendance' = '{}'::jsonb then
        return jsonb_build_object('success', false, 'error', 'No attendance provided.');
      end if;
      for v_row in
        select st.usn, m.value
        from jsonb_each_text(p_params->'attendance') m
        join public.students st on st.section_code = v_section and st.usn = upper(trim(m.key))
      loop
        v_mark := case when upper(trim(v_row.value)) in ('P', 'PRESENT') then 'P' else 'A' end;
        v_state := v_state || jsonb_build_object(v_row.usn, v_mark);
        if v_mark = 'P' then v_present := v_present + 1; else v_absent := v_absent + 1; end if;
      end loop;
      if v_state = '{}'::jsonb then
        return jsonb_build_object('success', false, 'error', 'No attendance provided.');
      end if;
      select count(*)::integer + 1 into v_session_number
        from public.attendance_sessions
        where section_code = v_section and course_code = v_course
          and class_date = v_date and active;
      v_session_id := v_section || '_' || v_course || '_' || v_date::text ||
        '_C' || v_session_number || '_' || replace(gen_random_uuid()::text, '-', '');
      v_conducted_after := v_conducted_before + 1;
      insert into public.attendance_sessions (
        session_id, section_code, course_code, class_date, session_number, state
      ) values (
        v_session_id, v_section, v_course, v_date, v_session_number, v_state
      );
      update public.subjects set conducted = v_conducted_after
        where section_code = v_section and course_code = v_course;
      insert into public.student_attendance (usn, section_code, course_code, attended)
      select st.usn, v_section, v_course, 0 from public.students st
        where st.section_code = v_section
      on conflict (usn, section_code, course_code) do nothing;
      update public.student_attendance sa set attended = sa.attended + 1
        from jsonb_each_text(v_state) m
        where sa.usn = m.key and sa.section_code = v_section
          and sa.course_code = v_course and m.value = 'P';
      insert into public.attendance_events (
        session_id, operation, state, previous_state, conducted_before, conducted_after
      ) values (v_session_id, 'submit', v_state, '{}'::jsonb,
        v_conducted_before, v_conducted_after) returning log_id into v_log_id;
      return jsonb_build_object('success', true, 'operation', 'submit',
        'section', v_section, 'courseCode', v_course, 'date', v_date,
        'sessionNumber', v_session_number, 'sessionId', v_session_id,
        'logId', v_log_id, 'conducted', v_conducted_after, 'present', v_present,
        'absent', v_absent, 'total', v_present + v_absent);
    end if;

    if nullif(trim(coalesce(p_params->>'sessionId', '')), '') is not null then
      select * into v_session from public.attendance_sessions
        where session_id = p_params->>'sessionId' and active
          and section_code = v_section and course_code = v_course
          and class_date = v_date for update;
    elsif nullif(trim(coalesce(p_params->>'logId', '')), '') is not null then
      begin
        v_log_id := (p_params->>'logId')::bigint;
      exception when others then
        v_log_id := null;
      end;
      select s.* into v_session from public.attendance_sessions s
        join public.attendance_events e on e.session_id = s.session_id
        where e.log_id = v_log_id and s.active
          and s.section_code = v_section and s.course_code = v_course
          and s.class_date = v_date for update of s;
    else
      select * into v_session from public.attendance_sessions
        where section_code = v_section and course_code = v_course
          and class_date = v_date and active
        order by created_at desc limit 1 for update;
    end if;

    if not found then
      if v_action in ('undoattendance', 'deleteattendance') then
        if v_action = 'deleteattendance' then
          return jsonb_build_object('success', true, 'operation', 'delete',
            'section', v_section, 'courseCode', v_course, 'date', v_date);
        end if;
        return jsonb_build_object('success', false,
          'error', 'Attendance has already been undone.', 'code', 'ALREADY_UNDONE');
      end if;
      return jsonb_build_object('success', false,
        'error', 'No submitted attendance found for this date/session.');
    end if;

    v_old_state := v_session.state;
    if v_action = 'updateattendance' then
      if coalesce(jsonb_typeof(p_params->'attendance'), 'null') <> 'object'
         or p_params->'attendance' = '{}'::jsonb then
        return jsonb_build_object('success', false, 'error', 'No attendance provided.');
      end if;
      for v_row in
        select st.usn, m.value
        from jsonb_each_text(p_params->'attendance') m
        join public.students st on st.section_code = v_section and st.usn = upper(trim(m.key))
      loop
        v_mark := case when upper(trim(v_row.value)) in ('P', 'PRESENT') then 'P' else 'A' end;
        v_state := v_state || jsonb_build_object(v_row.usn, v_mark);
      end loop;
      if v_state = '{}'::jsonb then
        return jsonb_build_object('success', false, 'error', 'No attendance provided.');
      end if;
      for v_row in
        select key as usn from jsonb_each(v_old_state)
        union
        select key as usn from jsonb_each(v_state)
      loop
        if exists (select 1 from public.students st
          where st.usn = v_row.usn and st.section_code = v_section) then
          v_mark := coalesce(v_state->>v_row.usn, 'A');
          if (case when v_mark = 'P' then 1 else 0 end) <>
             (case when coalesce(v_old_state->>v_row.usn, 'A') = 'P' then 1 else 0 end) then
            insert into public.student_attendance (usn, section_code, course_code, attended)
            values (v_row.usn, v_section, v_course, 0)
            on conflict (usn, section_code, course_code) do nothing;
            update public.student_attendance set attended = greatest(0, attended +
              (case when v_mark = 'P' then 1 else 0 end) -
              (case when coalesce(v_old_state->>v_row.usn, 'A') = 'P' then 1 else 0 end))
              where usn = v_row.usn and section_code = v_section and course_code = v_course;
          end if;
        end if;
      end loop;
      select count(*) filter (where value = 'P')::integer,
             count(*) filter (where value <> 'P')::integer
        into v_present, v_absent from jsonb_each_text(v_state);
      update public.attendance_sessions set state = v_state
        where session_id = v_session.session_id;
      insert into public.attendance_events (
        session_id, operation, state, previous_state, conducted_before, conducted_after
      ) values (v_session.session_id, 'edit', v_state, v_old_state,
        v_conducted_before, v_conducted_before) returning log_id into v_log_id;
      return jsonb_build_object('success', true, 'operation', 'edit',
        'section', v_section, 'courseCode', v_course, 'date', v_date,
        'sessionNumber', v_session.session_number, 'sessionId', v_session.session_id,
        'logId', v_log_id, 'conducted', v_conducted_before, 'present', v_present,
        'absent', v_absent, 'total', v_present + v_absent);
    end if;

    if v_action in ('undoattendance', 'deleteattendance') then
      v_conducted_after := greatest(0, v_conducted_before - 1);
      update public.subjects set conducted = v_conducted_after
        where section_code = v_section and course_code = v_course;
      update public.student_attendance sa set attended = greatest(0, sa.attended - 1)
        from jsonb_each_text(v_old_state) m
        where sa.usn = m.key and sa.section_code = v_section
          and sa.course_code = v_course and m.value = 'P';
      update public.attendance_sessions set active = false
        where session_id = v_session.session_id;
      insert into public.attendance_events (
        session_id, operation, state, previous_state, conducted_before, conducted_after
      ) values (v_session.session_id, 'undo', '{}'::jsonb, v_old_state,
        v_conducted_before, v_conducted_after) returning log_id into v_log_id;
      if v_action = 'deleteattendance' then
        return jsonb_build_object('success', true, 'operation', 'delete',
          'section', v_section, 'courseCode', v_course, 'date', v_date);
      end if;
      return jsonb_build_object('success', true, 'operation', 'undo',
        'undone', 'submit', 'conducted', v_conducted_after);
    end if;
  end if;

  return jsonb_build_object('success', false, 'error', 'Unknown action.');
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'error', 'Attendance references unknown student or subject.');
end;
$$;

revoke all on function public.gmit_attendance_status(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.gmit_attendance_api(text, jsonb) from public, anon, authenticated;
grant execute on function public.gmit_attendance_status(integer, integer, integer) to service_role;
grant execute on function public.gmit_attendance_api(text, jsonb) to service_role;
