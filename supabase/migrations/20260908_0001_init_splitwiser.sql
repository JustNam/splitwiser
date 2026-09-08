-- ###########################################################################
-- SplitWiser — migration v2 (GIU function + trigger cua mentor)
--
-- Khac ban truoc o cho: KHONG drop function, KHONG drop trigger.
-- Function duoc sua tai cho bang "create or replace", nen trigger
-- on_auth_user_created khong he bi dung toi va van chay lien tuc.
--
-- Ca file chay trong MOT transaction: loi o bat ky dau -> rollback sach.
-- ###########################################################################


-- ===========================================================================
-- BUOC 1 — Xoa dong du lieu test trong profiles
-- ===========================================================================
delete from public.profiles;


-- ===========================================================================
-- BUOC 2 — Bo bang profiles
--
-- profiles va accounts la CUNG MOT khai niem (ho so nguoi dung), chi khac
-- ten. Nen ta chuyen han sang ten accounts cho khop thiet ke, chu khong
-- giu song song ca hai bang.
--
-- KHONG dung "cascade" co y: neu con thu gi khac dang phu thuoc vao profiles
-- ma ta chua biet, lenh nay se bao loi va dung lai — tot hon la im lang xoa
-- theo. Function handle_new_user() KHONG phu thuoc cung vao bang nay
-- (no chi nhac ten bang trong than function), nen no song sot qua buoc nay.
-- ===========================================================================
drop table public.profiles;


-- ===========================================================================
-- BUOC 3 — Don cac doi tuong cua SplitWiser neu lo ton tai
--
-- Hien tai chua co gi nen may dong nay khong xoa gi ca. Chung o day de
-- file nay chay lai duoc nhieu lan ma khong dinh loi "already exists".
-- ===========================================================================
drop table if exists
  public.ledger, public.participants, public.cost_lines, public.sessions,
  public.members, public.groups, public.accounts
  cascade;

drop function if exists public.ledger_block_mutation() cascade;
drop type     if exists member_type cascade;
drop type     if exists ledger_type cascade;


-- ===========================================================================
-- BUOC 4 — 2 kieu enum
-- ===========================================================================
create type member_type as enum ('roster', 'guest');
create type ledger_type as enum ('share', 'adjustment', 'payment');


-- ===========================================================================
-- BUOC 5 — Bang 1: accounts (thay cho profiles)
--
-- Money is always an integer of VND (bigint). 90000 = 90.000d.
-- accounts — global identity (login). Profile row for a Supabase Auth user.
-- The single source of truth for a roster member's name.
-- ===========================================================================
create table accounts (
  id    uuid primary key references auth.users (id) on delete cascade,
  name  text not null check (length(btrim(name)) > 0),
  email text not null unique
);


-- ===========================================================================
-- BUOC 6 — Cap nhat function CUA MENTOR (khong xoa, chi sua ruot)
--
-- "create or replace" sua function TAI CHO. Trigger on_auth_user_created
-- van dang tro vao dung function nay va khong bi gian doan mot giay nao.
-- Doi chieu: ban truoc dung "drop function ... cascade" — cach do keo
-- theo ca trigger.
--
-- Thay doi duy nhat so voi ban cua mentor: ghi vao public.accounts thay vi
-- public.profiles, va lay them ten tu user_metadata.
--
-- security definer + search_path co dinh: trigger chay trong ngu canh cua
-- schema auth, can quyen cua ta de ghi vao public.accounts.
-- ===========================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, name, email)
  values (
    new.id,
    -- Lui ve phan truoc dau @ cua email. Ten rong se pham check
    -- length(btrim(name)) > 0, ma trigger loi thi ca lenh dang ky loi theo —
    -- nguoi dung se thay "Database error saving new user".
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ===========================================================================
-- BUOC 7 — Trigger: chi tao NEU CHUA CO
--
-- Trigger cua mentor dang ton tai san, nen khoi "if not exists" nay se
-- KHONG lam gi ca — trigger cu duoc giu nguyen ven. Doan nay chi cuu ho
-- cho truong hop file duoc chay tren mot project trong.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class     c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname  = 'on_auth_user_created'
      and not t.tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;


-- ===========================================================================
-- BUOC 8 — Bang 2: groups
-- Dung invite_code la vao duoc, khong can buoc duyet.
-- ===========================================================================
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  invite_code text not null unique
);


-- ===========================================================================
-- BUOC 9 — Bang 3: members
--   roster -> name NULL, account_id co gia tri (ten lay tu accounts)
--   guest  -> name co gia tri, account_id NULL
--   Ten hien thi: coalesce(members.name, accounts.name)
-- ===========================================================================
create table members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  name       text,
  type       member_type not null,
  account_id uuid references accounts (id) on delete restrict,

  constraint members_type_shape check (
    (type = 'guest'  and name is not null and length(btrim(name)) > 0 and account_id is null)
    or
    (type = 'roster' and name is null                                 and account_id is not null)
  ),

  constraint members_one_row_per_account_per_group unique (group_id, account_id)
);

-- Ten khach moi la duy nhat trong mot nhom, de name <-> guest luon 1-1.
-- Chua chan duoc: mot khach ten "Tran" trong khi mot roster cung hien thi
-- "Tran" — hai ten nam o hai bang khac nhau. Kiem tra o tang app.
create unique index members_unique_guest_name
  on members (group_id, name)
  where type = 'guest';

create index members_group_id_idx   on members (group_id);
create index members_account_id_idx on members (account_id);


