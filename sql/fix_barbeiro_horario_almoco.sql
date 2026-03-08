alter table public.barbeiro_horarios
  add column if not exists hora_intervalo_inicio time,
  add column if not exists hora_intervalo_fim time;

alter table public.barbeiro_horarios
  drop constraint if exists barbeiro_horarios_hora_intervalo_check;

alter table public.barbeiro_horarios
  add constraint barbeiro_horarios_hora_intervalo_check
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
  );
