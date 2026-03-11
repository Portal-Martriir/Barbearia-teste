-- =========================================================
-- BARBEARIA APP - SUPABASE SQL COMPLETO
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- LIMPEZA (ordem segura para recriar)
-- =========================================================
-- Nao fazemos DROP TRIGGER aqui porque em banco novo as tabelas ainda nao existem
-- e "drop trigger ... on public.tabela" gera erro 42P01.

drop function if exists public.sync_usuario_barbeiro() cascade;
drop function if exists public.sync_usuario_para_barbeiro() cascade;
drop function if exists public.before_write_agendamento() cascade;
drop function if exists public.processar_conclusao_agendamento() cascade;
drop function if exists public.atualizar_agendamentos_atrasados() cascade;
drop function if exists public.fn_is_admin() cascade;
drop function if exists public.fn_is_barbeiro() cascade;
drop function if exists public.fn_meu_barbeiro_id() cascade;
drop function if exists public.obter_configuracao_agenda_publica() cascade;
drop function if exists public.definir_usuario_como_barbeiro(uuid, text, text, numeric) cascade;
drop function if exists public.registrar_cliente_auth(text, text, text) cascade;
drop function if exists public.admin_atualizar_usuario_cadastro(uuid, text, text, text, date) cascade;
drop function if exists public.admin_definir_senha_usuario(uuid, text) cascade;
drop function if exists public.garantir_admin_como_barbeiro() cascade;
drop function if exists public.listar_usuarios_cadastro_admin() cascade;
drop function if exists public.dashboard_admin_resumo(date, date) cascade;

drop table if exists public.financeiro cascade;
drop table if exists public.loja_dias_fechados cascade;
drop table if exists public.loja_horarios_data cascade;
drop table if exists public.contas_receber_manuais cascade;
drop table if exists public.receitas_manuais cascade;
drop table if exists public.categorias_despesa cascade;
drop table if exists public.despesas cascade;
drop table if exists public.comissoes cascade;
drop table if exists public.agendamentos cascade;
drop table if exists public.servicos cascade;
drop table if exists public.barbeiro_horarios cascade;
drop table if exists public.barbeiros cascade;
drop table if exists public.clientes cascade;
drop table if exists public.configuracao_agenda cascade;
drop table if exists public.usuarios cascade;

-- =========================================================
-- TABELAS
-- =========================================================

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text not null,
  telefone text,
  data_nascimento date,
  perfil text not null check (perfil in ('admin', 'barbeiro', 'cliente')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  observacao text,
  created_at timestamptz not null default now()
);

create table public.barbeiros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid unique references public.usuarios(id) on delete set null,
  nome text not null,
  telefone text,
  comissao_percentual numeric(5,2) not null check (comissao_percentual >= 0 and comissao_percentual <= 100),
  saldo_barbeiro numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  preco numeric(12,2) not null check (preco >= 0),
  duracao_minutos integer not null check (duracao_minutos > 0 and duracao_minutos <= 720),
  created_at timestamptz not null default now()
);

create table public.barbeiro_horarios (
  id uuid primary key default gen_random_uuid(),
  barbeiro_id uuid not null references public.barbeiros(id) on delete cascade,
  dia_semana integer not null check (dia_semana >= 0 and dia_semana <= 6),
  ativo boolean not null default true,
  hora_inicio time,
  hora_intervalo_inicio time,
  hora_intervalo_fim time,
  hora_fim time,
  intervalo_minutos integer default 30 check (intervalo_minutos is null or (intervalo_minutos > 0 and intervalo_minutos <= 120)),
  created_at timestamptz not null default now(),
  unique (barbeiro_id, dia_semana),
  check (
    (ativo = false)
    or (
      hora_inicio is not null
      and hora_fim is not null
      and hora_inicio < hora_fim
    )
  ),
  check (
    hora_intervalo_inicio is null
    or hora_intervalo_fim is null
    or (
      hora_inicio is not null
      and hora_fim is not null
      and hora_inicio < hora_intervalo_inicio
      and hora_intervalo_inicio < hora_intervalo_fim
      and hora_intervalo_fim < hora_fim
    )
  )
);

create table public.configuracao_agenda (
  id smallint primary key default 1 check (id = 1),
  hora_abertura time not null default '09:00',
  hora_fechamento time not null default '19:00',
  intervalo_minutos integer not null default 30 check (intervalo_minutos > 0 and intervalo_minutos <= 120),
  updated_at timestamptz not null default now()
);

create table public.loja_horarios_data (
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

create table public.loja_dias_fechados (
  dia_semana integer primary key check (dia_semana >= 0 and dia_semana <= 6),
  fechado boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  barbeiro_id uuid not null references public.barbeiros(id) on delete restrict,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  status text not null default 'agendado' check (status in ('agendado','em_atendimento','concluido','cancelado')),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('pago','pendente')),
  pagamento_pendente boolean not null default true,
  valor numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.financeiro (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null unique references public.agendamentos(id) on delete cascade,
  barbeiro_id uuid not null references public.barbeiros(id) on delete restrict,
  valor_servico numeric(12,2) not null check (valor_servico >= 0),
  comissao_barbeiro numeric(12,2) not null check (comissao_barbeiro >= 0),
  forma_pagamento text,
  status_pagamento text not null check (status_pagamento in ('pago','pendente')),
  data date not null,
  created_at timestamptz not null default now()
);

create table public.receitas_manuais (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor >= 0),
  data date not null,
  status_pagamento text not null default 'pago' check (status_pagamento in ('pago','pendente')),
  observacao text,
  created_at timestamptz not null default now()
);

