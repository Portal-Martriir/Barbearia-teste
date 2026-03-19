-- MIGRACAO SEGURA
-- Faz a area publica / sem cadastro respeitar a barbearia do front
-- usando o header x-barbearia-slug enviado pelo cliente Supabase.
-- Nao remove dados existentes.

begin;

create or replace function public.fn_barbearia_publica_id()
returns bigint
language sql
stable
as $$
  select coalesce(
    (
      select b.id
      from public.barbearias b
      where lower(b.slug) = lower(
        coalesce(
          (coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-barbearia-slug'),
          ''
        )
      )
        and b.ativo = true
      limit 1
    ),
    2::bigint
  );
$$;

insert into public.barbearias (id, nome, slug, ativo)
values (2, 'Barbearia teste', 'barbearia-teste', true)
on conflict (id) do update
set nome = excluded.nome,
    slug = excluded.slug,
    ativo = true;

commit;