-- ===========================================================================
-- BUOC 10 — Bang 4: sessions
-- updated_by/updated_at bat cac chinh sua khong dung toi tien (ngay, ghi
-- chu) — nhung thay doi do khong sinh dong ledger nao, thieu 2 cot nay thi
-- khong truy duoc ai sua.
-- ===========================================================================
create table sessions (
  id                   uuid not null primary key default gen_random_uuid(),
  group_id             uuid not null references groups (id)  on delete cascade,
  date                 date not null,
  created_by_member_id uuid not null references members (id) on delete restrict,
  updated_by_member_id uuid          references members (id) on delete restrict,
  updated_at           timestamptz,

  constraint sessions_updated_pair check (
    (updated_by_member_id is null and updated_at is null)
    or
    (updated_by_member_id is not null and updated_at is not null)
  )
);

create index sessions_group_date_idx on sessions (group_id, date desc);


-- ===========================================================================
-- BUOC 11 — Bang 5: cost_lines
-- Moi dong chi tieu co nguoi tra rieng. note la text tu do, khong bao gio
-- tham gia vao tinh toan. Nguoi tra co the la roster hoac guest.
-- ===========================================================================
create table cost_lines (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid   not null references sessions (id) on delete cascade,
  note            text,
  amount          bigint not null check (amount > 0),
  payer_member_id uuid   not null references members (id)  on delete restrict
);

create index cost_lines_session_id_idx on cost_lines (session_id);
create index cost_lines_payer_idx      on cost_lines (payer_member_id);


-- ===========================================================================
-- BUOC 12 — Bang 6: participants
-- Diem danh, tach roi khoi tien, de nguoi no 0d van duoc ghi nhan la co mat.
-- ===========================================================================
create table participants (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  member_id  uuid not null references members (id)  on delete restrict,

  constraint participants_unique_per_session unique (session_id, member_id)
);

create index participants_member_id_idx on participants (member_id);


-- ===========================================================================
-- BUOC 13 — Bang 7: ledger
-- Nguon duy nhat cho moi so du. Chi them, khong sua khong xoa.
-- amount luon duong; chieu nam o cap (debtor, creditor), khong bao gio nam
-- o dau tru. Dong payment tro theo huong receiver -> payer.
-- session_id suy ra duoc tu cost_line_id; giu lai la mot buoc phi chuan hoa
-- co chu dich, de truy van "moi dong ledger cua session X" khoi phai join.
-- ===========================================================================
create table ledger (
  id                   uuid        primary key default gen_random_uuid(),
  debtor_id            uuid        not null references members (id)    on delete restrict,
  creditor_id          uuid        not null references members (id)    on delete restrict,
  amount               bigint      not null,
  type                 ledger_type not null,
  session_id           uuid        not null references sessions (id)   on delete restrict,
  cost_line_id         uuid        not null references cost_lines (id) on delete restrict,
  note                 text,
  created_by_member_id uuid        not null references members (id)    on delete restrict,
  created_at           timestamptz not null default now(),

  constraint ledger_no_self_debt    check (debtor_id <> creditor_id),
  constraint ledger_amount_positive check (amount > 0)
);

-- Truy van nang nhat: "no / da tra" cho mot cap nguoi trong mot cost line.
create index ledger_costline_pair_idx on ledger (cost_line_id, debtor_id, creditor_id);
create index ledger_session_id_idx    on ledger (session_id);
create index ledger_debtor_idx        on ledger (debtor_id);
create index ledger_creditor_idx      on ledger (creditor_id);

-- Chi-them (append-only) la nen mong cua moi phep tinh so du. Voi RLS dang
-- tat, trigger nay la noi duy nhat co the ep buoc dieu do.
create function ledger_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception
    'ledger is append-only: no UPDATE/DELETE. To correct a number, insert a row with type = adjustment.';
end;
$$;

create trigger ledger_no_update
  before update on ledger
  for each row execute function ledger_block_mutation();

create trigger ledger_no_delete
  before delete on ledger
  for each row execute function ledger_block_mutation();


-- ===========================================================================
-- BUOC 14 — Va du lieu cu (backfill)
--
-- Trigger chi chay khi co user MOI dang ky. Tai khoan testing1@gmail.com da
-- ton tai san trong auth.users tu truoc, nen no se khong co dong nao trong
-- accounts — mot user "mo coi".
--
-- Lenh nay tao ho so cho MOI user da co san, dung dung logic voi trigger.
-- "on conflict do nothing" nen chay lai bao nhieu lan cung khong sao.
--
-- Neu ban muon xoa han tai khoan test: vao Authentication -> Users, xoa no
-- TRUOC khi chay file nay, thi buoc backfill se khong tao lai ho so cho no.
-- ===========================================================================
insert into public.accounts (id, name, email)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(u.email, '@', 1)
  ),
  u.email
from auth.users u
where u.email is not null
on conflict (id) do nothing;


-- ===========================================================================
-- BUOC 15 — Kiem chung ngay tai cho
--
-- Mong doi:
--   so_bang_public       = 7   (accounts, groups, members, sessions,
--                               cost_lines, participants, ledger)
--   so_dong_accounts     = 1   (testing1@gmail.com duoc backfill)
--                          hoac 0 neu ban da xoa tai khoan test truoc do
--   trigger_con_song     = 1   (trigger cua mentor van nguyen ven)
--   ten_function         = handle_new_user
-- ===========================================================================
select
  (select count(*) from information_schema.tables
     where table_schema = 'public')                      as so_bang_public,
  (select count(*) from public.accounts)                 as so_dong_accounts,
  (select count(*)
     from pg_trigger t
     join pg_class     c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth'
       and c.relname = 'users'
       and t.tgname  = 'on_auth_user_created'
       and not t.tgisinternal)                           as trigger_con_song,
  (select routine_name from information_schema.routines
     where routine_schema = 'public'
       and routine_name = 'handle_new_user')             as ten_function;
