window.CommonUI = {
  syncResponsiveTable(table) {
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach((row) => {
      const cells = Array.from(row.children);
      const singleCell = cells.length === 1 && cells[0].tagName === 'TD';

      cells.forEach((cell, index) => {
        if (cell.tagName !== 'TD') return;

        if (singleCell || Number(cell.colSpan || 1) > 1) {
          cell.classList.add('table-empty-cell');
          cell.removeAttribute('data-label');
          return;
        }

        cell.classList.remove('table-empty-cell');
        cell.setAttribute('data-label', headers[index] || '');
      });
    });
  },

  enhanceResponsiveTables(root = document) {
    const tables = root.querySelectorAll('.table');

    tables.forEach((table) => {
      this.syncResponsiveTable(table);

      if (table.dataset.responsiveObserved === 'true') return;
      table.dataset.responsiveObserved = 'true';

      const observer = new MutationObserver(() => this.syncResponsiveTable(table));
      observer.observe(table, { childList: true, subtree: true });
    });
  },

  navHref(inPages, fileName) {
    return inPages ? `./${fileName}` : `./pages/${fileName}`;
  },

  getNavSections(perfil, inPages) {
    const href = (fileName) => this.navHref(inPages, fileName);

    if (perfil === 'admin') {
      return [
        {
          label: 'Inicio',
          href: href('dashboard.html')
        },
        {
          label: 'Cadastros',
          children: [
            { label: 'Usuarios', href: `${href('cadastro.html')}#usuarios` },
            { label: 'Servicos', href: `${href('cadastro.html')}#servicos` },
            { label: 'Despesas', href: `${href('cadastro.html')}#despesas` }
          ]
        },
        {
          label: 'Agenda',
          href: href('agenda.html')
        },
        {
          label: 'Configuracoes',
          children: [
            { label: 'Horarios', href: `${href('configuracoes.html')}#horarios` },
            { label: 'Trocar senha', href: `${href('configuracoes.html')}#senhas` }
          ]
        },
        {
          label: 'Financeiro',
          children: [
            { label: 'Geral', href: `${href('financeiro.html')}#geral` },
            { label: 'Receitas', href: `${href('financeiro.html')}#receitas` },
            { label: 'Despesas', href: `${href('financeiro.html')}#despesas` },
            { label: 'Contas a receber', href: `${href('financeiro.html')}#contas` },
            { label: 'Repasse barbeiros', href: `${href('financeiro.html')}#repasse` },
            { label: 'Liquido da empresa', href: `${href('financeiro.html')}#liquido` }
          ]
        },
        {
          label: 'Conta',
          children: [
            { label: 'Meus dados', href: href('meus-dados.html') }
          ]
        }
      ];
    }

    if (perfil === 'barbeiro') {
      return [
        {
          label: 'Inicio',
          href: href('barbeiro.html')
        },
        {
          label: 'Agenda',
          children: [
            { label: 'Agendamentos', href: `${href('agenda-barbeiro.html')}#agendamentos` },
            { label: 'Registro', href: `${href('agenda-barbeiro.html')}#registro` },
            { label: 'Lancamento manual', href: `${href('agenda-barbeiro.html')}#manual` }
          ]
        },
        {
          label: 'Financeiro',
          children: [
            { label: 'Resumo financeiro', href: `${href('financeiro-barbeiro.html')}#resumo` },
            { label: 'Ganhos', href: `${href('financeiro-barbeiro.html')}#ganhos` },
            { label: 'Contas a receber', href: `${href('financeiro-barbeiro.html')}#contas` }
          ]
        },
        {
          label: 'Configuracoes',
          children: [
            { label: 'Meus horarios', href: href('configuracoes-barbeiro.html') },
            { label: 'Meus dados', href: href('meus-dados.html') }
          ]
        }
      ];
    }

    return [
      {
        label: 'Inicio',
        href: href('cliente.html')
      },
      {
        label: 'Agenda',
        children: [
          { label: 'Agendar novo horario', href: href('cliente-agendamento.html') },
          { label: 'Meus agendamentos', href: href('meus-agendamentos.html') }
        ]
      },
      {
        label: 'Conta',
        children: [
          { label: 'Meus dados', href: href('meus-dados.html') }
        ]
      }
    ];
  },

  buildNavigation(safeUser) {
    const inPages = window.location.pathname.includes('/pages/');
    const currentPath = window.location.pathname.split('/').pop() || '';
    const currentHash = window.location.hash || '';
    const currentPathWithHash = `${currentPath}${currentHash}`;
    const sections = this.getNavSections(safeUser.perfil, inPages);
    const navContainers = document.querySelectorAll('.nav');

      navContainers.forEach((nav) => {
      nav.innerHTML = sections.map((section, sectionIndex) => {
        if (section.href) {
          const target = section.href.split('/').pop() || '';
          const activeClass = target === currentPathWithHash || (currentHash === '' && target === currentPath) ? 'active' : '';
          return `
            <div class="nav-section nav-section-link">
              <a class="nav-parent nav-link-direct ${activeClass}" href="${section.href}">
                <span>${window.AppUtils.escapeHtml(section.label)}</span>
              </a>
            </div>
          `;
        }

        const hasActiveChild = section.children.some((item) => {
          const target = item.href.split('/').pop() || '';
          return target === currentPathWithHash || (currentHash === '' && target === currentPath);
        });
        const shouldOpen = hasActiveChild || sectionIndex === 0;
        const childrenHtml = section.children.map((item) => {
          const target = item.href.split('/').pop() || '';
          const activeClass = target === currentPathWithHash || (currentHash === '' && target === currentPath) ? 'active' : '';
          return `<a class="${activeClass}" href="${item.href}">${window.AppUtils.escapeHtml(item.label)}</a>`;
        }).join('');

        return `
          <div class="nav-section ${shouldOpen ? 'open' : ''}">
            <button type="button" class="nav-parent" aria-expanded="${shouldOpen ? 'true' : 'false'}">
              <span>${window.AppUtils.escapeHtml(section.label)}</span>
              <span class="nav-chevron" aria-hidden="true"></span>
            </button>
            <div class="nav-children">
              ${childrenHtml}
            </div>
          </div>
        `;
      }).join('');
    });
  },

  async setupLayout(userInfo) {
    const safeUser = {
      nome: userInfo?.nome || 'Usuario',
      email: userInfo?.email || '',
      perfil: userInfo?.perfil || ''
    };

    const userNameEls = document.querySelectorAll('[data-user-name]');
    userNameEls.forEach((el) => {
      el.textContent = safeUser.nome;

      const sidebarContainer = el.closest('.sidebar-user');
      const parentMeta = el.parentElement?.querySelector('.user-meta');
      if (!sidebarContainer) {
        if (parentMeta) parentMeta.remove();
        return;
      }

      let meta = sidebarContainer.querySelector('.user-meta');
      if (meta) meta.remove();
    });

    const logoutBtns = document.querySelectorAll('[data-logout]');
    logoutBtns.forEach((btn) => btn.addEventListener('click', () => window.Auth.logout()));

    const showRoleElement = (el) => {
      const display = el.tagName === 'A' || el.tagName === 'BUTTON' ? 'inline-flex' : 'block';
      el.style.setProperty('display', display, 'important');
    };

    const hideRoleElement = (el) => {
      el.style.setProperty('display', 'none', 'important');
    };

    const adminOnly = document.querySelectorAll('[data-admin-only]');
    adminOnly.forEach((el) => {
      if (safeUser.perfil === 'admin') {
        showRoleElement(el);
      } else {
        hideRoleElement(el);
      }
    });

    const barberOnly = document.querySelectorAll('[data-barber-only]');
    barberOnly.forEach((el) => {
      if (safeUser.perfil === 'barbeiro') {
        showRoleElement(el);
      } else {
        hideRoleElement(el);
      }
    });

    const clientOnly = document.querySelectorAll('[data-client-only]');
    clientOnly.forEach((el) => {
      if (safeUser.perfil === 'cliente') {
        showRoleElement(el);
      } else {
        hideRoleElement(el);
      }
    });

    const menuToggle = document.getElementById('btn-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    const setSidebarState = (open) => {
      document.body.classList.toggle('sidebar-open', open);
      if (menuToggle) menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const closeSidebar = () => setSidebarState(false);
    const toggleSidebar = () => setSidebarState(!document.body.classList.contains('sidebar-open'));

    const bindNavigation = () => {
      this.buildNavigation(safeUser);

      const navParents = document.querySelectorAll('.nav-section button.nav-parent');
      navParents.forEach((btn) => {
        btn.addEventListener('click', () => {
          const section = btn.closest('.nav-section');
          if (!section) return;
          const willOpen = !section.classList.contains('open');

          document.querySelectorAll('.nav-section.open').forEach((openSection) => {
            if (openSection === section) return;
            openSection.classList.remove('open');
            const openButton = openSection.querySelector('button.nav-parent');
            if (openButton) {
              openButton.setAttribute('aria-expanded', 'false');
            }
          });

          section.classList.toggle('open', willOpen);
          btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      });

      const navLinks = document.querySelectorAll('.nav a[href]');
      navLinks.forEach((link) => link.addEventListener('click', closeSidebar));
    };

    bindNavigation();

    if (menuToggle) {
      menuToggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleSidebar();
      });
    }
    if (overlay) overlay.addEventListener('click', closeSidebar);

    document.addEventListener('click', (ev) => {
      if (!document.body.classList.contains('sidebar-open')) return;
      if (!sidebar) return;
      const clickedToggle = menuToggle && menuToggle.contains(ev.target);
      const clickedSidebar = sidebar.contains(ev.target);
      if (!clickedSidebar && !clickedToggle) closeSidebar();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
        closeSidebar();
      }
    });

    window.addEventListener('hashchange', () => bindNavigation());

    setSidebarState(false);
    this.enhanceResponsiveTables(document);
  }
};
