document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.Auth.requireAuth(['barbeiro']);
  if (!user) return;

  await window.CommonUI.setupLayout(user);
  await window.Api.runAutoCompletion();

  const info = document.getElementById('barbeiro-info');
  const agendaDataInicioInput = document.getElementById('agenda-data-inicio-barbeiro');
  const agendaDataFimInput = document.getElementById('agenda-data-fim-barbeiro');
  const periodoSelect = document.getElementById('barbeiro-periodo');
  const inicioWrap = document.getElementById('barbeiro-data-inicio-wrap');
  const fimWrap = document.getElementById('barbeiro-data-fim-wrap');
  const aplicarFiltroBtn = document.getElementById('btn-aplicar-filtro-barbeiro');
  const agendaBody = document.getElementById('lista-agenda-barbeiro');

  if (!periodoSelect || !agendaDataInicioInput || !agendaDataFimInput || !aplicarFiltroBtn || !agendaBody) {
    window.AppUtils.notify(info, 'Elementos obrigatorios do painel nao foram encontrados.', true);
    return;
  }

  const hojeISO = window.AppUtils.todayISO();
  agendaDataInicioInput.value = hojeISO;
  agendaDataFimInput.value = hojeISO;

  function toDateOnly(value) {
    return new Date(`${value}T00:00:00`);
  }

  function toISO(date) {
    return date.toISOString().slice(0, 10);
  }

  function showDateFilters() {
    const periodo = periodoSelect.value || 'hoje';
    const custom = periodo === 'personalizado';

    if (inicioWrap) inicioWrap.hidden = !custom;
    if (fimWrap) fimWrap.hidden = !custom;
  }

  function periodRange(periodo) {
    const hoje = toDateOnly(window.AppUtils.todayISO());
    const inicio = new Date(hoje);
    const fim = new Date(hoje);

    if (periodo === 'ontem') {
      inicio.setDate(inicio.getDate() - 1);
      fim.setDate(fim.getDate() - 1);
    } else if (periodo === 'semana') {
      inicio.setDate(inicio.getDate() - inicio.getDay());
      fim.setDate(inicio.getDate() + 6);
    } else if (periodo === 'mes') {
      inicio.setDate(1);
      fim.setMonth(inicio.getMonth() + 1);
      fim.setDate(0);
    } else if (periodo === 'personalizado') {
      const inicioCustom = agendaDataInicioInput.value;
      const fimCustom = agendaDataFimInput.value;

      if (!inicioCustom || !fimCustom) {
        throw new Error('Informe data inicial e data final para o periodo personalizado.');
      }

      const inicioDate = toDateOnly(inicioCustom);
      const fimDate = toDateOnly(fimCustom);
      if (inicioDate > fimDate) {
        throw new Error('A data inicial nao pode ser maior que a data final.');
      }

      return {
        inicioISO: toISO(inicioDate),
        fimISO: toISO(fimDate)
      };
    }

    return {
      inicioISO: toISO(inicio),
      fimISO: toISO(fim)
    };
  }

  async function getMeuBarbeiroId() {
    const { data, error } = await window.sb
      .from('barbeiros')
      .select('id')
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data?.id || null;
  }

  async function loadAgendamentosPeriodo(barbeiroId) {
    if (!barbeiroId) return [];

    const periodo = periodoSelect.value || 'hoje';
    const { inicioISO, fimISO } = periodRange(periodo);

    const { data, error } = await window.sb
      .from('agendamentos')
      .select(`
        id,
        data,
        hora_inicio,
        hora_fim,
        status,
        pagamento_pendente,
        cliente_id,
        clientes!agendamentos_cliente_id_fkey(nome),
        servicos(nome),
        valor,
        motivo_cancelamento,
        cancelado_em
      `)
      .eq('barbeiro_id', barbeiroId)
      .gte('data', inicioISO)
      .lte('data', fimISO)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  function buildStatusActions(row) {
    if (row.status === 'concluido' || row.status === 'cancelado' || row.status === 'desistencia_cliente') {
      return '-';
    }

    const buttons = [];
    buttons.push(`<button class="btn-danger" data-action="cancelar" data-id="${row.id}">Cancelar</button>`);
    buttons.push(`<button class="btn-warning" data-action="desistencia" data-id="${row.id}">Desistencia</button>`);

    return `<div class="action-wrap">${buttons.join('')}</div>`;
  }

  function formatMotivo(row) {
    if (row.status !== 'cancelado' && row.status !== 'desistencia_cliente') {
      return '-';
    }

    const motivo = String(row.motivo_cancelamento || '').trim();
    if (!motivo) return '-';

    return motivo;
  }

  async function loadResumoPeriodo(barbeiroId) {
    if (!barbeiroId) {
      document.getElementById('card-atendimentos-hoje').textContent = '0';
      document.getElementById('card-faturado-hoje').textContent = window.AppUtils.formatMoney(0);
      document.getElementById('card-comissao-hoje').textContent = window.AppUtils.formatMoney(0);
      document.getElementById('card-proximos-clientes').textContent = 'Sem proximos clientes.';
      return;
    }

    const rows = await loadAgendamentosPeriodo(barbeiroId);
    const { inicioISO, fimISO } = periodRange(periodoSelect.value || 'hoje');

    const { data: comRows, error: comError } = await window.sb
      .from('comissoes')
      .select('valor_comissao, data')
      .eq('barbeiro_id', barbeiroId)
      .gte('data', inicioISO)
      .lte('data', fimISO);
    if (comError) throw comError;

    const agora = new Date();
    const atendimentos = rows.filter((r) => !['cancelado', 'desistencia_cliente'].includes(r.status)).length;
    const faturado = rows
      .filter((r) => r.status === 'concluido')
      .reduce((acc, r) => acc + Number(r.valor || 0), 0);
    const comissao = (comRows || []).reduce((acc, r) => acc + Number(r.valor_comissao || 0), 0);

    const proximos = rows
      .filter((r) => r.status === 'agendado' || r.status === 'em_atendimento')
      .filter((r) => new Date(`${r.data}T${r.hora_inicio}`) >= agora)
      .slice(0, 4);

    document.getElementById('card-atendimentos-hoje').textContent = String(atendimentos);
    document.getElementById('card-faturado-hoje').textContent = window.AppUtils.formatMoney(faturado);
    document.getElementById('card-comissao-hoje').textContent = window.AppUtils.formatMoney(comissao);
    document.getElementById('card-proximos-clientes').innerHTML = proximos.length === 0
      ? 'Sem proximos clientes.'
      : proximos.map((p) => `${window.AppUtils.formatDate(p.data)} ${String(p.hora_inicio).slice(0, 5)} - ${p.clientes?.nome || '-'}`).join('<br/>');
  }

  async function loadAgendaPeriodo(barbeiroId) {
    if (!barbeiroId) {
      agendaBody.innerHTML = '<tr><td colspan="8">Nenhum agendamento.</td></tr>';
      return;
    }

    const rows = await loadAgendamentosPeriodo(barbeiroId);
    agendaBody.innerHTML = rows.length === 0
      ? '<tr><td colspan="8">Sem agendamentos para o periodo selecionado.</td></tr>'
      : rows.map((r) => `
        <tr>
          <td>${window.AppUtils.formatDate(r.data)}</td>
          <td>${String(r.hora_inicio).slice(0, 5)} - ${String(r.hora_fim).slice(0, 5)}</td>
          <td>${r.clientes?.nome || '-'}</td>
          <td>${r.servicos?.nome || '-'}</td>
          <td><span class="badge ${r.status}">${r.status}</span></td>
          <td><span class="badge ${r.pagamento_pendente ? 'pendente' : 'pago'}">${r.pagamento_pendente ? 'pendente' : 'pago'}</span></td>
          <td>${formatMotivo(r)}</td>
          <td>${buildStatusActions(r)}</td>
        </tr>
      `).join('');
  }

  async function persistAgendamentoStatus(id, payload) {
    const { error } = await window.sb
      .from('agendamentos')
      .update(payload)
      .eq('id', id);

    if (!error) return;

    const message = String(error.message || '').toLowerCase();
    const hasCancelExtras = Object.prototype.hasOwnProperty.call(payload, 'motivo_cancelamento')
      || Object.prototype.hasOwnProperty.call(payload, 'cancelado_em')
      || Object.prototype.hasOwnProperty.call(payload, 'cancelado_por');

    if (hasCancelExtras && (message.includes('column') || message.includes('motivo_cancelamento') || message.includes('cancelado_'))) {
      const { error: fallbackError } = await window.sb
        .from('agendamentos')
        .update({ status: payload.status })
        .eq('id', id);

      if (fallbackError) throw fallbackError;
      return;
    }

    throw error;
  }

  async function updateStatusWithValidation(id, nextStatus, motivo = null) {
    const { data: current, error: currentError } = await window.sb
      .from('agendamentos')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) throw new Error('Agendamento nao encontrado.');
    if (current.status === 'concluido') throw new Error('Nao e permitido alterar agendamento concluido.');

    const finais = ['cancelado', 'desistencia_cliente'];
    if (finais.includes(current.status) && nextStatus !== current.status) {
      throw new Error('Agendamento ja finalizado e nao pode ser alterado.');
    }

    const payload = { status: nextStatus };

    if (nextStatus === 'cancelado' || nextStatus === 'desistencia_cliente') {
      payload.motivo_cancelamento = motivo;
      payload.cancelado_em = new Date().toISOString();
      payload.cancelado_por = user.id;
    }

    await persistAgendamentoStatus(id, payload);
  }

  async function refreshAll(barbeiroId) {
    await Promise.all([
      loadResumoPeriodo(barbeiroId),
      loadAgendaPeriodo(barbeiroId)
    ]);
  }

  let barbeiroId = null;

  async function applyFilters() {
    try {
      await refreshAll(barbeiroId);
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  }

  periodoSelect.addEventListener('change', () => {
    showDateFilters();
  });

  aplicarFiltroBtn.addEventListener('click', applyFilters);

  agendaBody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action][data-id]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    try {
      if (action === 'cancelar') {
        const ok = window.confirm('Confirma cancelamento deste atendimento?');
        if (!ok) return;

        const motivo = window.prompt('Informe o motivo do cancelamento:');
        if (motivo === null) return;
        if (!motivo.trim()) {
          throw new Error('Informe o motivo do cancelamento.');
        }

        await updateStatusWithValidation(id, 'cancelado', motivo.trim());
      } else if (action === 'desistencia') {
        const ok = window.confirm('Confirma marcar como desistencia do cliente?');
        if (!ok) return;

        const motivo = window.prompt('Informe o motivo da desistencia:');
        if (motivo === null) return;
        if (!motivo.trim()) {
          throw new Error('Informe o motivo da desistencia.');
        }

        await updateStatusWithValidation(id, 'desistencia_cliente', motivo.trim());
      }

      await refreshAll(barbeiroId);
      window.AppUtils.notify(info, 'Agendamento atualizado com sucesso.');
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  try {
    showDateFilters();
    barbeiroId = await getMeuBarbeiroId();
    await refreshAll(barbeiroId);
    if (!barbeiroId) {
      window.AppUtils.notify(info, 'Nao foi possivel localizar barbeiro para este usuario.', true);
    }
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
