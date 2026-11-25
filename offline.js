/* 诗歌库：离线歌谱包 + 整库导出 / 导入
 * 依赖 app.js 里的全局变量和函数（songData、songLibrary、findSongLibEntryByTitle、showToast …），
 * 所以必须放在 app.js 之后加载。对外只有一个入口：window.OL。
 */
(function () {
  'use strict';

  const OL_CACHE = 'songlib-scores-v1';            // 要和 sw.js 里的 SCORES 同名
  const LS_PACKS = 'songLibOfflinePacks';
  const $ = (id) => document.getElementById(id);

  let packs = {};                                   // id → { type, key, label, urls, at }
  try { packs = JSON.parse(localStorage.getItem(LS_PACKS) || '{}') || {}; } catch (e) { packs = {}; }
  const savePacks = () => { try { localStorage.setItem(LS_PACKS, JSON.stringify(packs)); } catch (e) {} };

  let rows = [];                                    // 当前窗口里列出的谱包
  let busy = null;                                  // 正在下载：{ idx, cancel }
  let swState = 'checking';                         // checking | ok | unsupported | insecure | error
  let staged = null;                                // 选好、等确认的备份文件内容

  const isHttp = (u) => /^https?:\/\//i.test(u || '');
  const fmtMB = (n) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' GB' : (n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0) + ' MB';

  // ─────────── Service Worker ───────────
  async function registerSW() {
    if (!('serviceWorker' in navigator) || !('caches' in window)) { swState = 'unsupported'; return; }
    const h = location.hostname;
    if (!(location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1')) { swState = 'insecure'; return; }
    try { await navigator.serviceWorker.register('sw.js'); swState = 'ok'; }
    catch (e) { console.error('离线组件注册失败', e); swState = 'error'; }
  }

  // ─────────── 谱包里有哪些图片 ───────────
  function entryUrls(e) { return ((e && e.keys) || []).map(k => k.src).filter(isHttp); }
  function weekUrls(key) {
    const out = new Set();
    (songData[key] || []).forEach(s => {
      if (!s) return;
      if (isHttp(s.src)) out.add(s.src);
      entryUrls(s.title && findSongLibEntryByTitle(s.title)).forEach(u => out.add(u));   // 这首歌在库里的其他调也一起存
    });
    return [...out];
  }
  function bookUrls(name) {
    const out = new Set();
    songLibrary.forEach(s => { if (s.songbook === name) entryUrls(s).forEach(u => out.add(u)); });
    return [...out];
  }
  function favUrls() {
    const out = new Set();
    songLibrary.forEach(s => { if (songLibFavoriteIds.has(s.id)) entryUrls(s).forEach(u => out.add(u)); });
    return [...out];
  }
  function urlsOf(type, key) { return type === 'week' ? weekUrls(key) : type === 'book' ? bookUrls(key) : favUrls(); }

  function buildRows() {
    const cur = (typeof songLibCurWeekKey === 'function') ? songLibCurWeekKey() : '';
    const list = [];
    const weekKeys = Object.keys(songData || {}).filter(k => weekUrls(k).length).sort((a, b) => b.localeCompare(a)).slice(0, 8);
    weekKeys.forEach(k => {
      const d = new Date(k + 'T00:00:00');
      const t = k > cur ? '下周' : (typeof songLibRecentWeekTitle === 'function' ? songLibRecentWeekTitle(k, cur) : '');
      const n = (songData[k] || []).filter(s => s && s.title).length;
      list.push({ id: 'week:' + k, type: 'week', key: k, group: '按周', label: `${t} · ${d.getMonth() + 1}月${d.getDate()}日`, sub: `${n} 首`, urls: weekUrls(k) });
    });
    (songLibSongbooks || []).forEach(name => {
      const urls = bookUrls(name);
      if (!urls.length) return;
      const n = songLibrary.filter(s => s.songbook === name).length;
      list.push({ id: 'book:' + name, type: 'book', key: name, group: '按诗歌本', label: name, sub: `${n} 首`, urls });
    });
    const fu = favUrls();
    if (fu.length) list.push({ id: 'fav', type: 'fav', key: '', group: '我的收藏', label: '我的收藏', sub: `${songLibrary.filter(s => songLibFavoriteIds.has(s.id)).length} 首`, urls: fu });
    return list;
  }

  async function cachedCount(urls) {
    if (!('caches' in window)) return 0;
    const cache = await caches.open(OL_CACHE);
    let n = 0;
    for (let i = 0; i < urls.length; i += 20) {
      const part = await Promise.all(urls.slice(i, i + 20).map(u => cache.match(u).then(Boolean, () => false)));
      n += part.filter(Boolean).length;
    }
    return n;
  }

  // ─────────── 下载 ───────────
  async function fetchPut(cache, u) {
    try {
      const r = await fetch(u, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.http = true; throw e; }
      await cache.put(u, r);
      return 'cors';
    } catch (e) {
      if (e && (e.http || e.name === 'QuotaExceededError')) throw e;
      // 图床没开跨域：退一步用不透明响应缓存（也能离线显示，只是占的空间估算得比较大）
      const r2 = await fetch(u, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      await cache.put(u, r2);
      return 'opaque';
    }
  }

  function setProg(i, done, total, text) {
    const row = document.querySelector(`#olBody .ol-row[data-i="${i}"]`);
    if (!row) return;
    const bar = row.querySelector('.ol-bar i'); if (bar) bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    const st = row.querySelector('.ol-st'); if (st && text) st.textContent = text;
  }

  async function download(i) {
    const row = rows[i]; if (!row) return;
    if (busy) { if (busy.idx === i) { busy.cancel = true; showToast('正在取消…'); } else showToast('正在下载另一个谱包，请稍等'); return; }
    if (!('caches' in window)) { showToast('这个浏览器不支持离线缓存'); return; }
    if (!navigator.onLine) { showToast('现在没有网络，连上网再下载'); return; }
    const urls = row.urls.slice();
    if (!urls.length) { showToast('这个谱包里没有可缓存的谱图'); return; }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // 请求「别在空间紧张时清掉我」
    busy = { idx: i, cancel: false };
    renderBody(true);
    const cache = await caches.open(OL_CACHE);
    const queue = urls.slice();
    let done = 0, fail = 0, opaque = 0, quota = false;
    const total = urls.length;
    async function worker() {
      while (queue.length && !busy.cancel) {
        const u = queue.shift();
        try {
          if (await cache.match(u)) { done++; }
          else {
            let kind;
            try { kind = await fetchPut(cache, u); }
            catch (e1) { if (e1 && e1.name === 'QuotaExceededError') throw e1; kind = await fetchPut(cache, u); }   // 失败自动重试一次
            if (kind === 'opaque') opaque++;
            done++;
          }
        } catch (e) {
          fail++;
          if (e && e.name === 'QuotaExceededError') { quota = true; busy.cancel = true; }
        }
        setProg(i, done + fail, total, `下载中 ${done + fail}/${total}`);
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    const cancelled = busy.cancel && !quota;
    busy = null;
    packs[row.id] = { type: row.type, key: row.key, label: row.label, urls, at: Date.now() };
    savePacks();
    await render();
    if (quota) showToast('⚠️ 手机存储空间不够了，先清理一些再试', 4000);
    else if (cancelled) showToast('已取消，已下载的部分可以离线看');
    else if (fail) showToast(`✅ 已缓存 ${done} 张，${fail} 张失败（可点「更新」补齐）`, 4000);
    else showToast(`✅ 已缓存 ${done} 张谱${opaque ? '（部分来自外部图床，占用空间较大）' : ''}，没信号也能看`, 3500);
  }

  async function remove(i) {
    const row = rows[i]; if (!row || busy) return;
    if (!confirm(`删除「${row.label}」的离线谱图？删除后没信号就看不到这些谱了。`)) return;
    const cache = await caches.open(OL_CACHE);
    const mine = new Set((packs[row.id] && packs[row.id].urls) || row.urls);
    delete packs[row.id];
    const keep = new Set();
    Object.values(packs).forEach(p => (p.urls || []).forEach(u => keep.add(u)));   // 别的谱包还在用的图不能删
    await Promise.all([...mine].filter(u => !keep.has(u)).map(u => cache.delete(u)));
    savePacks();
    await render();
    showToast('已删除');
  }

  // ─────────── 窗口渲染 ───────────
  function envHtml(est) {
    const parts = [];
    if (swState === 'ok') parts.push(navigator.serviceWorker && navigator.serviceWorker.controller
      ? '<span class="ol-ok">✓ 离线功能已启用</span>'
      : '<span class="ol-warn">首次安装完成，刷新一次页面后生效</span>');
    else if (swState === 'insecure') parts.push('<span class="ol-bad">需要用 https 地址访问才能离线使用</span>');
    else if (swState === 'unsupported') parts.push('<span class="ol-bad">当前浏览器不支持离线（微信内置浏览器常见），请用 Safari / Chrome 打开，并「添加到主屏幕」</span>');
    else if (swState === 'error') parts.push('<span class="ol-bad">离线组件启动失败，请确认 sw.js 和 index.html 在同一个文件夹</span>');
    if (est) parts.push(`已用 ${fmtMB(est.usage || 0)}${est.quota ? ' / 可用约 ' + fmtMB(est.quota) : ''}`);
    return parts.join('<br>');
  }

  async function renderBody(keepStatus) {
    const body = $('olBody'); if (!body) return;
    const groups = [];
    rows.forEach((r, i) => { let g = groups.find(x => x.name === r.group); if (!g) { g = { name: r.group, items: [] }; groups.push(g); } g.items.push(i); });
    if (!rows.length) { body.innerHTML = '<div class="ol-empty">还没有带谱图的诗歌可以缓存。先给每周排班选歌、或给诗歌本里的歌上传谱子。</div>'; return; }
    body.innerHTML = groups.map(g => `<div class="ol-sec-title">${escapeHtml(g.name)}</div>` + g.items.map(i => {
      const r = rows[i];
      const isBusy = busy && busy.idx === i;
      const total = r.urls.length;
      const c = r.cached || 0;
      let st, btn, del = '';
      if (isBusy) { st = '下载中…'; btn = `<button class="ol-btn warn" onclick="OL.tap(${i})">取消</button>`; }
      else if (total && c >= total) { st = '✅ 已离线可用'; btn = `<button class="ol-btn ghost" onclick="OL.tap(${i})">重新检查</button>`; del = `<button class="ol-btn ghost" onclick="OL.del(${i})" aria-label="删除">删除</button>`; }
      else if (c > 0) { st = `已缓存 ${c}/${total}，有新谱或缺图`; btn = `<button class="ol-btn" onclick="OL.tap(${i})">更新</button>`; del = `<button class="ol-btn ghost" onclick="OL.del(${i})" aria-label="删除">删除</button>`; }
      else { st = '未下载'; btn = `<button class="ol-btn" onclick="OL.tap(${i})">下载</button>`; }
      return `<div class="ol-row" data-i="${i}"><div class="ol-info"><div class="ol-name">${escapeHtml(r.label)}</div><div class="ol-sub">${escapeHtml(r.sub)} · ${total} 张谱 · <span class="ol-st">${st}</span></div><div class="ol-bar"><i style="width:${isBusy ? 0 : (total ? Math.round(c / total * 100) : 0)}%"></i></div></div><div class="ol-acts">${btn}${del}</div></div>`;
    }).join('')).join('');
  }

  async function render() {
    rows = buildRows();
    for (const r of rows) r.cached = await cachedCount(r.urls);
    let est = null;
    try { if (navigator.storage && navigator.storage.estimate) est = await navigator.storage.estimate(); } catch (e) {}
    const env = $('olEnv'); if (env) env.innerHTML = envHtml(est);
    await renderBody();
    renderImportBox();
  }

  // ─────────── 整库导出 / 导入 ───────────
  function stamp() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }

  function exportAll(tag) {
    const data = {
      app: 'songlib', version: 1, exportedAt: new Date().toISOString(),
      songLibrary: deepClone(songLibrary), categories: deepClone(songLibCategories), songbooks: deepClone(songLibSongbooks),
      tags: deepClone(songLibTags), songData: deepClone(songData), favorites: [...songLibFavoriteIds],
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `诗歌库备份${tag || ''}_${stamp()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (!tag) showToast(`✅ 已导出 ${songLibrary.length} 首诗歌`);
  }

  function pickImport(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || d.app !== 'songlib' || !Array.isArray(d.songLibrary)) throw new Error('bad');
        staged = d;
      } catch (e) { staged = null; showToast('这不是有效的诗歌库备份文件', 3000); }
      renderImportBox();
    };
    rd.onerror = () => showToast('读取文件失败');
    rd.readAsText(f);
  }

  function renderImportBox() {
    const box = $('olImportBox'); if (!box) return;
    if (!staged) { box.innerHTML = ''; return; }
    const d = staged;
    const when = d.exportedAt ? new Date(d.exportedAt).toLocaleString() : '未知时间';
    const weeks = Object.keys(d.songData || {}).length;
    const sum = `备份时间：${escapeHtml(when)}<br>诗歌 ${d.songLibrary.length} 首 · 使用记录 ${weeks} 周 · 收藏 ${(d.favorites || []).length} 个`;
    box.innerHTML = `<div class="ol-stage"><div class="ol-stage-sum">${sum}</div>` + (isAdmin
      ? `<div class="ol-stage-tip"><b>补充导入</b>：只加入现在库里没有的歌和记录，不改动已有内容（推荐）。<br><b>完全覆盖</b>：用备份替换现在的全部数据（本机和云端），覆盖前会先自动下载一份当前数据。</div>
         <div class="ol-stage-btns"><button class="ol-btn" onclick="OL.doMerge()">补充导入</button><button class="ol-btn warn" onclick="OL.doOverwrite()">完全覆盖</button><button class="ol-btn ghost" onclick="OL.cancelImport()">取消</button></div>`
      : `<div class="ol-stage-tip">导入诗歌库数据需要管理员登录。现在只能把备份里的<b>收藏</b>恢复到这台设备。</div>
         <div class="ol-stage-btns"><button class="ol-btn" onclick="OL.doFavorites()">只恢复收藏</button><button class="ol-btn ghost" onclick="OL.cancelImport()">取消</button></div>`) + '</div>';
  }

  async function afterImport(msg) {
    persistSongLibrary(); persistSongLibFavorites(); persistSongLibCategories(); persistSongLibSongbooks(); persistSongLibTags();
    try { songLibCacheRemoteState(); } catch (e) {}
    renderSongLibFilterBar(); renderSongLibraryGrid(); updateSongLibImportHint();
    staged = null; renderImportBox(); render();
    showToast(msg, 3000);
    let ok = true;
    const steps = [() => syncSongLibraryToRemote(), () => syncSongLibCategoriesToRemote(), () => syncSongLibSongbooksToRemote(), () => syncSongLibTagsToRemote(), () => syncRemoteField('song_data', songData)];
    for (const s of steps) { try { await s(); } catch (e) { ok = false; console.error(e); } }
    if (!ok) showToast('已导入到本机，但部分内容云端同步失败，请稍后再试', 4000);
  }

  async function doMerge() {
    if (!isAdmin || !staged) return;
    const d = staged;
    const have = new Set(songLibrary.map(s => s.title.trim().toLowerCase()));
    const incoming = normalizeSongLibrary(d.songLibrary).filter(s => !have.has(s.title.trim().toLowerCase()));
    const ids = new Set(songLibrary.map(s => s.id));
    incoming.forEach(s => { if (ids.has(s.id)) s.id = genSongLibId(); ids.add(s.id); });
    songLibrary = songLibrary.concat(incoming);
    songLibCategories = normalizeSongLibCategoryList([...songLibCategories, ...(d.categories || [])]);
    songLibSongbooks = normalizeSongLibSongbookList([...songLibSongbooks, ...(d.songbooks || [])]);
    songLibTags = normalizeSongLibTagList([...songLibTags, ...(d.tags || [])]);
    const bd = normalizeSongData(d.songData);
    let weeks = 0;
    Object.keys(bd).forEach(k => { if (bd[k].length && !(songData[k] && songData[k].length)) { songData[k] = bd[k]; weeks++; } });
    const exist = new Set(songLibrary.map(s => s.id));
    (d.favorites || []).forEach(id => { if (exist.has(id)) songLibFavoriteIds.add(id); });
    await afterImport(`✅ 已补充 ${incoming.length} 首诗歌、${weeks} 周使用记录`);
  }

  async function doOverwrite() {
    if (!isAdmin || !staged) return;
    if (!confirm(`将用备份（${staged.songLibrary.length} 首诗歌）覆盖现在的全部诗歌库数据，本机和云端都会被替换。\n覆盖前会先自动下载一份当前数据，确定继续吗？`)) return;
    exportAll('_覆盖前');
    const d = staged;
    songLibrary = normalizeSongLibrary(d.songLibrary);
    songLibCategories = normalizeSongLibCategoryList(d.categories || []);
    songLibSongbooks = normalizeSongLibSongbookList(d.songbooks || []);
    songLibTags = normalizeSongLibTagList(d.tags || []);
    songData = normalizeSongData(d.songData);
    const exist = new Set(songLibrary.map(s => s.id));
    songLibFavoriteIds = new Set((d.favorites || []).filter(id => exist.has(id)));
    await afterImport(`✅ 已用备份覆盖，共 ${songLibrary.length} 首诗歌`);
  }

  function doFavorites() {
    if (!staged) return;
    const exist = new Set(songLibrary.map(s => s.id));
    const titleToId = new Map(songLibrary.map(s => [s.title.trim().toLowerCase(), s.id]));
    const backupById = new Map((staged.songLibrary || []).map(s => [s.id, (s.title || '').trim().toLowerCase()]));
    let n = 0;
    (staged.favorites || []).forEach(id => {
      const real = exist.has(id) ? id : titleToId.get(backupById.get(id) || '');   // id 对不上时按歌名找
      if (real && !songLibFavoriteIds.has(real)) { songLibFavoriteIds.add(real); n++; }
    });
    persistSongLibFavorites();
    renderSongLibraryGrid();
    staged = null; renderImportBox();
    showToast(`✅ 已恢复 ${n} 个收藏`);
  }

  // ─────────── 窗口开关 ───────────
  function open() {
    const ov = $('olOverlay'); if (!ov) return;
    ov.classList.add('open');
    $('olBody').innerHTML = '<div class="ol-empty">读取中…</div>';
    render();
  }
  function close(e) {
    if (e && e.target !== e.currentTarget) return;
    const ov = $('olOverlay'); if (ov) ov.classList.remove('open');
  }

  // ─────────── 网络状态 ───────────
  function netState() { document.documentElement.classList.toggle('is-offline', !navigator.onLine); }
  window.addEventListener('offline', () => { netState(); showToast('📴 已离线：可以看已缓存的歌谱', 3500); });
  window.addEventListener('online', () => { netState(); showToast('✅ 网络已恢复'); });
  netState();

  window.OL = {
    open, close, tap: download, del: remove, exportAll: () => exportAll(), pickImport,
    doMerge, doOverwrite, doFavorites, cancelImport: () => { staged = null; renderImportBox(); },
  };

  registerSW();
})();
