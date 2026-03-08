-- Ajustes para status de desistencia e validacao de horario do barbeiro

-- 1) Expandir constraint de status do agendamento
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'agendamentos'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%agendado%cancelado%'
  LOOP
    EXECUTE format('ALTER TABLE public.agendamentos DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END
$$;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('agendado', 'em_atendimento', 'concluido', 'cancelado', 'desistencia_cliente'));

-- 2) Validar horario de funcionamento + conflito ao gravar agendamento
CREATE OR REPLACE FUNCTION public.before_write_agendamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_duracao integer;
  v_preco numeric(12,2);
  v_abertura time;
  v_fechamento time;
  v_intervalo integer;
  v_dow integer;
  v_tem_regra_dia boolean := false;
  v_loja_ativo boolean;
  v_loja_inicio time;
  v_loja_fim time;
  v_loja_intervalo integer;
  v_dia_fechado boolean;
  v_h_ativo boolean;
  v_h_inicio time;
  v_h_fim time;
  v_h_intervalo integer;
BEGIN
  SELECT s.duracao_minutos, s.preco
  INTO v_duracao, v_preco
  FROM public.servicos s
  WHERE s.id = NEW.servico_id;

  IF v_duracao IS NULL THEN
    RAISE EXCEPTION 'Servico invalido para este agendamento';
  END IF;

  NEW.hora_fim := (NEW.hora_inicio + make_interval(mins => v_duracao))::time;
  NEW.valor := v_preco;

  SELECT c.hora_abertura, c.hora_fechamento, c.intervalo_minutos
  INTO v_abertura, v_fechamento, v_intervalo
  FROM public.configuracao_agenda c
  WHERE c.id = 1;

  IF v_abertura IS NULL OR v_fechamento IS NULL OR v_intervalo IS NULL THEN
    v_abertura := '09:00'::time;
    v_fechamento := '19:00'::time;
    v_intervalo := 30;
  END IF;

  SELECT ld.ativo, ld.hora_inicio, ld.hora_fim, ld.intervalo_minutos
  INTO v_loja_ativo, v_loja_inicio, v_loja_fim, v_loja_intervalo
  FROM public.loja_horarios_data ld
  WHERE ld.data = NEW.data
  LIMIT 1;

  IF FOUND THEN
    v_tem_regra_dia := true;
    IF NOT COALESCE(v_loja_ativo, false) THEN
      RAISE EXCEPTION 'A loja esta fechada na data selecionada';
    END IF;
    v_abertura := COALESCE(v_loja_inicio, v_abertura);
    v_fechamento := COALESCE(v_loja_fim, v_fechamento);
    v_intervalo := COALESCE(v_loja_intervalo, v_intervalo);
  END IF;

  v_dow := extract(dow from NEW.data)::integer;
  IF NOT v_tem_regra_dia THEN
    SELECT ldf.fechado
    INTO v_dia_fechado
    FROM public.loja_dias_fechados ldf
    WHERE ldf.dia_semana = v_dow
    LIMIT 1;

    IF COALESCE(v_dia_fechado, false) THEN
      RAISE EXCEPTION 'A loja esta fechada neste dia da semana';
    END IF;
  END IF;

  SELECT h.ativo, h.hora_inicio, h.hora_fim, h.intervalo_minutos
  INTO v_h_ativo, v_h_inicio, v_h_fim, v_h_intervalo
  FROM public.barbeiro_horarios h
  WHERE h.barbeiro_id = NEW.barbeiro_id
    AND h.dia_semana = v_dow
  LIMIT 1;

  IF FOUND THEN
    IF NOT COALESCE(v_h_ativo, false) THEN
      RAISE EXCEPTION 'O barbeiro nao atende neste dia';
    END IF;

    IF v_h_inicio IS NOT NULL THEN
      v_abertura := greatest(v_abertura, v_h_inicio);
    END IF;

    IF v_h_fim IS NOT NULL THEN
      v_fechamento := least(v_fechamento, v_h_fim);
    END IF;

    v_intervalo := COALESCE(v_h_intervalo, v_intervalo);
  END IF;

  IF v_abertura >= v_fechamento THEN
    RAISE EXCEPTION 'Horario de atendimento invalido para este barbeiro/dia';
  END IF;

  IF NEW.hora_inicio < v_abertura OR NEW.hora_fim > v_fechamento THEN
    RAISE EXCEPTION 'Agendamento fora do horario permitido (% - %)', v_abertura, v_fechamento;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.barbeiro_id = NEW.barbeiro_id
      AND a.data = NEW.data
      AND a.status NOT IN ('cancelado', 'desistencia_cliente')
      AND a.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (NEW.hora_inicio < a.hora_fim AND NEW.hora_fim > a.hora_inicio)
  ) THEN
    RAISE EXCEPTION 'Conflito de horario para este barbeiro';
  END IF;

  RETURN NEW;
END;
$$;
