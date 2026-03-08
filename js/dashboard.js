document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.Auth.requireAuth(['admin']);
  if (!user) return;

  await window.CommonUI.setupLayout(user);
  await window.Api.runAutoCompletion();

  const info = document.getElementById('dashboard-info');
  const periodoSelect = document.getElementById('dashboard-periodo');
  const seriesChart = document.getElementById('dashboard-chart-series');
  const rankingChart = document.getElementById('dashboard-chart-ranking');

  const cards = {
    totalFaturado: document.getElementById('total-faturado-hoje'),
    atendimentos: document.getElementById('atendimentos-hoje'),
    agendamentos: document.getElementById('agendamentos-hoje'),
    topBarbeiro: document.getElementById('top-barbeiro-hoje'),
    contasReceber: document.getElementById('dashboard-contas-receber'),
    despesasHoje: document.getElementById('dashboard-despesas-hoje'),
    comissoesHoje: document.getElementById('dashboard-comissoes-hoje'),
    liquidoHoje: document.getElementById('dashboard-liquido-hoje')
  };

  function formatShortDate(isoDate) {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  function renderSeriesChart(points) {
    if (!seriesChart) return;
    if (!points.length) {
      seriesChart.innerHTML = '<div class="chart-series-empty">Sem movimentacao para exibir no periodo.</div>';
      return;
    }

    const maxValue = Math.max(
      ...points.flatMap((point) => [point.receita, point.comissao, point.liquido]),
      1
    );

    const legend = `
      <div class="chart-legend">
        <span class="chart-legend-item"><span class="chart-legend-swatch series-receita"></span>Receita</span>
        <span class="chart-legend-item"><span class="chart-legend-swatch series-comissao"></span>Comissoes</span>
        <span class="chart-legend-item"><span class="chart-legend-swatch series-liquido"></span>Lucro liquido</span>
      </div>
    `;

    const bars = points.map((point) => {
      const receitaHeight = Math.max(10, (point.receita / maxValue) * 100);
      const comissaoHeight = Math.max(10, (point.comissao / maxValue) * 100);
      const liquidoHeight = Math.max(10, (point.liquido / maxValue) * 100);

      return `
        <div class="chart-group" title="${point.label}">
          <div class="chart-group-bars">
            <div class="chart-bar series-receita" style="height:${receitaHeight}%;" title="Receita: ${window.AppUtils.formatMoney(point.receita)}"></div>
            <div class="chart-bar series-comissao" style="height:${comissaoHeight}%;" title="Comissoes: ${window.AppUtils.formatMoney(point.comissao)}"></div>
            <div class="chart-bar series-liquido" style="height:${liquidoHeight}%;" title="Lucro liquido: ${window.AppUtils.formatMoney(point.liquido)}"></div>
          </div>
          <div class="chart-group-label">${point.shortLabel}</div>
        </div>
      `;
    }).join('');

    seriesChart.innerHTML = `${legend}<div class="chart-bars">${bars}</div>`;
  }

  function renderRankingChart(rows) {
    if (!rankingChart) return;
    if (!rows.length) {
      rankingChart.innerHTML = '<div class="chart-ranking-empty">Sem barbeiros com faturamento no periodo.</div>';
      return;
    }

    const maxValue = Math.max(...rows.map((row) => row.total), 1);
    rankingChart.innerHTML = rows.map((row) => {
      const width = Math.max(8, (row.total / maxValue) * 100);
      return `
        <div class="chart-ranking-row">
          <div class="chart-ranking-name" title="${row.nome}">${row.nome}</div>
          <div class="chart-ranking-track">
            <div class="chart-ranking-fill" style="width:${width}%;"></div>
          </div>
          <div class="chart-ranking-value">${window.AppUtils.formatMoney(row.total)}</div>
        </div>
      `;
    }).join('');
  }

  function periodBounds(tipo) {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    if (tipo === 'semana') {
      inicio.setDate(inicio.getDate() - inicio.getDay());
    } else if (tipo === 'mes') {
      inicio.setDate(1);
    }

    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    if (tipo === 'semana') {
      fim.setDate(inicio.getDate() + 6);
    } else if (tipo === 'mes') {
      fim.setMonth(inicio.getMonth() + 1);
      fim.setDate(0);
    }

    return {
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10)
    };
  }

  async function loadDashboard() {
    const periodo = periodoSelect.value || 'hoje';
    const { inicio, fim } = periodBounds(periodo);

    const [agRes, finRes, despRes, contasManuaisRes] = await Promise.all([
      window.sb
        .from('agendamentos')
        .select('data, hora_inicio, status, valor, clientes(nome), barbeiros(nome), servicos(nome)')
        .gte('data', inicio)
        .lte('data', fim)
        .order('data', { ascending: true })
        .order('hora_inicio', { ascending: true }),
      window.sb
        .from('financeiro')
        .select('data, valor_servico, comissao_barbeiro, status_pagamento, barbeiros(nome), agendamentos(clientes(nome), servicos(nome))')
        .gte('data', inicio)
        .lte('data', fim),
      window.sb
        .from('despesas')
        .select('data, descricao, valor')
        .gte('data', inicio)
        .lte('data', fim),
      window.sb
        .from('contas_receber_manuais')
        .select('id, data, descricao, valor, status')
        .eq('status', 'pendente')
        .gte('data', inicio)
        .lte('data', fim)
    ]);

    if (agRes.error) throw agRes.error;
    if (finRes.error) throw finRes.error;
    if (despRes.error) throw despRes.error;

    const agRows = agRes.data || [];
    const finRows = finRes.data || [];
    const despRows = despRes.data || [];

    const finPagos = finRows.filter((r) => r.status_pagamento === 'pago');
    const finPendentes = finRows.filter((r) => r.status_pagamento === 'pendente');

    const totalFaturado = finPagos.reduce((acc, r) => acc + Number(r.valor_servico || 0), 0);
    const totalComissoes = finPagos.reduce((acc, r) => acc + Number(r.comissao_barbeiro || 0), 0);
    const totalDespesas = despRows.reduce((acc, r) => acc + Number(r.valor || 0), 0);
    const totalLiquido = totalFaturado - totalComissoes;

    const atendimentosConcluidos = agRows.filter((a) => a.status === 'concluido').length;
    const agendamentosPeriodo = agRows.length;

    const porBarbeiro = {};
    finPagos.forEach((row) => {
      const nome = row.barbeiros?.nome || 'Sem nome';
      porBarbeiro[nome] = (porBarbeiro[nome] || 0) + Number(row.valor_servico || 0);
    });
    const top = Object.entries(porBarbeiro).sort((a, b) => b[1] - a[1])[0];

    const contasManuais = contasManuaisRes.error ? [] : (contasManuaisRes.data || []);
    const totalContas = finPendentes.reduce((acc, r) => acc + Number(r.valor_servico || 0), 0)
      + contasManuais.reduce((acc, r) => acc + Number(r.valor || 0), 0);

    const groupedByDate = new Map();
    const allDates = new Set([
      ...agRows.map((row) => row.data),
      ...finRows.map((row) => row.data),
      ...despRows.map((row) => row.data)
    ]);

    Array.from(allDates)
      .sort()
      .forEach((date) => {
        groupedByDate.set(date, {
          label: window.AppUtils.formatDate(date),
          shortLabel: formatShortDate(date),
          receita: 0,
          comissao: 0,
          liquido: 0
        });
      });

    finPagos.forEach((row) => {
      const bucket = groupedByDate.get(row.data);
      if (!bucket) return;
      bucket.receita += Number(row.valor_servico || 0);
      bucket.comissao += Number(row.comissao_barbeiro || 0);
      bucket.liquido += Number(row.valor_servico || 0) - Number(row.comissao_barbeiro || 0);
    });

    const rankingRows = Object.entries(porBarbeiro)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    cards.totalFaturado.textContent = window.AppUtils.formatMoney(totalFaturado);
    cards.atendimentos.textContent = String(atendimentosConcluidos);
    cards.agendamentos.textContent = String(agendamentosPeriodo);
    cards.topBarbeiro.textContent = top ? `${top[0]} (${window.AppUtils.formatMoney(top[1])})` : 'Sem dados';
    cards.contasReceber.textContent = window.AppUtils.formatMoney(totalContas);
    cards.despesasHoje.textContent = window.AppUtils.formatMoney(totalDespesas);
    cards.comissoesHoje.textContent = window.AppUtils.formatMoney(totalComissoes);
    cards.liquidoHoje.textContent = window.AppUtils.formatMoney(totalLiquido);
    renderSeriesChart(Array.from(groupedByDate.values()));
    renderRankingChart(rankingRows);
  }

  periodoSelect.addEventListener('change', () => {
    loadDashboard().catch((err) => {
      info.textContent = err.message;
    });
  });

  try {
    await loadDashboard();
  } catch (err) {
    info.textContent = err.message;
  }
});
