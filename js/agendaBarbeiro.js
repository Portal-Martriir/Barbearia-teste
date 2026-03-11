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
  const toggleFiltroBtn = document.getElementById('btn-toggle-filtro-agenda-barbeiro');
  const filtrosPanel = document.getElementById('agenda-barbeiro-filtros-panel');
  const quickPeriodButtons = document.querySelectorAll('[data-agenda-barbeiro-quick-period]');
  const agendaBody = document.getElementById('lista-agenda-barbeiro');
  const historicoBody = document.getElementById('historico-barbeiro-body');
  const tabButtons = document.querySelectorAll('[data-agenda-barbeiro-tab]');
  const panelAgendamentos = document.getElementById('agenda-barbeiro-panel-agendamentos');
  const panelRegistro = document.getElementById('agenda-barbeiro-panel-registro');
  const panelManual = document.getElementById('agenda-barbeiro-panel-manual');
  const manualNomeInput = document.getElementById('manual-cliente-nome');
  const manualTelefoneInput = document.getElementById('manual-cliente-telefone');
  const manualServicoSelect = document.getElementById('manual-servico');
  const manualDataInput = document.getElementById('manual-data');
  const manualDataLabel = document.getElementById('manual-data-label');
  const manualSlots = document.getElementById('manual-slots');
  const manualHorarioSelecionado = document.getElementById('manual-horario-selecionado');
  const manualSalvarBtn = document.getElementById('btn-salvar-manual-barbeiro');
  const manualCalTitle = document.getElementById('manual-cal-title');
  const manualCalGrid = document.getElementById('manual-calendar-grid');
  const manualCalPrev = document.getElementById('btn-manual-cal-prev');
  const manualCalNext = document.getElementById('btn-manual-cal-next');
  let manualSelectedSlot = null;
  let manualSlotsRequestId = 0;
  let manualViewMonth = new Date();
  let manualSelectedDate = null;

  if (!agendaDataInicioInput || !agendaDataFimInput || !periodoSelect || !aplicarFiltroBtn || !agendaBody || !historicoBody || !panelAgendamentos || !panelRegistro || !panelManual || !manualNomeInput || !manualTelefoneInput || !manualServicoSelect || !manualDataInput || !manualDataLabel || !manualSlots || !manualHorarioSelecionado || !manualSalvarBtn || !manualCalTitle || !manualCalGrid || !manualCalPrev || !manualCalNext) {
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

  function setFilterPanelState(open) {
    if (!filtrosPanel) return;
    filtrosPanel.classList.toggle('is-open', open);
  }

  function syncQuickPeriodButtons() {
    quickPeriodButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.agendaBarbeiroQuickPeriod === periodoSelect.value);
    });
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
        inicioISO: window.AppUtils.dateToISO(inicioDate),
        fimISO: window.AppUtils.dateToISO(fimDate)
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
      inicioISO: window.AppUtils.dateToISO(inicio),
      fimISO: window.AppUtils.dateToISO(fim)
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

  function renderManualSlots(rows) {
    manualSelectedSlot = null;
    manualHorarioSelecionado.textContent = 'Selecione um horario para confirmar.';

    if (!rows.length) {
      manualSlots.innerHTML = '<p class="muted">Nao ha horarios disponiveis para esta data.</p>';
      return;
    }

    manualSlots.innerHTML = rows.map((slot) => {
      const value = String(slot.hora_inicio).slice(0, 5);
      const safeValue = window.AppUtils.escapeAttr(value);
      return `<button type="button" class="slot-btn" data-manual-hora="${safeValue}">${window.AppUtils.escapeHtml(value)}</button>`;
    }).join('');
  }

  function formatMonth(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function normalizeDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function renderManualCalendar() {
    manualCalTitle.textContent = formatMonth(manualViewMonth);
    manualCalGrid.innerHTML = '';

    const firstDay = new Date(manualViewMonth.getFullYear(), manualViewMonth.getMonth(), 1);
    const lastDay = new Date(manualViewMonth.getFullYear(), manualViewMonth.getMonth() + 1, 0);
    const startWeekDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const todayOnly = normalizeDate(new Date());

    for (let index = 0; index < startWeekDay; index += 1) {
      manualCalGrid.insertAdjacentHTML('beforeend', '<span class="calendar-day muted"> </span>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const current = new Date(manualViewMonth.getFullYear(), manualViewMonth.getMonth(), day);
      const disabled = normalizeDate(current) < todayOnly;
      const isSelected = manualSelectedDate && window.AppUtils.dateToISO(current) === window.AppUtils.dateToISO(manualSelectedDate);

      manualCalGrid.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="calendar-day-btn ${isSelected ? 'active' : ''}" data-manual-date="${window.AppUtils.dateToISO(current)}" ${disabled ? 'disabled' : ''}>${day}</button>`
      );
    }
  }

  async function loadManualServices() {
    const { data, error } = await window.sb.rpc('listar_servicos_publico');
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      manualServicoSelect.innerHTML = '<option value="">Sem servicos disponiveis</option>';
      return;
    }

    manualServicoSelect.innerHTML = rows.map((row) => (
      `<option value="${window.AppUtils.escapeAttr(row.id)}">${window.AppUtils.escapeHtml(`${row.nome} - ${window.AppUtils.formatMoney(row.preco)} (${row.duracao_minutos}m)`)}</option>`
    )).join('');
  }

  async function loadManualSlots() {
    const requestId = ++manualSlotsRequestId;
    manualSelectedSlot = null;
    manualHorarioSelecionado.textContent = 'Selecione um horario para confirmar.';

    if (!barbeiroId || !manualServicoSelect.value || !manualDataInput.value) {
      manualSlots.innerHTML = '<p class="muted">Selecione servico e data para ver os horarios disponiveis.</p>';
      return;
    }

    const { data, error } = await window.sb.rpc('horarios_disponiveis_cliente', {
      p_data: manualDataInput.value,
      p_barbeiro_id: barbeiroId,
      p_servico_id: manualServicoSelect.value
    });
    if (error) throw error;
    if (requestId !== manualSlotsRequestId) return;

    renderManualSlots(data || []);
  }

  function setTab(tab) {
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.agendaBarbeiroTab === tab));
    panelAgendamentos.classList.toggle('active', tab === 'agendamentos');
    panelRegistro.classList.toggle('active', tab === 'registro');
    panelManual.classList.toggle('active', tab === 'manual');
  }

  function currentHashTab() {
    const tab = window.location.hash.replace('#', '').trim();
    return ['agendamentos', 'registro', 'manual'].includes(tab) ? tab : 'agendamentos';
  }

  function applyHashTab() {
    setTab(currentHashTab());
  }

  tabButtons.forEach((btn) => btn.addEventListener('click', () => {
    window.location.hash = btn.dataset.agendaBarbeiroTab;
    applyHashTab();
  }));

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

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55')) return digits;
    return `55${digits}`;
  }

  function whatsappLink(row) {
    const phone = normalizePhone(row.clientes?.telefone);
    if (!phone) return '';
    const nome = String(row.clientes?.nome || 'cliente').trim();
    const data = window.AppUtils.formatDate(row.data);
    const hora = String(row.hora_inicio || '').slice(0, 5);
    const mensagem = `Ola, ${nome}. Aqui e da DomLucasBarberShop. Confirma seu atendimento em ${data} as ${hora}?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
  }

  function telefoneCell(row) {
    const telefone = String(row.clientes?.telefone || '').trim();
    const link = whatsappLink(row);
    if (!telefone || !link) return '-';
    return `<a class="btn-whatsapp" href="${window.AppUtils.escapeAttr(link)}" target="_blank" rel="noopener noreferrer">${window.AppUtils.escapeHtml(telefone)}</a>`;
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

  async function loadRowsByPeriodo(barbeiroId) {
    if (!barbeiroId) {
      return [];
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
        clientes!agendamentos_cliente_id_fkey(nome, telefone),
        servicos(nome)
      `)
      .eq('barbeiro_id', barbeiroId)
      .gte('data', inicioISO)
      .lte('data', fimISO)
      .order('data', { ascending: false })
      .order('hora_inicio', { ascending: false });
    if (error) throw error;

    return rows || [];
  }

  function renderAgenda(rows) {
    if (!barbeiroId) {
      agendaBody.innerHTML = '<tr><td colspan="8">Nenhum agendamento.</td></tr>';
      return;
    }

    agendaBody.innerHTML = rows.length === 0
      ? '<tr><td colspan="8">Sem agendamentos para o periodo selecionado.</td></tr>'
      : rows.map((r) => `
          <tr>
            <td>${window.AppUtils.formatDate(r.data)}</td>
            <td>${String(r.hora_inicio).slice(0, 5)} - ${String(r.hora_fim).slice(0, 5)}</td>
            <td>${r.clientes?.nome || '-'}</td>
            <td>${telefoneCell(r)}</td>
            <td>${r.servicos?.nome || '-'}</td>
            <td><span class="badge ${r.status}">${r.status}</span></td>
            <td><span class="badge ${r.pagamento_pendente ? 'pendente' : 'pago'}">${r.pagamento_pendente ? 'pendente' : 'pago'}</span></td>
            <td>${actionsHtml(r)}</td>
          </tr>
        `).join('');
  }

  function renderHistorico(rows) {
    if (!barbeiroId) {
      historicoBody.innerHTML = '<tr><td colspan="8">Sem historico.</td></tr>';
      return;
    }

    const historico = rows.filter((r) => ['concluido', 'cancelado', 'desistencia_cliente'].includes(r.status));
    historicoBody.innerHTML = historico.length === 0
      ? '<tr><td colspan="8">Sem historico.</td></tr>'
      : historico.map((r) => `
          <tr>
            <td>${r.clientes?.nome || '-'}</td>
            <td>${telefoneCell(r)}</td>
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
    const rows = await loadRowsByPeriodo(barbeiroId);
    renderAgenda(rows);
    renderHistorico(rows);
  }

  periodoSelect.addEventListener('change', () => {
    showDateFilters();
    syncQuickPeriodButtons();
    if (periodoSelect.value === 'personalizado') {
      setFilterPanelState(true);
    }
  });

  aplicarFiltroBtn.addEventListener('click', () => {
    refresh().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  if (toggleFiltroBtn) {
    toggleFiltroBtn.addEventListener('click', () => {
      setFilterPanelState(!filtrosPanel?.classList.contains('is-open'));
    });
  }

  quickPeriodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      periodoSelect.value = button.dataset.agendaBarbeiroQuickPeriod;
      showDateFilters();
      syncQuickPeriodButtons();
      setFilterPanelState(false);
      refresh().catch((err) => window.AppUtils.notify(info, err.message, true));
    });
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

  manualServicoSelect.addEventListener('change', () => {
    loadManualSlots().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  manualCalPrev.addEventListener('click', () => {
    manualViewMonth = new Date(manualViewMonth.getFullYear(), manualViewMonth.getMonth() - 1, 1);
    renderManualCalendar();
  });

  manualCalNext.addEventListener('click', () => {
    manualViewMonth = new Date(manualViewMonth.getFullYear(), manualViewMonth.getMonth() + 1, 1);
    renderManualCalendar();
  });

  manualCalGrid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.calendar-day-btn[data-manual-date]');
    if (!btn) return;

    manualSelectedDate = new Date(`${btn.dataset.manualDate}T00:00:00`);
    manualDataInput.value = btn.dataset.manualDate;
    manualDataLabel.textContent = window.AppUtils.formatDate(manualDataInput.value);
    renderManualCalendar();
    loadManualSlots().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  manualSlots.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-manual-hora]');
    if (!btn) return;

    manualSlots.querySelectorAll('button[data-manual-hora]').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    manualSelectedSlot = btn.dataset.manualHora;
    manualHorarioSelecionado.textContent = `Horario selecionado: ${manualSelectedSlot}`;
  });

  manualSalvarBtn.addEventListener('click', async () => {
    const nomeCliente = String(manualNomeInput.value || '').trim();
    const telefoneCliente = String(manualTelefoneInput.value || '').trim();

    if (!nomeCliente) {
      window.AppUtils.notify(info, 'Informe o nome do cliente.', true);
      return;
    }
    if (!telefoneCliente) {
      window.AppUtils.notify(info, 'Informe o telefone do cliente.', true);
      return;
    }
    if (!manualServicoSelect.value || !manualDataInput.value) {
      window.AppUtils.notify(info, 'Selecione servico e data.', true);
      return;
    }
    if (!manualSelectedSlot) {
      window.AppUtils.notify(info, 'Selecione um horario disponivel.', true);
      return;
    }

    try {
      const { error } = await window.sb.rpc('criar_agendamento_publico', {
        p_cliente_id: null,
        p_nome: nomeCliente,
        p_telefone: telefoneCliente,
        p_barbeiro_id: barbeiroId,
        p_servico_id: manualServicoSelect.value,
        p_data: manualDataInput.value,
        p_hora_inicio: manualSelectedSlot,
        p_sem_cadastro: true
      });
      if (error) throw error;

      manualNomeInput.value = '';
      manualTelefoneInput.value = '';
      manualSelectedSlot = null;
      manualHorarioSelecionado.textContent = 'Selecione um horario para confirmar.';
      await Promise.all([refresh(), loadManualSlots()]);
      window.AppUtils.notify(info, 'Agendamento manual criado com sucesso.');
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  window.addEventListener('hashchange', applyHashTab);

  try {
    showDateFilters();
    syncQuickPeriodButtons();
    if (!window.location.hash) {
      window.location.hash = 'agendamentos';
    }
    applyHashTab();
    barbeiroId = await getMeuBarbeiroId();
    manualSelectedDate = new Date(`${hojeISO}T00:00:00`);
    manualViewMonth = new Date(manualSelectedDate.getFullYear(), manualSelectedDate.getMonth(), 1);
    manualDataInput.value = hojeISO;
    manualDataLabel.textContent = window.AppUtils.formatDate(manualDataInput.value);
    renderManualCalendar();
    await loadManualServices();
    await loadManualSlots();
    await refresh();
    if (!barbeiroId) {
      window.AppUtils.notify(info, 'Nao foi possivel localizar barbeiro para este usuario.', true);
    }
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
