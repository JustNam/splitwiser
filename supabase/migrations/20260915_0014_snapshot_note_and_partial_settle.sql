-- ###########################################################################
-- SplitWiser — migration 0014: two things the app was throwing away
--
-- 1. get_group_snapshot() never returned ledger.note.
--
--    edit_session() writes the sentence describing the edit — "Courts: paid
--    by Katie → Nam · In: Guest 1" — onto every adjustment row it creates,
--    and the Activity feed reads `note` to show it. The snapshot did not
--    select the column, so the feed read `undefined` and fell back to the
--    generic "edited a session" on EVERY edit. The feature was written end
--    to end and the one thing missing was a column name.
--
-- 2. settle_up() rolled back the whole batch over one stale item.
--
--    Tick eight debts, have somebody else settle one of them while the
--    screen is open, and all eight were refused — nothing recorded, and the
--    message did not say which one. The stale item is now skipped and the
--    rest go through; the return value says how many actually did, so the
--    app can tell the truth about a short count. Only a batch with nothing
--    left to record is still an error.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- get_group_snapshot — now with the one column the Activity feed needs
-- ===========================================================================
create or replace function get_group_snapshot(p_group_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    -- `coalesce(..., '[]')` on every one: json_agg returns NULL for an empty
    -- set, and a screen that map()s over null is a screen that crashes on a
    -- group with no sessions yet — which is every group on day one.
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id,
        'group_id', m.group_id,
        'name', m.name,
        'type', m.type,
        'email', m.email,
        'account_id', m.account_id,
        -- Nested to match PostgREST's embedded `accounts (...)`, which is
        -- what toAccounts() reads. A null account is a guest.
        'accounts', case when a.id is null then null else json_build_object(
          'id', a.id, 'name', a.name, 'email', a.email
        ) end
      ))
      from members m
      left join accounts a on a.id = m.account_id
      where m.group_id = p_group_id
    ), '[]'::json),

    'sessions', coalesce((
      select json_agg(json_build_object(
        'id', s.id,
        'group_id', s.group_id,
        'date', s.date,
        'created_at', s.created_at,
        'created_by_member_id', s.created_by_member_id,
        'updated_by_member_id', s.updated_by_member_id,
        'updated_at', s.updated_at
      ) order by s.date desc, s.created_at desc)
      from sessions s
      where s.group_id = p_group_id
    ), '[]'::json),

    'cost_lines', coalesce((
      select json_agg(json_build_object(
        'id', c.id,
        'session_id', c.session_id,
        'note', c.note,
        'amount', c.amount,
        'payer_member_id', c.payer_member_id
      ))
      from cost_lines c
      join sessions s on s.id = c.session_id
      where s.group_id = p_group_id
    ), '[]'::json),

    'participants', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'session_id', p.session_id,
        'member_id', p.member_id
      ))
      from participants p
      join sessions s on s.id = p.session_id
      where s.group_id = p_group_id
    ), '[]'::json),

    -- Ledger rows carry no group_id of their own, so the filter goes through
    -- the session they belong to — the same join the REST version made
    -- PostgREST do with `sessions!inner`.
    'ledger', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'debtor_id', l.debtor_id,
        'creditor_id', l.creditor_id,
        'amount', l.amount,
        'type', l.type,
        'session_id', l.session_id,
        'cost_line_id', l.cost_line_id,
        -- The sentence the editor wrote. Without it the Activity feed can
        -- only ever say "edited a session".
        'note', l.note,
        'created_by_member_id', l.created_by_member_id,
        'created_at', l.created_at
      ))
      from ledger l
      join sessions s on s.id = l.session_id
      where s.group_id = p_group_id
    ), '[]'::json)
  );
$$;


-- ===========================================================================
-- settle_up — skip what somebody else already settled, record the rest
-- ===========================================================================
create or replace function settle_up(p_group_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account    uuid := auth.uid();
  v_actor      uuid;
  v_item       jsonb;
  v_cost_line  uuid;
  v_member     uuid;
  v_session    uuid;
  v_net        bigint;
  v_count      integer := 0;
begin
  if v_account is null then
    raise exception 'You need to be signed in.';
  end if;

  select id into v_actor
  from members
  where group_id = p_group_id and account_id = v_account;

  if v_actor is null then
    raise exception 'You are not a member of this group.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tick at least one debt to settle.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cost_line := (v_item ->> 'cost_line_id')::uuid;
    v_member    := (v_item ->> 'member_id')::uuid;

    if v_member = v_actor then
      raise exception 'You cannot settle up with yourself.';
    end if;

    -- Two checks in one query: the cost line exists, and it belongs to THIS
    -- group. Without the second, a cost line id from another group would be
    -- accepted.
    select s.id into v_session
    from cost_lines cl
    join sessions s on s.id = cl.session_id
    where cl.id = v_cost_line and s.group_id = p_group_id;

    if v_session is null then
      raise exception 'That cost is not part of this group.';
    end if;

    if not exists (
      select 1 from members where id = v_member and group_id = p_group_id
    ) then
      raise exception 'That person is not in this group.';
    end if;

    -- What is still open between the two of us on this one cost line.
    -- Positive: I owe them. Negative: they owe me. Every row type counts,
    -- with a payment arriving in the opposite direction and so subtracting
    -- itself.
    select coalesce(sum(
             case
               when l.debtor_id = v_actor  and l.creditor_id = v_member then l.amount
               when l.debtor_id = v_member and l.creditor_id = v_actor  then -l.amount
               else 0
             end), 0)
      into v_net
      from ledger l
      where l.cost_line_id = v_cost_line;

    -- Somebody else settled this one while the screen was open. Skipped
    -- rather than refused: recording it twice would create a debt in the
    -- other direction and the ledger has no UPDATE to take that back with —
    -- but refusing the whole batch over one stale row threw away the seven
    -- good ones with it. The count returned below is what the app reports,
    -- so a short count is visible rather than silent.
    continue when v_net = 0;

    -- The direction of the money decides the row, and the sign of the net
    -- decides the direction. A payment always runs receiver → payer:
    --
    --   net > 0  I owe them, so I hand money over; they receive.
    --   net < 0  they owe me, so they hand money over; I receive.
    insert into ledger (
      debtor_id, creditor_id, amount, type,
      session_id, cost_line_id, created_by_member_id
    )
    values (
      case when v_net > 0 then v_member else v_actor  end,
      case when v_net > 0 then v_actor  else v_member end,
      abs(v_net), 'payment',
      v_session, v_cost_line, v_actor
    );

    v_count := v_count + 1;
  end loop;

  -- Every single one was already settled. That is not a partial success, it
  -- is a screen showing debts that no longer exist.
  if v_count = 0 then
    raise exception 'Those are already settled — reload and try again.';
  end if;

  return v_count;
end;
$$;
