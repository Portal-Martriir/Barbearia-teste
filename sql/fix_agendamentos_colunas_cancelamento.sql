alter table public.agendamentos
  add column if not exists motivo_cancelamento text,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por uuid references public.usuarios(id) on delete set null;
