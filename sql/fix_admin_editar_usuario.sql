alter table public.usuarios
  add column if not exists telefone text,
  add column if not exists data_nascimento date;

create or replace function public.admin_atualizar_usuario_cadastro(
  p_usuario_id uuid,
  p_nome text,
  p_email text default null,
  p_telefone text default null,
  p_data_nascimento date default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean;
  v_nome text;
  v_email text;
  v_telefone text;
begin
  select public.fn_is_admin() into v_is_admin;
  if not v_is_admin then
    raise exception 'Apenas admin pode atualizar usuarios';
  end if;

  v_nome := nullif(trim(coalesce(p_nome, '')), '');
  if v_nome is null then
    raise exception 'Nome do usuario e obrigatorio';
  end if;

  v_email := nullif(trim(coalesce(p_email, '')), '');
  if v_email is null then
    raise exception 'Email do usuario e obrigatorio';
  end if;

  v_telefone := nullif(trim(coalesce(p_telefone, '')), '');

  update public.usuarios
  set nome = v_nome,
      email = v_email,
      telefone = v_telefone,
      data_nascimento = p_data_nascimento
  where id = p_usuario_id;

  if not found then
    raise exception 'Usuario nao encontrado';
  end if;

  update auth.users
  set email = v_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'nome', v_nome,
          'telefone', coalesce(v_telefone, ''),
          'data_nascimento', coalesce(p_data_nascimento::text, '')
        )
  where id = p_usuario_id;

  update public.clientes
  set nome = v_nome,
      telefone = v_telefone
  where id = p_usuario_id;

  update public.barbeiros
  set nome = v_nome,
      telefone = v_telefone
  where usuario_id = p_usuario_id;

  return true;
end;
$$;

grant execute on function public.admin_atualizar_usuario_cadastro(uuid, text, text, text, date) to authenticated;
