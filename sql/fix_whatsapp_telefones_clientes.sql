-- =========================================================
-- FIX INCREMENTAL - TELEFONES DOS CLIENTES
-- Nao apaga dados
-- Preenche clientes.telefone com usuarios.telefone quando estiver vazio
-- =========================================================

update public.clientes c
set telefone = u.telefone
from public.usuarios u
where c.usuario_id = u.id
  and nullif(trim(coalesce(c.telefone, '')), '') is null
  and nullif(trim(coalesce(u.telefone, '')), '') is not null;

-- Opcionalmente, alinhar nomes tambem quando estiverem vazios
update public.clientes c
set nome = u.nome
from public.usuarios u
where c.usuario_id = u.id
  and nullif(trim(coalesce(c.nome, '')), '') is null
  and nullif(trim(coalesce(u.nome, '')), '') is not null;
