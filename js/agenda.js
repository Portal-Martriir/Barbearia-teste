document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.Auth.requireAuth(['admin']);
  if (!user) return;

  await window.CommonUI.setupLayout(user);
  await window.Api.runAutoCompletion();

  const info = document.getElementById('agenda-info');
  const tbody = document.getElementById('lista-agendamentos');
  const filtroBarbeiro = document.getElementById('filtro-barbeiro');
  const dataInput = document.getElementById('filtro-data');
  const dataLabel = document.getElementById('agenda-data-label');
  const calTitle = document.getElementById('cal-title');
  const calGrid = document.getElementById('calendar-grid');

  if (!tbody || !filtroBarbeiro || !dataInput || !dataLabel || !calTitle || !calGrid) {
    window.AppUtils.notify(info, 'Elementos da agenda nao foram encontrados.', true);
    return;
  }

  let selectedDate = new Date();
  let viewMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatMonth(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function normalizeDate(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  async function loadBarbeirosFilter() {
    const { data, error } = await window.sb.rpc('listar_barbeiros_publico');
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) {
      filtroBarbeiro.innerHTML = '<option value="">Sem barbeiros cadastrados</option>';
      return;
    }

    const options = ['<option value="">Todos os barbeiros</option>']
      .concat(rows.map((b) => `<option value="${b.id}">${b.nome}</option>`));
    filtroBarbeiro.innerHTML = options.join('');
  }

  function renderCalendar() {
    calTitle.textContent = formatMonth(viewMonth);
    calGrid.innerHTML = '';

    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const startWeekDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const today = normalizeDate(new Date());

    for (let i = 0; i < startWeekDay; i += 1) {
      calGrid.insertAdjacentHTML('beforeend', '<span class="calendar-day muted"> </span>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const current = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
      const disabled = normalizeDate(current) < today;
      const active = isoDate(current) === isoDate(selectedDate);
      calGrid.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="calendar-day-btn ${active ? 'active' : ''}" data-date="${isoDate(current)}" ${disabled ? 'disabled' : ''}>${day}</button>`
      );
    }
  }

  function updateSelectedDate(date) {
    selectedDate = date;
    dataInput.value = isoDate(date);
    dataLabel.textContent = window.AppUtils.formatDate(dataInput.value);
    renderCalendar();
  }

  function actionsForRow(row) {
    const locked = ['concluido', 'cancelado', 'desistencia_cliente'].includes(row.status);
    if (locked) {
      return '<span class="muted">Sem acoes</span>';
    }

    return `
      <div class="action-wrap">
        ${row.status === 'agendado' ? `<button class="btn-secondary" data-action="iniciar" data-id="${row.id}">Iniciar</button>` : ''}
        <button class="btn-secondary" data-action="concluir" data-id="${row.id}">Concluir</button>
        <button class="btn-danger" data-action="cancelar" data-id="${row.id}">Cancelar</button>
        <button class="btn-warning" data-action="desistencia" data-id="${row.id}">Desistencia</button>
        <button class="btn-secondary" data-action="pagto" data-id="${row.id}" data-next="${row.pagamento_status === 'pago' ? 'pendente' : 'pago'}">
          ${row.pagamento_status === 'pago' ? 'Marcar pendente' : 'Marcar pago'}
        </button>
      </div>
    `;
  }

  async function loadAgendamentos() {
    try {
      await window.Api.runAutoCompletion();
      const rows = await window.Api.listAgendamentosByDate(dataInput.value, filtroBarbeiro.value);

      tbody.innerHTML = rows.length === 0
        ? '<tr><td colspan="8">Sem agendamentos para a data selecionada.</td></tr>'
        : rows.map((r) => `
          <tr>
            <td>${r.clientes?.nome || '-'}</td>
            <td>${r.barbeiros?.nome || '-'}</td>
            <td>${r.servicos?.nome || '-'}</td>
            <td>${String(r.hora_inicio).slice(0, 5)} - ${String(r.hora_fim).slice(0, 5)}</td>
            <td><span class="badge ${r.status}">${r.status}</span></td>
            <td><span class="badge ${r.pagamento_status}">${r.pagamento_status}</span></td>
            <td>${window.AppUtils.formatMoney(r.valor)}</td>
            <td>${actionsForRow(r)}</td>
          </tr>
        `).join('');
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
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

    const finais = ['cancelado', 'desistencia_cliente'];
    if (finais.includes(data.status) && data.status !== nextStatus) {
      throw new Error('Agendamento finalizado nao pode ser alterado.');
    }

    await window.Api.updateAgendamento(id, { status: nextStatus });
  }

  document.getElementById('btn-cal-prev')?.addEventListener('click', () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  document.getElementById('btn-cal-next')?.addEventListener('click', () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  calGrid.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.calendar-day-btn[data-date]');
    if (!btn) return;
    updateSelectedDate(new Date(`${btn.dataset.date}T00:00:00`));
    await loadAgendamentos();
  });

  filtroBarbeiro.addEventListener('change', loadAgendamentos);

  tbody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    try {
      if (action === 'iniciar') await updateStatus(id, 'em_atendimento');
      if (action === 'concluir') await updateStatus(id, 'concluido');
      if (action === 'cancelar') {
        const ok = window.confirm('Confirma o cancelamento deste agendamento?');
        if (!ok) return;
        await updateStatus(id, 'cancelado');
      }
      if (action === 'desistencia') {
        const ok = window.confirm('Confirma marcar como desistencia do cliente?');
        if (!ok) return;
        await updateStatus(id, 'desistencia_cliente');
      }
      if (action === 'pagto') await window.Api.updateAgendamento(id, { pagamento_status: btn.dataset.next });

      await loadAgendamentos();
      window.AppUtils.notify(info, 'Agendamento atualizado.');
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  try {
    await loadBarbeirosFilter();
    updateSelectedDate(selectedDate);
    await loadAgendamentos();
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