create table public.contas_receber_manuais (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor >= 0),
  data date not null,
  status text not null default 'pendente' check (status in ('pendente','recebido')),
  data_recebimento date,
  observacao text,
  created_at timestamptz not null default now()
);

create table public.categorias_despesa (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor >= 0),
  data date not null,
  observacao text,
  created_at timestamptz not null default now()
);

create table public.comissoes (
  id uuid primary key default gen_random_uuid(),
  barbeiro_id uuid not null references public.barbeiros(id) on delete restrict,
  agendamento_id uuid not null unique references public.agendamentos(id) on delete cascade,
  valor_servico numeric(12,2) not null check (valor_servico >= 0),
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  valor_comissao numeric(12,2) not null check (valor_comissao >= 0),
  data date not null,
  created_at timestamptz not null default now()
);

create index idx_agendamentos_data on public.agendamentos(data);
create index idx_agendamentos_barbeiro_data on public.agendamentos(barbeiro_id, data);
create index idx_agendamentos_barbeiro_data_hora_ativos on public.agendamentos(barbeiro_id, data, hora_inicio, hora_fim) where status <> 'cancelado';
create index idx_agendamentos_cliente_data on public.agendamentos(cliente_id, data);
create index idx_agendamentos_status_data on public.agendamentos(status, data);
create index idx_financeiro_data on public.financeiro(data);
create index idx_financeiro_barbeiro on public.financeiro(barbeiro_id);
create index idx_financeiro_status_data on public.financeiro(status_pagamento, data);
create index idx_financeiro_barbeiro_status_data on public.financeiro(barbeiro_id, status_pagamento, data);
create index idx_receitas_manuais_data on public.receitas_manuais(data);
create index idx_contas_receber_manuais_data on public.contas_receber_manuais(data);
create index idx_contas_receber_manuais_status on public.contas_receber_manuais(status);
create index idx_loja_horarios_data_data on public.loja_horarios_data(data);
create index idx_despesas_data on public.despesas(data);
create index idx_despesas_categoria_data on public.despesas(categoria, data);
create index idx_comissoes_barbeiro_data on public.comissoes(barbeiro_id, data);
create index idx_barbeiro_horarios_barbeiro on public.barbeiro_horarios(barbeiro_id, dia_semana);

-- =========================================================
-- FUNCOES AUXILIARES (RLS)
-- =========================================================

create or replace function public.fn_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.perfil = 'admin'
      and u.ativo = true
  );
$$;

create or replace function public.fn_is_barbeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.perfil = 'barbeiro'
      and u.ativo = true
  );
$$;

create or replace function public.fn_meu_barbeiro_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.barbeiros b
  where b.usuario_id = auth.uid()
  limit 1;
$$;

-- =========================================================
-- TRIGGER 1: CALCULO DE HORA_FIM + VALOR + BLOQUEIO DE CONFLITO
-- =========================================================

create or replace function public.before_write_agendamento()
returns trigger
language plpgsql
as $$
declare
  v_duracao integer;
  v_preco numeric(12,2);
begin
  select s.duracao_minutos, s.preco
  into v_duracao, v_preco
  from public.servicos s
  where s.id = new.servico_id;

  if v_duracao is null then
    raise exception 'Servico invalido para este agendamento';
  end if;

  new.hora_fim := (new.hora_inicio + make_interval(mins => v_duracao))::time;
  new.valor := v_preco;

  if exists (
    select 1
    from public.agendamentos a
    where a.barbeiro_id = new.barbeiro_id
      and a.data = new.data
      and a.status <> 'cancelado'
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (new.hora_inicio < a.hora_fim and new.hora_fim > a.hora_inicio)
  ) then
    raise exception 'Conflito de horario para este barbeiro';
  end if;

  return new;
end;
$$;

create trigger trg_agendamentos_before_write
before insert or update of servico_id, hora_inicio, barbeiro_id, data
on public.agendamentos
for each row
execute function public.before_write_agendamento();

-- =========================================================
-- TRIGGER 2: AO CONCLUIR AGENDAMENTO -> FINANCEIRO + COMISSAO + SALDO
-- =========================================================

create or replace function public.processar_conclusao_agendamento()
returns trigger
language plpgsql
as $$
declare
  v_comissao_percentual numeric(5,2);
  v_comissao_valor numeric(12,2);
  v_status_pagamento text;
