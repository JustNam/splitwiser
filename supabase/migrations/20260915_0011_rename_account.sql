-- ###########################################################################
-- SplitWiser — migration 0011: change your own name
--
-- `accounts.name` is the name every group sees next to every number. It was
-- set once, at signup, from the auth metadata — and there was no way to
-- change it afterwards, which makes a typo permanent and a name change
-- impossible.
--
-- One function, because one function is the whole feature: nothing else about
-- an account is editable. Email is deliberately not: it is what you sign in
-- with and what claim_guest_rows() trusts to decide that a guest is you, so
-- changing it belongs to Supabase Auth's own confirmed-email flow rather than
-- to a function of ours.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################

create or replace function rename_account(p_name text)
returns accounts
language plpgsql
security definer
-- Pinned: a `security definer` function runs with the owner's rights, so a
-- caller who could change search_path could point `accounts` at a table of
-- their own and have this write to it.
set search_path = public
as $$
declare
  v_account uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_row     accounts;
begin
  if v_account is null then
    raise exception 'You need to be signed in to change your name.';
  end if;

  -- The same check the column carries, raised here so the person gets a
  -- sentence rather than a constraint violation.
  if v_name = '' then
    raise exception 'Your name cannot be empty.';
  end if;

  -- `auth.uid()`, never a parameter: the id comes from the signed JWT, so
  -- this function can only ever rename the caller. Passing the id in would
  -- make it a rename-anybody function.
  update accounts
     set name = v_name
   where id = v_account
  returning * into v_row;

  if v_row.id is null then
    raise exception 'No account found.';
  end if;

  return v_row;
end;
$$;
