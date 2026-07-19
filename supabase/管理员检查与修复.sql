-- 数之谜：管理员检查与权限修复脚本
-- 用法：Supabase Dashboard → SQL Editor → 新建查询 → 粘贴并运行。
-- 注意：此脚本只修复管理员 profile/role，不会修改 Auth 密码。

-- 1) 检查 Auth 用户是否存在、邮箱是否确认
select id, email, email_confirmed_at, created_at, updated_at
from auth.users
where lower(email) = 'adminpzh@math.example';

-- 如果上面的查询没有结果：
-- 请先进入 Authentication → Users → Add user → Create new user，
-- Email 填 adminpzh@math.example，设置密码，并启用自动确认。

-- 2) 为已存在的 Auth 用户补齐/修复管理员 profile
insert into public.profiles(id, username, role)
select id, 'adminpzh', 'admin'
from auth.users
where lower(email) = 'adminpzh@math.example'
on conflict (id) do update set
  username = 'adminpzh',
  role = 'admin';

-- 3) 查看最终结果
select p.id, u.email, u.email_confirmed_at, p.username, p.role
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'adminpzh@math.example';
