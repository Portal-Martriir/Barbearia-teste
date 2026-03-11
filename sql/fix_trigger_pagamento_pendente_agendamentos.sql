drop trigger if exists trg_agendamento_status_change on public.agendamentos;

create trigger trg_agendamento_status_change
after update of status, pagamento_status, pagamento_pendente
on public.agendamentos
for each row
execute function public.processar_conclusao_agendamento();
