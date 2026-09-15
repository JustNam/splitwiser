-- ###########################################################################
-- SplitWiser — migration 0013: say which groups were just claimed
--
-- claim_guest_rows() returned a count, which the app fired and ignored. So
-- somebody invited as a guest signed up, landed on Home, and found
-- themselves in a group they had never joined — with debts in it. Being
-- added to a group by somebody else is the one thing in this app that
-- happens TO you rather than because of you, and it arrived with no sentence
-- attached.
--
-- It now returns the groups themselves, so the app can name them.
--
-- `drop` first, not `create or replace`: replace cannot change a function's
-- return type, and integer → json is a change of return type. The drop is
-- safe here — nothing depends on this function but the app.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################

drop function if exists claim_guest_rows();

create or replace function claim_guest_rows()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account   uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_member    members;
  v_claimed   json[] := '{}';
  v_group     groups;
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
    return '[]'::json;
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

    select * into v_group from groups where id = v_member.group_id;

    v_claimed := v_claimed || json_build_object('id', v_group.id, 'name', v_group.name);
  end loop;

  -- array_to_json of an empty array is `[]`, which is what the caller wants
  -- for "nothing to tell you" — not null.
  return array_to_json(v_claimed);
end;
$$;
