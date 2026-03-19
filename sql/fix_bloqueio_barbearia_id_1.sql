-- Corrige o tenant publico e fecha a tabela de barbearias para expor
-- somente a barbearia atual deste front (ID 2).

create or replace function public.fn_barbearia_publica_id()
returns bigint
language sql
stable
as $$
  select 2::bigint;
$$;

alter table public.barbearias enable row level security;

drop policy if exists barbearias_select on public.barbearias;

create policy barbearias_select on public.barbearias
for select
using (id = public.fn_minha_barbearia_id());
