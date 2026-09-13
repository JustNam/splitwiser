-- ###########################################################################
-- SplitWiser — migration 0008: a guest can become a real member
--
-- The problem: a guest is a member row with a typed-in name and no account.
-- Their whole history — every share, adjustment and payment — hangs off that
-- row's id. When that person later signs up, nothing connects the two, so
-- the group ends up with two of them and the debts sit under the wrong one.
--
-- The ledger cannot be repointed: migration 0001 put a trigger on it that
-- refuses UPDATE outright. So the row itself has to change identity instead —
-- same id, same history, now backed by an account rather than a typed name.
--
-- What decides that it is really them is the email, proven by confirming it.
-- THIS FEATURE IS ONLY SAFE WHILE "Confirm email" IS ON IN SUPABASE AUTH.
-- With it off, anyone who guesses the email of a guest who is owed money can
-- sign up as them and walk away with it.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- members.email — only ever set on a guest
--
-- A roster member's email lives on their account, and the rule from the
-- database design holds: a value lives in exactly one place, so two places
-- can never disagree.
-- ===========================================================================
alter table members
  add column if not exists email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_email_guest_only'
  ) then
    alter table members
      add constraint members_email_guest_only
      check (email is null or type = 'guest');
  end if;
end $$;

-- Two guests in one group cannot share an email, or a single sign-up would
-- have two rows to claim and no way to choose.
create unique index if not exists members_guest_email_unique
  on members (group_id, lower(email))
  where type = 'guest' and email is not null;


-- ===========================================================================
-- add_guest — now takes an optional email
--
-- DROP first, not `create or replace`. Postgres identifies a function by name
-- AND argument list, so adding a third parameter creates a SECOND function
-- rather than replacing the first — and then add_guest(uuid, text) is
-- ambiguous and every call fails.
-- ===========================================================================
drop function if exists add_guest(uuid, text);

create or replace function add_guest(
  p_group_id uuid,
  p_name     text,
  p_email    text default null
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_target  uuid;
  v_member  members;
begin
  if v_account is null then
    raise exception 'You need to be signed in.';
  end if;

  if not exists (
    select 1 from members
    where group_id = p_group_id and account_id = v_account
  ) then
    raise exception 'You are not a member of this group.';
  end if;

  if v_name = '' then
    raise exception 'Type the guest''s name first.';
  end if;

  -- Deliberately crude. The real test of an email is whether the person can
  -- confirm it, and that test happens elsewhere.
  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'That email does not look right.';
  end if;

  -- Someone who already has an account is not a guest. Adding them straight
  -- to the roster leaves nothing to migrate later, and it is the common case:
  -- the friend you are adding already uses the app.
  if v_email is not null then
    select id into v_target from accounts where lower(email) = v_email;

    if v_target is not null then
      if exists (
        select 1 from members where group_id = p_group_id and account_id = v_target
      ) then
        raise exception '% is already in this group.', v_name;
      end if;

      insert into members (group_id, name, type, account_id)
      values (p_group_id, null, 'roster', v_target)
      returning * into v_member;

      return v_member;
    end if;
  end if;

  if exists (
    select 1 from members
    where group_id = p_group_id and type = 'guest' and lower(name) = lower(v_name)
  ) then
    raise exception 'There is already a guest called % in this group.', v_name;
  end if;

  if v_email is not null and exists (
    select 1 from members
    where group_id = p_group_id and type = 'guest' and lower(email) = v_email
  ) then
    raise exception 'A guest with that email is already in this group.';
  end if;

  insert into members (group_id, name, type, email)
  values (p_group_id, v_name, 'guest', v_email)
  returning * into v_member;

  return v_member;
end;
$$;


-- ===========================================================================
-- claim_guest_rows — turn my guest rows into me
--
-- Called by the app after signing in. Every guest row in any group carrying
-- this account's confirmed email becomes a roster row for this account, id
-- unchanged, so the entire history comes along without a single ledger row
-- being touched.
-- ===========================================================================
create or replace function claim_guest_rows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account   uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_member    members;
  v_count     integer := 0;
begin
  if v_account is null then
    raise exception 'You need to be signed in.';
  end if;

  select email, email_confirmed_at
    into v_email, v_confirmed
    from auth.users
   where id = v_account;

  -- With "Confirm email" on, an unconfirmed user has no session at all and so
  -- cannot reach this function. The check stays anyway: the safety of this
  -- whole feature rests on one setting in a dashboard, and a function that
  -- hands over other people's money should not take that on trust.
  if v_email is null or v_confirmed is null then
    return 0;
  end if;

  for v_member in
    select *
    from members
    where type = 'guest'
      and email is not null
      and lower(email) = lower(v_email)
  loop
    -- Already in that group under their own row. Merging the two would need
    -- the history moved, which the ledger forbids — so the guest row is left
    -- alone rather than half-claimed.
    if exists (
      select 1 from members
      where group_id = v_member.group_id and account_id = v_account
    ) then
      continue;
    end if;

    -- The id does not change. That is the whole trick: every share,
    -- adjustment, payment and participant row already points here.
    update members
    set type       = 'roster',
        account_id = v_account,
        name       = null,
        email      = null
    where id = v_member.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
