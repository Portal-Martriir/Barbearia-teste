update public.agendamentos
set pagamento_status = 'pendente',
    pagamento_pendente = true
where status in ('cancelado', 'desistencia_cliente')
  and (pagamento_status <> 'pendente' or pagamento_pendente <> true);

delete from public.financeiro f
using public.agendamentos a
where a.id = f.agendamento_id
  and a.status in ('cancelado', 'desistencia_cliente');

delete from public.comissoes c
using public.agendamentos a
where a.id = c.agendamento_id
  and a.status in ('cancelado', 'desistencia_cliente');
