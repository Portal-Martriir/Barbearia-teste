window.Api = {
  async runAutoCompletion() {
    const { error } = await window.sb.rpc('atualizar_agendamentos_atrasados');
    if (error) console.error('Falha na automacao de conclusao:', error.message);
  },

  async fetchBaseCadastros() {
    const [clientes, barbeiros, servicos] = await Promise.all([
      window.sb.from('clientes').select('*').order('nome'),
      window.sb.from('barbeiros').select('*').order('nome'),
      window.sb.from('servicos').select('*').order('nome')
    ]);

    if (clientes.error) throw clientes.error;
    if (barbeiros.error) throw barbeiros.error;
    if (servicos.error) throw servicos.error;

    return {
      clientes: clientes.data,
      barbeiros: barbeiros.data,
      servicos: servicos.data
    };
  },

  async createCliente(payload) {
    const { error } = await window.sb.from('clientes').insert(payload);
    if (error) throw error;
  },

  async createBarbeiro(payload) {
    const { error } = await window.sb.from('barbeiros').insert(payload);
    if (error) throw error;
  },

  async createServico(payload) {
    const { error } = await window.sb.from('servicos').insert(payload);
    if (error) throw error;
  },

  async listAgendamentosByDate(data, barbeiroId = '') {
    let query = window.sb
      .from('agendamentos')
      .select(`
        *,
        clientes(nome),
        barbeiros(nome),
        servicos(nome, duracao_minutos)
      `)
      .eq('data', data)
      .order('hora_inicio', { ascending: true });

    if (barbeiroId) query = query.eq('barbeiro_id', barbeiroId);

    const { data: rows, error } = await query;

    if (error) throw error;
    return rows;
  },

  async createAgendamento(payload) {
    const { error } = await window.sb.from('agendamentos').insert(payload);
    if (error) throw error;
  },

  async updateAgendamento(id, payload) {
    const { error } = await window.sb.from('agendamentos').update(payload).eq('id', id);
    if (error) throw error;
  },

  async deleteAgendamento(id) {
    const { error } = await window.sb.from('agendamentos').delete().eq('id', id);
    if (error) throw error;
  },

  async dashboardAdminHoje() {
    const hoje = window.AppUtils.todayISO();

    const [ag, fin] = await Promise.all([
      window.sb
        .from('agendamentos')
        .select('id, status, data, barbeiro_id, valor, barbeiros(nome)')
        .eq('data', hoje),
      window.sb
        .from('financeiro')
        .select('valor_servico, barbeiro_id, barbeiros(nome)')
        .eq('data', hoje)
    ]);

    if (ag.error) throw ag.error;
    if (fin.error) throw fin.error;

    const atendimentos = ag.data.filter((a) => a.status === 'concluido').length;
    const totalFaturado = fin.data.reduce((acc, row) => acc + Number(row.valor_servico || 0), 0);

    const porBarbeiro = {};
    fin.data.forEach((row) => {
      const nome = row.barbeiros?.nome || 'Sem nome';
      porBarbeiro[nome] = (porBarbeiro[nome] || 0) + Number(row.valor_servico || 0);
    });

    const top = Object.entries(porBarbeiro).sort((a, b) => b[1] - a[1])[0];

    return {
      totalFaturado,
      atendimentos,
      agendamentosHoje: ag.data.length,
      topBarbeiro: top ? `${top[0]} (${window.AppUtils.formatMoney(top[1])})` : 'Sem dados'
    };
  },

  async financeiroResumo(filtros = {}) {
    let query = window.sb
      .from('financeiro')
      .select('*, barbeiros(nome), agendamentos(status, cliente_id, servico_id, clientes(nome), servicos(nome))')
      .order('data', { ascending: false });

    if (filtros.dataInicio) query = query.gte('data', filtros.dataInicio);
    if (filtros.dataFim) query = query.lte('data', filtros.dataFim);
    if (filtros.barbeiroId) query = query.eq('barbeiro_id', filtros.barbeiroId);

    const { data, error } = await query;
    if (error) throw error;

    const servicoNome = filtros.servicoNome?.trim().toLowerCase();
    const filtrado = servicoNome
      ? data.filter((r) => (r.agendamentos?.servicos?.nome || '').toLowerCase().includes(servicoNome))
      : data;

    const hoje = window.AppUtils.todayISO();
    const hojeDate = new Date(hoje + 'T00:00:00');
    const inicioSemana = new Date(hojeDate);
    inicioSemana.setDate(hojeDate.getDate() - hojeDate.getDay());
    const inicioMes = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1);

    const sum = (arr) => arr.reduce((a, b) => a + Number(b.valor_servico || 0), 0);

    return {
      rows: filtrado,
      diario: sum(filtrado.filter((r) => r.data === hoje)),
      semanal: sum(filtrado.filter((r) => new Date(r.data + 'T00:00:00') >= inicioSemana)),
      mensal: sum(filtrado.filter((r) => new Date(r.data + 'T00:00:00') >= inicioMes)),
      pendentes: filtrado.filter((r) => r.status_pagamento === 'pendente'),
      comissoes: filtrado.reduce((a, b) => a + Number(b.comissao_barbeiro || 0), 0)
    };
  },

  async barbeiroPainel(barbeiroId, periodo = 'dia', dataRef = null) {
    const ref = dataRef ? new Date(`${dataRef}T00:00:00`) : new Date();
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const fim = new Date(inicio);

    if (periodo === 'semana') {
      inicio.setDate(inicio.getDate() - inicio.getDay());
      fim.setDate(inicio.getDate() + 6);
    } else if (periodo === 'mes') {
      inicio.setDate(1);
      fim.setMonth(inicio.getMonth() + 1);
      fim.setDate(0);
    }

    const inicioISO = inicio.toISOString().slice(0, 10);
    const fimISO = fim.toISOString().slice(0, 10);

    const [ags, fin, bar] = await Promise.all([
      window.sb
        .from('agendamentos')
        .select('*, clientes(nome), servicos(nome)')
        .eq('barbeiro_id', barbeiroId)
        .gte('data', inicioISO)
        .lte('data', fimISO)
        .order('data', { ascending: false }),
      window.sb
        .from('financeiro')
        .select('*')
        .eq('barbeiro_id', barbeiroId)
        .gte('data', inicioISO)
        .lte('data', fimISO),
      window.sb
        .from('barbeiros')
        .select('saldo_barbeiro, nome')
        .eq('id', barbeiroId)
        .single()
    ]);

    if (ags.error) throw ags.error;
    if (fin.error) throw fin.error;
    if (bar.error) throw bar.error;

    const total = fin.data.reduce((acc, r) => acc + Number(r.comissao_barbeiro || 0), 0);
    const ganhoHoje = fin.data
      .filter((r) => r.data === window.AppUtils.todayISO())
      .reduce((acc, r) => acc + Number(r.comissao_barbeiro || 0), 0);

    return {
      nome: bar.data.nome,
      saldo: bar.data.saldo_barbeiro,
      total,
      ganhoHoje,
      agendamentos: ags.data,
      servicosRealizados: ags.data.filter((a) => a.status === 'concluido').length
    };
  }
};

