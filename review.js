/* 上传诗歌 · 管理员审核
 * 对外入口：window.SU
 *  • 管理员上传：app.js 里照旧直接收进诗歌库。
 *  • 其他人上传：app.js 调 SU.submit() 把内容放进云端「待审核」表 song_uploads（见 supabase_song_uploads.sql）。
 *  • 管理员在「⋯ 更多 → 上传审核」里逐条通过 / 拒绝；通过 = 收进诗歌库并删掉待审核记录，拒绝 = 删掉记录（图片尽量一起清掉）。
 * 依赖 app.js 里的全局：isAdmin / supabaseClient / initSupabaseClient / songLibrary / ensureSongInLibrary /
 *   findDuplicateSongInLibrary / genSongLibId / persistSongLibrary / renderSongLibraryGrid / renderSongLibFilterBar /
 *   syncSongLibraryToRemote / normalizeSongLibTagList / uploadSongDataUrl / openLightboxWithList / showToast / escapeHtml / slConfirm / slDiag
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => escapeHtml(s == null ? '' : s);
  const TABLE = 'song_uploads';
  const st = { rows: [], ok: false, missing: false, loading: null, busy: false };

  function client() { try { return initSupabaseClient() ? supabaseClient : null; } catch (e) { return null; } }
  function toast(m, d) { try { showToast(m, d); } catch (e) { /* 忽略 */ } }
  function diag(e, where) { try { slDiag(e, 'SU.' + where); } catch (_) { console.error(where, e); } }
  function isMissingErr(err) {
    if (!err) return false;
    const m = String(err.message || err.details || err.hint || '').toLowerCase(), c = String(err.code || '');
    return c === 'PGRST205' || c === '42P01' || m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find the table');
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  let memDev = '';
  function deviceId() {   // 和点歌箱共用同一个设备编号
    const mk = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    try { let v = localStorage.getItem('songlibDeviceId'); if (!v || v.length < 8) { v = mk(); localStorage.setItem('songlibDeviceId', v); } return v; }
    catch (e) { return memDev || (memDev = mk()); }
  }
  function timeText(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ───────── 普通用户：提交审核 ─────────
  // 返回 true 表示已提交（调用方可以关窗口）；false 表示没提交成功（错误已用提示告诉用户）
  async function submit(p) {
    const c = client();
    if (!c) { toast('网络不可用，暂时没法提交，稍后再试'); return false; }
    let src = p.src || '';
    if (src.startsWith('data:')) {   // 本地图片：先传到存储换成网址；失败就不提交，免得把巨大的 base64 塞进待审核表
      try { src = await uploadSongDataUrl('pending-uploads', src, Date.now()); }
      catch (e) { diag(e, 'submit.upload'); toast('图片上传失败，请检查网络后重试'); return false; }
    }
    if (src && !/^https?:\/\//i.test(src)) { toast('图片链接需要以 http:// 或 https:// 开头'); return false; }
    const row = {
      id: uuid(), title: p.title, category: p.category || null, band: p.band || null, songbook: p.songbook || null,
      tags: Array.isArray(p.tags) ? p.tags : [], key_label: p.keyLabel || null, src: src || null,
      lyrics: p.lyrics || null, nickname: null, device_id: deviceId(),
    };
    const { error } = await c.from(TABLE).insert(row);
    if (error) {
      diag(error, 'submit');
      if (isMissingErr(error)) toast('上传审核还没开通，请联系管理员（需先执行 supabase_song_uploads.sql）', 5000);
      else if (String(error.code) === '23505') toast('这首歌已经有人提交了，正在等待管理员审核');
      else if (/等待审核|待审核/.test(String(error.message || ''))) toast(String(error.message).replace(/^.*?(你已经|待审核)/, '$1'), 4500);
      else toast('提交失败，请稍后再试');
      return false;
    }
    toast('✅ 已提交，管理员审核通过后会收进诗歌库', 4000);
    return true;
  }

  // ───────── 管理员：读取待审核 ─────────
  async function load(force) {
    if (!isAdmin) { st.rows = []; st.ok = false; refreshUi(); return false; }
    const c = client(); if (!c) return false;
    if (st.loading) return st.loading;
    st.loading = (async () => {
      const { data, error } = await c.from(TABLE).select('*').order('created_at', { ascending: true }).limit(200);
      st.ok = !error; st.missing = isMissingErr(error);
      if (error && !st.missing) diag(error, 'load');
      st.rows = error ? [] : (data || []);
      return !error;
    })().catch(e => { diag(e, 'load'); st.ok = false; return false; })
      .finally(() => { st.loading = null; refreshUi(); });
    return st.loading;
  }
  const count = () => (isAdmin && st.ok ? st.rows.length : 0);

  // ───────── 管理员：弹窗 ─────────
  function build() {
    if ($('suOverlay')) return;
    const o = document.createElement('div');
    o.className = 'modal-overlay'; o.id = 'suOverlay'; o.setAttribute('onclick', 'SU.close(event)');
    o.innerHTML = `<div class="song-lib-filter-drawer sg-drawer" onclick="event.stopPropagation()">
      <div class="picker-handle"></div>
      <div class="song-lib-filter-head"><div class="song-lib-filter-title">上传审核</div></div>
      <div class="mg-tip">大家上传的诗歌先放在这里，通过后才会收进诗歌库；拒绝会直接删掉。</div>
      <div id="suList"></div>
      <div class="drawer-actions"><button class="btn-cancel" onclick="SU.close()">关闭</button></div>
    </div>`;
    document.body.appendChild(o);
  }
  function metaChips(r) {
    const a = [];
    if (r.category) a.push('分类：' + r.category);
    if (r.band) a.push('乐团：' + r.band);
    if (r.songbook) a.push('诗歌本：' + r.songbook);
    if (r.key_label) a.push('调：' + r.key_label);
    (Array.isArray(r.tags) ? r.tags : []).forEach(t => a.push('#' + t));
    if (r.lyrics) a.push('带歌词');
    return a.map(x => `<span class="sg-why">${esc(x)}</span>`).join('');
  }
  function dupOf(r) { try { return findDuplicateSongInLibrary(r.title); } catch (e) { return null; } }
  function renderList() {
    const box = $('suList'); if (!box) return;
    if (!isAdmin) { box.innerHTML = '<div class="sg-empty">请先登录管理员</div>'; return; }
    if (st.missing) { box.innerHTML = '<div class="sg-card sg-hint"><i class="ti ti-info-circle"></i><div>上传审核还没开通：到 Supabase 的 SQL Editor 里执行项目里的 <b>supabase_song_uploads.sql</b> 就行（只需一次）。开通前，其他人暂时没法上传。</div></div>'; return; }
    if (!st.ok) { box.innerHTML = '<div class="sg-empty">读取失败，请检查网络后重新打开</div>'; return; }
    if (!st.rows.length) { box.innerHTML = '<div class="sg-empty">没有待审核的诗歌 🎉</div>'; return; }
    box.innerHTML = st.rows.map((r, i) => {
      const dup = dupOf(r);
      return `<div class="sg-item"><div class="sg-thumb${r.src ? ' pv' : ''}" onclick="SU.preview(${i})">${r.src ? `<img src="${esc(r.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i class="ti ti-photo"></i>'}</div>
        <div class="sg-info"><div class="sg-name">${esc(r.title)}</div>
          <div class="sg-chips">${dup ? '<span class="sg-warn">库里已有同名</span>' : ''}${r.src ? '' : '<span class="sg-warn">没有谱图</span>'}${metaChips(r)}<span class="sg-why">${esc(timeText(r.created_at))}</span></div></div>
        <div class="su-act"><button type="button" class="sg-go" onclick="SU.approve(${i})"><i class="ti ti-check"></i>${dup ? '加入' : '通过'}</button><button type="button" class="sg-go su-no" onclick="SU.reject(${i})"><i class="ti ti-x"></i>拒绝</button></div></div>`;
    }).join('');
  }
  function open() {
    if (!isAdmin) { toast('请先登录管理员'); return; }
    build(); $('suOverlay').classList.add('open'); renderList();
    load(true).then(() => { if ($('suOverlay') && $('suOverlay').classList.contains('open')) renderList(); });
  }
  function close(e) { if (e && e.target !== e.currentTarget) return; const o = $('suOverlay'); if (o) o.classList.remove('open'); }
  function preview(i) {
    const r = st.rows[i]; if (!r) return;
    if (!r.src) { toast('这首还没有谱图'); return; }
    openLightboxWithList([{ title: r.title, src: r.src }], 0);
  }

  async function removeRow(r, withImage) {
    const c = client(); if (!c) return false;
    const { error } = await c.from(TABLE).delete().eq('id', r.id);
    if (error) { diag(error, 'delete'); toast('操作失败：需要先登录管理员'); return false; }
    st.rows = st.rows.filter(x => x.id !== r.id);
    if (withImage && r.src) {   // 尽力清掉已上传的图片；失败也不影响
      try {
        const bucket = SUPABASE_CONFIG.songBucket, mark = `/${bucket}/`, k = r.src.indexOf(mark);
        if (k >= 0 && /\/pending-uploads\//.test(r.src)) await c.storage.from(bucket).remove([decodeURIComponent(r.src.slice(k + mark.length).split('?')[0])]);
      } catch (e) { diag(e, 'removeImage'); }
    }
    return true;
  }
  async function approve(i) {
    const r = st.rows[i]; if (!isAdmin || !r || st.busy) return;
    const dup = dupOf(r);
    if (dup && !await slConfirm(`诗歌库里已经有《${dup.title}》了。把这份加到《${dup.title}》里${r.src ? '（作为新的一版谱）' : ''}吗？`)) return;
    st.busy = true;
    try {
      let entry;
      if (dup) {
        entry = dup;
        if (r.category && !entry.category) entry.category = r.category;
        if (r.band && !entry.band) entry.band = r.band;
        if (r.songbook && !entry.songbook) entry.songbook = r.songbook;
        if (r.lyrics && !entry.lyrics) entry.lyrics = r.lyrics;
        entry.tags = normalizeSongLibTagList([...(entry.tags || []), ...(Array.isArray(r.tags) ? r.tags : [])]);
      } else {
        entry = ensureSongInLibrary(r.title, '');
        entry.category = r.category || ''; entry.band = r.band || ''; entry.songbook = r.songbook || '';
        entry.tags = normalizeSongLibTagList(Array.isArray(r.tags) ? r.tags : []);
        entry.lyrics = r.lyrics || '';
      }
      if (r.src) entry.keys.push({ id: genSongLibId(), label: r.key_label || '', src: r.src });
      persistSongLibrary();
      const synced = await syncSongLibraryToRemote();
      if (!synced) { toast('收进诗歌库失败（云端没同步成功），这条还留在待审核里，稍后再点一次'); return; }
      await removeRow(r, false);
      renderSongLibFilterBar(); renderSongLibraryGrid();
      toast(`✅ 《${entry.title}》已收进诗歌库`);
    } catch (e) { diag(e, 'approve'); toast('操作失败，请重试'); }
    finally { st.busy = false; refreshUi(); }
  }
  async function reject(i) {
    const r = st.rows[i]; if (!isAdmin || !r || st.busy) return;
    if (!await slConfirm(`拒绝并删除《${r.title}》？删除后无法恢复。`)) return;
    st.busy = true;
    try { if (await removeRow(r, true)) toast('已拒绝'); }
    finally { st.busy = false; refreshUi(); }
  }

  // ───────── 入口：菜单按钮 + 待处理红点 ─────────
  function refreshUi() {
    try {
      const b = $('suReviewBtn');
      if (b) {
        b.style.display = isAdmin ? '' : 'none';
        const l = b.querySelector('.sl-mi-l'); if (l) l.textContent = count() ? `上传审核（${count()}）` : '上传审核';
      }
      if ($('suOverlay') && $('suOverlay').classList.contains('open')) renderList();
      if (window.slMoreRefresh) slMoreRefresh();
    } catch (e) { diag(e, 'refreshUi'); }
  }
  function patch() {
    const orig = window.updateAdminUI; if (typeof orig !== 'function' || orig._su) return;
    const f = function () { const r = orig.apply(this, arguments); try { refreshUi(); load(true); } catch (e) { diag(e, 'patch'); } return r; };
    f._su = true; window.updateAdminUI = f;
  }
  function init() {
    patch();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      let ready = false;
      try { ready = !songLibSkelOn && !!client(); } catch (e) { /* 还没就绪 */ }
      if (ready || tries > 80) { clearInterval(t); if (ready) { refreshUi(); load(true); } }
    }, 300);
  }

  window.SU = { submit, load, open, close, preview, approve, reject, count, refreshUi };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
