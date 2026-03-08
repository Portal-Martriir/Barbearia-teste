document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.Auth.requireAuth(['admin']);
  if (!user) return;

  await window.CommonUI.setupLayout(user);

  const info = document.getElementById('config-info');
  const selectBarbeiro = document.getElementById('cfg-barbeiro');
  const semanaRefInput = document.getElementById('cfg-semana-ref');
  const horariosBody = document.getElementById('cfg-barbeiro-horarios-body');
  const btnSalvarBarbeiro = document.getElementById('btn-salvar-horarios-barbeiro');

  const diasSemana = [
    { id: 0, nome: 'Domingo' },
    { id: 1, nome: 'Segunda' },
    { id: 2, nome: 'Terca' },
    { id: 3, nome: 'Quarta' },
    { id: 4, nome: 'Quinta' },
    { id: 5, nome: 'Sexta' },
    { id: 6, nome: 'Sabado' }
  ];

  const defaults = {
    hora_abertura: '09:00',
    hora_fechamento: '19:00',
    intervalo_minutos: 30
  };

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function parseIsoDate(value) {
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return new Date();
    return d;
  }

  function startOfWeekSunday(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function weekDatesMap(refValue) {
    const ref = parseIsoDate(refValue || isoDate(new Date()));
    const start = startOfWeekSunday(ref);
    const map = new Map();
    diasSemana.forEach((dia) => {
      const current = new Date(start);
      current.setDate(start.getDate() + dia.id);
      map.set(dia.id, current);
    });
    return map;
  }

  function renderHorarioRows(horariosMap, datesMap) {
    horariosBody.innerHTML = diasSemana.map((d) => {
      const item = horariosMap.get(d.id) || {};
      const ativo = item.ativo ?? true;
      const inicio = String(item.hora_inicio || defaults.hora_abertura).slice(0, 5);
      const inicioIntervalo = String(item.hora_intervalo_inicio || '').slice(0, 5);
      const voltaIntervalo = String(item.hora_intervalo_fim || '').slice(0, 5);
      const fim = String(item.hora_fim || defaults.hora_fechamento).slice(0, 5);
      const intv = Number(item.intervalo_minutos || defaults.intervalo_minutos);
      const dateRef = datesMap.get(d.id);
      const dateText = dateRef ? window.AppUtils.formatDate(isoDate(dateRef)) : '-';

      return `
        <tr>
          <td>${d.nome}</td>
          <td>${dateText}</td>
          <td>
            <label class="status-switch">
              <input type="checkbox" data-dia="${d.id}" data-field="ativo" ${ativo ? 'checked' : ''} />
              <span class="status-switch-track">
                <span class="status-switch-thumb"></span>
              </span>
              <span class="status-switch-label">${ativo ? 'Ativo' : 'Pausado'}</span>
            </label>
          </td>
          <td><input type="time" data-dia="${d.id}" data-field="inicio" value="${inicio}" /></td>
          <td><input type="time" data-dia="${d.id}" data-field="inicio-intervalo" value="${inicioIntervalo}" /></td>
          <td><input type="time" data-dia="${d.id}" data-field="volta-intervalo" value="${voltaIntervalo}" /></td>
          <td><input type="time" data-dia="${d.id}" data-field="fim" value="${fim}" /></td>
          <td><input type="number" min="5" max="120" step="5" data-dia="${d.id}" data-field="intervalo" value="${intv}" /></td>
        </tr>
      `;
    }).join('');
  }

  async function loadBarbeiros() {
    const { data, error } = await window.sb.rpc('listar_barbeiros_publico');
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) {
      selectBarbeiro.innerHTML = '<option value="">Sem barbeiros cadastrados</option>';
      return;
    }

    selectBarbeiro.innerHTML = rows.map((b) => `<option value="${b.id}">${b.nome}</option>`).join('');
  }

  async function loadHorariosBarbeiro() {
    const barbeiroId = selectBarbeiro.value;
    if (!barbeiroId) {
      horariosBody.innerHTML = '<tr><td colspan="8">Selecione um barbeiro.</td></tr>';
      return;
    }

    const { data, error } = await window.sb
      .from('barbeiro_horarios')
      .select('dia_semana, ativo, hora_inicio, hora_intervalo_inicio, hora_intervalo_fim, hora_fim, intervalo_minutos')
      .eq('barbeiro_id', barbeiroId);
    if (error) throw error;

    const map = new Map((data || []).map((h) => [Number(h.dia_semana), h]));
    const datesMap = weekDatesMap(semanaRefInput.value);
    renderHorarioRows(map, datesMap);
  }

  selectBarbeiro.addEventListener('change', () => {
    loadHorariosBarbeiro().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  semanaRefInput.addEventListener('change', () => {
    loadHorariosBarbeiro().catch((err) => window.AppUtils.notify(info, err.message, true));
  });

  horariosBody.addEventListener('change', (ev) => {
    const input = ev.target.closest('input[data-field="ativo"]');
    if (!input) return;
    const label = input.closest('.status-switch')?.querySelector('.status-switch-label');
    if (label) label.textContent = input.checked ? 'Ativo' : 'Pausado';
  });

  btnSalvarBarbeiro.addEventListener('click', async () => {
    const barbeiroId = selectBarbeiro.value;
    if (!barbeiroId) {
      window.AppUtils.notify(info, 'Selecione um barbeiro.', true);
      return;
    }

    try {
      const rows = diasSemana.map((d) => {
        const ativo = horariosBody.querySelector(`input[data-dia="${d.id}"][data-field="ativo"]`)?.checked ?? true;
        const inicio = horariosBody.querySelector(`input[data-dia="${d.id}"][data-field="inicio"]`)?.value || null;
        const inicioIntervalo = horariosBody.querySelector(`input[data-dia="${d.id}"][data-field="inicio-intervalo"]`)?.value || null;
        const voltaIntervalo = horariosBody.querySelector(`input[data-dia="${d.id}"][data-field="volta-intervalo"]`)?.value || null;
        const fim = horariosBody.querySelector(`input[data-dia="${d.id}"][data-field="fim"]`)?.value || null;
        const intv = Number(horariosBody.querySelector(`input[data-dia="${d.id}"][data-field="intervalo"]`)?.value || defaults.intervalo_minutos);

        if (!ativo) {
          return {
            barbeiro_id: barbeiroId,
            dia_semana: d.id,
            ativo: false,
            hora_inicio: null,
            hora_intervalo_inicio: null,
            hora_intervalo_fim: null,
            hora_fim: null,
            intervalo_minutos: intv
          };
        }

        if (!inicio || !fim) throw new Error(`Preencha inicio e fim para ${d.nome}.`);
        if (inicio >= fim) throw new Error(`Horario invalido em ${d.nome}: inicio deve ser menor que fim.`);
        if ((inicioIntervalo && !voltaIntervalo) || (!inicioIntervalo && voltaIntervalo)) {
          throw new Error(`Preencha inicio e volta do intervalo de ${d.nome}.`);
        }
        if (inicioIntervalo && voltaIntervalo) {
          if (!(inicio < inicioIntervalo && inicioIntervalo < voltaIntervalo && voltaIntervalo < fim)) {
            throw new Error(`Intervalo de almoco invalido em ${d.nome}.`);
          }
        }
        if (!Number.isFinite(intv) || intv < 5 || intv > 120) {
          throw new Error(`Intervalo invalido em ${d.nome}: use um valor entre 5 e 120 minutos.`);
        }

        return {
          barbeiro_id: barbeiroId,
          dia_semana: d.id,
          ativo: true,
          hora_inicio: inicio,
          hora_intervalo_inicio: inicioIntervalo,
          hora_intervalo_fim: voltaIntervalo,
          hora_fim: fim,
          intervalo_minutos: intv
        };
      });

      const { error } = await window.sb.from('barbeiro_horarios').upsert(rows, { onConflict: 'barbeiro_id,dia_semana' });
      if (error) throw error;
      window.AppUtils.notify(info, 'Horarios do barbeiro salvos com sucesso.');
    } catch (err) {
      window.AppUtils.notify(info, err.message, true);
    }
  });

  try {
    semanaRefInput.value = isoDate(new Date());
    await loadBarbeiros();
    await loadHorariosBarbeiro();
  } catch (err) {
    window.AppUtils.notify(info, err.message, true);
  }
});
