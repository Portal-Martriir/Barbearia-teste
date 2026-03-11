document.addEventListener('DOMContentLoaded', async () => {
  const info = document.getElementById('cliente-agendamento-info');
  const slotsEl = document.getElementById('cliente-slots');
  const selectedEl = document.getElementById('cliente-horario-selecionado');
  const dataInput = document.getElementById('cliente-data');
  const dataLabel = document.getElementById('cliente-data-label');
  const servicoSelect = document.getElementById('cliente-servico');
  const barbeiroSelect = document.getElementById('cliente-barbeiro');
  const calTitle = document.getElementById('cal-title');
  const calGrid = document.getElementById('calendar-grid');

  if (!info || !slotsEl || !selectedEl || !dataInput || !dataLabel || !servicoSelect || !barbeiroSelect || !calTitle || !calGrid) {
    return;
  }

  const today = new Date();
  let viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = null;
  let selectedSlot = null;
  let slotsRequestId = 0;

  function isoDate(date) {
    return window.AppUtils.dateToISO(date);
  }

  function formatMonth(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function normalizeDate(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function renderOptions(selectEl, list, labelBuilder) {
    if (!list || list.length === 0) {
      selectEl.innerHTML = '<option value="">Sem opcoes disponiveis</option>';
      return;
    }
    selectEl.innerHTML = list.map((item) => (
      `<option value="${window.AppUtils.escapeAttr(item.id)}">${window.AppUtils.escapeHtml(labelBuilder(item))}</option>`
    )).join('');
  }

  async function requireSession() {
    const { data, error } = await window.sb.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      window.location.href = '../login.html';
      return null;
    }
    return data.session;
  }

  async function loadOptions() {
    const [barbeirosRes, servicosRes] = await Promise.all([
      window.sb.rpc('listar_barbeiros_publico'),
      window.sb.rpc('listar_servicos_publico')
    ]);
    if (barbeirosRes.error) throw barbeirosRes.error;
    if (servicosRes.error) throw servicosRes.error;

    renderOptions(barbeiroSelect, barbeirosRes.data || [], (b) => b.nome);
    renderOptions(servicoSelect, servicosRes.data || [], (s) => `${s.nome} - ${window.AppUtils.formatMoney(s.preco)} (${s.duracao_minutos}m)`);
  }

  function renderCalendar() {
    calTitle.textContent = formatMonth(viewMonth);
    calGrid.innerHTML = '';

    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const startWeekDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const todayOnly = normalizeDate(today);

    for (let i = 0; i < startWeekDay; i += 1) {
      calGrid.insertAdjacentHTML('beforeend', '<span class="calendar-day muted"> </span>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const current = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
      const disabled = normalizeDate(current) < todayOnly;
      const isSelected = selectedDate && isoDate(current) === isoDate(selectedDate);

      calGrid.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="calendar-day-btn ${isSelected ? 'active' : ''}" data-date="${isoDate(current)}" ${disabled ? 'disabled' : ''}>${day}</button>`
      );
    }
  }

  async function loadSlots() {
    const requestId = ++slotsRequestId;
    selectedSlot = null;
    selectedEl.textContent = 'Selecione um horario para confirmar.';

    const barbeiroId = barbeiroSelect.value;
    const servicoId = servicoSelect.value;
    if (!barbeiroId || !servicoId || !dataInput.value) {
      slotsEl.innerHTML = '<p class="muted">Selecione servico, barbeiro e data para ver horarios.</p>';
      return;
    }

    try {
      const { data, error } = await window.sb.rpc('horarios_disponiveis_cliente', {
        p_data: dataInput.value,
        p_barbeiro_id: barbeiroId,
        p_servico_id: servicoId
      });
      if (error) throw error;
      if (requestId !== slotsRequestId) return;

      const slots = data || [];
      if (slots.length === 0) {
        slotsEl.innerHTML = '<p class="muted">Nao ha horarios disponiveis para este dia.</p>';
        return;
      }

      slotsEl.innerHTML = slots.map((slot) => {
        const value = String(slot.hora_inicio).slice(0, 5);
        const safeValue = window.AppUtils.escapeAttr(value);
        return `<button type="button" class="slot-btn" data-hora="${safeValue}">${window.AppUtils.escapeHtml(value)}</button>`;
      }).join('');
    } catch (err) {
      if (requestId !== slotsRequestId) return;
      window.AppUtils.notify(info, err.message, true);
    }
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
    selectedDate = new Date(`${btn.dataset.date}T00:00:00`);
    dataInput.value = btn.dataset.date;
    dataLabel.textContent = window.AppUtils.formatDate(dataInput.value);
    renderCalendar();
    await loadSlots();
  });

  slotsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.slot-btn');
    if (!btn) return;
    slotsEl.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSlot = btn.dataset.hora;
    selectedEl.textContent = `Horario selecionado: ${selectedSlot}`;
  });

  [servicoSelect, barbeiroSelect].forEach((el) => el.addEventListener('change', loadSlots));
  dataInput.addEventListener('change', loadSlots);

  window.addEventListener('focus', () => {
    loadSlots().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadSlots().catch(() => {});
    }
  });

  document.getElementById('btn-confirmar-agendamento')?.addEventListener('click', async () => {
    if (!selectedDate || !dataInput.value) {
      window.AppUtils.notify(info, 'Selecione uma data no calendario.', true);
      return;
    }
    if (!selectedSlot) {
      window.AppUtils.notify(info, 'Selecione um horario disponivel.', true);
      return;
    }

    try {
      const { error } = await window.sb.rpc('criar_agendamento_cliente_auth', {
        p_servico_id: servicoSelect.value,
        p_barbeiro_id: barbeiroSelect.value,
        p_data: dataInput.value,
        p_hora_inicio: selectedSlot
      });
      if (error) throw error;

      window.AppUtils.notify(info, 'Agendamento confirmado com sucesso.');
      await loadSlots();
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  try {
    const session = await requireSession();
    if (!session) return;

    const profile = await window.Auth.getUserProfile();
    const nome = profile?.nome || session.user.user_metadata?.nome || session.user.email?.split('@')[0] || 'Cliente';
    const telefone = session.user.user_metadata?.telefone || null;

    const { error: ensureError } = await window.sb.rpc('garantir_cliente_auth', {
      p_nome: nome,
      p_telefone: telefone,
      p_email: session.user.email || null
    });
    if (ensureError) throw ensureError;

    await window.CommonUI.setupLayout({
      nome,
      email: profile?.email || session.user.email || '',
      perfil: profile?.perfil || 'cliente'
    });

    await loadOptions();
    selectedDate = normalizeDate(today);
    dataInput.value = isoDate(selectedDate);
    dataLabel.textContent = window.AppUtils.formatDate(dataInput.value);
    renderCalendar();
    await loadSlots();
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
