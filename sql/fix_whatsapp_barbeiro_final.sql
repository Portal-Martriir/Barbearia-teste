drop function if exists public.listar_barbeiros_publico();
create function public.listar_barbeiros_publico()
returns table (
  id uuid,
  nome text,
  telefone text
)
language sql
security definer
set search_path = public
as $$
  select
    b.id,
    b.nome,
    b.telefone
  from public.barbeiros b
  left join public.usuarios u on u.id = b.usuario_id
  where coalesce(u.perfil, 'barbeiro') <> 'admin'
  order by b.nome;
$$;

grant execute on function public.listar_barbeiros_publico() to anon, authenticated;

drop function if exists public.listar_meus_agendamentos();
create function public.listar_meus_agendamentos()
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

grant execute on function public.listar_meus_agendamentos() to authenticated;

create or replace function public.sync_usuario_para_barbeiro()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.perfil = 'barbeiro' then
    insert into public.barbeiros (usuario_id, nome, telefone, comissao_percentual)
    values (
      new.id,
      new.nome,
      nullif(trim(coalesce(new.telefone, '')), ''),
      40
    )
    on conflict (usuario_id) do update
      set nome = excluded.nome,
          telefone = excluded.telefone
      where public.barbeiros.nome is distinct from excluded.nome
         or public.barbeiros.telefone is distinct from excluded.telefone;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_usuarios_sync_barbeiro on public.usuarios;
create trigger trg_usuarios_sync_barbeiro
after insert or update of perfil, nome, telefone on public.usuarios
for each row
execute function public.sync_usuario_para_barbeiro();

update public.barbeiros b
set telefone = nullif(trim(coalesce(u.telefone, '')), '')
from public.usuarios u
where u.id = b.usuario_id
  and coalesce(u.perfil, '') = 'barbeiro'
  and b.telefone is distinct from nullif(trim(coalesce(u.telefone, '')), '');
