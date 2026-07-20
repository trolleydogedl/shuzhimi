(() => {
  'use strict';

  const cfg = window.SZM_CONFIG || {};
  const isConfigured = Boolean(
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).startsWith('YOUR_') &&
    !String(cfg.SUPABASE_ANON_KEY).startsWith('YOUR_')
  );
  const client = isConfigured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const state = {
    session: null,
    isAdmin: false,
    profile: null,
    problems: [],
    loading: true,
    search: '',
    tag: '全部',
    adminTab: 'library',
    adminSearch: '',
    importBusy: false
  };


  const SUBJECTS = ['几何','代数','数论','组合'];
  const SUBJECT_BY_CODE = {
    'PZH-001':'数论','PZH-002':'几何','PZH-003':'数论','PZH-004':'数论','PZH-005':'组合',
    'PZH-006':'组合','PZH-007':'组合','PZH-008':'数论','PZH-009':'组合','PZH-010':'数论',
    'PZH-011':'组合','PZH-012':'数论','PZH-013':'组合','PZH-014':'数论','PZH-015':'组合',
    'PZH-016':'组合','PZH-017':'组合','PZH-018':'组合','PZH-019':'数论','PZH-020':'数论',
    'PZH-021':'数论','PZH-022':'数论','PZH-023':'组合','PZH-024':'数论','PZH-025':'组合',
    'PZH-026':'数论','PZH-027':'组合','PZH-028':'组合','PZH-029':'几何','PZH-030':'代数',
    'PZH-031':'数论','PZH-032':'组合','PZH-033':'组合','PZH-034':'组合','PZH-035':'代数',
    'PZH-036':'组合','PZH-037':'代数','PZH-038':'组合','PZH-039':'数论','PZH-040':'数论',
    'PZH-041':'数论','PZH-042':'数论'
  };

  function inferPrimarySubject(problem={}) {
    if (SUBJECT_BY_CODE[problem.code]) return SUBJECT_BY_CODE[problem.code];
    if (SUBJECTS.includes(problem.primary_category)) return problem.primary_category;
    const supplied = (problem.tags || []).filter(t => SUBJECTS.includes(t));
    if (supplied.length === 1) return supplied[0];
    const text = `${problem.title || ''} ${stripLatex ? stripLatex(problem.problem_content || '') : problem.problem_content || ''}`;
    const scores = {几何:0,代数:0,数论:0,组合:0};
    const rules = {
      几何:[['三角形',3],['多边形',2],['面积',3],['圆',2],['抛物线',3],['几何',4]],
      代数:[['多项式',4],['函数',3],['方程',2],['根',2],['因式',3],['递推',1]],
      数论:[['整除',3],['同余',4],['模 ',2],['素数',3],['最大公约数',4],['公因数',3],['互素',3],['因数',2],['剩余系',4]],
      组合:[['集合族',4],['排列',3],['子集',3],['棋盘',2],['游戏',3],['树',3],['计数',2],['最少',1],['最大值',1],['询问',3]]
    };
    for (const [subject, words] of Object.entries(rules)) for (const [word, weight] of words) if (text.includes(word)) scores[subject] += weight;
    return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][1] > 0 ? Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0] : '组合';
  }

  function displayTags(problem={}) {
    const subject = inferPrimarySubject(problem);
    const extras = (problem.tags || []).filter(t => t && !SUBJECTS.includes(t) && t !== subject);
    return [subject, ...new Set(extras)];
  }

  function importedTags(problem={}) {
    const subject = SUBJECTS.includes(problem.primary_category) ? problem.primary_category : inferPrimarySubject(problem);
    const extras = (problem.tags || []).filter(t => t && !SUBJECTS.includes(t) && t !== subject);
    return [subject, ...new Set(extras)];
  }

  const app = document.getElementById('app');
  const toastRoot = document.getElementById('toast-root');
  const modalRoot = document.getElementById('modal-root');

  const esc = (v='') => String(v)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const attr = esc;

  const icons = {
    home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6Z"/><path d="m9 12 2 2 4-5"/></svg>',
    moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>',
    sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
    file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v4h16v-4"/></svg>',
    book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5Z"/><path d="M4 6.5v13"/></svg>',
    database:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.28.35.48.68.6 1 .1.35.14.72.1 1.1H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
    copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7"/></svg>'
  };
  const icon = (name) => icons[name] || '';

  function toast(message, type='') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('szm-theme', theme);
  }

  function toggleTheme() {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    renderRoute();
  }

  function currentRoute() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path] = raw.split('?');
    return path;
  }

  function navigate(path) {
    if (location.hash === `#${path}`) renderRoute();
    else location.hash = path;
  }

  function layout(content, active='home') {
    const dark = document.documentElement.dataset.theme === 'dark';
    const loginLabel = state.isAdmin ? '管理后台' : '管理员登录';
    const loginRoute = state.isAdmin ? '/admin' : '/login';
    return `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-inner">
            <a class="logo" href="#/" data-nav="/">
              <span class="logo-badge">数</span>
              <span class="logo-text"><strong>${esc(cfg.SITE_NAME || '数之谜')}</strong><span>${esc(cfg.SITE_SUBTITLE || '数学供题资料库')}</span></span>
            </a>
            <nav class="desktop-nav">
              <button class="nav-link ${active==='home'?'active':''}" data-nav="/">题目库</button>
              ${state.isAdmin ? `<button class="nav-link ${active==='admin'?'active':''}" data-nav="/admin">管理后台</button>` : ''}
            </nav>
            <div class="topbar-actions">
              <button class="icon-btn" data-action="theme" title="切换主题">${dark?icon('sun'):icon('moon')}</button>
              <button class="soft-btn" data-nav="${loginRoute}">${state.isAdmin?icon('admin'):icon('user')}<span>${loginLabel}</span></button>
            </div>
          </div>
        </header>
        <main class="main">${content}</main>
        <nav class="bottom-nav">
          <button class="bottom-link ${active==='home'?'active':''}" data-nav="/">${icon('home')}<span>题目</span></button>
          <button class="bottom-link" data-action="focus-search">${icon('search')}<span>搜索</span></button>
          <button class="bottom-link ${active==='admin'?'active':''}" data-nav="${loginRoute}">${state.isAdmin?icon('admin'):icon('user')}<span>${state.isAdmin?'管理':'登录'}</span></button>
        </nav>
      </div>`;
  }

  const renderer = window.SZM_RENDER || {};
  const sanitizePublicLatex = source => renderer.sanitizePublicSource ? renderer.sanitizePublicSource(source) : String(source || '');
  const stripLatex = source => renderer.stripText ? renderer.stripText(source) : String(source || '');
  const latexPreviewSource = (source, limit=280) => renderer.previewSource ? renderer.previewSource(source, limit) : String(source || '').slice(0, limit);
  const latexToHtml = (source, options={}) => renderer.renderRichText ? renderer.renderRichText(source, options) : `<p>${esc(source)}</p>`;

  // Only these two original source files contain a tikzpicture environment.
  const diagramMap = {
    'PZH-009': ['原题灯阵状态变化示意图', '两组方格展示亮灯状态从当前时刻到下一时刻的变化'],
    'PZH-033': ['原题蜂巢棋盘与直飞示意图', '边长为三的蜂巢棋盘以及沿蜂线连续前进的路径片段']
  };

  function renderProblemDiagram(code) {
    const item = diagramMap[code];
    if (!item) return '';
    const [caption, alt] = item;
    return `<figure class="problem-diagram original-diagram">
      <div class="diagram-frame"><img src="assets/diagrams/${attr(code)}.svg?v=20260720-r4" alt="${attr(alt)}" loading="lazy" decoding="async"></div>
      <figcaption>${esc(caption)}<span>由原始 TeX 中的 TikZ 图转换，未增加原题没有的图形</span></figcaption>
    </figure>`;
  }

  async function typesetMath(root=document, attempt=0) {
    if (!root) return;
    if (!window.MathJax?.typesetPromise) {
      if (attempt < 32) setTimeout(() => typesetMath(root, attempt + 1), 250);
      return;
    }
    try {
      window.MathJax.typesetClear?.([root]);
      window.MathJax.texReset?.();
      await window.MathJax.typesetPromise([root]);
    } catch (error) {
      console.warn('MathJax bulk typeset error; retrying block by block', error);
      const blocks = [];
      if (root.matches?.('.latex-content,.problem-preview')) blocks.push(root);
      blocks.push(...(root.querySelectorAll?.('.latex-content,.problem-preview') || []));
      let failures = 0;
      for (const block of [...new Set(blocks)]) {
        try {
          window.MathJax.typesetClear?.([block]);
          await window.MathJax.typesetPromise([block]);
        } catch (blockError) {
          failures++;
          console.warn('MathJax block error', blockError, block);
        }
      }
      root.querySelectorAll?.('.math-render-warning').forEach(el => el.remove());
      if (failures) {
        const warning = document.createElement('div');
        warning.className = 'math-render-warning';
        warning.textContent = `有 ${failures} 个内容区块包含无法识别的公式。请在管理后台使用“预览格式”定位并修改该段。`;
        root.prepend(warning);
      }
    }
  }

  async function resolveAdmin() {
    state.isAdmin = false;
    state.profile = null;
    if (!state.session?.user) return;
    const { data, error } = await client.from('profiles').select('id,username,role').eq('id', state.session.user.id).maybeSingle();
    if (!error && data?.role === 'admin') {
      state.isAdmin = true;
      state.profile = data;
    }
  }

  async function loadProblems(showError=true) {
    if (!client) return;
    state.loading = true;
    const { data, error } = await client.from('problems').select('*').order('sort_order', {ascending:true}).order('created_at', {ascending:true});
    if (error) {
      state.problems = [];
      if (showError) toast(`读取题库失败：${error.message}`, 'error');
      state.loading = false;
      return;
    }
    const problems = data || [];
    if (state.isAdmin && problems.length) {
      const ids = problems.map(p=>p.id);
      const [{data: metas}, {data: files}] = await Promise.all([
        client.from('problem_admin').select('*').in('problem_id', ids),
        client.from('problem_files').select('*').in('problem_id', ids).order('created_at', {ascending:true})
      ]);
      const metaMap = Object.fromEntries((metas||[]).map(x=>[x.problem_id,x]));
      const fileMap = {};
      (files||[]).forEach(f => (fileMap[f.problem_id] ||= []).push(f));
      problems.forEach(p => { p.admin = metaMap[p.id] || {}; p.files = fileMap[p.id] || []; });
    }
    state.problems = problems;
    state.loading = false;
  }

  function allTags() {
    return ['全部', ...SUBJECTS];
  }

  function filteredProblems() {
    const q = state.search.trim().toLowerCase();
    return state.problems.filter(p => {
      const tagOk = state.tag === '全部' || inferPrimarySubject(p) === state.tag;
      const searchOk = !q || `${p.code} ${p.title} ${stripLatex(p.problem_content)}`.toLowerCase().includes(q);
      return tagOk && searchOk;
    });
  }

  function renderHome() {
    const list = filteredProblems();
    const tags = allTags();
    const tagCount = SUBJECTS.length;
    const cards = list.length ? list.map(p => `
      <article class="problem-card" data-open-problem="${attr(p.code)}" tabindex="0">
        <div class="problem-top"><span class="problem-code">${esc(p.code)}</span></div>
        <h3>${esc(p.title)}</h3>
        <div class="problem-preview">${latexToHtml(latexPreviewSource(p.problem_content))}</div>
        <div class="problem-foot">
          ${displayTags(p).slice(0,2).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}
          <span class="problem-arrow">${icon('arrow')}</span>
        </div>
      </article>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">∅</div><strong>没有匹配的题目</strong><div>试试更换关键词或分类</div></div>`;

    const content = `
      <section class="hero">
        <div class="hero-content">
          <span class="hero-kicker">✦ 原创数学供题资料库</span>
          <h1>在一道好题里，发现思维的另一条路</h1>
          <p>适配手机、平板与电脑。游客可阅读题目和完整解答。</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>${state.problems.length}</strong><span>收录题目</span></div>
            <div class="hero-stat"><strong>${tagCount}</strong><span>知识方向</span></div>
            <div class="hero-stat"><strong>3</strong><span>资料格式</span></div>
          </div>
        </div>
      </section>
      <section class="search-panel">
        <div class="search-row">
          <label class="search-box">${icon('search')}<input id="main-search" value="${attr(state.search)}" placeholder="搜索题号、标题或题目内容" autocomplete="off"></label>
          ${state.isAdmin?`<button class="soft-btn" data-action="new-problem">${icon('plus')}<span class="desktop-only">新增题目</span></button>`:''}
        </div>
        <div class="filter-row">${tags.map(t=>`<button class="chip ${state.tag===t?'active':''}" data-tag="${attr(t)}">${esc(t)}</button>`).join('')}</div>
      </section>
      <div class="section-head"><div><h2>全部题目</h2><p>点击题目卡片查看题面与解答</p></div><span class="section-count">${list.length} 道</span></div>
      <section class="problem-grid">${cards}</section>`;
    app.innerHTML = layout(content,'home');
    const input = document.getElementById('main-search');
    input?.addEventListener('input', debounce(e => { state.search=e.target.value; renderHome(); document.getElementById('main-search')?.focus(); }, 160));
    typesetMath(document.querySelector('.problem-grid'));
  }

  function getProblem(code) { return state.problems.find(p=>p.code===code); }

  function renderDetail(code) {
    const p = getProblem(code);
    if (!p) {
      app.innerHTML = layout(`<div class="empty-state"><div class="empty-icon">?</div><strong>未找到这道题</strong><div><button class="soft-btn" data-nav="/" style="margin-top:12px">返回题库</button></div></div>`,'home');
      return;
    }
    const adminSide = state.isAdmin ? `
      <div class="detail-side-card">
        <div class="meta-list">
          <div class="meta-item"><label>预估难度</label><div>${esc(p.admin?.difficulty || '未填写')}</div></div>
          <div class="meta-item"><label>供题方向（机构）</label><div>${esc(p.admin?.institution || '未填写')}</div></div>
          <div class="meta-item"><label>原始编号</label><div>${esc(p.admin?.original_code || '—')}</div></div>
          ${p.admin?.duplicate_note?`<div class="admin-only-note">${esc(p.admin.duplicate_note)}</div>`:''}
        </div>
        <div class="download-list">
          ${(p.files||[]).length ? p.files.map(f=>`<button class="download-btn" data-download-file="${attr(f.id)}">${icon('download')}<span>${esc((f.file_type||'file').toUpperCase())} · ${esc(f.original_name)}</span></button>`).join('') : '<div class="form-help">暂无附件</div>'}
        </div>
        <button class="primary-btn" style="width:100%;margin-top:13px" data-edit-problem="${attr(p.code)}">${icon('edit')}编辑题目</button>
      </div>` : '';
    const content = `
      <div class="detail-layout">
        <article class="detail-main">
          <button class="back-link" data-nav="/">${icon('back')}返回题目库</button>
          <div><span class="detail-code">${esc(p.code)}</span></div>
          <h1 class="detail-title">${esc(p.title)}</h1>
          <div class="detail-tags">${displayTags(p).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
          <section class="content-section">
            <h2 class="content-title"><span class="num">题</span>题目</h2>
            <div class="latex-content" id="problem-math">${latexToHtml(p.problem_content,{stripLeading:'problem'})}</div>
            ${renderProblemDiagram(p.code)}
          </section>
          <section class="content-section">
            <h2 class="content-title"><span class="num">解</span>解答</h2>
            <div class="latex-content" id="solution-math">${latexToHtml(p.solution_content,{stripLeading:'solution'})}</div>
          </section>
        </article>
        ${state.isAdmin?`<aside class="detail-side">${adminSide}</aside>`:''}
      </div>`;
    app.innerHTML = layout(content,'home');
    typesetMath(document.querySelector('.detail-main'));
  }

  function renderLogin() {
    if (state.isAdmin) { navigate('/admin'); return; }
    const loginEmail = cfg.ADMIN_LOGIN_EMAIL || 'adminpzh@math.example';
    const content = `
      <div class="login-wrap">
        <section class="login-card">
          <div class="login-icon">${icon('admin')}</div>
          <h1>管理员登录</h1>
          <p>登录后可查看难度、供题机构、附件，并在线编辑题库。</p>
          <div id="login-error"></div>
          <form id="login-form">
            <div class="form-group"><label for="username">管理员账号</label><input class="input" id="username" name="username" autocomplete="username" value="adminpzh" required></div>
            <div class="form-group"><label for="password">密码</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
            <button class="primary-btn" id="login-submit" type="submit">登录管理后台</button>
          </form>
          <div class="login-help">登录名 <strong>adminpzh</strong> 实际对应 Supabase 用户 <span class="login-email">${esc(loginEmail)}</span>。若提示登录凭据无效，请先按 <a href="管理员登录修复.html" target="_blank" rel="noopener">管理员登录修复说明</a> 检查用户是否已创建、已确认并设置了密码。</div>
        </section>
      </div>`;
    app.innerHTML = layout(content,'login');
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  }

  function friendlyAuthError(error) {
    const raw = String(error?.message || '未知错误');
    const lower = raw.toLowerCase();
    if (lower.includes('invalid login credentials')) return '登录失败：Supabase 中不存在这个已确认账号，或后台密码与输入密码不一致。请打开“管理员登录修复说明”检查并重新创建/重置用户。';
    if (lower.includes('email not confirmed')) return '登录失败：管理员邮箱尚未确认。请在 Supabase 的 Authentication → Users 中确认该用户，或重新创建并启用自动确认。';
    if (lower.includes('failed to fetch') || lower.includes('network')) return '无法连接 Supabase。请检查 config.js 的 Project URL、Publishable key，以及当前网络。';
    return `登录失败：${raw}`;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const username = form.username.value.trim().toLowerCase();
    const password = form.password.value;
    const loginEmail = String(cfg.ADMIN_LOGIN_EMAIL || 'adminpzh@math.example').trim().toLowerCase();
    const errorBox = document.getElementById('login-error');
    const btn = document.getElementById('login-submit');
    errorBox.innerHTML='';
    if (username !== 'adminpzh' && username !== loginEmail) {
      errorBox.innerHTML='<div class="form-error">管理员账号应为 adminpzh，或配置中的管理员邮箱。</div>'; return;
    }
    if (!password) {
      errorBox.innerHTML='<div class="form-error">请输入管理员密码。</div>'; return;
    }
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span>正在登录';
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        errorBox.innerHTML=`<div class="form-error">${esc(friendlyAuthError(error))}</div>`;
        btn.disabled=false; btn.textContent='登录管理后台'; return;
      }
      state.session=data.session;
      await resolveAdmin();
      if (!state.isAdmin) {
        await client.auth.signOut();
        errorBox.innerHTML='<div class="form-error">账号验证成功，但尚未取得管理员权限。请运行 supabase/管理员检查与修复.sql，然后重新登录。</div>';
        btn.disabled=false; btn.textContent='登录管理后台'; return;
      }
      await loadProblems();
      toast('登录成功','success');
      navigate('/admin');
    } catch (err) {
      errorBox.innerHTML=`<div class="form-error">${esc(friendlyAuthError(err))}</div>`;
      btn.disabled=false; btn.textContent='登录管理后台';
    }
  }

  function adminTabs() {
    return [
      ['library','题库管理',icon('book')],['import','批量导入',icon('upload')],['backup','备份导出',icon('database')],['account','账号设置',icon('settings')]
    ].map(([id,label,ic])=>`<button class="admin-tab ${state.adminTab===id?'active':''}" data-admin-tab="${id}">${ic}${label}</button>`).join('');
  }

  function renderAdmin() {
    if (!state.isAdmin) { navigate('/login'); return; }
    let panel='';
    if (state.adminTab==='library') panel=renderAdminLibrary();
    if (state.adminTab==='import') panel=renderImportPanel();
    if (state.adminTab==='backup') panel=renderBackupPanel();
    if (state.adminTab==='account') panel=renderAccountPanel();
    const content = `
      <section class="admin-hero">
        <div class="admin-avatar">管</div>
        <div class="admin-hero-text"><h1>题库管理后台</h1><p>${esc(state.profile?.username || 'adminpzh')} · 仅管理员可见</p></div>
        <div class="admin-hero-actions"><button class="primary-btn" data-action="new-problem">${icon('plus')}新增题目</button></div>
      </section>
      <div class="admin-tabs">${adminTabs()}</div>
      <section class="admin-panel">${panel}</section>`;
    app.innerHTML=layout(content,'admin');
    bindAdminPanelEvents();
  }

  function renderAdminLibrary() {
    const q=state.adminSearch.trim().toLowerCase();
    const list=state.problems.filter(p=>!q||`${p.code} ${p.title} ${p.admin?.institution||''} ${p.admin?.difficulty||''}`.toLowerCase().includes(q));
    return `
      <div class="admin-toolbar">
        <label class="search-box">${icon('search')}<input id="admin-search" value="${attr(state.adminSearch)}" placeholder="搜索题号、标题、机构或难度"></label>
        <button class="soft-btn" data-action="refresh">刷新</button>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>题号</th><th>标题</th><th>机构</th><th>预估难度</th><th>状态</th><th>附件</th><th>操作</th></tr></thead>
        <tbody>${list.map(p=>`<tr>
          <td><strong>${esc(p.code)}</strong></td><td>${esc(p.title)}</td><td>${esc(p.admin?.institution||'未填写')}</td><td>${esc(p.admin?.difficulty||'未填写')}</td>
          <td><span class="status-dot ${p.published?'':'off'}">${p.published?'已发布':'已隐藏'}</span></td><td>${(p.files||[]).length}</td>
          <td><div class="row-actions"><button class="mini-btn" data-open-problem="${attr(p.code)}">查看</button><button class="mini-btn" data-edit-problem="${attr(p.code)}">编辑</button></div></td>
        </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted)">暂无题目</td></tr>'}</tbody>
      </table></div>`;
  }

  function renderImportPanel() {
    return `
      <div class="import-card">
        <h3>批量导入题库包</h3>
        <p>选择本项目附带的“首次导入题库_42题.zip”，网站会自动写入题目、解答、难度、机构，并上传 ZIP/PDF/TeX 附件。重复执行会覆盖更新，不会重复建题。</p>
        <input class="input" id="bundle-input" type="file" accept=".zip" ${state.importBusy?'disabled':''}>
        <button class="primary-btn" id="import-button" style="margin-top:12px" ${state.importBusy?'disabled':''}>${icon('upload')}开始导入</button>
        <div class="progress-wrap ${state.importBusy?'':'hidden'}" id="import-progress-wrap"><div class="progress-bar"><div class="progress-fill" id="import-progress"></div></div><div class="progress-text" id="import-progress-text">准备导入…</div></div>
      </div>
      <div class="admin-only-note" style="margin-top:14px">导入包中可能含供题声明和个人资料，因此附件存放在私有 Storage 中，游客无法直接访问。</div>`;
  }

  function renderBackupPanel() {
    return `<div class="backup-grid">
      <div class="backup-card"><h3>导出题库 JSON</h3><p>导出题目、解答、难度、机构和附件索引，适合快速备份或检查。</p><button class="soft-btn" data-action="export-json">${icon('download')}导出 JSON</button></div>
      <div class="backup-card"><h3>完整备份 ZIP</h3><p>连同全部私有附件一起打包，可重新通过“批量导入”恢复。</p><button class="primary-btn" data-action="export-full">${icon('download')}生成完整备份</button><div id="backup-status" class="form-help"></div></div>
    </div>`;
  }

  function renderAccountPanel() {
    return `
      <div class="editor-grid">
        <div><h3 style="margin-top:0">修改管理员密码</h3><p class="form-help">初始密码已按你的要求设置。网站上线后建议立即换成只有你知道的新密码。</p>
          <form id="password-form"><div class="form-group"><label>新密码</label><input class="input" name="password" type="password" minlength="8" required></div><div class="form-group"><label>再次输入</label><input class="input" name="confirm" type="password" minlength="8" required></div><button class="primary-btn" type="submit">更新密码</button></form>
        </div>
        <div><h3 style="margin-top:0">当前账号</h3><div class="meta-list"><div class="meta-item"><label>登录名</label><div>adminpzh</div></div><div class="meta-item"><label>权限</label><div>管理员</div></div></div><button class="danger-btn" style="margin-top:18px" data-action="logout">退出登录</button></div>
      </div>`;
  }

  function bindAdminPanelEvents() {
    document.getElementById('admin-search')?.addEventListener('input', debounce(e=>{state.adminSearch=e.target.value;renderAdmin();document.getElementById('admin-search')?.focus();},160));
    document.getElementById('import-button')?.addEventListener('click',()=>{
      const f=document.getElementById('bundle-input')?.files?.[0];
      if(!f) return toast('请先选择导入 ZIP','error');
      importBundle(f);
    });
    document.getElementById('password-form')?.addEventListener('submit', changePassword);
  }

  async function changePassword(e) {
    e.preventDefault();
    const p=e.currentTarget.password.value, c=e.currentTarget.confirm.value;
    if(p!==c) return toast('两次密码不一致','error');
    const {error}=await client.auth.updateUser({password:p});
    if(error) return toast(error.message,'error');
    e.currentTarget.reset(); toast('密码已更新','success');
  }

  async function logout() {
    await client.auth.signOut();
    state.session=null; state.isAdmin=false; state.profile=null;
    await loadProblems(false);
    toast('已退出管理员账号'); navigate('/');
  }

  function openEditor(problem=null) {
    if(!state.isAdmin) return;
    const isNew=!problem;
    const next=Math.max(0,...state.problems.map(p=>Number((p.code||'').match(/(\d+)$/)?.[1]||0)))+1;
    const p=problem || {code:`PZH-${String(next).padStart(3,'0')}`,title:'',problem_content:'',solution_content:'',tags:[],published:true,sort_order:next,admin:{},files:[]};
    modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal" style="width:min(920px,100%)">
      <div class="modal-head"><h2>${isNew?'新增题目':`编辑 ${esc(p.code)}`}</h2><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <form id="editor-form"><div class="modal-body">
        <div class="editor-grid">
          <div class="form-group"><label>题号</label><input class="input" name="code" value="${attr(p.code)}" required></div>
          <div class="form-group"><label>排序数字</label><input class="input" name="sort_order" type="number" value="${Number(p.sort_order||next)}"></div>
          <div class="form-group editor-full"><label>题目标题</label><input class="input" name="title" value="${attr(p.title)}" required></div>
          <div class="form-group"><label>预估难度（仅管理员可见）</label><input class="input" name="difficulty" value="${attr(p.admin?.difficulty||'')}"></div>
          <div class="form-group"><label>供题方向/机构（仅管理员可见）</label><select class="select" name="institution">${['爱尖子','学而思','其他','未填写'].map(x=>`<option ${p.admin?.institution===x?'selected':''}>${x}</option>`).join('')}</select></div>
          <div class="form-group"><label>原始编号</label><input class="input" name="original_code" value="${attr(p.admin?.original_code||'')}"></div>
          <div class="form-group"><label>所属模块</label><select class="select" name="subject">${SUBJECTS.map(x=>`<option value="${x}" ${inferPrimarySubject(p)===x?'selected':''}>${x}</option>`).join('')}</select><div class="form-help">四大模块只选一个，避免同一道题同时出现在多个模块。</div></div>
          <div class="form-group"><label>其他公开标签（可选，逗号分隔）</label><input class="input" name="extra_tags" value="${attr(displayTags(p).slice(1).join(','))}"></div>
          <div class="form-group editor-full"><label>重复说明（仅管理员可见）</label><input class="input" name="duplicate_note" value="${attr(p.admin?.duplicate_note||'')}"></div>
          <div class="form-group editor-full"><div style="display:flex;justify-content:space-between;align-items:center"><label>题目内容（LaTeX/普通文本）</label><label class="mini-btn">从 TeX 自动识别<input class="sr-only" id="tex-import" type="file" accept=".tex,text/plain"></label></div><textarea class="textarea" name="problem_content" style="min-height:260px" required>${esc(p.problem_content)}</textarea></div>
          <div class="form-group editor-full"><label>解答内容（LaTeX / Markdown / 普通文本）</label><textarea class="textarea" name="solution_content" style="min-height:320px" required>${esc(p.solution_content)}</textarea><div class="form-help">支持 $...$、\(...\)、\[...\]，也支持单独一行的 [ 与 ] 作为公式块，以及 ### 标题、* 列表、**粗体**。</div></div>
          <div class="form-group editor-full hidden" id="editor-render-preview"><label>显示效果预览</label><div class="editor-preview-grid"><section><h3>题目</h3><div class="latex-content" id="editor-problem-preview"></div></section><section><h3>解答</h3><div class="latex-content" id="editor-solution-preview"></div></section></div></div>
          <div class="form-group editor-full"><label>内部备注（仅管理员可见）</label><textarea class="textarea" name="internal_notes" style="min-height:90px">${esc(p.admin?.internal_notes||'')}</textarea></div>
          <div class="form-group editor-full"><label>新增附件（可多选 ZIP/PDF/TEX）</label><input class="input" name="files" type="file" multiple accept=".zip,.pdf,.tex,application/zip,application/pdf,text/plain"></div>
          <div class="form-group editor-full"><div class="toggle-row"><button type="button" class="toggle ${p.published?'on':''}" id="published-toggle" aria-label="发布状态"></button><strong id="published-label">${p.published?'已发布，游客可见':'已隐藏，仅管理员可见'}</strong><input type="hidden" name="published" value="${p.published?'true':'false'}"></div></div>
          ${!isNew && (p.files||[]).length?`<div class="form-group editor-full"><label>现有附件</label><div class="file-table">${p.files.map(f=>`<div class="file-row"><span class="file-type">${esc((f.file_type||'').toUpperCase())}</span><div class="file-info"><strong>${esc(f.original_name)}</strong><span>${formatBytes(f.size_bytes)}</span></div><button type="button" class="mini-btn" data-delete-file="${attr(f.id)}">删除</button></div>`).join('')}</div></div>`:''}
        </div>
      </div><div class="modal-foot">${!isNew?`<button type="button" class="danger-btn" style="margin-right:auto" id="delete-problem-button">删除题目</button>`:'<span style="margin-right:auto"></span>'}<button type="button" class="soft-btn" id="editor-preview-button">预览格式</button><button type="button" class="soft-btn" data-close-modal>取消</button><button class="primary-btn" id="editor-save" type="submit">保存题目</button></div></form>
    </div></div>`;
    modalRoot.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
    modalRoot.querySelector('.modal-backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
    const form=document.getElementById('editor-form');
    document.getElementById('published-toggle')?.addEventListener('click',e=>{
      e.currentTarget.classList.toggle('on'); const on=e.currentTarget.classList.contains('on'); form.published.value=String(on); document.getElementById('published-label').textContent=on?'已发布，游客可见':'已隐藏，仅管理员可见';
    });
    document.getElementById('editor-preview-button')?.addEventListener('click',async()=>{
      const wrap=document.getElementById('editor-render-preview');
      const problemPreview=document.getElementById('editor-problem-preview');
      const solutionPreview=document.getElementById('editor-solution-preview');
      problemPreview.innerHTML=latexToHtml(form.problem_content.value,{stripLeading:'problem'});
      solutionPreview.innerHTML=latexToHtml(form.solution_content.value,{stripLeading:'solution'});
      wrap.classList.remove('hidden');
      await typesetMath(wrap);
      wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    document.getElementById('tex-import')?.addEventListener('change',async e=>{
      const f=e.target.files?.[0]; if(!f)return; const text=await f.text(); const parsed=parseTexDocument(text);
      if(parsed.title)form.title.value=parsed.title;
      if(parsed.difficulty)form.difficulty.value=parsed.difficulty;
      if(parsed.problem)form.problem_content.value=parsed.problem;
      if(parsed.solution)form.solution_content.value=parsed.solution;
      toast('已从 TeX 识别题目和解答','success');
    });
    modalRoot.querySelectorAll('[data-delete-file]').forEach(b=>b.addEventListener('click',()=>deleteFile(b.dataset.deleteFile,p)));
    document.getElementById('delete-problem-button')?.addEventListener('click',()=>deleteProblem(p));
    form.addEventListener('submit',e=>saveProblem(e,p,isNew));
  }

  function closeModal(){modalRoot.innerHTML='';}

  async function saveProblem(e, oldProblem, isNew) {
    e.preventDefault();
    const form=e.currentTarget, btn=document.getElementById('editor-save');
    btn.disabled=true;btn.innerHTML='<span class="spinner"></span>保存中';
    const code=form.code.value.trim().toUpperCase();
    const extras=form.extra_tags.value.split(/[,，]/).map(x=>x.trim()).filter(x=>x&&!SUBJECTS.includes(x)); const payload={code,title:form.title.value.trim(),sort_order:Number(form.sort_order.value)||0,problem_content:form.problem_content.value,solution_content:form.solution_content.value,content_format:'mixed-latex',tags:[form.subject.value,...new Set(extras)],published:form.published.value==='true'};
    let result;
    if(isNew) result=await client.from('problems').insert(payload).select().single();
    else result=await client.from('problems').update(payload).eq('id',oldProblem.id).select().single();
    if(result.error){btn.disabled=false;btn.textContent='保存题目';return toast(result.error.message,'error');}
    const problem=result.data;
    const meta={problem_id:problem.id,difficulty:form.difficulty.value.trim(),institution:form.institution.value,original_code:form.original_code.value.trim(),duplicate_note:form.duplicate_note.value.trim(),internal_notes:form.internal_notes.value};
    const {error:metaErr}=await client.from('problem_admin').upsert(meta,{onConflict:'problem_id'});
    if(metaErr){btn.disabled=false;btn.textContent='保存题目';return toast(metaErr.message,'error');}
    const files=[...form.files.files];
    for(const file of files){
      const type=fileType(file.name); const storagePath=`${code}/${type}-${Date.now()}-${safeFileName(file.name)}`;
      const {error:upErr}=await client.storage.from('problem-files').upload(storagePath,file,{upsert:false,contentType:file.type||mimeFor(type)});
      if(upErr){toast(`附件 ${file.name} 上传失败：${upErr.message}`,'error');continue;}
      await client.from('problem_files').insert({problem_id:problem.id,file_type:type,storage_path:storagePath,original_name:file.name,size_bytes:file.size,mime_type:file.type||mimeFor(type)});
    }
    await loadProblems(); closeModal(); toast('题目已保存','success'); navigate(`/problem/${encodeURIComponent(code)}`);
  }

  async function deleteProblem(problem) {
    if(!confirm(`确定永久删除“${problem.title}”吗？题目、管理信息和附件都会删除。`))return;
    const paths=(problem.files||[]).map(f=>f.storage_path);
    if(paths.length){const {error:sErr}=await client.storage.from('problem-files').remove(paths);if(sErr)return toast(sErr.message,'error');}
    const {error}=await client.from('problems').delete().eq('id',problem.id);
    if(error)return toast(error.message,'error');
    await loadProblems();closeModal();toast('题目已删除','success');navigate('/admin');
  }

  async function deleteFile(id, problem) {
    const f=(problem.files||[]).find(x=>x.id===id); if(!f)return;
    if(!confirm(`确定删除附件“${f.original_name}”吗？`))return;
    const {error:sErr}=await client.storage.from('problem-files').remove([f.storage_path]);
    if(sErr)return toast(sErr.message,'error');
    await client.from('problem_files').delete().eq('id',id);
    await loadProblems(); closeModal(); openEditor(getProblem(problem.code)); toast('附件已删除','success');
  }

  function parseTexDocument(text) {
    const body=(text.split('\\begin{document}')[1]||text).split('\\end{document}')[0];
    const clean=s=>s.replace(/\\(?:textbf|LARGE|Large|large|normalsize)\s*\{?([^}\n]*)\}?/g,'$1').replace(/\\\\/g,' ').replace(/\s+/g,' ').trim().replace(/^[{}]+|[{}]+$/g,'');
    const center=body.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/)?.[1]||'';
    let title=clean(center.match(/供题材料[：:]\s*(.*?)(?=\\\\|\n|预估难度)/s)?.[1]||center.match(/\\textbf\{([^\n]+?)\}/)?.[1]||'');
    let difficulty=clean(body.match(/预估难度[：:]\s*(.*?)(?=\\\\|\n|\\end\{center\})/s)?.[1]||'');
    const find=(name)=>{const m=body.match(new RegExp(`\\\\section\\*?\\{\\s*${name}\\s*\\}`));return m?{start:m.index,end:m.index+m[0].length}:null};
    const q=find('题目'),a=find('答案'),s=find('解答'); let problem='',solution='';
    if(q){const end=[a,s].filter(x=>x&&x.start>q.end).sort((x,y)=>x.start-y.start)[0]?.start||body.length;problem=body.slice(q.end,end).trim()}
    if(s){solution=body.slice(s.end).trim();const stops=['评分标准','考查内容','原创声明','供题者信息'];for(const name of stops){const m=solution.match(new RegExp(`\\\\section\\*?\\{\\s*${name}.*?\\}`));if(m)solution=solution.slice(0,m.index).trim()}}
    if(a&&s&&a.start<s.start)solution=`\\subsection*{答案}\n${body.slice(a.end,s.start).trim()}\n\n${solution}`;
    return {title,difficulty,problem,solution};
  }

  async function importBundle(file) {
    if(state.importBusy)return;
    state.importBusy=true; renderAdmin();
    const wrap=document.getElementById('import-progress-wrap'),bar=document.getElementById('import-progress'),text=document.getElementById('import-progress-text');
    wrap?.classList.remove('hidden');
    try{
      const zip=await JSZip.loadAsync(file);
      const manifestFile=zip.file('manifest.json'); if(!manifestFile)throw new Error('导入包缺少 manifest.json');
      const manifest=JSON.parse(await manifestFile.async('text'));
      const total=manifest.problems?.length||0; if(!total)throw new Error('导入包中没有题目');
      for(let i=0;i<total;i++){
        const p=manifest.problems[i];
        text.textContent=`${i+1}/${total}  正在导入 ${p.code} ${p.title}`; bar.style.width=`${Math.round(i/total*100)}%`;
        const {data:problem,error:pErr}=await client.from('problems').upsert({code:p.code,title:p.title,problem_content:sanitizePublicLatex(p.problem_content),solution_content:sanitizePublicLatex(p.solution_content),content_format:p.content_format||'mixed-latex',tags:importedTags(p),published:p.published!==false,sort_order:p.sort_order||i+1},{onConflict:'code'}).select().single();
        if(pErr)throw new Error(`${p.code} 写入失败：${pErr.message}`);
        const {error:mErr}=await client.from('problem_admin').upsert({problem_id:problem.id,...(p.admin||{})},{onConflict:'problem_id'});if(mErr)throw new Error(`${p.code} 管理信息失败：${mErr.message}`);
        for(const f of p.files||[]){
          const zf=zip.file(f.bundle_path); if(!zf)continue;
          const blob=await zf.async('blob'); const storagePath=`${p.code}/${f.file_type}.${f.file_type==='tex'?'tex':f.file_type}`;
          const typed=new Blob([blob],{type:f.mime_type||mimeFor(f.file_type)});
          const {error:uErr}=await client.storage.from('problem-files').upload(storagePath,typed,{upsert:true,contentType:f.mime_type||mimeFor(f.file_type)});if(uErr)throw new Error(`${p.code} 附件失败：${uErr.message}`);
          const {error:fErr}=await client.from('problem_files').upsert({problem_id:problem.id,file_type:f.file_type,storage_path:storagePath,original_name:f.original_name,size_bytes:f.size_bytes||typed.size,mime_type:f.mime_type||typed.type},{onConflict:'storage_path'});if(fErr)throw new Error(`${p.code} 附件索引失败：${fErr.message}`);
        }
      }
      bar.style.width='100%';text.textContent=`导入完成：${total} 道题目，附件已写入私有存储。`;
      await loadProblems(); toast('初始题库导入完成','success');
    }catch(err){console.error(err);text.textContent=`导入失败：${err.message}`;toast(err.message,'error');}
    finally{state.importBusy=false;}
  }

  function buildExportManifest() {
    return {version:1,name:'数之谜题库备份',exported_at:new Date().toISOString(),problem_count:state.problems.length,problems:state.problems.map(p=>({
      code:p.code,sort_order:p.sort_order,title:p.title,problem_content:p.problem_content,solution_content:p.solution_content,content_format:p.content_format||'mixed-latex',primary_category:inferPrimarySubject(p),tags:displayTags(p),published:p.published,
      admin:{difficulty:p.admin?.difficulty||'',institution:p.admin?.institution||'',original_code:p.admin?.original_code||'',duplicate_note:p.admin?.duplicate_note||'',internal_notes:p.admin?.internal_notes||''},
      files:(p.files||[]).map(f=>({file_type:f.file_type,bundle_path:`files/${p.code}/${safeFileName(f.original_name)}`,original_name:f.original_name,mime_type:f.mime_type,size_bytes:f.size_bytes,storage_path:f.storage_path,id:f.id}))
    }))};
  }

  function exportJson() { downloadBlob(new Blob([JSON.stringify(buildExportManifest(),null,2)],{type:'application/json'}),`数之谜题库_${dateStamp()}.json`); }

  async function exportFullBackup() {
    const status=document.getElementById('backup-status'); status.textContent='正在读取私有附件…';
    try{
      const manifest=buildExportManifest(),zip=new JSZip();
      for(let i=0;i<manifest.problems.length;i++){
        const p=manifest.problems[i];status.textContent=`${i+1}/${manifest.problems.length}  ${p.code}`;
        for(const f of p.files){const {data,error}=await client.storage.from('problem-files').download(f.storage_path);if(error)throw error;zip.file(f.bundle_path,data);delete f.storage_path;delete f.id;}
      }
      zip.file('manifest.json',JSON.stringify(manifest,null,2));status.textContent='正在生成 ZIP…';
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,`数之谜完整备份_${dateStamp()}.zip`);status.textContent='完整备份已生成。';toast('完整备份已导出','success');
    }catch(e){status.textContent=`备份失败：${e.message}`;toast(e.message,'error');}
  }

  async function downloadFile(id) {
    const f=state.problems.flatMap(p=>p.files||[]).find(x=>x.id===id);if(!f)return;
    toast(`正在读取 ${f.original_name}`);
    const {data,error}=await client.storage.from('problem-files').download(f.storage_path);
    if(error)return toast(error.message,'error');
    downloadBlob(data,f.original_name);
  }

  function renderSetup() {
    const content=`<div class="setup-wrap"><section class="setup-card">
      <div class="brand-mark">数</div><h1>网站源码已就绪</h1><p style="color:var(--muted)">目前 config.js 还没有填入 Supabase 项目信息，因此网站处于安装提示页。</p>
      <div class="setup-step"><span class="setup-num">1</span><div><h3>建立 Supabase 免费项目</h3><p>运行源码包中的 supabase/schema.sql，并创建管理员用户。</p></div></div>
      <div class="setup-step"><span class="setup-num">2</span><div><h3>填写 config.js</h3><p>把项目 URL 和 Publishable/anon key 替换到下面两行。</p></div></div>
      <pre class="code-box">SUPABASE_URL: "https://你的项目.supabase.co",\nSUPABASE_ANON_KEY: "你的 Publishable 或 anon key"</pre>
      <div class="setup-step"><span class="setup-num">3</span><div><h3>部署并导入题库</h3><p>部署到 GitHub Pages 后，以 adminpzh 登录，再选择“首次导入题库_42题.zip”。</p></div></div>
      <p class="form-help">完整无代码步骤请看源码包根目录的《部署说明.html》。</p>
    </section></div>`;
    app.innerHTML=layout(content,'home');
  }

  function bindAdminActions(target) {
    const tab=target.closest('[data-admin-tab]');if(tab){state.adminTab=tab.dataset.adminTab;renderAdmin();return true}
    return false;
  }

  document.addEventListener('click', async e => {
    const t=e.target;
    if(bindAdminActions(t))return;
    const nav=t.closest('[data-nav]'); if(nav){e.preventDefault();navigate(nav.dataset.nav);return}
    const open=t.closest('[data-open-problem]');if(open){navigate(`/problem/${encodeURIComponent(open.dataset.openProblem)}`);return}
    const edit=t.closest('[data-edit-problem]');if(edit){openEditor(getProblem(edit.dataset.editProblem));return}
    const dl=t.closest('[data-download-file]');if(dl){downloadFile(dl.dataset.downloadFile);return}
    const tag=t.closest('[data-tag]');if(tag){state.tag=tag.dataset.tag;renderHome();return}
    const action=t.closest('[data-action]')?.dataset.action;
    if(action==='theme')toggleTheme();
    if(action==='focus-search'){navigate('/');setTimeout(()=>document.getElementById('main-search')?.focus(),30)}
    if(action==='new-problem')openEditor();
    if(action==='refresh'){await loadProblems();renderAdmin();toast('题库已刷新','success')}
    if(action==='logout')logout();
    if(action==='export-json')exportJson();
    if(action==='export-full')exportFullBackup();
  });

  document.addEventListener('keydown',e=>{
    const card=e.target.closest?.('[data-open-problem]');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();navigate(`/problem/${encodeURIComponent(card.dataset.openProblem)}`)}
    if(e.key==='Escape'&&modalRoot.innerHTML)closeModal();
  });

  function renderRoute() {
    if(!isConfigured){renderSetup();return}
    const route=currentRoute();
    if(route==='/'){renderHome();return}
    if(route==='/login'){renderLogin();return}
    if(route==='/admin'){renderAdmin();return}
    const m=route.match(/^\/problem\/(.+)$/);if(m){renderDetail(decodeURIComponent(m[1]));return}
    navigate('/');
  }

  async function init() {
    setTheme(localStorage.getItem('szm-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
    if(!isConfigured){state.loading=false;renderSetup();return}
    const {data}=await client.auth.getSession();state.session=data.session;await resolveAdmin();await loadProblems();
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(async()=>{state.session=session;await resolveAdmin();await loadProblems(false);renderRoute();},0)});
    renderRoute();
  }

  window.addEventListener('hashchange',renderRoute);

  function debounce(fn,ms){let id;return(...args)=>{clearTimeout(id);id=setTimeout(()=>fn(...args),ms)}}
  function fileType(name=''){const ext=name.split('.').pop().toLowerCase();return ['zip','pdf','tex'].includes(ext)?ext:'other'}
  function mimeFor(type){return type==='zip'?'application/zip':type==='pdf'?'application/pdf':type==='tex'?'application/x-tex':'application/octet-stream'}
  function safeFileName(name='file'){return name.normalize('NFKC').replace(/[^\w.\-\u4e00-\u9fff]+/g,'_').slice(0,120)||'file'}
  function formatBytes(n=0){if(!n)return'0 B';const u=['B','KB','MB','GB'];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return`${(n/1024**i).toFixed(i?1:0)} ${u[i]}`}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function dateStamp(){const d=new Date();return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`}

  init();
})();
