-- ###########################################################################
-- SplitWiser — migration 0012: the whole group in one request
--
-- Every screen in the app fetches the same five tables, and it costs five
-- HTTP requests to do it. Measured against this project: the five in
-- parallel take about 850ms while a single query takes about 350ms, and the
-- payload is under 7KB. The app was spending a second moving seven kilobytes
-- — a round-trip problem, not a data one.
--
-- So: one function, one request, one JSON object. It returns the SAME shape
-- the five queries did, snake_case and all, so every mapper in
-- src/api/groups.js keeps working untouched.
--
-- `stable`, not `volatile`: it only reads. That lets Postgres plan it better
-- and, more usefully, says out loud that calling it twice changes nothing.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################

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
        'created_by_member_id', l.created_by_member_id,
        'created_at', l.created_at
      ))
      from ledger l
      join sessions s on s.id = l.session_id
      where s.group_id = p_group_id
    ), '[]'::json)
  );
$$;
