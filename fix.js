/* 歌谱纠错
 * 对外入口：window.FX
 *  - 任何人（不用登录）：在「看图模式」里点「纠错」，选类型、写一句哪里不对，提交给管理员
 *  - 管理员：首页右上角会多一个旗子图标（带未处理数量），点开查看全部纠错，可「看谱 / 标为已处理 / 删除」；
 *            看某一首谱子时点「纠错」，也能看到这首歌已有的纠错
 * 数据在 Supabase 的 score_fixes 表里（见 supabase_score_fixes.sql，执行一次即可）。
 * 依赖 app.js 里的全局：songLibrary / isAdmin / lightboxSongs / lightboxIndex / lbvEntry / findSongLibEntryByTitle /
 *   openLightboxWithList / initSupabaseClient / supabaseClient / showToast / escapeHtml / slConfirm / slDiag
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => escapeHtml(s == null ? '' : s);
  const TBL = 'score_fixes';
  const KINDS = [['note', '音符 / 旋律'], ['lyric', '歌词 / 错字'], ['sig', '调号 / 拍号'], ['mark', '反复 / 段落记号'], ['page', '缺页 / 图不清'], ['other', '其他']];
  const KIND_TXT = Object.fromEntries(KINDS);
  const st = { kind: 'note', cur: null, busy: false, rows: [], missing: false, showDone: false };

  // ───────── 小工具 ─────────
  function client() { try { return initSupabaseClient() ? supabaseClient : null; } catch (e) { return null; } }
  function toast(m, d) { try { showToast(m, d); } catch (e) { /* 忽略 */ } }
  function diag(e, where) { try { slDiag(e, 'FX.' + where); } catch (_) { console.error(where, e); } }
  function rnd() { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  let memDev = '';
  function deviceId() {   // 和点歌箱共用同一个设备编号
    try { let v = localStorage.getItem('songlibDeviceId'); if (!v || v.length < 8) { v = rnd(); localStorage.setItem('songlibDeviceId', v); } return v; }
    catch (e) { return memDev || (memDev = rnd()); }
  }
  function isMissingErr(err) {
    if (!err) return false;
    const m = String(err.message || err.details || err.hint || '').toLowerCase(), c = String(err.code || '');
    return c === 'PGRST205' || c === '42P01' || c === 'PGRST200' || m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find the table');
  }
  function ago(iso) {
    const t = new Date(iso).getTime(); if (!t) return '';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '刚刚'; if (m < 60) return m + ' 分钟前';
    const h = Math.floor(m / 60); if (h < 24) return h + ' 小时前';
    const d = Math.floor(h / 24); if (d < 30) return d + ' 天前';
    const x = new Date(t); return `${x.getMonth() + 1}月${x.getDate()}日`;
  }
  const norm = t => String(t || '').trim().toLowerCase().replace(/\s+/g, '');

  // ───────── 当前正在看的谱子 ─────────
  function curSong() { try { return lightboxSongs[lightboxIndex] || null; } catch (e) { return null; } }
  function describe(s) {
    if (!s) return null;
    let e = null; try { e = lbvEntry(s); } catch (_) { /* 忽略 */ }
    const title = e ? e.title : String(s.title || '').replace(/\s*[（(]\d+\/\d+[）)]\s*$/, '').trim();
    const k = e && e.keys ? e.keys.find(x => x && x.src === s.src) : null;
    const label = k && k.label && k.label !== '默认' ? String(k.label) : '';
    return { id: e ? e.id : '', title, key: label };
  }
  function canFix(s) { return !!(s && s.src && !s.noLib && !s.loader && String(s.title || '').trim()); }   // 专属搜索（外部）的谱子不收纠错

  // ───────── 读取（管理员）─────────
  async function loadRows() {
    const c = client();
    if (!c || !isAdmin) { st.rows = []; return false; }
    const { data, error } = await c.from(TBL).select('*').order('created_at', { ascending: false }).limit(300);
    st.missing = isMissingErr(error);
    if (error) { if (!st.missing) diag(error, 'load'); st.rows = []; return false; }
    st.rows = data || [];
    return true;
  }
  const openCount = () => st.rows.filter(r => r.status === 'open').length;
  function updateDot() {
    const d = $('fxDot'); if (!d) return;
    const n = openCount(); d.textContent = n ? (n > 99 ? '99+' : String(n)) : '';
  }
  function rowHtml(r, withSong) {
    const done = r.status === 'done';
    return `<div class="fx-item${done ? ' done' : ''}">
      <div class="fx-item-h">${withSong ? `<span>${esc(r.song_title)}${r.key_label ? `<small style="font-weight:500;color:var(--text-3)"> · ${esc(r.key_label)}</small>` : ''}</span>` : ''}<span class="fx-kind">${esc(KIND_TXT[r.kind] || '其他')}</span>${done ? '<span class="fx-kind" style="background:#e8f5f0;color:#0f6e56">已处理</span>' : ''}</div>
      <div class="fx-detail">${esc(r.detail)}</div>
      <div class="fx-meta">${esc(r.nickname || '匿名')} · ${esc(ago(r.created_at))}</div>
      <div class="fx-acts">
        ${withSong ? `<button type="button" onclick="FX.view('${esc(r.id)}')"><i class="ti ti-eye"></i>看谱</button>` : ''}
        <button type="button" class="ok" onclick="FX.setDone('${esc(r.id)}',${done ? 'false' : 'true'})"><i class="ti ti-${done ? 'arrow-back-up' : 'check'}"></i>${done ? '恢复为未处理' : '标为已处理'}</button>
        <button type="button" class="del" onclick="FX.del('${esc(r.id)}')"><i class="ti ti-trash"></i>删除</button>
      </div></div>`;
  }

  // ───────── 提交弹窗 ─────────
  function build() {
    if ($('fxOverlay')) return;
    const o = document.createElement('div');
    o.className = 'modal-overlay'; o.id = 'fxOverlay'; o.setAttribute('onclick', 'FX.close(event)');
    o.innerHTML = `<div class="song-lib-filter-drawer sg-drawer" onclick="event.stopPropagation()">
      <div class="picker-handle"></div>
      <div class="song-lib-filter-head"><div class="song-lib-filter-title">歌谱纠错</div></div>
      <div class="fx-song" id="fxSong"></div>
      <div class="fx-kinds" id="fxKinds"></div>
      <textarea class="fx-text" id="fxText" maxlength="300" placeholder="哪里不对？写清楚位置更好改，比如「第二段第三行，第5个音应该是 6」"></textarea>
      <input class="week-pick-search" id="fxNick" type="text" maxlength="20" autocomplete="off" placeholder="称呼（选填，不填显示「匿名」）">
      <div class="fx-tip" id="fxTip">提交后管理员会看到，核对后修改歌谱。</div>
      <button type="button" class="btn-save fx-submit" id="fxSubmit" onclick="FX.submit()"><i class="ti ti-send"></i> 提交纠错</button>
      <div id="fxAdminSec"></div>
      <div class="drawer-actions"><button class="btn-cancel" onclick="FX.close()">关闭</button></div>
    </div>`;
    const ib = document.createElement('div');
    ib.className = 'modal-overlay'; ib.id = 'fxInboxOverlay'; ib.setAttribute('onclick', 'FX.closeInbox(event)');
    ib.innerHTML = `<div class="song-lib-filter-drawer sg-drawer" onclick="event.stopPropagation()">
      <div class="picker-handle"></div>
      <div class="song-lib-filter-head"><div class="song-lib-filter-title">歌谱纠错反馈</div></div>
      <div class="song-lib-filter-chips" style="margin-bottom:6px"><button type="button" class="song-lib-filter-chip" id="fxDoneChip" onclick="FX.toggleDone()"><i class="ti ti-checks"></i>显示已处理</button></div>
      <div id="fxInboxList" style="overflow-y:auto;max-height:58vh"></div>
      <div class="drawer-actions"><button class="btn-cancel" onclick="FX.closeInbox()">关闭</button></div>
    </div>`;
    document.body.append(o, ib);
    try { $('fxNick').value = localStorage.getItem('songlibNick') || ''; } catch (e) { /* 忽略 */ }
  }
  function renderKinds() {
    $('fxKinds').innerHTML = KINDS.map(([k, t]) => `<button type="button" class="song-lib-filter-chip${st.kind === k ? ' active' : ''}" onclick="FX.setKind('${k}')">${t}</button>`).join('');
  }
  function renderAdminSec() {
    const box = $('fxAdminSec'); if (!box) return;
    if (!isAdmin || !st.cur) { box.innerHTML = ''; return; }
    if (st.missing) { box.innerHTML = '<div class="fx-tip" style="margin-top:12px">纠错表还没开通：到 Supabase 的 SQL Editor 里执行项目里的 <b>supabase_score_fixes.sql</b> 就行（只需一次）。</div>'; return; }
    const mine = st.rows.filter(r => r.status === 'open' && ((st.cur.id && r.song_id === st.cur.id) || norm(r.song_title) === norm(st.cur.title)));
    box.innerHTML = mine.length ? `<div class="fx-sec">这首歌待处理的纠错（${mine.length}）</div>${mine.map(r => rowHtml(r, false)).join('')}` : '';
  }
  function open() {
    const s = curSong();
    if (!canFix(s)) { toast('这张谱子暂时不能纠错'); return; }
    st.cur = describe(s);
    build();
    $('fxSong').innerHTML = `<b>《${esc(st.cur.title)}》</b>${st.cur.key ? ` · ${esc(st.cur.key)}` : ''}`;
    $('fxText').value = '';
    renderKinds(); renderAdminSec();
    $('fxSubmit').disabled = false;
    $('fxOverlay').classList.add('open');
    if (isAdmin) loadRows().then(() => { if ($('fxOverlay').classList.contains('open')) renderAdminSec(); updateDot(); });
  }
  function close(e) { if (e && e.target !== e.currentTarget) return; const o = $('fxOverlay'); if (o) o.classList.remove('open'); }
  function setKind(k) { st.kind = k; renderKinds(); }

  async function copyFallback(row, why) {
    const txt = `【歌谱纠错】《${row.song_title}》${row.key_label ? '（' + row.key_label + '）' : ''}\n类型：${KIND_TXT[row.kind]}\n${row.detail}${row.nickname ? '\n—— ' + row.nickname : ''}`;
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { /* 忽略 */ }
    toast(ok ? `${why}，已把内容复制好，可以直接发给管理员` : `${why}，请截图或手动告诉管理员`, 4000);
  }
  async function submit() {
    if (st.busy || !st.cur) return;
    const detail = $('fxText').value.trim();
    if (detail.length < 2) { toast('请简单写一下哪里不对（至少两个字）'); $('fxText').focus(); return; }
    const nick = $('fxNick').value.trim().slice(0, 20);
    try { localStorage.setItem('songlibNick', nick); } catch (e) { /* 忽略 */ }
    const row = {
      id: uuid(), song_id: st.cur.id || null, song_title: st.cur.title.slice(0, 80), key_label: st.cur.key ? st.cur.key.slice(0, 30) : null,
      kind: st.kind, detail: detail.slice(0, 300), nickname: nick || null, device_id: deviceId(),
    };
    const c = client();
    if (!c) { await copyFallback(row, '现在连不上网络'); return; }
    st.busy = true; $('fxSubmit').disabled = true;
    try {
      const { error } = await c.from(TBL).insert(row);
      if (error) throw error;
      toast('✅ 已提交，谢谢你帮忙纠错', 3000);
      close();
      if (isAdmin) loadRows().then(updateDot);
    } catch (err) {
      if (isMissingErr(err)) {
        st.missing = true;
        if (isAdmin) toast('纠错表还没开通：先在 Supabase 执行 supabase_score_fixes.sql', 4500);
        else await copyFallback(row, '纠错功能还没开通');
      } else {
        diag(err, 'submit');
        const m = String((err && err.message) || '');
        toast(/[\u4e00-\u9fa5]/.test(m) ? m : '提交失败，请稍后再试', 3500);
      }
    } finally { st.busy = false; const b = $('fxSubmit'); if (b) b.disabled = false; }
  }

  // ───────── 管理员：纠错反馈列表 ─────────
  function renderInbox() {
    const list = $('fxInboxList'); if (!list) return;
    $('fxDoneChip').classList.toggle('active', st.showDone);
    if (st.missing) { list.innerHTML = '<div class="sg-empty">纠错表还没开通：到 Supabase 的 SQL Editor 里执行项目里的 <b>supabase_score_fixes.sql</b> 就行（只需一次）。</div>'; return; }
    const rows = st.rows.filter(r => st.showDone || r.status === 'open');
    list.innerHTML = rows.length ? rows.map(r => rowHtml(r, true)).join('') : `<div class="sg-empty">${st.showDone ? '还没有任何纠错' : '没有待处理的纠错 🎉'}</div>`;
  }
  async function openInbox() {
    if (!isAdmin) { toast('需要管理员登录'); return; }
    build();
    $('fxInboxList').innerHTML = '<div class="sg-empty">加载中…</div>';
    $('fxInboxOverlay').classList.add('open');
    await loadRows(); updateDot(); renderInbox();
  }
  function closeInbox(e) { if (e && e.target !== e.currentTarget) return; const o = $('fxInboxOverlay'); if (o) o.classList.remove('open'); }
  function toggleDone() { st.showDone = !st.showDone; renderInbox(); }
  async function setDone(id, done) {
    const c = client(); if (!c || !isAdmin) return;
    const { error } = await c.from(TBL).update({ status: done ? 'done' : 'open' }).eq('id', id);
    if (error) { diag(error, 'setDone'); toast('操作失败，请稍后再试'); return; }
    const r = st.rows.find(x => x.id === id); if (r) r.status = done ? 'done' : 'open';
    updateDot(); renderInbox(); renderAdminSec();
    toast(done ? '已标为已处理' : '已恢复为未处理');
  }
  async function del(id) {
    const c = client(); if (!c || !isAdmin) return;
    if (!await slConfirm('删除这条纠错？', { okText: '删除', danger: true })) return;
    const { error } = await c.from(TBL).delete().eq('id', id);
    if (error) { diag(error, 'del'); toast('删除失败，请稍后再试'); return; }
    st.rows = st.rows.filter(x => x.id !== id);
    updateDot(); renderInbox(); renderAdminSec();
  }
  function view(id) {
    const r = st.rows.find(x => x.id === id); if (!r) return;
    let e = null;
    try { e = (r.song_id && songLibrary.find(x => x.id === r.song_id)) || findSongLibEntryByTitle(r.song_title); } catch (_) { /* 忽略 */ }
    const keys = e && e.keys ? e.keys.filter(k => k && k.src) : [];
    const k = (r.key_label && keys.find(x => x.label === r.key_label)) || keys[0];
    if (!e || !k) { toast('诗歌库里找不到这首歌的谱子（可能已改名或删除）'); return; }
    closeInbox();
    openLightboxWithList([{ title: e.title, src: k.src, songId: e.id }], 0);
  }

  // ───────── 接到页面上 ─────────
  function injectInboxBtn() {
    if ($('fxInboxBtn')) return;
    const ref = $('songLibAdminBtn'); if (!ref || !ref.parentNode) return;
    const b = document.createElement('button');
    b.className = 'song-lib-page-search-btn sl-mi'; b.id = 'fxInboxBtn'; b.style.display = 'none';
    b.title = '歌谱纠错反馈（管理员）'; b.setAttribute('aria-label', '歌谱纠错反馈');
    b.setAttribute('onclick', 'FX.openInbox()');
    b.innerHTML = '<i class="ti ti-flag"></i><span class="sl-mi-l">歌谱纠错反馈</span><span class="fx-dot" id="fxDot"></span>';
    ref.parentNode.insertBefore(b, ref);
  }
  function onAdmin() {
    injectInboxBtn();
    const b = $('fxInboxBtn'); if (b) b.style.display = isAdmin ? '' : 'none';
    if (isAdmin) loadRows().then(updateDot).catch(e => diag(e, 'onAdmin')); else { st.rows = []; updateDot(); }
  }
  function syncLbBtn(s) { const b = $('lightboxFixBtn'); if (b) b.style.display = canFix(s) ? '' : 'none'; }

  const _admin = window.updateAdminUI;
  if (typeof _admin === 'function') {
    window.updateAdminUI = function () { const r = _admin.apply(this, arguments); try { onAdmin(); } catch (e) { diag(e, 'hook'); } return r; };
  }
  const _extras = window.lbvRenderExtras;
  if (typeof _extras === 'function') {
    window.lbvRenderExtras = function (s) { const r = _extras.apply(this, arguments); try { syncLbBtn(s); } catch (e) { diag(e, 'hook2'); } return r; };
  }
  injectInboxBtn();
  try { if (isAdmin) onAdmin(); } catch (e) { /* 忽略 */ }

  window.FX = { open, close, setKind, submit, openInbox, closeInbox, toggleDone, setDone, del, view };
})();
