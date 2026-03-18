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
    cancelados: document.getElementById('cancelados-hoje'),
    topBarbeiro: document.getElementById('top-barbeiro-hoje'),
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
      inicio: window.AppUtils.dateToISO(inicio),
      fim: window.AppUtils.dateToISO(fim)
    };
  }

  async function loadDashboard() {
    const periodo = periodoSelect.value || 'hoje';
    const { inicio, fim } = periodBounds(periodo);
    const { data, error } = await window.sb.rpc('dashboard_admin_resumo', {
      p_inicio: inicio,
      p_fim: fim
    });
    if (error) throw error;

    const resumo = data || {};
    const top = resumo.topBarbeiro || null;
    const series = Array.isArray(resumo.series)
      ? resumo.series.map((point) => ({
        ...point,
        label: window.AppUtils.formatDate(point.data),
        shortLabel: formatShortDate(point.data)
      }))
      : [];
    const rankingRows = Array.isArray(resumo.ranking) ? resumo.ranking : [];

    cards.totalFaturado.textContent = window.AppUtils.formatMoney(resumo.totalFaturado || 0);
    cards.atendimentos.textContent = String(resumo.atendimentos || 0);
    cards.agendamentos.textContent = String(resumo.agendamentos || 0);
    cards.cancelados.textContent = String(resumo.cancelados || 0);
    cards.topBarbeiro.textContent = top ? `${top.nome} (${window.AppUtils.formatMoney(top.total || 0)})` : 'Sem dados';
    cards.comissoesHoje.textContent = window.AppUtils.formatMoney(resumo.comissoes || 0);
    cards.liquidoHoje.textContent = window.AppUtils.formatMoney(resumo.liquido || 0);
    renderSeriesChart(series);
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
