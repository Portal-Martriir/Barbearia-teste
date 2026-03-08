window.CommonUI = {
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

    const inPages = window.location.pathname.includes('/pages/');
    const meusDadosHref = inPages ? './meus-dados.html' : './pages/meus-dados.html';
    const navContainers = document.querySelectorAll('.nav');
    navContainers.forEach((nav) => {
      const exists = nav.querySelector(`a[href="${meusDadosHref}"]`) || nav.querySelector('a[href$="meus-dados.html"]');
      if (exists) return;
      const link = document.createElement('a');
      link.href = meusDadosHref;
      link.textContent = 'Meus dados';
      link.setAttribute('data-all-profiles', 'true');
      nav.appendChild(link);
    });

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

    if (safeUser.perfil === 'barbeiro') {
      const barberNavFallback = document.querySelectorAll('.nav a:not([data-admin-only]):not([data-client-only])');
      barberNavFallback.forEach((el) => showRoleElement(el));
    }

    const path = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.nav a[href]');
    const menuToggle = document.getElementById('btn-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    const setSidebarState = (open) => {
      document.body.classList.toggle('sidebar-open', open);
      if (menuToggle) menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const closeSidebar = () => setSidebarState(false);
    const toggleSidebar = () => setSidebarState(!document.body.classList.contains('sidebar-open'));

    navLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (href.endsWith(path)) link.classList.add('active');
      link.addEventListener('click', closeSidebar);
    });

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

    setSidebarState(false);
  }
};
