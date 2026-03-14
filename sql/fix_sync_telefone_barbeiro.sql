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
