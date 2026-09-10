-- ###########################################################################
-- SplitWiser — migration 0002: create a group, join a group
--
-- Why these are Postgres functions rather than app code: both write TWO
-- tables. The Supabase JS client sends one HTTP request per statement, so if
-- the second fails — lost connection, closed tab — you are left with a group
-- nobody belongs to, and nothing ever cleans it up.
--
-- A plpgsql function runs inside ONE transaction. An error anywhere rolls the
-- whole thing back.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- create_group — new group, with its creator already inside it
--
-- `returns groups` hands back the whole row of the groups table, so the app
-- gets the invite_code in the same round trip and can show it immediately.
--
-- `security definer` runs the function with the privileges of whoever created
-- it rather than the caller's, and `set search_path` pins where unqualified
-- table names resolve — without that pin, a definer function is a known
-- escalation route.
-- ===========================================================================
create or replace function create_group(group_name text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Deliberately missing O/0 and I/1/L: this code gets read off a screen,
  -- pasted into a chat, and typed back in by hand.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  -- auth.uid() is the id of the signed-in user, read from the JWT that
  -- Supabase attaches to every request. It is null when nobody is signed in,
  -- and it cannot be forged by the browser — which is why the account id is
  -- taken from here rather than accepted as a parameter.
  v_account uuid := auth.uid();
  v_code    text;
  v_group   groups;
  i         int;
begin
  -- These strings reach the user as-is: the app shows error.message straight
  -- from Supabase, so they are UI copy and stay in English like every other
  -- screen.
  if v_account is null then
    raise exception 'You need to be signed in to create a group.';
  end if;

  if btrim(coalesce(group_name, '')) = '' then
    raise exception 'Group name cannot be empty.';
  end if;

  -- Keep drawing codes until one is unused. invite_code carries a unique
  -- constraint, so checking here is what stops the insert below from failing
  -- on a collision. Eight characters from a 31-letter alphabet is ~850
  -- billion combinations; the loop realistically runs once.
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);

    exit when not exists (select 1 from groups where invite_code = v_code);
  end loop;

  -- `returning * into v_group` captures the inserted row — including the id
  -- Postgres just generated — without a second SELECT.
  insert into groups (name, invite_code)
  values (btrim(group_name), v_code)
  returning * into v_group;

  -- The creator becomes a roster member. `name` stays NULL on purpose: a
  -- roster member's name lives on their account, so there is only ever one
  -- place it can be, and two places can never disagree.
  insert into members (group_id, type, account_id, name)
  values (v_group.id, 'roster', v_account, null);

  return v_group;
end;
$$;


-- ===========================================================================
-- join_group — join by invite code
--
-- The right code gets you in immediately; there is no approval step and no
-- "pending" state (spec A3).
-- ===========================================================================
create or replace function join_group(code text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := auth.uid();
  v_group   groups;
begin
  if v_account is null then
    raise exception 'You need to be signed in to join a group.';
  end if;

  -- upper() + btrim() because the code arrives by way of a chat message: it
  -- picks up stray spaces, and people type it in lower case.
  select * into v_group
  from groups
  where invite_code = upper(btrim(coalesce(code, '')));

  -- SELECT INTO does not raise when nothing matches — it leaves the record
  -- with null fields. Checking a column is how you detect the miss.
  if v_group.id is null then
    raise exception 'No group has this code. Check it with whoever invited you.';
  end if;

  -- Already a member: return the group instead of failing. Tapping an invite
  -- link twice is normal behaviour, not an error worth showing.
  if exists (
    select 1 from members
    where group_id = v_group.id and account_id = v_account
  ) then
    return v_group;
  end if;

  insert into members (group_id, type, account_id, name)
  values (v_group.id, 'roster', v_account, null);

  return v_group;
end;
$$;


-- ===========================================================================
-- Check: both functions should be listed below
-- ===========================================================================
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('create_group', 'join_group')
order by routine_name;
