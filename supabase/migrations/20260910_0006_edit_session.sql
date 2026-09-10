-- ###########################################################################
-- SplitWiser — migration 0006: edit a session without erasing what it said
--
-- The rule the whole data design exists to serve: a wrong number is never
-- overwritten in the ledger. It is corrected by APPENDING an `adjustment`
-- row, so the original share, the correction, and who made it all survive.
--
-- The caller sends the numbers it wants to be TRUE, never the difference.
-- This function reads what is currently recorded and works the difference out
-- itself — which is both what the spec asks for ("người dùng chỉ nhập giá trị
-- đúng") and the only safe way to do it, since the caller's screen may be
-- minutes old.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- edit_session
--
--   p_lines = [ { "cost_line_id": "…",
--                 "note": "Courts",
--                 "amount": 108000,
--                 "shares": [ { "member_id": "…", "amount": 54000 }, … ] } ]
--
-- `shares` lists EVERY participant, the payer included. The payer's own share
-- is never written anywhere — a debt to yourself isn't a debt — but it has to
-- be sent so that the sum can be checked against the cost.
-- ===========================================================================
create or replace function edit_session(
  p_session_id      uuid,
  p_date            date,
  p_lines           jsonb,
  p_participant_ids uuid[],
  p_summary         text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account   uuid := auth.uid();
  v_group     uuid;
  v_actor     uuid;
  v_line      jsonb;
  v_cost_line uuid;
  v_payer     uuid;
  v_amount    bigint;
  v_assigned  bigint;
  v_member    uuid;
  v_target    bigint;
  v_current   bigint;
  v_delta     bigint;
  v_count     integer := 0;
begin
  if v_account is null then
    raise exception 'You need to be signed in to edit a session.';
  end if;

  select group_id into v_group from sessions where id = p_session_id;

  if v_group is null then
    raise exception 'That session no longer exists.';
  end if;

  select id into v_actor
  from members
  where group_id = v_group and account_id = v_account;

  if v_actor is null then
    raise exception 'You are not a member of this group.';
  end if;

  if p_date is null then
    raise exception 'Pick a date for the session.';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'A session needs at least one cost.';
  end if;

  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'Tick at least one person who played.';
  end if;

  if exists (
    select 1
    from unnest(p_participant_ids) as pid
    where not exists (
      select 1 from members m where m.id = pid and m.group_id = v_group
    )
  ) then
    raise exception 'Someone on the list is not a member of this group.';
  end if;

  -- The date has no effect on money, so it is simply overwritten. Same for
  -- the note below. Only amounts and who played move money, and those go
  -- through the ledger.
  update sessions
  set date                 = p_date,
      updated_by_member_id = v_actor,
      updated_at           = now()
  where id = p_session_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_cost_line := (v_line ->> 'cost_line_id')::uuid;
    v_amount    := (v_line ->> 'amount')::bigint;

    select payer_member_id into v_payer
    from cost_lines
    where id = v_cost_line and session_id = p_session_id;

    if v_payer is null then
      raise exception 'That cost is not part of this session.';
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Every cost needs an amount above zero.';
    end if;

    select coalesce(sum((s ->> 'amount')::bigint), 0)
      into v_assigned
      from jsonb_array_elements(v_line -> 'shares') as s;

    if v_assigned <> v_amount then
      raise exception 'The split does not add up to the cost.';
    end if;

    -- cost_lines holds what the cost IS, not what it was first typed as. The
    -- history lives in the ledger, which is append-only; leaving this column
    -- stale would instead make the current cost unrecoverable, since the
    -- payer's own share is only ever derived from it.
    update cost_lines
    set note   = nullif(btrim(coalesce(v_line ->> 'note', '')), ''),
        amount = v_amount
    where id = v_cost_line;

    -- Everyone who needs a delta: whoever plays now, plus anyone who already
    -- has rows on this line. The second half is what catches a participant
    -- being REMOVED — their share has to be walked back to zero, and they are
    -- no longer in the list of who played.
    for v_member in
      select t.m
      from (
        select unnest(p_participant_ids) as m
        union
        select case when l.debtor_id = v_payer then l.creditor_id else l.debtor_id end
        from ledger l
        where l.cost_line_id = v_cost_line
          and l.type <> 'payment'
          and (l.debtor_id = v_payer or l.creditor_id = v_payer)
      ) t
      where t.m <> v_payer
    loop
      v_target := coalesce((
        select (s ->> 'amount')::bigint
        from jsonb_array_elements(v_line -> 'shares') as s
        where (s ->> 'member_id')::uuid = v_member
      ), 0);

      -- What this person is recorded as owing right now: the original share
      -- plus every correction since. Payments are excluded on purpose — this
      -- is what they OWE, not what is left to hand over.
      select coalesce(sum(
               case
                 when l.debtor_id = v_member and l.creditor_id = v_payer then l.amount
                 when l.debtor_id = v_payer  and l.creditor_id = v_member then -l.amount
                 else 0
               end), 0)
        into v_current
        from ledger l
        where l.cost_line_id = v_cost_line and l.type <> 'payment';

      v_delta := v_target - v_current;

      continue when v_delta = 0;

      -- The direction follows the sign, exactly as the design doc sets out:
      -- undercharged (delta positive) runs participant → payer, like a share;
      -- overcharged runs the other way and cancels part of one.
      insert into ledger (
        debtor_id, creditor_id, amount, type,
        session_id, cost_line_id, note, created_by_member_id
      )
      values (
        case when v_delta > 0 then v_member else v_payer end,
        case when v_delta > 0 then v_payer  else v_member end,
        abs(v_delta), 'adjustment',
        p_session_id, v_cost_line, nullif(btrim(coalesce(p_summary, '')), ''), v_actor
      );

      v_count := v_count + 1;
    end loop;
  end loop;

  -- Who played is a plain list with no history of its own; the money side of
  -- adding or dropping someone is already in the adjustments above.
  delete from participants
  where session_id = p_session_id
    and not (member_id = any(p_participant_ids));

  insert into participants (session_id, member_id)
  select p_session_id, pid
  from unnest(p_participant_ids) as pid
  where not exists (
    select 1 from participants
    where session_id = p_session_id and member_id = pid
  );

  return v_count;
end;
$$;
