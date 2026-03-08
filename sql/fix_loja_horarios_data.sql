create table if not exists public.loja_horarios_data (
  data date primary key,
  ativo boolean not null default true,
  hora_inicio time,
  hora_fim time,
  intervalo_minutos integer default 30 check (intervalo_minutos is null or (intervalo_minutos > 0 and intervalo_minutos <= 120)),
  updated_at timestamptz not null default now(),
  check (
    (ativo = false)
    or (
      hora_inicio is not null
      and hora_fim is not null
      and hora_inicio < hora_fim
    )
  )
);

create index if not exists idx_loja_horarios_data_data on public.loja_horarios_data(data);

alter table public.loja_horarios_data enable row level security;

drop policy if exists loja_horarios_data_select_auth on public.loja_horarios_data;
create policy loja_horarios_data_select_auth on public.loja_horarios_data
for select using (auth.role() = 'authenticated');

drop policy if exists loja_horarios_data_write_admin on public.loja_horarios_data;
create policy loja_horarios_data_write_admin on public.loja_horarios_data
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

create or replace function public.horarios_disponiveis_cliente(
  p_data date,
  p_barbeiro_id uuid,
  p_servico_id uuid
)
returns table (
  hora_inicio time
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abertura time;
  v_fechamento time;
  v_intervalo integer;
  v_passo interval;
  v_duracao integer;
  v_cursor time;
  v_dow integer;
  v_loja_ativo boolean;
  v_loja_inicio time;
  v_loja_fim time;
  v_loja_intervalo integer;
  v_h_ativo boolean;
  v_h_inicio time;
  v_h_fim time;
  v_h_intervalo integer;
begin
  if p_data is null then
    raise exception 'Data obrigatoria';
  end if;
  if p_barbeiro_id is null then
    raise exception 'Barbeiro obrigatorio';
  end if;
  if p_servico_id is null then
    raise exception 'Servico obrigatorio';
  end if;

  select c.hora_abertura, c.hora_fechamento, c.intervalo_minutos
  into v_abertura, v_fechamento, v_intervalo
  from public.configuracao_agenda c
  where c.id = 1;

  if v_abertura is null or v_fechamento is null or v_intervalo is null then
    v_abertura := '09:00'::time;
    v_fechamento := '19:00'::time;
    v_intervalo := 30;
  end if;

  select ld.ativo, ld.hora_inicio, ld.hora_fim, ld.intervalo_minutos
  into v_loja_ativo, v_loja_inicio, v_loja_fim, v_loja_intervalo
  from public.loja_horarios_data ld
  where ld.data = p_data
  limit 1;

  if found then
    if not coalesce(v_loja_ativo, false) then
      return;
    end if;
    v_abertura := coalesce(v_loja_inicio, v_abertura);
    v_fechamento := coalesce(v_loja_fim, v_fechamento);
    v_intervalo := coalesce(v_loja_intervalo, v_intervalo);
  end if;

  v_passo := make_interval(mins => v_intervalo);

  v_dow := extract(dow from p_data)::integer;
  select h.ativo, h.hora_inicio, h.hora_fim, h.intervalo_minutos
  into v_h_ativo, v_h_inicio, v_h_fim, v_h_intervalo
  from public.barbeiro_horarios h
  where h.barbeiro_id = p_barbeiro_id
    and h.dia_semana = v_dow
  limit 1;

  if found then
    if not coalesce(v_h_ativo, false) then
      return;
    end if;
    if v_h_inicio is not null then
      v_abertura := greatest(v_abertura, v_h_inicio);
    end if;
    if v_h_fim is not null then
      v_fechamento := least(v_fechamento, v_h_fim);
    end if;
    v_intervalo := coalesce(v_h_intervalo, v_intervalo);
    v_passo := make_interval(mins => v_intervalo);
  end if;

  if v_abertura >= v_fechamento then
    return;
  end if;

  select s.duracao_minutos
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id;

  if v_duracao is null then
    raise exception 'Servico invalido';
  end if;

  v_cursor := v_abertura;
  while (v_cursor + make_interval(mins => v_duracao)) <= v_fechamento loop
    if not exists (
      select 1
      from public.agendamentos a
      where a.barbeiro_id = p_barbeiro_id
        and a.data = p_data
        and a.status not in ('cancelado','desistencia_cliente')
        and (v_cursor < a.hora_fim and (v_cursor + make_interval(mins => v_duracao))::time > a.hora_inicio)
    ) then
      if (p_data > current_date) or (p_data = current_date and v_cursor > localtime) then
        hora_inicio := v_cursor;
        return next;
      end if;
    end if;

    v_cursor := (v_cursor + v_passo)::time;
  end loop;
end;
$$;
