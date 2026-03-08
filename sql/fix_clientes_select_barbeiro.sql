drop policy if exists clientes_select_self_or_admin on public.clientes;

create policy clientes_select_self_or_admin on public.clientes
for select using (
  public.fn_is_admin()
  or (
    public.fn_is_barbeiro()
    and exists (
      select 1
      from public.agendamentos a
      where a.cliente_id = clientes.id
        and a.barbeiro_id = public.fn_meu_barbeiro_id()
    )
  )
  or auth.uid() = id
);
