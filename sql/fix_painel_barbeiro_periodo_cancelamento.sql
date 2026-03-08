-- Ajustes do painel do barbeiro: status, motivo de cancelamento e historico basico

-- 1) Garantir status com desistencia
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
      AND pg_get_constraintdef(con.oid) ILIKE '%status%agendado%'
  LOOP
    EXECUTE format('ALTER TABLE public.agendamentos DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END
$$;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('agendado', 'em_atendimento', 'concluido', 'cancelado', 'desistencia_cliente'));

-- 2) Campos de historico de cancelamento/desistencia
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES public.usuarios(id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cancelado_em ON public.agendamentos(cancelado_em);

-- 3) Trigger para manter consistencia dos campos de cancelamento
CREATE OR REPLACE FUNCTION public.before_update_agendamento_cancelamento_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('cancelado', 'desistencia_cliente') THEN
    IF NEW.cancelado_em IS NULL THEN
      NEW.cancelado_em := now();
    END IF;

    IF NEW.cancelado_por IS NULL THEN
      NEW.cancelado_por := auth.uid();
    END IF;
  ELSE
    NEW.motivo_cancelamento := NULL;
    NEW.cancelado_em := NULL;
    NEW.cancelado_por := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_cancelamento_meta ON public.agendamentos;

CREATE TRIGGER trg_agendamento_cancelamento_meta
BEFORE UPDATE OF status, motivo_cancelamento
ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.before_update_agendamento_cancelamento_meta();
