drop function if exists public.listar_clientes_agendamento_barbeiro(text);
drop function if exists public.criar_agendamento_manual_barbeiro(uuid, uuid, uuid, date, time);

create or replace function public.listar_clientes_agendamento_barbeiro(
  p_busca text default null
)
returns table (
  id uuid,
  nome text,
  email text,
  telefone text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_busca text;
begin
  if not public.fn_is_barbeiro() then
    raise exception 'Apenas barbeiro pode listar clientes para agendamento manual';
  end if;

  v_busca := nullif(trim(coalesce(p_busca, '')), '');

  return query
  select
    u.id,
    u.nome,
    u.email,
    coalesce(nullif(trim(coalesce(u.telefone, '')), ''), c.telefone) as telefone
  from public.usuarios u
  left join public.clientes c on c.id = u.id
  where u.ativo = true
    and u.perfil = 'cliente'
    and (
      v_busca is null
      or lower(coalesce(u.nome, '')) like '%' || lower(v_busca) || '%'
      or lower(coalesce(u.email, '')) like '%' || lower(v_busca) || '%'
      or lower(coalesce(u.telefone, '')) like '%' || lower(v_busca) || '%'
      or lower(coalesce(c.telefone, '')) like '%' || lower(v_busca) || '%'
    )
  order by u.nome asc, u.created_at desc
  limit 50;
end;
$$;

create or replace function public.criar_agendamento_manual_barbeiro(
  p_usuario_id uuid,
  p_barbeiro_id uuid,
  p_servico_id uuid,
  p_data date,
  p_hora_inicio time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_usuario public.usuarios%rowtype;
  v_cliente_id uuid;
  v_agendamento_id uuid;
begin
  if not public.fn_is_barbeiro() then
    raise exception 'Apenas barbeiro pode criar agendamento manual';
  end if;

  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_usuario_id is null then
    raise exception 'Usuario do cliente e obrigatorio';
  end if;
  if p_barbeiro_id is null then
    raise exception 'Barbeiro e obrigatorio';
  end if;
  if p_servico_id is null then
    raise exception 'Servico e obrigatorio';
  end if;
  if p_data is null then
    raise exception 'Data e obrigatoria';
  end if;
  if p_hora_inicio is null then
    raise exception 'Hora de inicio e obrigatoria';
  end if;
  if p_data < current_date then
    raise exception 'Nao e permitido agendar em data passada';
  end if;

  if not exists (
    select 1
    from public.barbeiros b
    where b.id = p_barbeiro_id
      and b.usuario_id = v_auth_user_id
  ) then
    raise exception 'Barbeiro informado nao pertence ao usuario autenticado';
  end if;

  select *
  into v_usuario
  from public.usuarios u
  where u.id = p_usuario_id
    and u.ativo = true
    and u.perfil = 'cliente';

  if not found then
    raise exception 'Selecione um usuario cliente existente e ativo';
  end if;

  insert into public.clientes (id, nome, telefone, observacao)
  values (
    v_usuario.id,
    v_usuario.nome,
    nullif(trim(coalesce(v_usuario.telefone, '')), ''),
    'Vinculado via agendamento manual do barbeiro'
  )
  on conflict (id) do update
    set nome = excluded.nome,
        telefone = coalesce(excluded.telefone, public.clientes.telefone)
  returning id into v_cliente_id;

  insert into public.agendamentos (
    cliente_id,
    barbeiro_id,
    servico_id,
    data,
    hora_inicio,
    status,
    pagamento_status,
    pagamento_pendente
  )
  values (
    v_cliente_id,
    p_barbeiro_id,
    p_servico_id,
    p_data,
    p_hora_inicio,
    'agendado',
    'pago',
    false
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.listar_clientes_agendamento_barbeiro(text) to authenticated;
grant execute on function public.criar_agendamento_manual_barbeiro(uuid, uuid, uuid, date, time) to authenticated;
