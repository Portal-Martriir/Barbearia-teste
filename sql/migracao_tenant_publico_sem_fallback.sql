-- MIGRACAO SEGURA
-- Area publica / sem cadastro passa a respeitar exclusivamente o slug
-- enviado pelo front em x-barbearia-slug.
-- Se o front nao enviar slug, nenhuma barbearia publica sera resolvida.
-- Nao remove dados e nao altera registros da barbearia 1.

begin;

create or replace function public.fn_barbearia_publica_id()
returns bigint
language sql
stable
as $$
  select b.id
  from public.barbearias b
  where lower(b.slug) = lower(
    coalesce(
      (coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-barbearia-slug'),
      ''
    )
  )
    and b.ativo = true
  limit 1;
$$;

commit;
