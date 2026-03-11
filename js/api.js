window.Api = {
  async runAutoCompletion(force = false) {
    const cacheKey = 'domlucas:auto-completion:last-run';
    const now = Date.now();
    const lastRun = Number(window.sessionStorage.getItem(cacheKey) || 0);

    if (!force && lastRun && now - lastRun < 5 * 60 * 1000) {
      return;
    }

    const { error } = await window.sb.rpc('atualizar_agendamentos_atrasados');
    if (error) {
      console.error('Falha na automacao de conclusao:', error.message);
      return;
    }

    window.sessionStorage.setItem(cacheKey, String(now));
  },

  async updateAgendamento(id, payload) {
    const { error } = await window.sb
      .from('agendamentos')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
  }
};
