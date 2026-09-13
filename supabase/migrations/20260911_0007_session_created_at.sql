-- ###########################################################################
-- SplitWiser — migration 0007: when a session was logged
--
-- `date` is the day the game was played, which is what the list is ordered
-- by. It is not enough on its own: two games on the same Sunday sort equal,
-- and Postgres is then free to return them in any order — so the list
-- reshuffles between page loads.
--
-- There was no other column to break the tie with. `id` is a random uuid and
-- carries no time at all.
--
-- Run once in the Supabase SQL Editor.
-- ###########################################################################

-- `default now()` fills the column for rows that already exist. Their real
-- creation time is lost — nothing ever recorded it — so they all land on the
-- moment this runs. Harmless while there is barely any history, and the only
-- alternative is a nullable column that every query then has to handle.
alter table sessions
  add column if not exists created_at timestamptz not null default now();

-- Ordering the list is the only thing this column is for, so the index
-- matches the order the list asks for.
create index if not exists sessions_group_recent_idx
  on sessions (group_id, date desc, created_at desc);
