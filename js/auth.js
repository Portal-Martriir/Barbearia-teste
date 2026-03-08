window.Auth = {
  paths() {
    const inPages = window.location.pathname.includes('/pages/');
    return {
      login: inPages ? '../login.html' : './login.html',
      dashboard: inPages ? './dashboard.html' : './pages/dashboard.html',
      barbeiro: inPages ? './barbeiro.html' : './pages/barbeiro.html',
      cliente: inPages ? './cliente.html' : './pages/cliente.html',
      meusDados: inPages ? './meus-dados.html' : './pages/meus-dados.html'
    };
  },

  async getSession() {
    const { data, error } = await window.sb.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async login(email, password) {
    const { error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async logout() {
    const { error } = await window.sb.auth.signOut();
    if (error) throw error;
    window.location.href = this.paths().login;
  },

  async getCurrentUserRole() {
    const session = await this.getSession();
    if (!session?.user?.id) return null;

    const { data, error } = await window.sb
      .from('usuarios')
      .select('id, nome, email, perfil, ativo')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    if (data && !data.ativo) return null;

    if (data) {
      return {
        ...data,
        email: data.email || session.user.email || ''
      };
    }

    return {
      id: session.user.id,
      nome: session.user.user_metadata?.nome || session.user.email?.split('@')[0] || 'Usuario',
      email: session.user.email || '',
      perfil: 'cliente',
      ativo: true
    };
  },

  async getUserProfile() {
    const session = await this.getSession();
    if (!session?.user?.id) return null;

    try {
      const roleData = await this.getCurrentUserRole();
      if (roleData) return roleData;
    } catch (err) {
      console.error('Falha ao carregar perfil em usuarios:', err);
    }

    return {
      id: session.user.id,
      nome: session.user.user_metadata?.nome || session.user.email?.split('@')[0] || 'Usuario',
      email: session.user.email || '',
      perfil: 'cliente',
      ativo: true
    };
  },

  async requireAuth(allowedProfiles = []) {
    let userInfo = null;
    try {
      userInfo = await this.getCurrentUserRole();
    } catch (err) {
      console.error('Falha ao buscar perfil do usuario:', err);
      window.location.href = this.paths().login;
      return null;
    }

    if (!userInfo) {
      window.location.href = this.paths().login;
      return null;
    }

    if (allowedProfiles.length > 0 && !allowedProfiles.includes(userInfo.perfil)) {
      if (userInfo.perfil === 'barbeiro') {
        window.location.href = this.paths().barbeiro;
      } else if (userInfo.perfil === 'cliente') {
        window.location.href = this.paths().cliente;
      } else {
        window.location.href = this.paths().dashboard;
      }
      return null;
    }

    return userInfo;
  }
};
