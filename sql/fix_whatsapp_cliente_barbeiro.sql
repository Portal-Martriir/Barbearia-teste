create or replace function public.listar_barbeiros_publico()
returns table (
  id uuid,
  nome text,
  telefone text
)
language sql
security definer
set search_path = public
as $$
  select b.id, b.nome, b.telefone
  from public.barbeiros b
  left join public.usuarios u on u.id = b.usuario_id
  where coalesce(u.perfil, 'barbeiro') <> 'admin'
  order by b.nome;
$$;

create or replace function public.listar_meus_agendamentos()
returns table (
  id uuid,
  barbeiro text,
  barbeiro_telefone text,
  servico text,
  data date,
  hora_inicio time,
  hora_fim time,
  status text,
  valor numeric,
  pode_cancelar boolean
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    b.nome as barbeiro,
    b.telefone as barbeiro_telefone,
    s.nome as servico,
    a.data,
    a.hora_inicio,
    a.hora_fim,
    a.status,
    a.valor,
    (
      a.status = 'agendado'
      and ((a.data::timestamp + a.hora_inicio) - now()) > interval '2 hours'
    ) as pode_cancelar
  from public.agendamentos a
  join public.barbeiros b on b.id = a.barbeiro_id
  join public.servicos s on s.id = a.servico_id
  where a.cliente_id = auth.uid()
  order by a.data desc, a.hora_inicio desc;
$$;