begin
  if new.status = 'concluido' and old.status is distinct from 'concluido' then
    select b.comissao_percentual
    into v_comissao_percentual
    from public.barbeiros b
    where b.id = new.barbeiro_id;

    v_comissao_valor := round((new.valor * coalesce(v_comissao_percentual, 0) / 100.0)::numeric, 2);
    v_status_pagamento := case when coalesce(new.pagamento_pendente, false) then 'pendente' else 'pago' end;

    insert into public.financeiro (
      agendamento_id,
      barbeiro_id,
      valor_servico,
      comissao_barbeiro,
      forma_pagamento,
      status_pagamento,
      data
    )
    values (
      new.id,
      new.barbeiro_id,
      new.valor,
      v_comissao_valor,
      null,
      v_status_pagamento,
      new.data
    )
    on conflict (agendamento_id) do update
      set valor_servico = excluded.valor_servico,
          comissao_barbeiro = excluded.comissao_barbeiro,
          status_pagamento = excluded.status_pagamento,
          data = excluded.data;

    insert into public.comissoes (
      barbeiro_id,
      agendamento_id,
      valor_servico,
      percentual,
      valor_comissao,
      data
    )
    values (
      new.barbeiro_id,
      new.id,
      new.valor,
      coalesce(v_comissao_percentual, 0),
      v_comissao_valor,
      new.data
    )
    on conflict (agendamento_id) do update
      set valor_servico = excluded.valor_servico,
          percentual = excluded.percentual,
          valor_comissao = excluded.valor_comissao,
          data = excluded.data;

    update public.barbeiros
      set saldo_barbeiro = saldo_barbeiro + v_comissao_valor
      where id = new.barbeiro_id;
  elsif new.status = 'concluido'
    and (
      old.pagamento_status is distinct from new.pagamento_status
      or old.pagamento_pendente is distinct from new.pagamento_pendente
    ) then
    update public.financeiro
      set status_pagamento = case when coalesce(new.pagamento_pendente, false) then 'pendente' else 'pago' end
      where agendamento_id = new.id;
  end if;

  return new;
end;
$$;

create trigger trg_agendamento_status_change
after update of status, pagamento_status
on public.agendamentos
for each row
execute function public.processar_conclusao_agendamento();

-- =========================================================
-- FUNCAO DE AUTOMACAO DE STATUS (AGENDADO -> CONCLUIDO)
-- =========================================================

create or replace function public.atualizar_agendamentos_atrasados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.agendamentos a
  set status = 'concluido'
  where a.status = 'agendado'
    and (
      (a.data < current_date)
      or (a.data = current_date and a.hora_fim <= localtime)
    );

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

grant execute on function public.atualizar_agendamentos_atrasados() to authenticated;

-- =========================================================
-- SINCRONIZACAO USUARIO/BARBEIRO
-- =========================================================

create or replace function public.sync_usuario_barbeiro()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.usuario_id is not null then
    update public.usuarios
    set nome = new.nome
    where id = new.usuario_id
      and nome is distinct from new.nome;
  end if;
  return new;
end;
$$;

create trigger trg_barbeiro_sync_usuarios
after insert or update of nome on public.barbeiros
for each row
execute function public.sync_usuario_barbeiro();

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
      null,
      40
    )
    on conflict (usuario_id) do update
      set nome = excluded.nome
      where public.barbeiros.nome is distinct from excluded.nome;
  end if;

  return new;
end;
$$;

create or replace function public.proteger_perfil_admin()
returns trigger
language plpgsql
as $$
begin
  if old.perfil = 'admin' and new.perfil <> 'admin' then
    new.perfil := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_proteger_admin on public.usuarios;
create trigger trg_usuarios_proteger_admin
before update of perfil on public.usuarios
for each row
execute function public.proteger_perfil_admin();

create trigger trg_usuarios_sync_barbeiro
after insert or update of perfil, nome on public.usuarios
for each row
execute function public.sync_usuario_para_barbeiro();

-- =========================================================
-- RLS
-- =========================================================

alter table public.usuarios enable row level security;
alter table public.clientes enable row level security;
alter table public.barbeiros enable row level security;
alter table public.barbeiro_horarios enable row level security;
alter table public.servicos enable row level security;
alter table public.agendamentos enable row level security;
alter table public.financeiro enable row level security;
alter table public.receitas_manuais enable row level security;
alter table public.contas_receber_manuais enable row level security;
alter table public.categorias_despesa enable row level security;
alter table public.despesas enable row level security;
alter table public.comissoes enable row level security;
alter table public.configuracao_agenda enable row level security;
alter table public.loja_horarios_data enable row level security;
alter table public.loja_dias_fechados enable row level security;

-- usuarios
create policy usuarios_select_self_or_admin on public.usuarios
for select using (
  auth.uid() = id or public.fn_is_admin()
);

create policy usuarios_update_self_or_admin on public.usuarios
for update using (
  auth.uid() = id or public.fn_is_admin()
)
with check (
  public.fn_is_admin()
  or (
    auth.uid() = id
    and perfil = 'cliente'
    and ativo = true
  )
);

create policy usuarios_insert_admin on public.usuarios
for insert with check (public.fn_is_admin());

create policy usuarios_insert_self_cliente on public.usuarios
for insert with check (
  auth.uid() = id
  and perfil = 'cliente'
);

-- clientes
create policy clientes_select_self_or_admin on public.clientes
for select using (
  public.fn_is_admin()
  or (
    public.fn_is_barbeiro()
    and exists (
      select 1
      from public.agendamentos a
      where a.cliente_id = clientes.id
        and a.barbeiro_id = public.fn_meu_barbeiro_id()
    )
  )
  or auth.uid() = id
);

create policy clientes_insert_self_or_admin on public.clientes
for insert with check (
  public.fn_is_admin()
  or auth.uid() = id
);

create policy clientes_update_self_or_admin on public.clientes
for update using (
  public.fn_is_admin()
  or auth.uid() = id
)
with check (
  public.fn_is_admin()
  or auth.uid() = id
);

create policy clientes_delete_admin on public.clientes
for delete using (public.fn_is_admin());

-- barbeiros
create policy barbeiros_select_auth on public.barbeiros
for select using (auth.role() = 'authenticated');

