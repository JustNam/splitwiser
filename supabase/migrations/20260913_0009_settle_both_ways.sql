-- ###########################################################################
-- SplitWiser — migration 0009: either side can mark a debt settled
--
-- Until now only the person who owed could record a payment: settle_up()
-- refused anything where the net did not say "you owe them". But "I paid you"
-- and "you paid me" are one event seen from two chairs, and whoever opens the
-- app first should be able to record it.
--
-- It is also the safer half of the two. Saying you paid someone is a claim on
-- their memory; saying someone paid YOU gives up a claim on money, and nobody
-- forgives a debt owed to them by mistake twice.
--
-- Nothing changes in the ledger's shape. A payment is stored receiver →
-- payer either way; the sign of the net decides which way round the row goes.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################

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
    -- group. Without the second, a cost line id from someone else's group
    -- would be accepted.
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

    -- Someone else may have recorded this while the screen was open. Refusing
    -- is the right answer either way: recording it twice creates a debt in
    -- the other direction, and the ledger has no UPDATE to take it back with.
    if v_net = 0 then
      raise exception 'That one is already settled — reload and try again.';
    end if;

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

  return v_count;
end;
$$;
