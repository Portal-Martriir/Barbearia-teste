window.AppUtils = {
  _notifyModalState: {
    root: null,
    title: null,
    message: null,
    closeBtn: null,
    timer: null
  },
  _inlineNotifyTimers: new WeakMap(),

  pad2(value) {
    return String(value).padStart(2, '0');
  },

  dateToISO(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${this.pad2(date.getMonth() + 1)}-${this.pad2(date.getDate())}`;
  },

  todayISO() {
    return this.dateToISO(new Date());
  },

  formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  },

  formatDate(value) {
    if (!value) return '-';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('pt-BR');
  },

  toDateTime(dateStr, timeStr) {
    return new Date(`${dateStr}T${timeStr}`);
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  escapeAttr(value) {
    return this.escapeHtml(value);
  },

  ensureNotifyModal() {
    if (this._notifyModalState.root) return this._notifyModalState;

    const root = document.createElement('div');
    root.className = 'app-modal-root notify-modal-root';
    root.id = 'global-notify-modal';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <button class="app-modal-backdrop" type="button" aria-label="Fechar aviso"></button>
      <div class="app-modal-dialog notify-modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="global-notify-title">
        <button class="app-modal-close" type="button" aria-label="Fechar">&times;</button>
        <div class="app-modal-header">
          <h3 id="global-notify-title">Aviso</h3>
          <p class="muted" id="global-notify-message"></p>
        </div>
        <div class="app-modal-actions">
          <button type="button" class="btn-primary">Fechar</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const close = () => {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      if (this._notifyModalState.timer) {
        window.clearTimeout(this._notifyModalState.timer);
        this._notifyModalState.timer = null;
      }
    };

    root.querySelector('.app-modal-backdrop')?.addEventListener('click', close);
    root.querySelector('.app-modal-close')?.addEventListener('click', close);
    root.querySelector('.app-modal-actions .btn-primary')?.addEventListener('click', close);

    this._notifyModalState = {
      root,
      title: root.querySelector('#global-notify-title'),
      message: root.querySelector('#global-notify-message'),
      closeBtn: root.querySelector('.app-modal-actions .btn-primary'),
      timer: null
    };

    return this._notifyModalState;
  },

  notify(el, msg, isError = false) {
    if (el) {
      const currentTimer = this._inlineNotifyTimers.get(el);
      if (currentTimer) {
        window.clearTimeout(currentTimer);
      }

      el.className = isError ? 'error' : 'info';
      el.textContent = msg;

      const hideTimer = window.setTimeout(() => {
        el.className = 'muted';
        el.textContent = '';
        this._inlineNotifyTimers.delete(el);
      }, isError ? 5000 : 3000);

      this._inlineNotifyTimers.set(el, hideTimer);
    }

    const modal = this.ensureNotifyModal();
    if (!modal.root || !modal.title || !modal.message) return;

    modal.root.hidden = false;
    modal.root.setAttribute('aria-hidden', 'false');
    modal.root.classList.toggle('is-error', isError);
    modal.root.classList.toggle('is-success', !isError);
    modal.title.textContent = isError ? 'Erro' : 'Alteracao realizada';
    modal.message.textContent = msg;

    if (modal.closeBtn) {
      modal.closeBtn.textContent = isError ? 'Fechar' : 'Ok';
      modal.closeBtn.className = isError ? 'btn-secondary' : 'btn-primary';
    }

    if (this._notifyModalState.timer) {
      window.clearTimeout(this._notifyModalState.timer);
    }

    this._notifyModalState.timer = window.setTimeout(() => {
      if (!modal.root.hidden) {
        modal.root.hidden = true;
        modal.root.setAttribute('aria-hidden', 'true');
      }
      this._notifyModalState.timer = null;
    }, isError ? 5000 : 3000);
  }
};