create policy barbeiros_write_admin on public.barbeiros
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- barbeiro_horarios
create policy barbeiro_horarios_select_auth on public.barbeiro_horarios
for select using (auth.role() = 'authenticated');

create policy barbeiro_horarios_write_admin_or_owner on public.barbeiro_horarios
for all using (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
)
with check (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
);

-- servicos
create policy servicos_select_auth on public.servicos
for select using (auth.role() = 'authenticated');

create policy servicos_write_admin on public.servicos
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- agendamentos
create policy agendamentos_select_admin_or_owner on public.agendamentos
for select using (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
  or auth.uid() = cliente_id
);

create policy agendamentos_insert_admin on public.agendamentos
for insert with check (public.fn_is_admin());

create policy agendamentos_update_admin_or_owner on public.agendamentos
for update using (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
)
with check (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
);

create policy agendamentos_delete_admin on public.agendamentos
for delete using (public.fn_is_admin());

-- financeiro
create policy financeiro_select_admin_or_owner on public.financeiro
for select using (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
);

create policy financeiro_write_admin on public.financeiro
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- receitas_manuais
create policy receitas_manuais_select_admin on public.receitas_manuais
for select using (public.fn_is_admin());

create policy receitas_manuais_write_admin on public.receitas_manuais
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- contas_receber_manuais
create policy contas_receber_manuais_select_admin on public.contas_receber_manuais
for select using (public.fn_is_admin());

create policy contas_receber_manuais_write_admin on public.contas_receber_manuais
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- categorias_despesa
create policy categorias_despesa_select_admin on public.categorias_despesa
for select using (public.fn_is_admin());

create policy categorias_despesa_write_admin on public.categorias_despesa
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- despesas
create policy despesas_select_admin on public.despesas
for select using (public.fn_is_admin());

create policy despesas_write_admin on public.despesas
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- comissoes
create policy comissoes_select_admin_or_owner on public.comissoes
for select using (
  public.fn_is_admin()
  or (public.fn_is_barbeiro() and barbeiro_id = public.fn_meu_barbeiro_id())
);

create policy comissoes_write_admin on public.comissoes
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- configuracao_agenda
create policy configuracao_agenda_select_auth on public.configuracao_agenda
for select using (auth.role() = 'authenticated');

create policy configuracao_agenda_write_admin on public.configuracao_agenda
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- loja_horarios_data
create policy loja_horarios_data_select_auth on public.loja_horarios_data
for select using (auth.role() = 'authenticated');

create policy loja_horarios_data_write_admin on public.loja_horarios_data
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- loja_dias_fechados
create policy loja_dias_fechados_select_auth on public.loja_dias_fechados
for select using (auth.role() = 'authenticated');

create policy loja_dias_fechados_write_admin on public.loja_dias_fechados
for all using (public.fn_is_admin())
with check (public.fn_is_admin());

-- =========================================================
-- DADOS INICIAIS OPCIONAIS
-- =========================================================

insert into public.servicos (nome, preco, duracao_minutos)
values
  ('Corte', 35, 40),
  ('Barba', 25, 30),
  ('Corte + Barba', 55, 70)
on conflict (nome) do nothing;

insert into public.configuracao_agenda (id, hora_abertura, hora_fechamento, intervalo_minutos)
values (1, '09:00', '19:00', 30)
on conflict (id) do nothing;

-- IMPORTANTE:
-- 1) Crie os usuarios no Auth (dashboard Supabase)
-- 2) Depois insira em public.usuarios o id do auth.users + perfil
-- 3) Para barbeiro, crie registro em public.barbeiros vinculando usuario_id

-- =========================================================
-- AGENDAMENTO PUBLICO (CLIENTE)
-- =========================================================

create or replace function public.listar_barbeiros_publico()
returns table (
  id uuid,
  nome text
)
language sql
security definer
set search_path = public
as $$
  select b.id, b.nome
  from public.barbeiros b
  left join public.usuarios u on u.id = b.usuario_id
  where coalesce(u.perfil, 'barbeiro') <> 'admin'
  order by b.nome;
$$;

create or replace function public.listar_servicos_publico()
returns table (
  id uuid,
  nome text,
  preco numeric,
  duracao_minutos integer
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.nome, s.preco, s.duracao_minutos
  from public.servicos s
  order by s.nome;
$$;

create or replace function public.buscar_cliente_por_telefone_publico(p_telefone text)
returns table (
  id uuid,
  nome text,
  telefone text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome, c.telefone
  from public.clientes c
  where lower(coalesce(c.telefone, '')) = lower(coalesce(trim(p_telefone), ''))
  limit 1;
$$;

create or replace function public.cadastrar_cliente_publico(
  p_nome text,
  p_telefone text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if trim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome do cliente e obrigatorio';
  end if;

  insert into public.clientes (nome, telefone, observacao)
  values (
    trim(p_nome),
    nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_observacao, '')), '')
  )
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

