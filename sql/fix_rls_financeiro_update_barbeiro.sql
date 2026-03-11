drop policy if exists financeiro_update_barbeiro_owner on public.financeiro;

create policy financeiro_update_barbeiro_owner on public.financeiro
for update
using (
  public.fn_is_barbeiro()
  and barbeiro_id = public.fn_meu_barbeiro_id()
)
with check (
  public.fn_is_barbeiro()
  and barbeiro_id = public.fn_meu_barbeiro_id()
);
