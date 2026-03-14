alter table public.agendamentos
  drop constraint if exists agendamentos_status_check;

alter table public.agendamentos
  add constraint agendamentos_status_check
  check (status in ('agendado','em_atendimento','concluido','cancelado','desistencia_cliente'));

drop index if exists public.idx_agendamentos_barbeiro_data_hora_ativos;

create index if not exists idx_agendamentos_barbeiro_data_hora_ativos
on public.agendamentos(barbeiro_id, data, hora_inicio, hora_fim)
where status not in ('cancelado', 'desistencia_cliente');

create or replace function public.before_write_agendamento()
returns trigger
language plpgsql
as $$
declare
  v_duracao integer;
  v_preco numeric(12,2);
begin
  select s.duracao_minutos, s.preco
  into v_duracao, v_preco
  from public.servicos s
  where s.id = new.servico_id;

  if v_duracao is null then
    raise exception 'Servico invalido para este agendamento';
  end if;

  new.hora_fim := (new.hora_inicio + make_interval(mins => v_duracao))::time;
  new.valor := v_preco;

  if exists (
    select 1
    from public.agendamentos a
    where a.barbeiro_id = new.barbeiro_id
      and a.data = new.data
      and a.status not in ('cancelado', 'desistencia_cliente')
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (new.hora_inicio < a.hora_fim and new.hora_fim > a.hora_inicio)
  ) then
    raise exception 'Conflito de horario para este barbeiro';
  end if;

  return new;
end;
$$;
