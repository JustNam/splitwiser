-- ===========================================================================
-- CourtTab — schema v3
-- Source: Splitwise - Personal Notes/CourtTab_Database_Design.md
-- Target: Supabase / PostgreSQL 15+
--
-- Money is always an integer of VND (bigint). 90000 = 90.000đ.
-- Table names are plural to match src/constants/mock.js and to avoid quoting
-- "group". RLS is NOT enabled yet — see note at the bottom.
-- ===========================================================================


create type member_type as enum ('roster', 'guest');
create type ledger_type as enum ('share', 'adjustment', 'payment');


-- 1. accounts — global identity (login). Profile row for a Supabase Auth user.
--    The single source of truth for a roster member's name.
create table accounts (
  id    uuid primary key references auth.users (id) on delete cascade,
  name  text not null check (length(btrim(name)) > 0),
  email text not null unique
);

-- Every new Supabase Auth user gets an accounts row, automatically.
--
-- AuthApi.signUp() sends the name as user metadata (`options.data.name`)
-- because auth.users is Supabase's own table and takes no columns of ours.
-- Without this trigger that name stays in metadata and `accounts` is never
-- written — signup appears to work while the profile silently doesn't exist.
--
-- Doing it here rather than with an insert after signUp() in the client:
-- the row is created even when the tab closes, even when "Confirm email" is
-- on and there is no session yet, and the id can't be forged by the browser.
--
-- security definer + a pinned search_path: the trigger fires in the auth
-- schema's context and needs our permission to write public.accounts.
create function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, name, email)
  values (
    new.id,
    -- Falls back to the email's local part. A blank name would fail the
    -- length(btrim(name)) > 0 check above, and a failed trigger fails the
    -- whole signup — the user would see "Database error saving new user".
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  -- Idempotent, so re-running this against an existing user is harmless.
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- 2. groups — the right invite_code gets you in, no approval step.
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  invite_code text not null unique
);


-- 3. members — one person's slice inside exactly one group.
--    roster → name NULL, account_id set (name comes from accounts)
--    guest  → name set, account_id NULL
--    Display name: coalesce(members.name, accounts.name)
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

-- Guest names are unique within a group, so name ↔ guest stays 1-1.
-- Not covered: a guest named "Trân" while a roster member also displays as
-- "Trân" — the two names live in different tables. Validate that in the app.
create unique index members_unique_guest_name
  on members (group_id, name)
  where type = 'guest';

create index members_group_id_idx   on members (group_id);
create index members_account_id_idx on members (account_id);


-- 4. sessions
--    updated_by/updated_at catch edits that don't touch money (date, notes) —
--    those produce no ledger row, so without these two nobody is traceable.
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


-- 5. cost_lines — one spend line, each with its own payer.
--    note is free text and nullable; it never feeds the math.
--    The payer may be a roster member or a guest.
create table cost_lines (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid   not null references sessions (id) on delete cascade,
  note            text,
  amount          bigint not null check (amount > 0),
  payer_member_id uuid   not null references members (id)  on delete restrict
);

create index cost_lines_session_id_idx on cost_lines (session_id);
create index cost_lines_payer_idx      on cost_lines (payer_member_id);


-- 6. participants — attendance, kept separate from money, so someone who owes
--    0đ is still recorded as having turned up.
create table participants (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  member_id  uuid not null references members (id)  on delete restrict,

  constraint participants_unique_per_session unique (session_id, member_id)
);

create index participants_member_id_idx on participants (member_id);


-- 7. ledger — the only source for any balance. Append-only.
--    amount is always positive; direction lives in the (debtor, creditor)
--    pair, never in a minus sign. Payment rows point receiver → payer.
--    session_id is derivable from cost_line_id; kept as a deliberate
--    denormalization so "all ledger rows for session X" needs no join.
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

-- Heaviest query: "owed / paid" for one pair of people in one cost line.
create index ledger_costline_pair_idx on ledger (cost_line_id, debtor_id, creditor_id);
create index ledger_session_id_idx    on ledger (session_id);
create index ledger_debtor_idx        on ledger (debtor_id);
create index ledger_creditor_idx      on ledger (creditor_id);

-- Append-only is the foundation of every balance calculation. With RLS off,
-- this trigger is the only place it can be enforced.
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
-- NOTES
--
-- 1. RLS is off. Anyone holding the anon key can read and write every group's
--    data. Fine while building; must be enabled before real users.
--
-- 2. The schema cannot catch cross-group mixing — e.g. a ledger row whose
--    debtor_id belongs to group A but whose session_id belongs to group B.
--    Enforced in the app for now.
--
-- 3. No balance column, no status column. Both are derived from ledger:
--
--      Balance(A → B) = sum(amount where debtor = A and creditor = B)
--                     − sum(amount where debtor = B and creditor = A)
--
--    Per cost line CL, for member A against payer P:
--
--      Owed = sum(amount where debtor=A, creditor=P, cost_line=CL, type <> 'payment')
--           − sum(amount where debtor=P, creditor=A, cost_line=CL, type <> 'payment')
--      Paid = sum(amount where debtor=P, creditor=A, cost_line=CL, type  = 'payment')
--
--    Owed − Paid < 0 is a reverse debt. It needs no extra mechanism.
-- ===========================================================================


-- Teardown — uncomment to rebuild from scratch (DESTROYS ALL DATA)
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop table if exists ledger, participants, cost_lines, sessions, members,
--                      groups, accounts cascade;
-- drop function if exists handle_new_user() cascade;
-- drop function if exists ledger_block_mutation() cascade;
-- drop type if exists ledger_type, member_type;
