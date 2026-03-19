create or replace function public.dashboard_admin_resumo(
  p_inicio date,
  p_fim date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barbearia_id bigint := public.fn_minha_barbearia_id();
  v_result jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'Apenas admin pode acessar o dashboard';
  end if;

  with ag as (
    select a.data, a.status
    from public.agendamentos a
    where a.barbearia_id = v_barbearia_id
      and a.data between p_inicio and p_fim
  ),
  fin as (
    select
      f.data,
      f.valor_servico,
      f.comissao_barbeiro,
      f.status_pagamento,
      coalesce(b.nome, 'Sem nome') as barbeiro
    from public.financeiro f
    left join public.barbeiros b on b.id = f.barbeiro_id
    where f.barbearia_id = v_barbearia_id
      and f.data between p_inicio and p_fim
  ),
  desp as (
    select d.data, d.valor
    from public.despesas d
    where d.barbearia_id = v_barbearia_id
      and d.data between p_inicio and p_fim
  ),
  contas as (
    select coalesce(sum(c.valor), 0) as total
    from public.contas_receber_manuais c
    where c.barbearia_id = v_barbearia_id
      and c.status = 'pendente'
      and c.data between p_inicio and p_fim
  ),
  ranking as (
    select f.barbeiro as nome, sum(f.valor_servico) as total
    from fin f
    where f.status_pagamento = 'pago'
    group by f.barbeiro
    order by total desc
    limit 6
  ),
  serie as (
    select
      f.data,
      sum(case when f.status_pagamento = 'pago' then f.valor_servico else 0 end) as receita,
      sum(case when f.status_pagamento = 'pago' then f.comissao_barbeiro else 0 end) as comissao
    from fin f
    group by f.data
  )
  select jsonb_build_object(
    'totalFaturado', coalesce((select sum(valor_servico) from fin where status_pagamento = 'pago'), 0),
    'atendimentos', coalesce((select count(*) from ag where status = 'concluido'), 0),
    'agendamentos', coalesce((select count(*) from ag where status in ('agendado', 'em_atendimento')), 0),
    'cancelados', coalesce((select count(*) from ag where status in ('cancelado', 'desistencia_cliente')), 0),
    'topBarbeiro', coalesce((select jsonb_build_object('nome', nome, 'total', total) from ranking limit 1), 'null'::jsonb),
    'contasReceber', coalesce((select sum(valor_servico) from fin where status_pagamento = 'pendente'), 0) + coalesce((select total from contas), 0),
    'despesas', coalesce((select sum(valor) from desp), 0),
    'comissoes', coalesce((select sum(comissao_barbeiro) from fin where status_pagamento = 'pago'), 0),
    'liquido', coalesce((select sum(valor_servico - comissao_barbeiro) from fin where status_pagamento = 'pago'), 0) - coalesce((select sum(valor) from desp), 0),
    'series', coalesce((select jsonb_agg(jsonb_build_object('data', s.data, 'receita', s.receita, 'comissao', s.comissao, 'liquido', s.receita - s.comissao) order by s.data) from serie s), '[]'::jsonb),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object('nome', r.nome, 'total', r.total) order by r.total desc) from ranking r), '[]'::jsonb)
  )
  into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;
