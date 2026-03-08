# integralissolucoes

Sistema web completo para gerenciamento de barbearia com:
- HTML, CSS e JavaScript puro
- Supabase Auth + Database
- Controle de clientes, barbeiros, servicos, agendamentos, financeiro e comissoes

## Estrutura

```text
/barbearia-app
  /css
    style.css
  /js
    api.js
    auth.js
    common.js
    config.js
    login.js
    dashboard.js
    cadastro.js
    agenda.js
    configuracoes.js
    configuracoesBarbeiro.js
    financeiro.js
    barbeiro.js
    clienteArea.js
    clienteAgendamento.js
    meusAgendamentos.js
    supabaseClient.js
    utils.js
  /pages
    dashboard.html
    agenda.html
    configuracoes.html
    configuracoes-barbeiro.html
    cadastro.html
    financeiro.html
    barbeiro.html
    cliente.html
    cliente-agendamento.html
    meus-agendamentos.html
  /sql
    supabase.sql
  index.html
  login.html
```

## Como rodar local

1. Execute o SQL em `sql/supabase.sql` no editor SQL do Supabase.
2. Crie usuarios no Auth (admin e barbeiro).
3. Insira os usuarios na tabela `public.usuarios` e vincule barbeiro em `public.barbeiros.usuario_id`.
4. Edite `js/config.js` com URL e ANON KEY do seu projeto Supabase.
5. Abra a pasta `barbearia-app` no VS Code.
6. Rode com Live Server (ou qualquer servidor estatico) e abra `login.html`.

## Automacoes implementadas

- Calcula `hora_fim` automaticamente com base no servico.
- Impede conflito de horario para o mesmo barbeiro.
- Muda agendamentos atrasados para `concluido` via `rpc(atualizar_agendamentos_atrasados)`.
- Ao concluir agendamento:
  - grava/atualiza em `financeiro`
  - calcula comissao
  - soma no `saldo_barbeiro`
- Pagamento pode ficar `pago` ou `pendente` apos conclusao.

## Observacao

A funcao de auto conclusao e disparada pelo frontend ao abrir/trocar de tela administrativa. Se quiser 100% server-side por horario sem usuario online, configure um cron (pg_cron/Edge Function) chamando `public.atualizar_agendamentos_atrasados()` periodicamente.

