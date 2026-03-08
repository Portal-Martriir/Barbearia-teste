document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.Auth.requireAuth(['barbeiro']);
  if (!user) return;

  await window.CommonUI.setupLayout(user);
  await window.Api.runAutoCompletion();

  const info = document.getElementById('agenda-barbeiro-info');
  const agendaDataInicioInput = document.getElementById('agenda-data-inicio-barbeiro');
  const agendaDataFimInput = document.getElementById('agenda-data-fim-barbeiro');
  const periodoSelect = document.getElementById('agenda-periodo-barbeiro');
  const inicioWrap = document.getElementById('agenda-barbeiro-inicio-wrap');
  const fimWrap = document.getElementById('agenda-barbeiro-fim-wrap');
  const aplicarFiltroBtn = document.getElementById('btn-aplicar-filtro-agenda-barbeiro');
  const agendaBody = document.getElementById('lista-agenda-barbeiro');
  const historicoBody = document.getElementById('historico-barbeiro-body');
  const tabButtons = document.querySelectorAll('[data-agenda-barbeiro-tab]');
  const panelAgendamentos = document.getElementById('agenda-barbeiro-panel-agendamentos');
  const panelRegistro = document.getElementById('agenda-barbeiro-panel-registro');

  if (!agendaDataInicioInput || !agendaDataFimInput || !periodoSelect || !aplicarFiltroBtn || !agendaBody || !historicoBody || !panelAgendamentos || !panelRegistro) {
    window.AppUtils.notify(info, 'Elementos da agenda nao encontrados.', true);
    return;
  }

  const hojeISO = window.AppUtils.todayISO();
  agendaDataInicioInput.value = hojeISO;
  agendaDataFimInput.value = hojeISO;

  function toDateOnly(value) {
    return new Date(`${value}T00:00:00`);
  }

  function showDateFilters() {
    const periodo = periodoSelect.value || 'dia';
    const custom = periodo === 'personalizado';

    if (inicioWrap) inicioWrap.hidden = !custom;
    if (fimWrap) fimWrap.hidden = !custom;
  }

  function periodRange(periodo) {
    if (periodo === 'personalizado') {
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
        inicioISO: inicioDate.toISOString().slice(0, 10),
        fimISO: fimDate.toISOString().slice(0, 10)
      };
    }

    const ref = toDateOnly(hojeISO);
    const inicio = new Date(ref);
    const fim = new Date(ref);

    if (periodo === 'semana') {
      inicio.setDate(inicio.getDate() - inicio.getDay());
      fim.setDate(inicio.getDate() + 6);
    } else if (periodo === 'mes') {
      inicio.setDate(1);
      fim.setMonth(inicio.getMonth() + 1);
      fim.setDate(0);
    }

    return {
      inicioISO: inicio.toISOString().slice(0, 10),
      fimISO: fim.toISOString().slice(0, 10)
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

  function setTab(tab) {
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.agendaBarbeiroTab === tab));
    panelAgendamentos.classList.toggle('active', tab === 'agendamentos');
    panelRegistro.classList.toggle('active', tab === 'registro');
  }

  tabButtons.forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.agendaBarbeiroTab)));

  function actionsHtml(row) {
    if (['concluido', 'cancelado', 'desistencia_cliente'].includes(row.status)) return '-';

    const buttons = [];
    buttons.push(`<button class="btn-danger" data-action="cancelar" data-id="${row.id}">Cancelar</button>`);
    buttons.push(`<button class="btn-warning" data-action="desistencia" data-id="${row.id}">Desistencia</button>`);
    return `<div class="action-wrap">${buttons.join('')}</div>`;
  }

  function formatMotivo(row) {
    if (row.status !== 'cancelado' && row.status !== 'desistencia_cliente') return '-';
    const motivo = String(row.motivo_cancelamento || '').trim();
    return motivo || '-';
  }

  async function updateStatus(id, nextStatus) {
    const { data, error } = await window.sb
      .from('agendamentos')
      .select('status')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Agendamento nao encontrado.');
    if (data.status === 'concluido') throw new Error('Nao e permitido alterar agendamento concluido.');
    if (['cancelado', 'desistencia_cliente'].includes(data.status) && data.status !== nextStatus) {
      throw new Error('Agendamento finalizado nao pode ser alterado.');
    }

    const { error: updateError } = await window.sb.from('agendamentos').update({ status: nextStatus }).eq('id', id);
    if (updateError) throw updateError;
  }

  async function loadAgenda(barbeiroId) {
    if (!barbeiroId) {
      agendaBody.innerHTML = '<tr><td colspan="7">Nenhum agendamento.</td></tr>';
      return;
    }

    const { inicioISO, fimISO } = periodRange(periodoSelect.value || 'dia');
    const { data: rows, error } = await window.sb
      .from('agendamentos')
      .select(`
        id,
        data,
        hora_inicio,
        hora_fim,
        status,
        pagamento_pendente,
        valor,
        motivo_cancelamento,
        clientes!agendamentos_cliente_id_fkey(nome),
        servicos(nome)
      `)
      .eq('barbeiro_id', barbeiroId)
      .gte('data', inicioISO)
      .lte('data', fimISO)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true });
    if (error) throw error;

    agendaBody.innerHTML = (rows || []).length === 0
      ? '<tr><td colspan="7">Sem agendamentos para o periodo selecionado.</td></tr>'
      : rows.map((r) => `
          <tr>
            <td>${window.AppUtils.formatDate(r.data)}</td>
            <td>${String(r.hora_inicio).slice(0, 5)} - ${String(r.hora_fim).slice(0, 5)}</td>
            <td>${r.clientes?.nome || '-'}</td>
            <td>${r.servicos?.nome || '-'}</td>
            <td><span class="badge ${r.status}">${r.status}</span></td>
            <td><span class="badge ${r.pagamento_pendente ? 'pendente' : 'pago'}">${r.pagamento_pendente ? 'pendente' : 'pago'}</span></td>
            <td>${actionsHtml(r)}</td>
          </tr>
        `).join('');
  }

  async function loadHistorico(barbeiroId) {
    if (!barbeiroId) {
      historicoBody.innerHTML = '<tr><td colspan="7">Sem historico.</td></tr>';
      return;
    }

    const { inicioISO, fimISO } = periodRange(periodoSelect.value || 'dia');
    const { data: rows, error } = await window.sb
      .from('agendamentos')
      .select(`
        id,
        data,
        status,
        pagamento_pendente,
        valor,
        motivo_cancelamento,
        clientes!agendamentos_cliente_id_fkey(nome),
        servicos(nome)
      `)
      .eq('barbeiro_id', barbeiroId)
      .gte('data', inicioISO)
      .lte('data', fimISO)
      .order('data', { ascending: false });
    if (error) throw error;

    const historico = (rows || []).filter((r) => ['concluido', 'cancelado', 'desistencia_cliente'].includes(r.status));
    historicoBody.innerHTML = historico.length === 0
      ? '<tr><td colspan="7">Sem historico.</td></tr>'
      : historico.map((r) => `
          <tr>
            <td>${r.clientes?.nome || '-'}</td>
            <td>${r.servicos?.nome || '-'}</td>
            <td>${window.AppUtils.formatMoney(r.valor)}</td>
            <td>${window.AppUtils.formatDate(r.data)}</td>
            <td><span class="badge ${r.status}">${r.status}</span></td>
            <td>${formatMotivo(r)}</td>
            <td><span class="badge ${r.pagamento_pendente ? 'pendente' : 'pago'}">${r.pagamento_pendente ? 'pendente' : 'pago'}</span></td>
          </tr>
        `).join('');
  }

  let barbeiroId = null;

  async function refresh() {
    await Promise.all([
      loadAgenda(barbeiroId),
      loadHistorico(barbeiroId)
    ]);
  }

  periodoSelect.addEventListener('change', () => {
    showDateFilters();
  });

  aplicarFiltroBtn.addEventListener('click', () => {
    refresh().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  agendaBody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action][data-id]');
    if (!btn) return;

    try {
      if (btn.dataset.action === 'cancelar') {
        const ok = window.confirm('Confirma cancelamento deste atendimento?');
        if (!ok) return;
        await updateStatus(btn.dataset.id, 'cancelado');
      } else if (btn.dataset.action === 'desistencia') {
        const ok = window.confirm('Confirma marcar como desistencia do cliente?');
        if (!ok) return;
        await updateStatus(btn.dataset.id, 'desistencia_cliente');
      }

      await refresh();
      window.AppUtils.notify(info, 'Agendamento atualizado com sucesso.');
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  try {
    showDateFilters();
    setTab('agendamentos');
    barbeiroId = await getMeuBarbeiroId();
    await refresh();
    if (!barbeiroId) {
      window.AppUtils.notify(info, 'Nao foi possivel localizar barbeiro para este usuario.', true);
    }
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
