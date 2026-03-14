drop trigger if exists trg_agendamentos_whatsapp on public.agendamentos;

drop function if exists public.trg_agendamentos_whatsapp() cascade;
drop function if exists public.enfileirar_whatsapp_agendamento(uuid, text) cascade;
drop function if exists public.disparar_mensagem_whatsapp(text, text, text, uuid) cascade;
drop function if exists public.enviar_teste_whatsapp_admin(text) cascade;
drop function if exists public.listar_logs_whatsapp_admin(integer) cascade;
drop function if exists public.obter_configuracao_whatsapp_admin() cascade;
drop function if exists public.salvar_configuracao_whatsapp_admin(boolean, text, text, text, text, text) cascade;
drop function if exists public.salvar_configuracao_whatsapp_admin(boolean, text, text, text, text, text, text) cascade;
drop function if exists public.normalizar_telefone_whatsapp(text, text) cascade;

drop table if exists public.whatsapp_mensagens cascade;
drop table if exists public.whatsapp_configuracao cascade;
