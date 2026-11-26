/* 会众功能：点歌建议箱 + 本周主题推荐
 * 对外入口：window.SG
 * 依赖 app.js 里的全局：songLibrary / songData / isAdmin / supabaseClient / initSupabaseClient /
 *   showToast / escapeHtml / songLibPyMatch / songLibCurWeekKey / songLibUsageState / songLibStaleText /
 *   getSongLibTags / songLibHasTag / weekPickSel / weekPickToggle / renderWeekPick / songLibPickWeekSongs …
 * 数据在两张独立的表里（见 supabase_song_requests.sql）：song_requests（点歌，任何人可投）、song_themes（主题，管理员可写）。
 * 表还没建好时，普通用户什么都看不到；管理员会在首页看到一条「还没开通」的提示。
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => escapeHtml(s == null ? '' : s);
  const T_REQ = 'song_requests', V_REQ = 'song_requests_public', T_THEME = 'song_themes';
  const MAX_PER_WEEK = 3;
  const st = {
    reqOk: false, themeOk: false, missing: false, draft: null, hidden: false,
    requests: [], theme: null, loadedAt: 0, loading: null,
    agg: [], rec: [], recKey: '', sug: [], chosenId: '', editing: false, tagsDraft: [], busy: false,
  };

  // ───────── 小工具 ─────────
  function client() { try { return initSupabaseClient() ? supabaseClient : null; } catch (e) { return null; } }
  function toast(m, d) { try { showToast(m, d); } catch (e) { /* 忽略 */ } }
  function diag(e, where) { try { slDiag(e, 'SG.' + where); } catch (_) { console.error(where, e); } }
  const norm = t => String(t || '').trim().toLowerCase().replace(/[\s·・。，,.!！?？、《》「」“”"'’‘（）()\-—_]/g, '');
  function rnd() { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  let memDev = '';
  function deviceId() {
    try { let v = localStorage.getItem('songlibDeviceId'); if (!v || v.length < 8) { v = rnd(); localStorage.setItem('songlibDeviceId', v); } return v; }
    catch (e) { return memDev || (memDev = rnd()); }
  }
  function myStore() { try { const o = JSON.parse(localStorage.getItem('songlibMyReqs') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function myList(wk) { const o = myStore(); return Array.isArray(o[wk]) ? o[wk] : []; }
  function myAdd(wk, key) {
    try {
      const o = myStore(), n = {};
      Object.keys(o).sort().slice(-3).forEach(k => { n[k] = o[k]; });
      n[wk] = Array.from(new Set([...(n[wk] || []), key]));
      localStorage.setItem('songlibMyReqs', JSON.stringify(n));
    } catch (e) { diag(e, 'myAdd'); }
  }
  function isMissingErr(err) {
    if (!err) return false;
    const m = String(err.message || err.details || err.hint || '').toLowerCase(), c = String(err.code || '');
    return c === 'PGRST205' || c === '42P01' || c === 'PGRST200' || m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find the table');
  }
  function dateText(key) { const d = new Date(key + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; }
  function findLib(id, title) {
    return (id && songLibrary.find(s => s.id === id)) || songLibrary.find(s => norm(s.title) === norm(title)) || null;
  }
  function thumbHtml(s) {
    const src = s && s.keys && s.keys[0] && s.keys[0].src;
    return src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i class="ti ti-photo"></i>';
  }
  function previewSong(s) {
    const k = s && s.keys && s.keys.find(x => x && x.src);
    if (!k) { toast('这首歌还没有歌谱图片'); return; }
    openLightboxWithList([{ title: s.title, src: k.src, songId: s.id }], 0);
  }

  // ───────── 读取云端 ─────────
  async function load(force) {
    const c = client();
    if (!c) return false;
    if (st.loading) return st.loading;
    if (!force && st.loadedAt && Date.now() - st.loadedAt < 20000) return true;
    st.loading = (async () => {
      const wk = songLibCurWeekKey();
      const [r1, r2] = await Promise.all([
        c.from(V_REQ).select('id,created_at,req_week,song_title,song_id,reason,nickname,status')
          .eq('req_week', wk).order('created_at', { ascending: false }).limit(300),
        c.from(T_THEME).select('*').eq('week_key', wk).maybeSingle(),
      ]);
      st.reqOk = !r1.error; st.themeOk = !r2.error;
      st.missing = isMissingErr(r1.error) || isMissingErr(r2.error);
      if (r1.error && !isMissingErr(r1.error)) diag(r1.error, 'load.req');
      if (r2.error && !isMissingErr(r2.error)) diag(r2.error, 'load.theme');
      st.requests = r1.error ? [] : (r1.data || []);
      st.theme = r2.error ? null : (r2.data || null);
      st.loadedAt = Date.now(); st.recKey = '';
      return true;
    })().catch(e => { diag(e, 'load'); st.reqOk = st.themeOk = false; return false; })
      .finally(() => { st.loading = null; refreshAll(); });
    return st.loading;
  }
  function enabled() { return st.reqOk || st.themeOk; }

  // ───────── 点歌汇总 ─────────
  function aggregate() {
    const wk = songLibCurWeekKey(), mine = new Set(myList(wk));
    const inWeek = new Set(((songData && songData[wk]) || []).filter(x => x && x.title).map(x => norm(x.title)));
    const map = new Map();
    st.requests.forEach(r => {
      if (r.status === 'dismissed') return;
      const lib = findLib(r.song_id, r.song_title);
      const title = lib ? lib.title : String(r.song_title || '').trim();
      const key = norm(title);
      let a = map.get(key);
      if (!a) { a = { key, title, lib, count: 0, reasons: [], ids: [], last: '', mine: mine.has(key), inWeek: inWeek.has(key) }; map.set(key, a); }
      a.count++; a.ids.push(r.id);
      if ((r.created_at || '') > a.last) a.last = r.created_at || '';
      if (r.reason && r.reason.trim()) a.reasons.push({ text: r.reason.trim(), nick: (r.nickname || '').trim() });
    });
    st.agg = Array.from(map.values()).sort((a, b) => (b.count - a.count) || b.last.localeCompare(a.last));
    return st.agg;
  }

  // ───────── 主题推荐 ─────────
  const SEP = /[\s,，、;；:：。.!！?？/\\|()（）「」《》“”"'’‘·\-–—]+/;
  const STOP = /[的了与和及在是我你他之也都就而并或为以]/;
  const uniq = a => Array.from(new Set(a));
  function themeTokens(th) {
    const title = th.title || '';
    const strong = uniq([...(th.keywords || '').split(SEP), ...title.split(SEP)].map(x => x.trim()).filter(x => x.length >= 2));
    const clean = title.replace(SEP, ''), bi = new Set();
    for (let i = 0; i < clean.length - 1; i++) {
      const g = clean.slice(i, i + 2);
      if (/[\u4e00-\u9fff]/.test(g) && !STOP.test(g)) bi.add(g);
    }
    return { strong, bi: Array.from(bi).filter(g => !strong.includes(g)) };
  }
  function themeTags(th) {
    const blob = ((th.title || '') + ' ' + (th.keywords || '') + ' ' + (th.note || '')).toLowerCase();
    const auto = getSongLibTags().filter(t => blob.includes(t.toLowerCase()));
    return uniq([...(th.tags || []), ...auto]);
  }
  function recommend(th) {
    if (!th || !th.title) return [];
    const { strong, bi } = themeTokens(th), tags = themeTags(th);
    const reqCount = new Map(aggregate().map(a => [a.key, a.count]));
    const out = [];
    songLibrary.forEach(s => {
      const title = (s.title || '').toLowerCase(), lyr = (s.lyrics || '').toLowerCase();
      let sc = 0; const why = [], warn = [];
      const tagHits = tags.filter(t => songLibHasTag(s, t));
      if (tagHits.length) { sc += Math.min(24, 12 * tagHits.length); why.push('标签：' + tagHits.join('、')); }
      const tHit = strong.filter(k => title.includes(k.toLowerCase()));
      if (tHit.length) { sc += 8 * Math.min(2, tHit.length); why.push(`歌名含「${tHit[0]}」`); }
      const tagText = strong.filter(k => (s.tags || []).some(x => x.toLowerCase().includes(k.toLowerCase()) && !tagHits.some(h => h.toLowerCase() === x.toLowerCase())));
      if (tagText.length) { sc += Math.min(10, 5 * tagText.length); if (!tagHits.length) why.push(`标签含「${tagText[0]}」`); }
      const lHit = strong.filter(k => lyr.includes(k.toLowerCase()));
      if (lHit.length) { sc += 3 * Math.min(3, lHit.length); why.push(`歌词含「${lHit.slice(0, 2).join('、')}」`); }
      const bT = bi.filter(g => title.includes(g)).length, bL = bi.filter(g => lyr.includes(g)).length;
      sc += 2 * Math.min(2, bT) + 0.5 * Math.min(6, bL);
      if (!why.length && bL >= 2) why.push('歌词里有相关的词');
      if (!why.length && bT) why.push('歌名里有相关的字');
      if (sc < 3) return;   // 跟主题没什么关系的，不推荐
      const rq = reqCount.get(norm(s.title)) || 0;
      if (rq) { sc += Math.min(8, rq * 2); why.push(`${rq} 人点过`); }
      const u = songLibUsageState(s);
      if (u.state === 'never') { sc += 3; why.push('从未使用'); }
      else if (u.state === 'stale') { sc += 3; why.push(songLibStaleText(u.weeks)); }
      else if (u.state === 'ok' && u.last) {
        if (u.weeks <= 1) { sc -= 6; warn.push('上周刚唱'); }
        else if (u.weeks <= 3) { sc -= 2; warn.push(u.weeks + ' 周前唱过'); }
      }
      if (!(s.keys && s.keys.length)) { sc -= 3; warn.push('缺谱'); }
      out.push({ s, sc, why, warn, rq });
    });
    return out.sort((a, b) => b.sc - a.sc).slice(0, 20);
  }
  function recs() {
    const th = st.theme;
    const key = JSON.stringify([th, songLibrary.length, st.requests.length, Object.keys(songData || {}).length, songLibCurWeekKey()]);
    if (key !== st.recKey) { st.rec = recommend(th); st.recKey = key; }
    return st.rec;
  }

  // ───────── 首页小卡片 ─────────
  try { st.hidden = localStorage.getItem('songlibCongCard') === 'hide'; } catch (e) { /* 忽略 */ }
  function obOn() { try { return !!ob.on; } catch (e) { return false; } }   // 使用引导进行中，卡片照常显示，免得引导里看不到
  function renderPrefBar() {
    const el = $('sgCardPrefBar'); if (!el) return;
    el.innerHTML = [['show', 'ti-eye', '显示'], ['hide', 'ti-eye-off', '隐藏']].map(([v, ic, t]) =>
      `<button type="button" class="song-lib-filter-chip${(st.hidden ? 'hide' : 'show') === v ? ' active' : ''}" onclick="SG.setCardPref('${v}')"><i class="ti ${ic}"></i>${t}</button>`).join('');
  }
  function setCardPref(v) {
    st.hidden = v === 'hide';
    try { localStorage.setItem('songlibCongCard', st.hidden ? 'hide' : 'show'); } catch (e) { diag(e, 'setCardPref'); }
    renderPrefBar(); renderCard();
  }
  function hideCard() { setCardPref('hide'); toast('已隐藏。想再显示，到「筛选 → 会众卡片」里打开', 3500); }
  function cardVisible() {
    try {
      const pg = $('songLibraryOverlay');
      if (pg && (pg.classList.contains('ds-mode') || pg.classList.contains('tab-books'))) return false;   // 专属搜索 / 诗歌本页面不显示
      return songLibTab === 'all' && songLibSearchMode === 'lib' && !songLibSearchKeyword && !songLibSongbookFilter
        && !songLibCategoryFilter && !songLibTagFilter.length && !songLibUsageFilter && songLibWeekDataState !== 'fail' && !songLibSkelOn;
    } catch (e) { return false; }
  }
  function renderCard() {
    const host = $('songLibCongHost'); if (!host) return;
    if (!cardVisible() || (st.hidden && !obOn())) { host.innerHTML = ''; return; }
    if (!enabled()) {
      host.innerHTML = (st.missing && isAdmin)
        ? '<div class="sg-card sg-hint"><i class="ti ti-info-circle"></i><div>点歌建议箱和本周主题还没开通：到 Supabase 的 SQL Editor 里执行项目里的 <b>supabase_song_requests.sql</b> 就行（只需一次）。</div></div>'
        : '';
      return;
    }
    aggregate();
    const th = st.theme;
    let rows = '';
    if (st.themeOk && (th || isAdmin)) {
      const tags = th ? themeTags(th).slice(0, 4).map(t => `<span class="sg-tag">${esc(t)}</span>`).join('') : '';
      rows += `<button type="button" class="sg-row" id="sgThemeRow" onclick="SG.openTheme()"><i class="ti ti-bulb"></i>
        <div class="sg-main"><div class="sg-k">本周主题</div>
        <div class="sg-v">${th ? esc(th.title) + (th.scripture ? `<small>${esc(th.scripture)}</small>` : '') : '<span class="sg-dim">还没有设置，点这里设置</span>'}</div>
        ${tags ? `<div class="sg-tags">${tags}</div>` : ''}</div><i class="ti ti-chevron-right sg-chev"></i></button>`;
    }
    if (st.reqOk) {
      const n = st.agg.reduce((x, a) => x + a.count, 0);
      rows += `<button type="button" class="sg-row" id="sgBoxRow" onclick="SG.openBox()"><i class="ti ti-mailbox"></i>
        <div class="sg-main"><div class="sg-k">点歌建议箱</div><div class="sg-v">想唱哪首？告诉主领${n ? `<small>本周已收到 ${n} 条</small>` : ''}</div></div><i class="ti ti-chevron-right sg-chev"></i></button>`;
    }
    host.innerHTML = rows ? `<section class="sg-card">${rows}<button type="button" class="sg-close" onclick="SG.hideCard()" aria-label="隐藏这张卡片" title="隐藏这张卡片"><i class="ti ti-x"></i></button></section>` : '';
  }

  // ───────── 弹窗骨架（只建一次）─────────
  function build() {
    if ($('sgBoxOverlay')) return;
    const box = document.createElement('div');
    box.className = 'modal-overlay'; box.id = 'sgBoxOverlay'; box.setAttribute('onclick', 'SG.closeBox(event)');
    box.innerHTML = `<div class="song-lib-filter-drawer sg-drawer" onclick="event.stopPropagation()">
      <div class="picker-handle"></div>
      <div class="song-lib-filter-head"><div class="song-lib-filter-title">点歌建议箱</div></div>
      <div class="mg-tip" id="sgBoxTip"></div>
      <div id="sgForm">
        <input class="week-pick-search" id="sgName" type="text" maxlength="60" autocomplete="off" placeholder="想唱哪首？输入歌名或拼音首字母" oninput="SG.onName()">
        <div class="sg-suggest" id="sgSuggest"></div>
        <input class="week-pick-search" id="sgReason" type="text" maxlength="120" autocomplete="off" placeholder="想点这首的原因（选填）">
        <input class="week-pick-search" id="sgNick" type="text" maxlength="20" autocomplete="off" placeholder="称呼（选填，不填显示「匿名」）">
        <div class="sg-quota" id="sgQuota"></div>
        <button type="button" class="btn-save sg-submit" id="sgSubmit" onclick="SG.submit()"><i class="ti ti-send"></i> 投进点歌箱</button>
      </div>
      <div class="ol-sec-title">本周大家想唱的歌</div>
      <div id="sgList"></div>
      <div class="drawer-actions"><button class="btn-cancel" onclick="SG.closeBox()">关闭</button></div>
    </div>`;
    const th = document.createElement('div');
    th.className = 'modal-overlay'; th.id = 'sgThemeOverlay'; th.setAttribute('onclick', 'SG.closeTheme(event)');
    th.innerHTML = `<div class="song-lib-filter-drawer sg-drawer" onclick="event.stopPropagation()">
      <div class="picker-handle"></div>
      <div class="song-lib-filter-head"><div class="song-lib-filter-title">本周主题推荐</div></div>
      <div id="sgThemeBody"></div>
      <div class="drawer-actions"><button class="btn-cancel" onclick="SG.closeTheme()">关闭</button></div>
    </div>`;
    document.body.append(box, th);
    try { $('sgNick').value = localStorage.getItem('songlibNick') || ''; } catch (e) { /* 忽略 */ }
  }

  // ───────── 点歌箱弹窗 ─────────
  function renderBox() {
    if (!$('sgBoxOverlay')) return;
    aggregate();
    const wk = songLibCurWeekKey(), left = Math.max(0, MAX_PER_WEEK - myList(wk).length);
    $('sgBoxTip').textContent = `点给 ${dateText(wk)} 的主日。点歌只是给主领和同工的参考，是否安排由他们决定。`;
    $('sgQuota').textContent = left ? `本周你还能点 ${left} 首（给下面的歌点 ＋1 也算一首）` : `本周你已经点满 ${MAX_PER_WEEK} 首啦，下周再来～`;
    $('sgSubmit').disabled = !left || st.busy;
    const list = $('sgList');
    if (!st.agg.length) { list.innerHTML = '<div class="sg-empty">还没有人点歌，来当第一个吧</div>'; return; }
    list.innerHTML = st.agg.map((a, i) => {
      const rs = (isAdmin ? a.reasons.slice(0, 5) : a.reasons.slice(0, 2))
        .map(r => `<div class="sg-reason">「${esc(r.text)}」<span>— ${esc(r.nick || '匿名')}</span></div>`).join('');
      const badges = (a.inWeek ? '<span class="sg-badge ok">已排入本周歌单</span>' : '') + (!a.lib ? '<span class="sg-badge">库里还没有</span>' : '');
      const adm = isAdmin ? `<div class="sg-adm">${a.lib && !a.inWeek ? `<button type="button" onclick="SG.admAdd(${i})" title="加入本周歌单"><i class="ti ti-playlist-add"></i></button>` : ''}<button type="button" onclick="SG.admHide(${i})" title="忽略这首"><i class="ti ti-eye-off"></i></button></div>` : '';
      return `<div class="sg-item"><div class="sg-thumb${a.lib && a.lib.keys && a.lib.keys.length ? ' pv' : ''}"${a.lib ? ` onclick="SG.preview(${i})"` : ''}>${thumbHtml(a.lib)}</div>
        <div class="sg-info"><div class="sg-name">${esc(a.title)}${badges}</div>
        <div class="sg-sub"><b>${a.count}</b> 人想唱</div>${rs}</div>
        <button type="button" class="sg-plus${a.mine ? ' on' : ''}" ${a.mine || !left ? 'disabled' : ''} onclick="SG.plus(${i})">${a.mine ? '已点' : '＋1'}</button>${adm}</div>`;
    }).join('');
  }
  function openBox(prefill) {
    build(); $('sgBoxOverlay').classList.add('open');
    renderBox();
    load().then(() => { if ($('sgBoxOverlay').classList.contains('open')) renderBox(); });
    if (prefill && prefill.title) { $('sgName').value = prefill.title; st.chosenId = prefill.id || ''; $('sgSuggest').innerHTML = ''; }
  }
  function closeBox(e) { if (e && e.target !== e.currentTarget) return; const o = $('sgBoxOverlay'); if (o) o.classList.remove('open'); }
  function onName() {
    st.chosenId = '';
    const kw = $('sgName').value.trim().toLowerCase(), box = $('sgSuggest');
    if (!kw) { st.sug = []; box.innerHTML = ''; return; }
    st.sug = songLibrary.filter(s => s.title.toLowerCase().includes(kw) || songLibPyMatch(s.title, kw)).slice(0, 6);
    box.innerHTML = st.sug.length
      ? st.sug.map((s, i) => `<button type="button" class="sg-sug" onclick="SG.pickSug(${i})"><i class="ti ti-music"></i>${esc(s.title)}</button>`).join('')
      : '<div class="sg-sug-none">库里没有这首，也可以直接提交，管理员会看到</div>';
  }
  function pickSug(i) { const s = st.sug[i]; if (!s) return; $('sgName').value = s.title; st.chosenId = s.id; $('sgSuggest').innerHTML = ''; }

  async function insertReq({ title, id, reason, nick }) {
    const c = client(); if (!c) { toast('现在连不上网络，稍后再试'); return false; }
    const wk = songLibCurWeekKey(), key = norm(title);
    if (myList(wk).includes(key)) { toast('这首你已经点过啦'); return false; }
    if (myList(wk).length >= MAX_PER_WEEK) { toast(`每人每周最多点 ${MAX_PER_WEEK} 首`); return false; }
    const row = { id: uuid(), req_week: wk, song_title: title, song_id: id || null, reason: reason || null, nickname: nick || null, device_id: deviceId() };
    st.busy = true; renderBox();
    try {
      const { error } = await c.from(T_REQ).insert(row);
      if (error) throw error;
      myAdd(wk, key);
      st.requests.unshift({ id: row.id, created_at: new Date().toISOString(), req_week: wk, song_title: title, song_id: row.song_id, reason: row.reason, nickname: row.nickname, status: 'open' });
      st.recKey = '';
      return true;
    } catch (e) {
      const m = String(e && (e.message || e.details) || '');
      if (e && (e.code === '23505' || /duplicate|unique/i.test(m))) { myAdd(wk, key); toast('这首你已经点过啦'); }
      else if (m.includes('每人每周最多')) toast(`每人每周最多点 ${MAX_PER_WEEK} 首`);
      else if (m.includes('已满')) toast('本周点歌箱已满，下周再来');
      else if (isMissingErr(e)) toast('点歌箱还没开通，请联系管理员');
      else { diag(e, 'insert'); toast('提交失败，请稍后再试'); }
      return false;
    } finally { st.busy = false; refreshAll(); }
  }
  async function submit() {
    const title = $('sgName').value.trim();
    if (!title) { toast('先写下想唱的歌名'); $('sgName').focus(); return; }
    const lib = (st.chosenId && songLibrary.find(s => s.id === st.chosenId)) || songLibrary.find(s => norm(s.title) === norm(title)) || null;
    const nick = $('sgNick').value.trim();
    try { localStorage.setItem('songlibNick', nick); } catch (e) { /* 忽略 */ }
    const ok = await insertReq({ title: lib ? lib.title : title, id: lib && lib.id, reason: $('sgReason').value.trim(), nick });
    if (ok) { $('sgName').value = ''; $('sgReason').value = ''; st.chosenId = ''; $('sgSuggest').innerHTML = ''; toast('✅ 已投进点歌箱，谢谢你～'); }
  }
  async function plus(i) {
    const a = st.agg[i]; if (!a || a.mine) return;
    let nick = ''; try { nick = (localStorage.getItem('songlibNick') || '').trim(); } catch (e) { /* 忽略 */ }
    const ok = await insertReq({ title: a.title, id: a.lib && a.lib.id, reason: '', nick });
    if (ok) toast('✅ 已加一票');
  }
  function preview(i) { const a = st.agg[i]; if (a && a.lib) previewSong(a.lib); }

  // 管理员：加入本周歌单 / 忽略
  function addToPick(title) {
    const open = $('weekPickOverlay') && $('weekPickOverlay').classList.contains('open');
    if (!open) songLibPickWeekSongs();   // 没登录会先弹出登录，登录后自动进选歌
    setTimeout(() => {
      if (!$('weekPickOverlay').classList.contains('open')) return;
      if (!weekPickSel.includes(title)) { weekPickSel.push(title); renderWeekPick(); }
      toast(`已加入已选：${title}`);
    }, 0);
  }
  function admAdd(i) {
    const a = st.agg[i]; if (!isAdmin || !a) return;
    if (!a.lib) { toast('这首还不在诗歌库里，先上传谱子再加入歌单'); return; }
    closeBox(); addToPick(a.lib.title);
  }
  async function admHide(i) {
    const a = st.agg[i]; if (!isAdmin || !a) return;
    if (!await slConfirm(`忽略「${a.title}」的 ${a.count} 条点歌？忽略后会从点歌箱里隐藏。`)) return;
    const c = client(); if (!c) return;
    const { error } = await c.from(T_REQ).update({ status: 'dismissed' }).in('id', a.ids);
    if (error) { diag(error, 'hide'); toast('操作失败：需要先登录管理员'); return; }
    st.requests = st.requests.filter(r => !a.ids.includes(r.id)); st.recKey = '';
    refreshAll(); toast('已忽略');
  }

  // ───────── 主题弹窗 ─────────
  function recRowHtml(r, i) {
    const chips = r.why.map(w => `<span class="sg-why">${esc(w)}</span>`).join('') + r.warn.map(w => `<span class="sg-warn">${esc(w)}</span>`).join('');
    const act = isAdmin
      ? `<button type="button" class="sg-go" onclick="SG.admAddRec(${i})"><i class="ti ti-playlist-add"></i>加入</button>`
      : (st.reqOk ? `<button type="button" class="sg-go" onclick="SG.wantRec(${i})">点这首</button>` : '');
    return `<div class="sg-item"><div class="sg-thumb${r.s.keys && r.s.keys.length ? ' pv' : ''}" onclick="SG.previewRec(${i})">${thumbHtml(r.s)}</div>
      <div class="sg-info"><div class="sg-name">${esc(r.s.title)}</div><div class="sg-chips">${chips}</div></div>${act}</div>`;
  }
  function themeFormHtml() {
    const th = st.draft || {}, all = getSongLibTags();
    return `<div class="sg-form">
      <input class="week-pick-search" id="sgThTitle" type="text" maxlength="40" placeholder="主题（必填，例如：感恩与盼望）" value="${esc(th.title || '')}">
      <input class="week-pick-search" id="sgThScr" type="text" maxlength="60" placeholder="经文（选填，例如：诗篇 100）" value="${esc(th.scripture || '')}">
      <input class="week-pick-search" id="sgThKw" type="text" maxlength="80" placeholder="关键词（选填，用空格或逗号分开：盼望 复兴 医治）" value="${esc(th.keywords || '')}">
      <div class="sg-form-l">主题标签（可多选，没有合适的可以不选）</div>
      <div class="sg-tagpick">${all.length ? all.map((t, i) => `<button type="button" class="song-lib-tagchip${st.tagsDraft.some(x => x.toLowerCase() === t.toLowerCase()) ? ' on' : ''}" onclick="SG.thTag(${i})">${esc(t)}</button>`).join('') : '<span class="sg-dim">还没有主题标签，先在筛选里添加</span>'}</div>
      <input class="week-pick-search" id="sgThNote" type="text" maxlength="120" placeholder="备注（选填，给主领的话）" value="${esc(th.note || '')}">
      <div class="sg-form-act"><button type="button" class="btn-cancel" onclick="SG.cancelEdit()">取消</button>${st.theme ? '<button type="button" class="btn-cancel sg-danger" onclick="SG.clearTheme()">清除主题</button>' : ''}<button type="button" class="btn-save" onclick="SG.saveTheme()">保存主题</button></div></div>`;
  }
  function renderTheme() {
    const body = $('sgThemeBody'); if (!body) return;
    const th = st.theme, wk = songLibCurWeekKey();
    let html = '';
    if (st.editing && isAdmin) { body.innerHTML = themeFormHtml(); return; }
    if (th) {
      html += `<div class="sg-theme-head"><div class="sg-theme-date">${dateText(wk)} 主日</div><div class="sg-theme-title">${esc(th.title)}</div>
        ${th.scripture ? `<div class="sg-theme-scr"><i class="ti ti-book"></i>${esc(th.scripture)}</div>` : ''}
        ${th.note ? `<div class="sg-theme-note">${esc(th.note)}</div>` : ''}
        <div class="sg-tags">${themeTags(th).map(t => `<span class="sg-tag">${esc(t)}</span>`).join('')}</div></div>`;
    } else {
      html += `<div class="sg-empty">${isAdmin ? '还没有设置本周主题，设置后这里会按主题推荐歌曲。' : '主领和同工还没有设置本周主题。'}</div>`;
    }
    if (isAdmin) html += `<button type="button" class="ol-btn ghost sg-edit" id="sgThemeEditBtn" onclick="SG.editTheme()"><i class="ti ti-pencil"></i> ${th ? '编辑主题' : '设置主题'}</button>`;
    if (th) {
      const r = recs();
      html += `<div class="ol-sec-title">推荐诗歌${r.length ? `（${r.length}）` : ''}</div><div class="mg-tip">按标签、歌名、歌词里的相关词来找；没唱过、很久没唱的排前面，上周刚唱的会提醒。</div>`;
      html += r.length ? r.map(recRowHtml).join('')
        : '<div class="sg-empty">没有找到合适的歌。可以补充关键词，或给诗歌打上主题标签，推荐会更准。</div>';
    }
    body.innerHTML = html;
  }
  function openTheme() {
    build(); $('sgThemeOverlay').classList.add('open'); st.editing = false; renderTheme();
    load().then(() => { if ($('sgThemeOverlay').classList.contains('open') && !st.editing) renderTheme(); });
  }
  function closeTheme(e) { if (e && e.target !== e.currentTarget) return; const o = $('sgThemeOverlay'); if (o) o.classList.remove('open'); st.editing = false; }
  function editTheme() {
    if (!isAdmin) return;
    const th = st.theme || {};
    st.editing = true; st.tagsDraft = (th.tags || []).slice();
    st.draft = { title: th.title || '', scripture: th.scripture || '', keywords: th.keywords || '', note: th.note || '' };
    renderTheme();
  }
  function readDraft() {
    st.draft = { title: $('sgThTitle').value, scripture: $('sgThScr').value, keywords: $('sgThKw').value, note: $('sgThNote').value };
  }
  function cancelEdit() { st.editing = false; renderTheme(); }
  function thTag(i) {
    const t = getSongLibTags()[i]; if (!t) return;
    const k = st.tagsDraft.findIndex(x => x.toLowerCase() === t.toLowerCase());
    if (k >= 0) st.tagsDraft.splice(k, 1); else st.tagsDraft.push(t);
    readDraft(); renderTheme();   // 重画表单前先把没保存的输入存进草稿
  }
  async function saveTheme() {
    if (!isAdmin) { toast('请先登录管理员'); return; }
    const title = $('sgThTitle').value.trim();
    if (!title) { toast('主题不能为空'); return; }
    const c = client(); if (!c) return;
    const row = { week_key: songLibCurWeekKey(), title, scripture: $('sgThScr').value.trim() || null, keywords: $('sgThKw').value.trim() || null, tags: st.tagsDraft.slice(), note: $('sgThNote').value.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await c.from(T_THEME).upsert(row, { onConflict: 'week_key' });
    if (error) { diag(error, 'saveTheme'); toast(isMissingErr(error) ? '还没开通：请先执行 supabase_song_requests.sql' : '保存失败：需要先登录管理员'); return; }
    st.theme = row; st.themeOk = true; st.editing = false; st.recKey = '';
    refreshAll(); toast('✅ 本周主题已保存');
  }
  async function clearTheme() {
    if (!isAdmin || !st.theme) return;
    if (!await slConfirm('清除本周主题？')) return;
    const c = client(); if (!c) return;
    const { error } = await c.from(T_THEME).delete().eq('week_key', songLibCurWeekKey());
    if (error) { diag(error, 'clearTheme'); toast('操作失败：需要先登录管理员'); return; }
    st.theme = null; st.editing = false; st.recKey = ''; refreshAll(); toast('已清除');
  }
  function admAddRec(i) { const r = st.rec[i]; if (!isAdmin || !r) return; closeTheme(); addToPick(r.s.title); }
  function wantRec(i) { const r = st.rec[i]; if (!r) return; closeTheme(); openBox({ title: r.s.title, id: r.s.id }); }
  function previewRec(i) { const r = st.rec[i]; if (r) previewSong(r.s); }

  // ───────── 主领选歌窗口里的推荐条 ─────────
  function renderPickBox() {
    const el = $('weekPickThemeBox'); if (!el) return;
    let html = '';
    if (enabled()) {
      const th = st.theme, r = th ? recs().slice(0, 8) : [];
      const reqs = aggregate().filter(a => a.lib).slice(0, 8);
      const chip = (title, cls, sub, onclick) => `<button type="button" class="sg-chip${cls}" onclick="${onclick}"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
      html += `<div class="sg-pick-head"><i class="ti ti-bulb"></i><span>${th ? '本周主题：<b>' + esc(th.title) + '</b>' : '还没设置本周主题'}</span><button type="button" onclick="SG.openTheme()">${th ? '详情' : '去设置'}</button></div>`;
      if (th) html += r.length
        ? `<div class="sg-pick-row">${r.map((x, i) => chip(x.s.title, weekPickSel.includes(x.s.title) ? ' on' : '', x.why[0] || '', `SG.pickRec(${i})`)).join('')}</div>`
        : '<div class="sg-dim sg-pick-none">暂时没有匹配主题的歌，可以在主题里补充关键词</div>';
      if (st.reqOk) {
        html += `<div class="sg-pick-head sub"><i class="ti ti-mailbox"></i><span>会众点歌${reqs.length ? '' : '：还没有人点歌'}</span><button type="button" onclick="SG.openBox()">点歌箱</button></div>`;
        if (reqs.length) html += `<div class="sg-pick-row">${reqs.map((a, i) => chip(a.title, weekPickSel.includes(a.title) ? ' on' : '', a.count + ' 人想唱', `SG.pickReq(${i})`)).join('')}</div>`;
      }
    }
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  }
  function pickRec(i) { const r = st.rec[i]; if (r) weekPickToggle(r.s.id); }
  function pickReq(i) { const a = st.agg.filter(x => x.lib)[i]; if (a) weekPickToggle(a.lib.id); }

  function refreshAll() {
    try { renderCard(); } catch (e) { diag(e, 'renderCard'); }
    try { if ($('sgBoxOverlay') && $('sgBoxOverlay').classList.contains('open')) renderBox(); } catch (e) { diag(e, 'renderBox'); }
    try { if ($('sgThemeOverlay') && $('sgThemeOverlay').classList.contains('open') && !st.editing) renderTheme(); } catch (e) { diag(e, 'renderTheme'); }
    try { renderPickBox(); } catch (e) { diag(e, 'renderPickBox'); }
  }

  // 使用引导里演示用：打开 / 关闭这两个弹窗
  function obApply(name) {
    build();
    const b = $('sgBoxOverlay'), t = $('sgThemeOverlay');
    b.classList.toggle('open', name === 'box'); t.classList.toggle('open', name === 'theme');
    st.editing = false;
    if (name === 'box') renderBox();
    if (name === 'theme') renderTheme();
  }

  // ───────── 接进 app.js ─────────
  function patch() {
    const wrap = (name, after) => {
      const orig = window[name]; if (typeof orig !== 'function' || orig._sg) return;
      const f = function () { const r = orig.apply(this, arguments); try { after.apply(this, arguments); } catch (e) { diag(e, 'patch.' + name); } return r; };
      f._sg = true; window[name] = f;
    };
    wrap('songLibRenderWeekCard', renderCard);   // 首页卡片跟着本周卡片一起显示 / 隐藏
    wrap('renderWeekPick', renderPickBox);       // 选歌窗口里的推荐条
    wrap('renderSongLibFilterBar', renderPrefBar);   // 筛选抽屉里的「会众卡片」显示 / 隐藏
    wrap('updateAdminUI', refreshAll);           // 登录 / 退出管理员后刷新按钮
    wrap('openWeekPick', () => { load(true).then(renderPickBox); });
    wrap('setSongLibTab', renderCard);                 // 切标签时马上收起 / 恢复首页卡片
    wrap('setSongLibSearchMode', renderCard);          // 切到专属搜索时马上收起
  }
  function init() {
    build(); patch(); renderPrefBar();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      let ready = false;
      try { ready = !songLibSkelOn && !!client(); } catch (e) { /* 还没就绪 */ }
      if (ready || tries > 80) { clearInterval(t); if (ready) load(true); }
    }, 300);
  }

  window.SG = {
    enabled, load, openBox, closeBox, openTheme, closeTheme, onName, pickSug, submit, plus, preview,
    admAdd, admHide, editTheme, cancelEdit, thTag, saveTheme, clearTheme, admAddRec, wantRec, previewRec,
    pickRec, pickReq, renderCard, renderPickBox, obApply, hideCard, setCardPref,
    _t: { recommend, themeTokens, themeTags, aggregate, norm, st },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
