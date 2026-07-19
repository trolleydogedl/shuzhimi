-- 数之谜数学供题库：Supabase 初始化脚本
-- 在 Supabase Dashboard -> SQL Editor 中完整运行一次。

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'viewer' check (role in ('viewer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.problems (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  problem_content text not null default '',
  solution_content text not null default '',
  content_format text not null default 'latex' check (content_format in ('latex','text','markdown')),
  tags text[] not null default '{}',
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.problem_admin (
  problem_id uuid primary key references public.problems(id) on delete cascade,
  difficulty text not null default '',
  institution text not null default '未填写',
  original_code text not null default '',
  duplicate_note text not null default '',
  internal_notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.problem_files (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete cascade,
  file_type text not null check (file_type in ('zip','pdf','tex','other')),
  storage_path text not null unique,
  original_name text not null,
  size_bytes bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now()
);

create index if not exists problems_published_sort_idx on public.problems(published, sort_order);
create index if not exists problem_files_problem_idx on public.problem_files(problem_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists problems_set_updated_at on public.problems;
create trigger problems_set_updated_at before update on public.problems
for each row execute function public.set_updated_at();

drop trigger if exists problem_admin_set_updated_at on public.problem_admin;
create trigger problem_admin_set_updated_at before update on public.problem_admin
for each row execute function public.set_updated_at();

-- 新建 Auth 用户时自动建立 profile。
-- 指定邮箱会自动成为管理员；网站登录界面仍只显示账号 adminpzh。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, username, role)
  values (
    new.id,
    split_part(coalesce(new.email, new.id::text), '@', 1),
    case when lower(coalesce(new.email,'')) = 'adminpzh@math.example' then 'admin' else 'viewer' end
  )
  on conflict (id) do update set
    username = excluded.username,
    role = case when lower(coalesce(new.email,'')) = 'adminpzh@math.example' then 'admin' else profiles.role end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_user();

-- 如果管理员用户在运行脚本前已经建立，也会自动补齐。
insert into public.profiles(id, username, role)
select id, split_part(email,'@',1),
       case when lower(email)='adminpzh@math.example' then 'admin' else 'viewer' end
from auth.users
where email is not null
on conflict (id) do update set
  username=excluded.username,
  role=case when excluded.role='admin' then 'admin' else profiles.role end;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.problems enable row level security;
alter table public.problem_admin enable row level security;
alter table public.problem_files enable row level security;

-- 重复运行脚本时先清理同名策略。
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "problems public read" on public.problems;
drop policy if exists "problems admin insert" on public.problems;
drop policy if exists "problems admin update" on public.problems;
drop policy if exists "problems admin delete" on public.problems;
drop policy if exists "problem admin only" on public.problem_admin;
drop policy if exists "problem files admin only" on public.problem_files;

create policy "profiles read own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "problems public read"
on public.problems for select
to anon, authenticated
using (published = true or public.is_admin());

create policy "problems admin insert"
on public.problems for insert
to authenticated
with check (public.is_admin());

create policy "problems admin update"
on public.problems for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "problems admin delete"
on public.problems for delete
to authenticated
using (public.is_admin());

create policy "problem admin only"
on public.problem_admin for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "problem files admin only"
on public.problem_files for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- API 权限：RLS 仍是最终安全边界。
grant usage on schema public to anon, authenticated;
grant select on public.problems to anon, authenticated;
grant insert, update, delete on public.problems to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.problem_admin to authenticated;
grant select, insert, update, delete on public.problem_files to authenticated;

-- 建立私有附件桶。游客没有任何对象访问策略。
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'problem-files',
  'problem-files',
  false,
  52428800,
  array['application/zip','application/x-zip-compressed','application/pdf','application/x-tex','text/plain','application/octet-stream']
)
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "problem storage admin select" on storage.objects;
drop policy if exists "problem storage admin insert" on storage.objects;
drop policy if exists "problem storage admin update" on storage.objects;
drop policy if exists "problem storage admin delete" on storage.objects;

create policy "problem storage admin select"
on storage.objects for select
to authenticated
using (bucket_id='problem-files' and public.is_admin());

create policy "problem storage admin insert"
on storage.objects for insert
to authenticated
with check (bucket_id='problem-files' and public.is_admin());

create policy "problem storage admin update"
on storage.objects for update
to authenticated
using (bucket_id='problem-files' and public.is_admin())
with check (bucket_id='problem-files' and public.is_admin());

create policy "problem storage admin delete"
on storage.objects for delete
to authenticated
using (bucket_id='problem-files' and public.is_admin());

-- 完成后：在 Authentication -> Users 新建用户
-- Email: adminpzh@math.example
-- Password: pass2008@@
-- 勾选/选择自动确认用户（Auto Confirm User）。
