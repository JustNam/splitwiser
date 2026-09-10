-- ###########################################################################
-- SplitWiser — migration 0004: mark debts as paid
--
-- One payment row per debt, all in one transaction. Paying three people at
-- once either records all three or none: half a settlement is worse than
-- none, because the two sides then disagree about what is still owed.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################


-- ===========================================================================
-- settle_up — record money that has actually changed hands
--
-- p_items says WHICH debts, never how much:
--
--   [ { "cost_line_id": "…", "member_id": "…" }, … ]
--
-- member_id is the person being paid. The amount is worked out here, from the
-- ledger, because B5 has no amount field by design — every debt is paid in
-- full. Sending the amount from the browser would mean trusting a number the
-- user's screen might have computed minutes ago, before someone else paid.
--
-- Direction: a payment is stored receiver → payer, the mirror image of the
-- share it cancels. That is what lets netBetween() add up every row type with
-- one formula and no `case` on `type`.
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
    raise exception 'Tick at least one debt to pay.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cost_line := (v_item ->> 'cost_line_id')::uuid;
    v_member    := (v_item ->> 'member_id')::uuid;

    if v_member = v_actor then
      raise exception 'You cannot pay yourself.';
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
    -- Positive means I owe them; every row type counts, with a payment
    -- arriving in the opposite direction and so subtracting itself.
    select coalesce(sum(
             case
               when l.debtor_id = v_actor  and l.creditor_id = v_member then l.amount
               when l.debtor_id = v_member and l.creditor_id = v_actor  then -l.amount
               else 0
             end), 0)
      into v_net
      from ledger l
      where l.cost_line_id = v_cost_line;

    -- Someone else may have recorded this payment while the screen was open.
    -- Refusing is the right answer: paying twice creates a debt in the other
    -- direction, and the ledger has no UPDATE to take it back with.
    if v_net <= 0 then
      raise exception 'That debt is already settled — reload and try again.';
    end if;

    insert into ledger (
      debtor_id, creditor_id, amount, type,
      session_id, cost_line_id, created_by_member_id
    )
    values (
      v_member, v_actor, v_net, 'payment',
      v_session, v_cost_line, v_actor
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