create or replace function public.criar_agendamento_publico(
  p_cliente_id uuid default null,
  p_nome text default null,
  p_telefone text default null,
  p_barbeiro_id uuid default null,
  p_servico_id uuid default null,
  p_data date default null,
  p_hora_inicio time default null,
  p_sem_cadastro boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_agendamento_id uuid;
begin
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

  if p_cliente_id is not null then
    v_cliente_id := p_cliente_id;
  else
    if trim(coalesce(p_nome, '')) = '' then
      raise exception 'Nome do cliente e obrigatorio';
    end if;

    insert into public.clientes (nome, telefone, observacao)
    values (
      trim(p_nome),
      nullif(trim(coalesce(p_telefone, '')), ''),
      case
        when p_sem_cadastro then 'Agendamento rapido sem cadastro previo'
        else 'Cadastro via agendamento online'
      end
    )
    returning id into v_cliente_id;
  end if;

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

grant execute on function public.listar_barbeiros_publico() to anon, authenticated;
grant execute on function public.listar_servicos_publico() to anon, authenticated;
grant execute on function public.buscar_cliente_por_telefone_publico(text) to anon, authenticated;
grant execute on function public.cadastrar_cliente_publico(text, text, text) to anon, authenticated;
grant execute on function public.criar_agendamento_publico(uuid, text, text, uuid, uuid, date, time, boolean) to anon, authenticated;

create or replace function public.garantir_cliente_auth(
  p_nome text default null,
  p_telefone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_nome text;
  v_cliente_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Usuario nao autenticado';
  end if;

  v_nome := nullif(trim(coalesce(p_nome, '')), '');
  if v_nome is null then
    v_nome := 'Cliente';
  end if;

  insert into public.usuarios (id, email, nome, perfil, ativo)
  values (
    v_uid,
    nullif(trim(coalesce(p_email, '')), ''),
    v_nome,
    'cliente',
    true
  )
  on conflict (id) do update
    set nome = excluded.nome,
        email = coalesce(excluded.email, public.usuarios.email),
        ativo = true;

  insert into public.clientes (id, nome, telefone, observacao)
  values (
    v_uid,
    v_nome,
    nullif(trim(coalesce(p_telefone, '')), ''),
    'Cadastro via area do cliente'
  )
  on conflict (id) do update
    set nome = excluded.nome,
        telefone = coalesce(excluded.telefone, public.clientes.telefone)
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

create or replace function public.registrar_cliente_auth(
  p_nome text,
  p_telefone text,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.garantir_cliente_auth(p_nome, p_telefone, p_email);
end;
$$;

create or replace function public.definir_usuario_como_barbeiro(
  p_usuario_id uuid,
  p_nome text,
  p_telefone text default null,
  p_comissao numeric default 40
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_barbeiro_id uuid;
begin
  select public.fn_is_admin() into v_is_admin;
  if not v_is_admin then
    raise exception 'Apenas admin pode definir barbeiro';
  end if;

  update public.usuarios
  set perfil = case when perfil = 'admin' then 'admin' else 'barbeiro' end,
      nome = coalesce(nullif(trim(coalesce(p_nome, '')), ''), nome)
  where id = p_usuario_id;

  if not found then
    raise exception 'Usuario nao encontrado';
  end if;

  insert into public.barbeiros (usuario_id, nome, telefone, comissao_percentual)
  values (
    p_usuario_id,
    coalesce(nullif(trim(coalesce(p_nome, '')), ''), 'Barbeiro'),
    nullif(trim(coalesce(p_telefone, '')), ''),
    coalesce(p_comissao, 40)
  )
  on conflict (usuario_id) do update
    set nome = excluded.nome,
        telefone = coalesce(excluded.telefone, public.barbeiros.telefone),
        comissao_percentual = excluded.comissao_percentual
  returning id into v_barbeiro_id;

  return v_barbeiro_id;
end;
$$;

create or replace function public.definir_usuario_como_cliente(
  p_usuario_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select public.fn_is_admin() into v_is_admin;
  if not v_is_admin then
    raise exception 'Apenas admin pode definir cliente';
  end if;

  update public.usuarios
  set perfil = case when perfil = 'admin' then 'admin' else 'cliente' end
  where id = p_usuario_id;

  if not found then
    raise exception 'Usuario nao encontrado';
  end if;

  update public.barbeiros
  set usuario_id = null
  where usuario_id = p_usuario_id;

  return true;
end;
$$;

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

create or replace function public.admin_definir_senha_usuario(
  p_usuario_id uuid,
  p_nova_senha text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_is_admin boolean;
  v_senha text;
begin
  select public.fn_is_admin() into v_is_admin;
  if not v_is_admin then
    raise exception 'Apenas admin pode alterar senhas';
  end if;

  v_senha := coalesce(p_nova_senha, '');
  if length(v_senha) < 6 then
    raise exception 'A senha deve ter no minimo 6 caracteres';
  end if;

  if not exists (
    select 1
    from public.usuarios u
    where u.id = p_usuario_id
  ) then
    raise exception 'Usuario nao encontrado';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_usuario_id;

  if not found then
    raise exception 'Usuario de autenticacao nao encontrado';
  end if;

  return true;
end;
$$;

create or replace function public.listar_usuarios_cadastro_admin()
returns table (
  id uuid,
  nome text,
  email text,
  telefone text,
  data_nascimento date,
  perfil text,
  ativo boolean,
  comissao_percentual numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_is_admin() then
    raise exception 'Apenas admin pode listar usuarios';
  end if;

  return query
  select
    u.id,
    u.nome,
    u.email,
    u.telefone,
    u.data_nascimento,
    u.perfil,
    u.ativo,
    b.comissao_percentual
  from public.usuarios u
  left join public.barbeiros b on b.usuario_id = u.id
  order by u.created_at desc;
end;
$$;

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
  v_result jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'Apenas admin pode acessar o dashboard';
  end if;

  with ag as (
    select a.data, a.status
    from public.agendamentos a
    where a.data >= p_inicio
      and a.data <= p_fim
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
    where f.data >= p_inicio
      and f.data <= p_fim
  ),
  desp as (
    select d.data, d.valor
    from public.despesas d
    where d.data >= p_inicio
      and d.data <= p_fim
  ),
  contas as (
    select coalesce(sum(c.valor), 0) as total
    from public.contas_receber_manuais c
    where c.status = 'pendente'
      and c.data >= p_inicio
      and c.data <= p_fim
  ),
  datas as (
    select data from ag
    union
    select data from fin
    union
    select data from desp
  ),
  fin_por_data as (
    select
      f.data,
      sum(case when f.status_pagamento = 'pago' then f.valor_servico else 0 end) as receita,
      sum(case when f.status_pagamento = 'pago' then f.comissao_barbeiro else 0 end) as comissao
    from fin f
    group by f.data
  ),
  ranking as (
    select
      f.barbeiro as nome,
      sum(f.valor_servico) as total
    from fin f
    where f.status_pagamento = 'pago'
    group by f.barbeiro
    order by total desc
    limit 6
  )
  select jsonb_build_object(
    'totalFaturado', coalesce((select sum(f.valor_servico) from fin f where f.status_pagamento = 'pago'), 0),
    'atendimentos', coalesce((select count(*) from ag where status = 'concluido'), 0),
    'agendamentos', coalesce((select count(*) from ag), 0),
    'topBarbeiro', coalesce(
      (
        select jsonb_build_object('nome', r.nome, 'total', r.total)
        from ranking r
        limit 1
      ),
      'null'::jsonb
    ),
    'contasReceber', coalesce((select sum(f.valor_servico) from fin f where f.status_pagamento = 'pendente'), 0)
      + coalesce((select total from contas), 0),
    'despesas', coalesce((select sum(d.valor) from desp d), 0),
    'comissoes', coalesce((select sum(f.comissao_barbeiro) from fin f where f.status_pagamento = 'pago'), 0),
    'liquido', coalesce((select sum(f.valor_servico - f.comissao_barbeiro) from fin f where f.status_pagamento = 'pago'), 0),
    'series', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'data', ds.data,
            'receita', coalesce(fd.receita, 0),
            'comissao', coalesce(fd.comissao, 0),
            'liquido', coalesce(fd.receita, 0) - coalesce(fd.comissao, 0)
          )
          order by ds.data
        )
        from datas ds
        left join fin_por_data fd on fd.data = ds.data
      ),
      '[]'::jsonb
    ),
    'ranking', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('nome', r.nome, 'total', r.total)
          order by r.total desc
        )
        from ranking r
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.garantir_admin_como_barbeiro()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_nome text;
  v_barbeiro_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not public.fn_is_admin() then
    raise exception 'Apenas admin pode executar esta funcao';
  end if;

  select u.nome into v_nome
  from public.usuarios u
  where u.id = v_uid
  limit 1;

  if v_nome is null then
    v_nome := 'Admin';
  end if;

  insert into public.barbeiros (usuario_id, nome, telefone, comissao_percentual)
  values (v_uid, v_nome, null, 40)
  on conflict (usuario_id) do update
    set nome = excluded.nome
  returning id into v_barbeiro_id;

  return v_barbeiro_id;
end;
$$;

create or replace function public.obter_cliente_auth()
returns table (
  id uuid,
  nome text,
  telefone text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome, c.telefone
  from public.clientes c
  where c.id = auth.uid()
  limit 1;
$$;

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
  v_h_ativo boolean;
  v_h_inicio time;
  v_h_intervalo_inicio time;
  v_h_intervalo_fim time;
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

  v_dow := extract(dow from p_data)::integer;
  select h.ativo, h.hora_inicio, h.hora_intervalo_inicio, h.hora_intervalo_fim, h.hora_fim, h.intervalo_minutos
  into v_h_ativo, v_h_inicio, v_h_intervalo_inicio, v_h_intervalo_fim, v_h_fim, v_h_intervalo
  from public.barbeiro_horarios h
  where h.barbeiro_id = p_barbeiro_id
    and h.dia_semana = v_dow
  limit 1;

  if not found then
    return;
  end if;

  if not coalesce(v_h_ativo, false) then
    return;
  end if;

  v_abertura := coalesce(v_h_inicio, '09:00'::time);
  v_fechamento := coalesce(v_h_fim, '19:00'::time);
  v_intervalo := coalesce(v_h_intervalo, 30);
  v_passo := make_interval(mins => v_intervalo);

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
    if (
      v_h_intervalo_inicio is not null
      and v_h_intervalo_fim is not null
      and v_cursor < v_h_intervalo_fim
      and (v_cursor + make_interval(mins => v_duracao))::time > v_h_intervalo_inicio
    ) then
      v_cursor := greatest((v_cursor + v_passo)::time, v_h_intervalo_fim);
      continue;
    end if;

    if not exists (
      select 1
      from public.agendamentos a
      where a.barbeiro_id = p_barbeiro_id
        and a.data = p_data
        and a.status <> 'cancelado'
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

create or replace function public.obter_configuracao_agenda_publica()
returns table (
  hora_abertura time,
  hora_fechamento time,
  intervalo_minutos integer
)
language sql
security definer
set search_path = public
as $$
  select c.hora_abertura, c.hora_fechamento, c.intervalo_minutos
  from public.configuracao_agenda c
  where c.id = 1;
$$;

create or replace function public.criar_agendamento_cliente_auth(
  p_servico_id uuid,
  p_barbeiro_id uuid,
  p_data date,
  p_hora_inicio time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_agendamento_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not exists (select 1 from public.clientes c where c.id = v_uid) then
    raise exception 'Cliente nao encontrado para o usuario logado';
  end if;

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
    v_uid,
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

create or replace function public.listar_meus_agendamentos()
returns table (
  id uuid,
  barbeiro text,
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

create or replace function public.cancelar_agendamento_cliente(p_agendamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date;
  v_hora time;
  v_status text;
begin
  select a.data, a.hora_inicio, a.status
  into v_data, v_hora, v_status
  from public.agendamentos a
  where a.id = p_agendamento_id
    and a.cliente_id = auth.uid();

  if v_data is null then
    raise exception 'Agendamento nao encontrado para este cliente';
  end if;

  if v_status <> 'agendado' then
    raise exception 'Somente agendamentos com status agendado podem ser cancelados';
  end if;

  if ((v_data::timestamp + v_hora) - now()) <= interval '2 hours' then
    raise exception 'Cancelamento permitido apenas com mais de 2 horas de antecedencia';
  end if;

  update public.agendamentos
  set status = 'cancelado'
  where id = p_agendamento_id
    and cliente_id = auth.uid();
end;
$$;

grant execute on function public.garantir_cliente_auth(text, text, text) to authenticated;
grant execute on function public.registrar_cliente_auth(text, text, text) to authenticated;
grant execute on function public.obter_cliente_auth() to authenticated;
grant execute on function public.horarios_disponiveis_cliente(date, uuid, uuid) to anon, authenticated;
grant execute on function public.criar_agendamento_cliente_auth(uuid, uuid, date, time) to authenticated;
grant execute on function public.listar_meus_agendamentos() to authenticated;
grant execute on function public.cancelar_agendamento_cliente(uuid) to authenticated;
grant execute on function public.definir_usuario_como_barbeiro(uuid, text, text, numeric) to authenticated;
grant execute on function public.definir_usuario_como_cliente(uuid) to authenticated;
grant execute on function public.admin_atualizar_usuario_cadastro(uuid, text, text, text, date) to authenticated;
grant execute on function public.admin_definir_senha_usuario(uuid, text) to authenticated;
grant execute on function public.garantir_admin_como_barbeiro() to authenticated;
grant execute on function public.obter_configuracao_agenda_publica() to anon, authenticated;
grant execute on function public.listar_usuarios_cadastro_admin() to authenticated;
grant execute on function public.dashboard_admin_resumo(date, date) to authenticated;


-- =========================================================
-- CORRECOES CONSOLIDADAS
-- =========================================================
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
  v_h_ativo boolean;
  v_h_inicio time;
  v_h_intervalo_inicio time;
  v_h_intervalo_fim time;
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

  v_dow := extract(dow from p_data)::integer;

  select h.ativo, h.hora_inicio, h.hora_intervalo_inicio, h.hora_intervalo_fim, h.hora_fim, h.intervalo_minutos
  into v_h_ativo, v_h_inicio, v_h_intervalo_inicio, v_h_intervalo_fim, v_h_fim, v_h_intervalo
  from public.barbeiro_horarios h
  where h.barbeiro_id = p_barbeiro_id
    and h.dia_semana = v_dow
  limit 1;

  if not found then
    return;
  end if;

  if not coalesce(v_h_ativo, false) then
    return;
  end if;

  v_abertura := coalesce(v_h_inicio, '09:00'::time);
  v_fechamento := coalesce(v_h_fim, '19:00'::time);
  v_intervalo := coalesce(v_h_intervalo, 30);
  v_passo := make_interval(mins => v_intervalo);

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
    if (
      v_h_intervalo_inicio is not null
      and v_h_intervalo_fim is not null
      and v_cursor < v_h_intervalo_fim
      and (v_cursor + make_interval(mins => v_duracao))::time > v_h_intervalo_inicio
    ) then
      v_cursor := greatest((v_cursor + v_passo)::time, v_h_intervalo_fim);
      continue;
    end if;

    if not exists (
      select 1
      from public.agendamentos a
      where a.barbeiro_id = p_barbeiro_id
        and a.data = p_data
        and a.status not in ('cancelado', 'desistencia_cliente')
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

create or replace function public.before_write_agendamento()
returns trigger
language plpgsql
as $$
declare
  v_duracao integer;
  v_preco numeric(12,2);
  v_abertura time;
  v_fechamento time;
  v_dow integer;
  v_h_ativo boolean;
  v_h_inicio time;
  v_h_intervalo_inicio time;
  v_h_intervalo_fim time;
  v_h_fim time;
begin
  select s.duracao_minutos, s.preco
  into v_duracao, v_preco
  from public.servicos s
  where s.id = new.servico_id;

  if v_duracao is null then
    raise exception 'Servico invalido para este agendamento';
  end if;

  new.hora_fim := (new.hora_inicio + make_interval(mins => v_duracao))::time;
  new.valor := v_preco;

  v_dow := extract(dow from new.data)::integer;

  select h.ativo, h.hora_inicio, h.hora_intervalo_inicio, h.hora_intervalo_fim, h.hora_fim
  into v_h_ativo, v_h_inicio, v_h_intervalo_inicio, v_h_intervalo_fim, v_h_fim
  from public.barbeiro_horarios h
  where h.barbeiro_id = new.barbeiro_id
    and h.dia_semana = v_dow
  limit 1;

  if not found then
    raise exception 'O barbeiro nao possui horario configurado para este dia';
  end if;

  if not coalesce(v_h_ativo, false) then
    raise exception 'O barbeiro nao atende neste dia';
  end if;

  v_abertura := coalesce(v_h_inicio, '09:00'::time);
  v_fechamento := coalesce(v_h_fim, '19:00'::time);

  if v_abertura >= v_fechamento then
    raise exception 'Horario de atendimento invalido para este barbeiro/dia';
  end if;

  if new.hora_inicio < v_abertura or new.hora_fim > v_fechamento then
    raise exception 'Agendamento fora do horario permitido (% - %)', v_abertura, v_fechamento;
  end if;

  if (
    v_h_intervalo_inicio is not null
    and v_h_intervalo_fim is not null
    and new.hora_inicio < v_h_intervalo_fim
    and new.hora_fim > v_h_intervalo_inicio
  ) then
    raise exception 'Agendamento em conflito com o intervalo do barbeiro (% - %)', v_h_intervalo_inicio, v_h_intervalo_fim;
  end if;

  if exists (
    select 1
    from public.agendamentos a
    where a.barbeiro_id = new.barbeiro_id
      and a.data = new.data
      and a.status not in ('cancelado', 'desistencia_cliente')
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (new.hora_inicio < a.hora_fim and new.hora_fim > a.hora_inicio)
  ) then
    raise exception 'Conflito de horario para este barbeiro';
  end if;

  return new;
end;
$$;


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
  v_h_ativo boolean;
  v_h_inicio time;
  v_h_intervalo_inicio time;
  v_h_intervalo_fim time;
  v_h_fim time;
  v_h_intervalo integer;
  v_now_sp timestamptz;
  v_today_sp date;
  v_time_sp time;
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

  v_now_sp := now() at time zone 'America/Sao_Paulo';
  v_today_sp := v_now_sp::date;
  v_time_sp := v_now_sp::time;

  v_dow := extract(dow from p_data)::integer;

  select h.ativo, h.hora_inicio, h.hora_intervalo_inicio, h.hora_intervalo_fim, h.hora_fim, h.intervalo_minutos
  into v_h_ativo, v_h_inicio, v_h_intervalo_inicio, v_h_intervalo_fim, v_h_fim, v_h_intervalo
  from public.barbeiro_horarios h
  where h.barbeiro_id = p_barbeiro_id
    and h.dia_semana = v_dow
  limit 1;

  if not found then
    return;
  end if;

  if not coalesce(v_h_ativo, false) then
    return;
  end if;

  v_abertura := coalesce(v_h_inicio, '09:00'::time);
  v_fechamento := coalesce(v_h_fim, '19:00'::time);
  v_intervalo := coalesce(v_h_intervalo, 30);
  v_passo := make_interval(mins => v_intervalo);

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
    if (
      v_h_intervalo_inicio is not null
      and v_h_intervalo_fim is not null
      and v_cursor < v_h_intervalo_fim
      and (v_cursor + make_interval(mins => v_duracao))::time > v_h_intervalo_inicio
    ) then
      v_cursor := greatest((v_cursor + v_passo)::time, v_h_intervalo_fim);
      continue;
    end if;

    if not exists (
      select 1
      from public.agendamentos a
      where a.barbeiro_id = p_barbeiro_id
        and a.data = p_data
        and a.status not in ('cancelado', 'desistencia_cliente')
        and (v_cursor < a.hora_fim and (v_cursor + make_interval(mins => v_duracao))::time > a.hora_inicio)
    ) then
      if (p_data > v_today_sp) or (p_data = v_today_sp and v_cursor > v_time_sp) then
        hora_inicio := v_cursor;
        return next;
      end if;
    end if;

    v_cursor := (v_cursor + v_passo)::time;
  end loop;
end;
$$;


create or replace function public.atualizar_agendamentos_atrasados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_now_sp timestamp;
  v_today_sp date;
  v_time_sp time;
begin
  v_now_sp := now() at time zone 'America/Sao_Paulo';
  v_today_sp := v_now_sp::date;
  v_time_sp := v_now_sp::time;

  update public.agendamentos a
  set status = 'concluido'
  where a.status = 'agendado'
    and (
      (a.data < v_today_sp)
      or (a.data = v_today_sp and a.hora_fim <= v_time_sp)
    );

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

grant execute on function public.atualizar_agendamentos_atrasados() to authenticated;


create or replace function public.listar_usuarios_cadastro_admin()
returns table (
  id uuid,
  nome text,
  email text,
  telefone text,
  data_nascimento date,
  perfil text,
  ativo boolean,
  comissao_percentual numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_is_admin() then
    raise exception 'Apenas admin pode listar usuarios';
  end if;

  return query
  select
    u.id,
    u.nome,
    u.email,
    coalesce(nullif(trim(coalesce(u.telefone, '')), ''), c.telefone, b.telefone) as telefone,
    u.data_nascimento,
    u.perfil,
    u.ativo,
    b.comissao_percentual
  from public.usuarios u
  left join public.clientes c on c.id = u.id
  left join public.barbeiros b on b.usuario_id = u.id
  order by u.created_at desc;
end;
$$;

grant execute on function public.listar_usuarios_cadastro_admin() to authenticated;

