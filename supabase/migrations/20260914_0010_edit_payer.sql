-- ###########################################################################
-- SplitWiser — migration 0010: correcting who paid
--
-- The last row of the spec's B4 table that had no mechanism behind it:
--
--   | Người ứng trả 1 dòng chi phí | Có | Sinh adjustment chuyển nợ từ
--   |                              |    | payer cũ sang payer mới |
--
-- Until now the payer was the one thing a session could get wrong and never
-- recover from. You cannot delete a session either, so a mis-tapped dropdown
-- left the money permanently owed to the wrong person.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################

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
  v_payer     uuid;   -- who is recorded as having paid, right now
  v_new_payer uuid;   -- who actually did
  v_amount    bigint;
  v_assigned  bigint;
  v_member    uuid;
  v_target    bigint;
  v_current   bigint;
  v_delta     bigint;
  v_due       bigint;
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

    -- Absent means unchanged, so an old caller that does not send it still
    -- works and simply never triggers the transfer below.
    v_new_payer := coalesce((v_line ->> 'payer_member_id')::uuid, v_payer);

    if not exists (
      select 1 from members where id = v_new_payer and group_id = v_group
    ) then
      raise exception 'Choose who paid, from this group.';
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

    update cost_lines
    set note   = nullif(btrim(coalesce(v_line ->> 'note', '')), ''),
        amount = v_amount
    where id = v_cost_line;

    -- =====================================================================
    -- The payer changed: every charge moves from one person to another
    -- =====================================================================
    if v_new_payer <> v_payer then

      -- Step 1 — undo what everyone was CHARGED by the old payer.
      --
      -- On `due` (every row that is not a payment), never on the net. That
      -- distinction is the whole correctness of this branch. Say A was
      -- recorded as paying, C already handed A their 100.000đ, and it turns
      -- out B paid all along:
      --
      --   on net  C owes nothing, so nothing is written — and C ends up
      --           owing B 100.000đ while A quietly keeps C's money.
      --   on due  A → C 100.000đ is written, C's net with A becomes −100.000đ,
      --           so A owes C back exactly what A is holding. Correct.
      for v_member in
        select distinct case
                 when l.debtor_id = v_payer then l.creditor_id
                 else l.debtor_id
               end
        from ledger l
        where l.cost_line_id = v_cost_line
          and l.type <> 'payment'
          and (l.debtor_id = v_payer or l.creditor_id = v_payer)
      loop
        select coalesce(sum(
                 case
                   when l.debtor_id = v_member and l.creditor_id = v_payer then l.amount
                   when l.debtor_id = v_payer  and l.creditor_id = v_member then -l.amount
                   else 0
                 end), 0)
          into v_due
          from ledger l
          where l.cost_line_id = v_cost_line and l.type <> 'payment';

        continue when v_due = 0;

        insert into ledger (
          debtor_id, creditor_id, amount, type,
          session_id, cost_line_id, note, created_by_member_id
        )
        values (
          case when v_due > 0 then v_payer  else v_member end,
          case when v_due > 0 then v_member else v_payer  end,
          abs(v_due), 'adjustment',
          p_session_id, v_cost_line,
          nullif(btrim(coalesce(p_summary, '')), ''), v_actor
        );

        v_count := v_count + 1;
      end loop;

      -- Step 2 — the line now belongs to whoever really paid it.
      update cost_lines set payer_member_id = v_new_payer where id = v_cost_line;

      -- Step 3 — charge everyone again, to the new payer. The new payer's own
      -- share is skipped for the same reason it was never written the first
      -- time: a debt to yourself is not a debt.
      for v_member in select unnest(p_participant_ids)
      loop
        continue when v_member = v_new_payer;

        v_target := coalesce((
          select (s ->> 'amount')::bigint
          from jsonb_array_elements(v_line -> 'shares') as s
          where (s ->> 'member_id')::uuid = v_member
        ), 0);

        continue when v_target = 0;

        insert into ledger (
          debtor_id, creditor_id, amount, type,
          session_id, cost_line_id, note, created_by_member_id
        )
        values (
          v_member, v_new_payer, v_target, 'adjustment',
          p_session_id, v_cost_line,
          nullif(btrim(coalesce(p_summary, '')), ''), v_actor
        );

        v_count := v_count + 1;
      end loop;

      -- Nothing else to do for this line: step 3 set every share to its
      -- target, so the delta pass below would find nothing and double-charge
      -- if it did.
      continue;
    end if;

    -- =====================================================================
    -- Same payer: correct each person's share by the difference
    -- =====================================================================
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

      insert into ledger (
        debtor_id, creditor_id, amount, type,
        session_id, cost_line_id, note, created_by_member_id
      )
      values (
        case when v_delta > 0 then v_member else v_payer end,
        case when v_delta > 0 then v_payer  else v_member end,
        abs(v_delta), 'adjustment',
        p_session_id, v_cost_line,
        nullif(btrim(coalesce(p_summary, '')), ''), v_actor
      );

      v_count := v_count + 1;
    end loop;
  end loop;

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
