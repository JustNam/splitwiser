-- ###########################################################################
-- SplitWiser — migration 0005: a fresh invite code
--
-- Why this is needed: an invite code is a password that gets pasted into
-- group chats. Once it leaks there is currently no way to take it back.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- new_invite_code — one unused code
--
-- Pulled out into its own function so the code FORMAT lives in one place.
-- create_group() in migration 0002 still has its own copy of this loop; worth
-- folding in the next time that function is touched.
-- ===========================================================================
create or replace function new_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- No O/0 and no I/1/L: this gets read off a screen and typed back by hand.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i      int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);

    exit when not exists (select 1 from groups where invite_code = v_code);
  end loop;

  return v_code;
end;
$$;


-- ===========================================================================
-- regenerate_invite_code — replace a group's code
--
-- The old code stops working the moment this returns, for everybody. That is
-- the whole point, and it is why the screen warns before calling it.
-- ===========================================================================
create or replace function regenerate_invite_code(p_group_id uuid)
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
    raise exception 'You need to be signed in.';
  end if;

  -- Any member can do this. The spec gives the group no roles: everyone in it
  -- can log and edit sessions, so a code reset is no more privileged.
  if not exists (
    select 1 from members
    where group_id = p_group_id and account_id = v_account
  ) then
    raise exception 'You are not a member of this group.';
  end if;

  update groups
  set invite_code = new_invite_code()
  where id = p_group_id
  returning * into v_group;

  return v_group;
end;
$$;
