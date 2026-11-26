/* 诗歌库 · 首页精简
 * 1) 顶栏只留「搜索」和「⋯ 更多」，其余按钮（离线与备份、使用引导、长辈模式、字号、上传、管理员…）收进菜单
 * 2) 首页的三条提示条（导入 / 合并 / 久未使用）不再占首屏：有待处理的事时「⋯」上出现红点，菜单里列出来
 * 3) 「诗歌库 / 专属搜索」切换只在需要时出现（点搜索框、已有关键词、或处于专属搜索时）
 * 只做「显示层」的事：不改任何数据；原有按钮保留各自的 id 和 onclick，只是搬进了菜单里。
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const diag = (e, where) => { try { slDiag(e, where); } catch (_) { /* 忽略 */ } };

  // ───────── 待处理事项（来自原来的三条提示条）─────────
  const isShown = id => { const e = $(id); return !!(e && e.classList.contains('show')); };
  const txt = id => { const e = $(id); return e ? e.textContent.trim() : ''; };

  function todos() {
    const a = [];
    if (isShown('songLibImportHint')) a.push({
      icon: 'ti-download', label: '导入 ' + txt('songLibImportCount') + ' 首历史诗歌',
      sub: '历史排班里唱过、诗歌库还没收录', run: () => importHistoricalSongs(),
    });
    if (isShown('songLibDupHint')) a.push({
      icon: 'ti-git-merge', label: '合并 ' + txt('songLibDupCount') + ' 组同名歌曲',
      sub: '合并后同一首歌可以切换不同的谱', run: () => openSongLibMerge(),
    });
    if (isShown('songLibStaleHint')) a.push({
      icon: 'ti-hourglass-high', label: txt('songLibStaleCount') + ' 首歌超过' + txt('songLibStaleWk') + '没唱了',
      sub: '点一下只看这些歌', run: () => songLibShowStale(), dismiss: true, noBar: true,
    });
    try {
      if (window.SU && SU.count()) a.push({
        icon: 'ti-inbox', label: SU.count() + ' 首上传待审核',
        sub: '大家上传的诗歌，通过后才会收进诗歌库', run: () => SU.open(),
      });
    } catch (e) { diag(e, 'slMore.todo.su'); }
    return a;
  }

  function renderTodo(list) {
    const box = $('slMoreTodo'); if (!box) return;
    box.textContent = '';
    box.hidden = !list.length;
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'sl-more-sec'; h.textContent = '待处理';
    box.appendChild(h);
    list.forEach(it => {
      const row = document.createElement('div'); row.className = 'sl-mi-row';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sl-mi todo';
      const ic = document.createElement('i'); ic.className = 'ti ' + it.icon;
      const lb = document.createElement('span'); lb.className = 'sl-mi-l'; lb.textContent = it.label;
      const sm = document.createElement('small'); sm.textContent = it.sub; lb.appendChild(sm);
      b.append(ic, lb);
      b.addEventListener('click', () => { close(); try { it.run(); } catch (e) { diag(e, 'slMore.todo'); } });
      row.appendChild(b);
      if (it.dismiss) {
        const x = document.createElement('button'); x.type = 'button'; x.className = 'sl-mi-x';
        x.title = '7 天内不再提示'; x.setAttribute('aria-label', '7 天内不再提示');
        x.innerHTML = '<i class="ti ti-x"></i>';
        x.addEventListener('click', e => { e.stopPropagation(); try { songLibDismissStaleHint(e); } catch (err) { diag(err, 'slMore.dismiss'); } refresh(); });
        row.appendChild(x);
      }
      box.appendChild(row);
    });
  }

  // ───────── 管理员待办条（首页顶部，可收起；普通用户看不到）─────────
  // 内容 = 菜单里的待处理（导入 / 合并 / 上传审核）+ 歌谱纠错；「久未使用」只是参考信息，不放进来
  const LS_BAR = 'slAdminBarFold';
  function barItems() {
    const a = todos().filter(x => !x.noBar);
    const fx = $('fxDot'), n = fx ? fx.textContent.trim() : '';
    if (n) a.push({ icon: 'ti-flag', label: n + ' 条歌谱纠错', run: () => { if (window.FX) FX.openInbox(); } });
    return a;
  }
  function barSig(list) { return list.map(x => x.label).join('|'); }
  function renderAdminBar() {
    let bar = $('slAdminBar');
    const main = document.querySelector('.song-lib-main');
    let on = false, list = [];
    try { on = !!isAdmin; } catch (e) { on = false; }
    if (on) list = barItems();
    if (!on || !list.length) { if (bar) bar.hidden = true; return; }
    if (!main) return;
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'slAdminBar'; bar.className = 'sl-abar';
      main.insertBefore(bar, main.firstChild);
    }
    const sig = barSig(list);
    let folded = false;
    try { folded = localStorage.getItem(LS_BAR) === sig; } catch (e) { /* 忽略 */ }   // 只在「内容没变」时保持收起；有新的待办就自动展开
    bar.hidden = false; bar.classList.toggle('fold', folded);
    bar.textContent = '';
    const head = document.createElement('button'); head.type = 'button'; head.className = 'sl-abar-h';
    head.setAttribute('aria-expanded', folded ? 'false' : 'true');
    head.innerHTML = '<i class="ti ti-bell-ringing"></i><span></span><i class="ti ti-chevron-down sl-abar-c"></i>';
    head.querySelector('span').textContent = '待处理 ' + list.length + ' 项';
    head.addEventListener('click', () => {
      const f = !bar.classList.contains('fold');
      try { if (f) localStorage.setItem(LS_BAR, sig); else localStorage.removeItem(LS_BAR); } catch (e) { diag(e, 'abar.fold'); }
      renderAdminBar();
    });
    bar.appendChild(head);
    if (!folded) {
      const body = document.createElement('div'); body.className = 'sl-abar-b';
      list.forEach(it => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'sl-abar-i';
        const ic = document.createElement('i'); ic.className = 'ti ' + it.icon;
        const t = document.createElement('span'); t.textContent = it.label;
        b.append(ic, t);
        b.addEventListener('click', () => { try { it.run(); } catch (e) { diag(e, 'abar.run'); } });
        body.appendChild(b);
      });
      bar.appendChild(body);
    }
  }

  let fxWatched = false;
  function refresh() {
    try { renderAdminBar(); } catch (e) { diag(e, 'renderAdminBar'); }
    try {
      const list = todos();
      const fx = $('fxDot'), fxOn = !!(fx && fx.textContent.trim());
      const dot = $('slMoreDot'); if (dot) dot.hidden = !(list.length || fxOn);
      renderTodo(list);
      const hasElder = !!$('elderToggleBtn');
      ['slMoreElder', 'slMoreFont'].forEach(id => { const e = $(id); if (e) e.hidden = !hasElder; });
      if (fx && !fxWatched) {   // 纠错收件箱的未处理数变化时，红点跟着变
        fxWatched = true;
        new MutationObserver(refresh).observe(fx, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) { diag(e, 'slMoreRefresh'); }
  }

  // ───────── 菜单开关 ─────────
  const menu = () => $('slMoreMenu'), btn = () => $('slMoreBtn');
  const isOpen = () => { const m = menu(); return !!(m && m.classList.contains('open')); };
  function open() {
    const m = menu(), b = btn(); if (!m || !b) return;
    refresh();
    m.classList.add('open'); m.scrollTop = 0;
    b.classList.add('active'); b.setAttribute('aria-expanded', 'true');
  }
  function close() {
    const m = menu(), b = btn(); if (!m || !b) return;
    m.classList.remove('open');
    b.classList.remove('active'); b.setAttribute('aria-expanded', 'false');
  }
  window.slMoreOpen = open;
  window.slMoreClose = close;
  window.slMoreRefresh = refresh;
  window.slMoreToggle = function (e) { if (e) e.stopPropagation(); isOpen() ? close() : open(); };
  // 长辈模式 / 字号：菜单里只是转发，真正的按钮仍由 elder.js 管（长辈模式下它们会直接显示在顶栏）
  window.slMoreProxy = function (id) { close(); const b = $(id); if (b) b.click(); };

  document.addEventListener('pointerdown', e => {
    if (!isOpen()) return;
    if (e.target.closest && e.target.closest('#slMoreWrap')) return;
    try { if (typeof ob !== 'undefined' && ob.on) return; } catch (_) { /* 忽略 */ }   // 使用引导进行中，点引导框不收菜单
    close();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
  // 点菜单里的任意一行（除了待处理里的 ✕）后自动收起
  const mm = menu();
  if (mm) mm.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button');
    if (b && !b.classList.contains('sl-mi-x')) close();
  });

  // ───────── 提示条变化 → 刷新红点 ─────────
  ['songLibImportHint', 'songLibDupHint', 'songLibStaleHint'].forEach(id => {
    const el = $(id);
    if (el) new MutationObserver(refresh).observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // ───────── 「诗歌库 / 专属搜索」切换：需要时才出现 ─────────
  let scopeT = 0;
  function syncScope() {
    const page = $('songLibraryOverlay'), inp = $('songLibSearchInput');
    if (!page || !inp) return;
    page.classList.toggle('scope-show', !!inp.value.trim() || document.activeElement === inp);
  }
  function scopeLater(ms) { clearTimeout(scopeT); scopeT = setTimeout(syncScope, ms); }
  document.addEventListener('focusin', e => { if (e.target && e.target.id === 'songLibSearchInput') scopeLater(0); });
  document.addEventListener('focusout', e => { if (e.target && e.target.id === 'songLibSearchInput') scopeLater(300); });   // 稍等一下，免得点切换按钮时它先消失
  document.addEventListener('input', e => { if (e.target && e.target.id === 'songLibSearchInput') scopeLater(0); });
  const clr = $('songLibSearchClear');
  if (clr) new MutationObserver(() => scopeLater(0)).observe(clr, { attributes: true, attributeFilter: ['class'] });   // 清除按钮出现 / 消失 = 关键词有 / 无
  syncScope();

  refresh();
})();
