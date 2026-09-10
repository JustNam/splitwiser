-- ###########################################################################
-- SplitWiser — migration 0003: log a session, add a guest
--
-- create_session() writes FOUR tables: sessions, cost_lines, ledger,
-- participants. Same reason as migration 0002, only worse — a half-written
-- session is a set of debts that don't add up to anything, and the ledger is
-- append-only, so there is no UPDATE to go back and repair it with.
--
-- Parameters are prefixed p_ here. Inside a plpgsql body a bare parameter
-- called `date` or `amount` is ambiguous with the column of the same name,
-- and Postgres resolves that in ways you will not enjoy debugging.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- add_guest — someone who played but has no account
--
-- A guest is a member row with the name on it and no account_id (see the
-- members_type_shape constraint in migration 0001).
-- ===========================================================================
create or replace function add_guest(p_group_id uuid, p_name text)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_member  members;
begin
  if v_account is null then
    raise exception 'You need to be signed in.';
  end if;

  -- Anyone could send this request with any group id. Membership is checked
  -- here, not trusted from the app.
  if not exists (
    select 1 from members
    where group_id = p_group_id and account_id = v_account
  ) then
    raise exception 'You are not a member of this group.';
  end if;

  if v_name = '' then
    raise exception 'Type the guest''s name first.';
  end if;

  -- Case-insensitive on purpose: "nam" and "Nam" are the same person to
  -- everyone in the group, so letting both exist only splits one person's
  -- debt across two rows. Stricter than the unique index, which is exact.
  if exists (
    select 1 from members
    where group_id = p_group_id
      and type = 'guest'
      and lower(name) = lower(v_name)
  ) then
    raise exception 'There is already a guest called % in this group.', v_name;
  end if;

  insert into members (group_id, name, type)
  values (p_group_id, v_name, 'guest')
  returning * into v_member;

  return v_member;
end;
$$;


-- ===========================================================================
-- create_session — one session, its costs, who played, and the debts
--
-- p_lines is JSON so that a variable number of cost lines fits in one call:
--
--   [
--     { "note": "Courts",
--       "amount": 300000,
--       "payer_member_id": "…",
--       "shares": [ { "member_id": "…", "amount": 100000 }, … ] }
--   ]
--
-- The shares arrive already worked out, from split.service.js. That is
-- deliberate: the rounding rule (whoever loses most to rounding gets the
-- leftover đồng) is tested there, and having it in two places is how the two
-- copies start disagreeing.
-- ===========================================================================
create or replace function create_session(
  p_group_id        uuid,
  p_date            date,
  p_lines           jsonb,
  p_participant_ids uuid[]
)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account   uuid := auth.uid();
  v_actor     uuid;          -- the caller's member id IN THIS GROUP
  v_session   sessions;
  v_cost_line cost_lines;
  v_line      jsonb;
  v_share     jsonb;
  v_payer     uuid;
  v_amount    bigint;
  v_assigned  bigint;
  v_member    uuid;
begin
  if v_account is null then
    raise exception 'You need to be signed in to log a session.';
  end if;

  -- Every row written below is attributed to a member, never to an account:
  -- the same person is a different member in each group.
  select id into v_actor
  from members
  where group_id = p_group_id and account_id = v_account;

  -- `select … into` does NOT raise when nothing matches — it just leaves the
  -- variable null. The test has to be explicit.
  if v_actor is null then
    raise exception 'You are not a member of this group.';
  end if;

  if p_date is null then
    raise exception 'Pick a date for the session.';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one cost.';
  end if;

  -- array_length returns NULL for an empty array, not 0.
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'Tick at least one person who played.';
  end if;

  if exists (
    select 1
    from unnest(p_participant_ids) as pid
    where not exists (
      select 1 from members m where m.id = pid and m.group_id = p_group_id
    )
  ) then
    raise exception 'Someone on the list is not a member of this group.';
  end if;

  insert into sessions (group_id, date, created_by_member_id)
  values (p_group_id, p_date, v_actor)
  returning * into v_session;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_amount := (v_line ->> 'amount')::bigint;
    v_payer  := (v_line ->> 'payer_member_id')::uuid;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Every cost needs an amount above zero.';
    end if;

    if v_payer is null or not exists (
      select 1 from members where id = v_payer and group_id = p_group_id
    ) then
      raise exception 'Choose who paid, from this group.';
    end if;

    -- The shares must add up to the cost EXACTLY. One đồng out and the group
    -- carries a debt nobody can ever settle. The UI blocks saving too; this
    -- is the gate that cannot be bypassed.
    select coalesce(sum((s ->> 'amount')::bigint), 0)
      into v_assigned
      from jsonb_array_elements(v_line -> 'shares') as s;

    if v_assigned <> v_amount then
      raise exception 'The split does not add up to the cost.';
    end if;

    insert into cost_lines (session_id, note, amount, payer_member_id)
    values (
      v_session.id,
      nullif(btrim(coalesce(v_line ->> 'note', '')), ''),
      v_amount,
      v_payer
    )
    returning * into v_cost_line;

    for v_share in select * from jsonb_array_elements(v_line -> 'shares')
    loop
      v_member := (v_share ->> 'member_id')::uuid;

      if not (v_member = any(p_participant_ids)) then
        raise exception 'Only people who played can be given a share.';
      end if;

      -- The payer's own share is not a debt, and a 0đ row would fail the
      -- ledger's amount > 0 check. Skipped, not rejected — both are normal.
      continue when v_member = v_payer;
      continue when (v_share ->> 'amount')::bigint = 0;

      insert into ledger (
        debtor_id, creditor_id, amount, type,
        session_id, cost_line_id, created_by_member_id
      )
      values (
        v_member, v_payer, (v_share ->> 'amount')::bigint, 'share',
        v_session.id, v_cost_line.id, v_actor
      );
    end loop;
  end loop;

  insert into participants (session_id, member_id)
  select v_session.id, pid from unnest(p_participant_ids) as pid;

  return v_session;
end;
$$;
