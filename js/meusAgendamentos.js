document.addEventListener('DOMContentLoaded', async () => {
  const info = document.getElementById('meus-agendamentos-info');
  const tbody = document.getElementById('meus-agendamentos-tbody');
  const tabs = document.querySelectorAll('[data-status-tab]');
  let activeStatus = 'agendado';
  let cache = [];

  async function requireSession() {
    const { data, error } = await window.sb.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      window.location.href = '../login.html';
      return null;
    }
    return data.session;
  }

  function timeLabel(v) {
    return String(v).slice(0, 5);
  }

  function renderRows() {
    const rows = cache.filter((r) => {
      if (activeStatus === 'cancelado') {
        return r.status === 'cancelado' || r.status === 'desistencia_cliente';
      }
      return r.status === activeStatus;
    });

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Sem agendamentos nesse status.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.barbeiro}</td>
        <td>${r.servico}</td>
        <td>${window.AppUtils.formatDate(r.data)}</td>
        <td>${timeLabel(r.hora_inicio)} - ${timeLabel(r.hora_fim)}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>
          ${r.status === 'agendado' && r.pode_cancelar
            ? `<button type="button" class="btn-danger" data-cancel-id="${r.id}">Cancelar</button>`
            : '-'}
        </td>
      </tr>
    `).join('');
  }

  async function loadData() {
    const { data, error } = await window.sb.rpc('listar_meus_agendamentos');
    if (error) throw error;
    cache = data || [];
    renderRows();
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeStatus = tab.dataset.statusTab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      renderRows();
    });
  });

  tbody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-cancel-id]');
    if (!btn) return;

    try {
      const { error } = await window.sb.rpc('cancelar_agendamento_cliente', {
        p_agendamento_id: btn.dataset.cancelId
      });
      if (error) throw error;
      window.AppUtils.notify(info, 'Agendamento cancelado com sucesso.');
      await loadData();
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  try {
    const session = await requireSession();
    if (!session) return;

    const profile = await window.Auth.getUserProfile();
    const nome = profile?.nome || session.user.user_metadata?.nome || session.user.email?.split('@')[0] || 'Cliente';

    await window.CommonUI.setupLayout({
      nome,
      email: profile?.email || session.user.email || '',
      perfil: profile?.perfil || 'cliente'
    });
    await loadData();
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
