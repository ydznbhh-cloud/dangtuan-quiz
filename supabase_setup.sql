-- =========================================================
-- 2026 党团知识竞赛训练系统 · 云同步数据库脚本
-- 用法：Supabase 控制台 → SQL Editor → 粘贴本文件 → Run
-- 只需运行一次。
-- =========================================================

-- 1. 数据表：一个同步码对应一份 JSON 数据
create table if not exists public.sync_data (
  code       text primary key check (char_length(code) between 6 and 40),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2. 开启行级安全：不建任何策略，匿名用户无法直接读写整张表
alter table public.sync_data enable row level security;

-- 3. 读取接口：只有知道同步码才能取到对应数据
create or replace function public.get_sync(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  if char_length(coalesce(p_code, '')) < 6 then
    raise exception '同步码格式不正确';
  end if;
  select data into v_data from public.sync_data where code = p_code;
  return v_data;  -- 没有记录时返回 null
end;
$$;

-- 4. 写入接口：按同步码新增或覆盖
create or replace function public.put_sync(p_code text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(coalesce(p_code, '')) < 6 or char_length(p_code) > 40 then
    raise exception '同步码格式不正确';
  end if;
  if p_data is null then
    raise exception '数据不能为空';
  end if;
  if pg_column_size(p_data) > 500000 then
    raise exception '数据过大';
  end if;
  insert into public.sync_data (code, data, updated_at)
  values (p_code, p_data, now())
  on conflict (code) do update
    set data = excluded.data, updated_at = now();
end;
$$;

-- 5. 只允许匿名角色调用这两个函数，禁止直接访问表
revoke all on function public.get_sync(text) from public;
revoke all on function public.put_sync(text, jsonb) from public;
grant execute on function public.get_sync(text) to anon;
grant execute on function public.put_sync(text, jsonb) to anon;

-- 完成。可选的维护：删除 180 天未更新的同步数据
-- delete from public.sync_data where updated_at < now() - interval '180 days';
