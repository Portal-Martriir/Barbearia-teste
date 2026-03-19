-- MIGRACAO SEGURA
-- Objetivo:
-- 1) Fixar este front na Barbearia ID 2
-- 2) Impedir visualizacao da Barbearia ID 1 por este fluxo
-- 3) Nao apagar dados existentes
--
-- Este arquivo NAO remove tabelas nem registros.
-- Pode ser executado no SQL Editor do Supabase.

begin;

create or replace function public.fn_barbearia_publica_id()
returns bigint
language sql
stable
as $$
  select 2::bigint;
$$;

insert into public.barbearias (id, nome, slug, ativo)
values (2, 'Barbearia teste', 'barbearia-teste', true)
on conflict (id) do update
set nome = excluded.nome,
    slug = excluded.slug,
    ativo = true;

insert into public.configuracao_agenda (
  barbearia_id,
  hora_abertura,
  hora_fechamento,
  intervalo_minutos,
  whatsapp_confirmacao_obrigatoria
)
values (
  2,
  '09:00',
  '19:00',
  30,
  true
)
on conflict (barbearia_id) do update
set hora_abertura = excluded.hora_abertura,
    hora_fechamento = excluded.hora_fechamento,
    intervalo_minutos = excluded.intervalo_minutos,
    whatsapp_confirmacao_obrigatoria = excluded.whatsapp_confirmacao_obrigatoria,
    updated_at = now();

alter table public.barbearias enable row level security;

drop policy if exists barbearias_select on public.barbearias;

create policy barbearias_select on public.barbearias
for select
using (id = public.fn_minha_barbearia_id());

commit;
