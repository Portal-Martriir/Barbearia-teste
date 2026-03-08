document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.Auth.requireAuth(['barbeiro']);
  if (!user) return;

  await window.CommonUI.setupLayout(user);
  await window.Api.runAutoCompletion();

  const info = document.getElementById('agenda-barbeiro-info');
  const agendaDataInput = document.getElementById('agenda-data-barbeiro');
  const periodoSelect = document.getElementById('agenda-periodo-barbeiro');
  const agendaBody = document.getElementById('lista-agenda-barbeiro');

  if (!agendaDataInput || !periodoSelect || !agendaBody) {
    window.AppUtils.notify(info, 'Elementos da agenda nao encontrados.', true);
    return;
  }

  agendaDataInput.value = window.AppUtils.todayISO();

  function toDateOnly(value) {
    return new Date(`${value}T00:00:00`);
  }

  function periodRange(periodo, refDateISO) {
    const ref = toDateOnly(refDateISO || window.AppUtils.todayISO());
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

  function actionsHtml(row) {
    if (['concluido', 'cancelado', 'desistencia_cliente'].includes(row.status)) return '-';

    const buttons = [];
    if (row.status === 'agendado') {
      buttons.push(`<button class="btn-secondary" data-action="iniciar" data-id="${row.id}">Iniciar</button>`);
    }
    buttons.push(`<button class="btn-secondary" data-action="concluir" data-id="${row.id}">Concluir</button>`);
    buttons.push(`<button class="btn-danger" data-action="cancelar" data-id="${row.id}">Cancelar</button>`);
    buttons.push(`<button class="btn-warning" data-action="desistencia" data-id="${row.id}">Desistencia</button>`);
    return `<div class="action-wrap">${buttons.join('')}</div>`;
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

    const { inicioISO, fimISO } = periodRange(periodoSelect.value || 'dia', agendaDataInput.value);
    const { data: rows, error } = await window.sb
      .from('agendamentos')
      .select('id, data, hora_inicio, hora_fim, status, pagamento_pendente, clientes(nome), servicos(nome)')
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

  let barbeiroId = null;

  async function refresh() {
    await loadAgenda(barbeiroId);
  }

  agendaDataInput.addEventListener('change', () => {
    refresh().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  periodoSelect.addEventListener('change', () => {
    refresh().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  agendaBody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action][data-id]');
    if (!btn) return;

    try {
      if (btn.dataset.action === 'iniciar') {
        await updateStatus(btn.dataset.id, 'em_atendimento');
      } else if (btn.dataset.action === 'concluir') {
        await updateStatus(btn.dataset.id, 'concluido');
      } else if (btn.dataset.action === 'cancelar') {
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
    barbeiroId = await getMeuBarbeiroId();
    await refresh();
    if (!barbeiroId) {
      window.AppUtils.notify(info, 'Nao foi possivel localizar barbeiro para este usuario.', true);
    }
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
