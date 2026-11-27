// ══════ 诊断记录：出错时自动记在本机（最近 100 条），可在「离线与备份」里导出 / 复制 ══════
const LS_DIAG = 'songLibDiag';
const _consoleError = console.error.bind(console);
function slDiagClean(t) {   // 不记录令牌 / 密钥
  return String(t == null ? '' : t)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***')
    .replace(/\b((?:access_token|token|apikey|key|sign\w*)=)[^&\s"']+/gi, '$1***');
}
function slDiagList() { try { return JSON.parse(localStorage.getItem(LS_DIAG) || '[]') || []; } catch (e) { return []; } }
function slDiag(err, scope) {
  try {
    const msg = slDiagClean((err && err.message) || err).slice(0, 300);
    const stack = slDiagClean((err && err.stack) || '').split('\n').slice(0, 4).join(' | ').slice(0, 400);
    let list = slDiagList();
    const last = list[list.length - 1];
    if (last && last.scope === scope && last.msg === msg) { last.n = (last.n || 1) + 1; last.t = Date.now(); }
    else list.push({ t: Date.now(), scope: scope || '', msg, stack, on: navigator.onLine ? 1 : 0 });
    if (list.length > 100) list = list.slice(-100);
    localStorage.setItem(LS_DIAG, JSON.stringify(list));
  } catch (_) {}
}
function slDiagClear() { try { localStorage.removeItem(LS_DIAG); } catch (_) {} }
console.error = function (...a) {
  try { slDiag(a.map(x => (x && x.message) ? x.message : String(x)).join(' '), 'console.error'); } catch (_) {}
  _consoleError.apply(console, a);
};
window.addEventListener('error', ev => slDiag(ev.error || ev.message, 'window.onerror ' + String(ev.filename || '').split('/').pop() + ':' + (ev.lineno || '')));
window.addEventListener('unhandledrejection', ev => slDiag(ev.reason, 'unhandledrejection'));
async function slDiagReport() {
  const L = [];
  L.push('诗歌库诊断信息', '生成时间：' + new Date().toLocaleString(), '页面：' + location.origin + location.pathname,
    '浏览器：' + navigator.userAgent, '屏幕：' + screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x',
    '网络：' + (navigator.onLine ? '在线' : '离线'),
    '离线组件：' + (('serviceWorker' in navigator) ? (navigator.serviceWorker.controller ? '已启用' : '未接管（刷新一次页面后生效）') : '不支持'));
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); L.push(`存储：已用 ${(e.usage / 1048576).toFixed(1)} MB / 配额 ${(e.quota / 1048576).toFixed(0)} MB`); } } catch (_) {}
  try { L.push(`数据：诗歌 ${songLibrary.length} 首，使用记录 ${Object.keys(songData || {}).length} 周，管理员：${isAdmin ? '是' : '否'}`); } catch (_) {}
  try {
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); rows.push([k, (localStorage.getItem(k) || '').length]); }
    rows.sort((a, b) => b[1] - a[1]);
    L.push('本机存储（只列名称和字符数，不含内容）：');
    rows.slice(0, 15).forEach(r => L.push('  ' + r[0] + '：' + r[1]));
  } catch (_) {}
  const list = slDiagList();
  L.push('', `最近错误（${list.length} 条，新的在前）：`);
  list.slice().reverse().forEach(x => L.push(`[${new Date(x.t).toLocaleString()}] ${x.scope || ''} ${x.n > 1 ? '×' + x.n + ' ' : ''}${x.on ? '' : '(离线) '}${x.msg}${x.stack ? '\n    ' + x.stack : ''}`));
  return L.join('\n');
}

// ══════ 应用内弹窗：替代浏览器自带的 prompt / confirm / alert（微信里样式简陋，部分手机还会被拦截）══════
let _slDlgQueue = Promise.resolve();
function _slDialog(o) {
  const run = () => new Promise(resolve => {
    const prevFocus = document.activeElement;
    const id = 'sldlg' + Date.now();
    const ov = document.createElement('div');
    ov.className = 'sl-dlg-ov';
    ov.innerHTML = `<div class="sl-dlg" role="${o.hideCancel ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}m">
      ${o.title ? `<div class="sl-dlg-title">${escapeHtml(o.title)}</div>` : ''}
      <div class="sl-dlg-msg" id="${id}m">${escapeHtml(o.message || '')}</div>
      ${o.input ? `<input class="sl-dlg-input" type="text" autocomplete="off" maxlength="${o.maxLength || 60}" value="${escapeHtml(o.defaultValue || '')}" aria-labelledby="${id}m">` : ''}
      <div class="sl-dlg-btns">${o.hideCancel ? '' : `<button type="button" class="sl-dlg-btn" data-r="cancel">${escapeHtml(o.cancelText || '取消')}</button>`}<button type="button" class="sl-dlg-btn ok${o.danger ? ' danger' : ''}" data-r="ok">${escapeHtml(o.okText || '确定')}</button></div>
    </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('.sl-dlg-input');
    const okBtn = ov.querySelector('[data-r="ok"]');
    const cancelBtn = ov.querySelector('[data-r="cancel"]');
    const finish = v => { document.removeEventListener('keydown', onKey, true); ov.remove(); try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { slDiag(e, '_slDialog'); } resolve(v); };
    const ok = () => finish(o.input ? input.value : true);
    const cancel = () => finish(o.input ? null : false);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); (o.hideCancel ? ok : cancel)(); }
      else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); ok(); }
      else if (e.key === 'Tab') {   // 焦点不要跑到弹窗后面
        const f = [...ov.querySelectorAll('input,button')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', e => {
      if (e.target === ov) { (o.hideCancel ? ok : cancel)(); return; }
      const b = e.target.closest('[data-r]');
      if (b) { if (b.dataset.r === 'ok') ok(); else cancel(); }
    });
    requestAnimationFrame(() => {
      if (input) { input.focus(); input.select(); }
      else if (o.danger && cancelBtn) cancelBtn.focus();   // 删除类操作：默认停在「取消」，回车不会误删
      else okBtn.focus();
    });
  });
  const p = _slDlgQueue.then(run, run);
  _slDlgQueue = p.catch(() => {});
  return p;
}
function slConfirm(msg, opts) {
  opts = opts || {};
  const m = String(msg || '');
  const danger = opts.danger !== undefined ? opts.danger : /删除|清除|覆盖/.test(m);
  const okText = opts.okText || (/删除/.test(m) ? '删除' : /清除/.test(m) ? '清除' : /覆盖/.test(m) ? '覆盖' : '确定');
  return _slDialog({ message: m, danger, okText });
}
function slPrompt(msg, def, opts) { return _slDialog(Object.assign({ message: String(msg || ''), input: true, defaultValue: def || '' }, opts || {})); }
function slAlert(msg) { return _slDialog({ message: String(msg || ''), hideCancel: true }); }

// ── 按需加载 html2canvas（只在「保存海报」时才下载，首页不再白白加载 ~200KB）──
let _h2cPromise = null;
function _loadScript(src){
  return new Promise((ok, fail) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => fail(new Error('load ' + src)); document.head.appendChild(el); });
}
function ensureHtml2canvas(){
  if (typeof html2canvas !== 'undefined') return Promise.resolve(true);
  if (!_h2cPromise) {
    _h2cPromise = _loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js')
      .catch(() => _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'))
      .then(() => typeof html2canvas !== 'undefined', () => false)
      .then(ok => { if (!ok) _h2cPromise = null; return ok; });
  }
  return _h2cPromise;
}
let songData = {};   // 云端 song_data（历史排班用过的诗歌，用于「使用记录」和一键导入）
let scheduleData = {};   // 云端 schedule_data（只用来显示本周主领）

const LS_SONG_LIBRARY = 'churchSongLibrary';

let songLibrary = [];

// 「最近播放」时间只存本机，不上传云端：否则每听一首歌就整库同步一次，还会和别人的改动产生合并冲突
const LS_SONG_PLAYED = 'churchSongLibPlayedLocal';
function slPlayedMap() { try { return JSON.parse(localStorage.getItem(LS_SONG_PLAYED) || '{}') || {}; } catch (e) { return {}; } }
function slApplyPlayedLocal(list) {
  const m = slPlayedMap();
  (list || []).forEach(s => { const t = m[s.id]; if (t && (!s.lastPlayedAt || new Date(t) > new Date(s.lastPlayedAt))) s.lastPlayedAt = t; });
  return list;
}

function loadSongLibrary() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIBRARY);
    songLibrary = slApplyPlayedLocal(normalizeSongLibrary(raw ? JSON.parse(raw) : []));
  } catch (e) { songLibrary = []; }
}

function persistSongLibrary() {
  try { localStorage.setItem(LS_SONG_LIBRARY, JSON.stringify(songLibrary)); } catch (e) { slDiag(e, 'persistSongLibrary'); }
}

const LS_SONG_LIB_FAVORITES = 'churchSongLibFavoritesLocal';

let songLibFavoriteIds = new Set();

function loadSongLibFavorites() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIB_FAVORITES);
    songLibFavoriteIds = new Set(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibFavoriteIds = new Set(); }
}

function persistSongLibFavorites() {
  try { localStorage.setItem(LS_SONG_LIB_FAVORITES, JSON.stringify([...songLibFavoriteIds])); } catch (e) { slDiag(e, 'persistSongLibFavorites'); }
}

function isSongLibFavorite(id) {
  return songLibFavoriteIds.has(id);
}

// ── 我的歌单：本周选好的歌自动在里面 + 自己手动加入的歌（只存在这台设备，和「我的收藏」一样）──
const LS_SONG_LIB_PLAYLIST = 'churchSongLibPlaylistLocal';
let songLibPlaylistIds = [];   // 手动加入的歌曲 id，按加入顺序
function loadSongLibPlaylist() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SONG_LIB_PLAYLIST) || '[]');
    songLibPlaylistIds = Array.isArray(raw) ? [...new Set(raw.filter(x => typeof x === 'string'))] : [];
  } catch (e) { songLibPlaylistIds = []; }
}
function persistSongLibPlaylist() {
  try { localStorage.setItem(LS_SONG_LIB_PLAYLIST, JSON.stringify(songLibPlaylistIds)); } catch (e) { slDiag(e, 'persistSongLibPlaylist'); }
}
// 本周已选好的歌（按选歌顺序，对应到诗歌库里的歌；库里没有的跳过）
function songLibWeekSongs() {
  let arr = [];
  try { arr = (songData[songLibCurWeekKey()] || []); } catch (e) { return []; }
  const seen = new Set(), out = [];
  arr.forEach(it => {
    if (!it || !it.title) return;
    const song = (it.songId && songLibrary.find(x => x.id === it.songId)) || findSongLibEntryByTitle(it.title);
    if (song && !seen.has(song.id)) { seen.add(song.id); out.push(song); }
  });
  return out;
}
// 歌单 = 本周的歌（自动，排最前）+ 手动加入的歌
function songLibPlaylistSongs() {
  const week = songLibWeekSongs(), seen = new Set(week.map(x => x.id));
  const mine = [];
  songLibPlaylistIds.forEach(id => { const song = songLibrary.find(x => x.id === id); if (song && !seen.has(id)) { seen.add(id); mine.push(song); } });
  return { week, mine, all: week.concat(mine) };
}
function isInSongLibPlaylist(id) { return songLibPlaylistIds.includes(id); }
function toggleSongLibPlaylist(id) {
  const song = songLibrary.find(x => x.id === id); if (!song) return;
  const i = songLibPlaylistIds.indexOf(id);
  const inWeek = songLibWeekSongs().some(x => x.id === id);
  if (i >= 0) { songLibPlaylistIds.splice(i, 1); showToast(inWeek ? '已取消保留（本周的歌仍会自动在歌单里）' : '已移出我的歌单'); }
  else { songLibPlaylistIds.push(id); showToast(inWeek ? '已保留到我的歌单（过了本周也还在）' : '已加入我的歌单'); }
  persistSongLibPlaylist();
  if (songLibTab === 'playlist') renderSongLibraryGrid();
  songLibSyncPlButtons();
}
function toggleSongLibPlaylistFromDetail() { if (songLibDetailCurrent) toggleSongLibPlaylist(songLibDetailCurrent.id); }
let _slWeekIdSet = null;
function songLibWeekIdSet(fresh) {
  if (!_slWeekIdSet || fresh) _slWeekIdSet = new Set(songLibWeekSongs().map(x => x.id));
  return _slWeekIdSet;
}
// 某首歌在歌单里的状态：'mine'（我加入的）| 'week'（本周自动）| ''（不在）
function songLibPlState(id, fresh) {
  if (isInSongLibPlaylist(id)) return 'mine';
  return songLibWeekIdSet(fresh).has(id) ? 'week' : '';
}
function renderSongLibDetailPlBtn() {
  const btn = document.getElementById('songLibDetailPlBtn'), s = songLibDetailCurrent;
  if (!btn || !s) return;
  const st = songLibPlState(s.id, true);
  btn.classList.toggle('active', st === 'mine');
  btn.classList.toggle('week', st === 'week');
  btn.innerHTML = st === 'mine' ? '<i class="ti ti-playlist-add-check"></i>已在我的歌单'
    : st === 'week' ? '<i class="ti ti-calendar-star"></i>本周歌单中 · 点击保留'
    : '<i class="ti ti-playlist-add"></i>加入我的歌单';
  btn.title = st === 'mine' ? '点击移出我的歌单' : st === 'week' ? '本周的歌会自动在歌单里，点一下可保留到以后' : '加入我的歌单';
}
// 把所有位置上的「歌单」按钮状态一次刷新：卡片、详情页、悬浮播放条、播放页
function songLibSyncPlButtons() {
  try {
    const wk = songLibWeekIdSet(true);
    renderSongLibDetailPlBtn();
    const cur = (typeof musicPlayerSongTitle !== 'undefined' && musicPlayerSongTitle) ? findSongLibEntryByTitle(musicPlayerSongTitle) : null;
    const fb = document.getElementById('floatingAudioPlBtn');
    if (fb) {
      const on = !!cur && (isInSongLibPlaylist(cur.id) || wk.has(cur.id));
      fb.classList.toggle('active', on); fb.style.display = cur ? '' : 'none';
      fb.innerHTML = `<i class="ti ${on ? 'ti-playlist-add-check' : 'ti-playlist-add'}"></i>`;
      fb.title = on ? '已在歌单（点击' + (cur && isInSongLibPlaylist(cur.id) ? '移出' : '保留') + '）' : '加入我的歌单';
    }
    const ns = (typeof nowPlayingSong !== 'undefined') ? nowPlayingSong : null;
    const nb = document.getElementById('npPlBtn'), nm = document.getElementById('npMorePlBtn');
    if (ns) {
      const st = songLibPlState(ns.id);
      if (nb) { nb.classList.toggle('active', !!st); nb.innerHTML = `<i class="ti ${st ? 'ti-playlist-add-check' : 'ti-playlist-add'}"></i>`; }
      if (nm) nm.innerHTML = `<i class="ti ${st ? 'ti-playlist-add-check' : 'ti-playlist-add'}"></i>${st === 'mine' ? '移出我的歌单' : st === 'week' ? '保留到我的歌单' : '加入我的歌单'}`;
    }
  } catch (e) { slDiag(e, 'songLibSyncPlButtons'); }
}
function floatingAudioTogglePlaylist() {
  const cur = findSongLibEntryByTitle(musicPlayerSongTitle);
  if (!cur) { showToast('没有找到这首歌'); return; }
  toggleSongLibPlaylist(cur.id);
}
function toggleNowPlayingPlaylist() { if (nowPlayingSong) toggleSongLibPlaylist(nowPlayingSong.id); }

// ── 「我的歌单」列表（仿网易云 / QQ 音乐：序号 + 歌名 + 副标题 + 播放 + 更多）──
function songLibNowTitleKey() {
  try { return (globalAudioEl && globalAudioEl.src && loadedAudioLinkId) ? String(musicPlayerSongTitle || '').trim().toLowerCase() : ''; } catch (e) { return ''; }
}
function songLibSyncPlaylistRows() {
  if (songLibTab !== 'playlist') return;
  const cur = songLibNowTitleKey(), playing = !!(globalAudioEl && !globalAudioEl.paused && cur);
  document.querySelectorAll('.pl-row').forEach(r => {
    const on = !!cur && r.dataset.title === cur;
    r.classList.toggle('current', on); r.classList.toggle('playing', on && playing);
    const i = r.querySelector('.pl-play i'); if (i) i.className = 'ti ' + (on && playing ? 'ti-player-pause' : 'ti-player-play');
  });
}
function songLibPlRowHtml(s, n, isWeek) {
  const hasAudio = getAudioLinksForTitle(s.title).length > 0;
  const safeTitle = escapeHtml(s.title).replace(/'/g, "\\'");
  const sub = [];
  if (s.band) sub.push(escapeHtml(s.band));
  if (s.songbook) sub.push(escapeHtml(s.songbook));
  const keys = (s.keys || []).map(k => k.label).filter(Boolean);
  if (keys.length) sub.push('调 ' + escapeHtml(keys.slice(0, 3).join(' / ')));
  return `<div class="pl-row${hasAudio ? '' : ' no-audio'}" data-sid="${s.id}" data-title="${escapeHtml(s.title.trim().toLowerCase())}" onclick="openSongLibDetail('${s.id}')">
    <div class="pl-idx"><span>${n}</span><b class="pl-eq"><i></i><i></i><i></i></b></div>
    <div class="pl-info">
      <div class="pl-title">${highlightKeyword(s.title, songLibSearchKeyword)}</div>
      <div class="pl-sub">${isWeek ? '<span class="song-lib-plbadge">本周</span>' : ''}${sub.length ? '<span class="pl-sub-t">' + sub.join(' · ') + '</span>' : ''}</div>
    </div>
    ${hasAudio ? `<button type="button" class="pl-btn pl-play" onclick="event.stopPropagation();songLibPlRowPlay('${safeTitle}')" title="播放" aria-label="播放"><i class="ti ti-player-play"></i></button>` : ''}
    <button type="button" class="pl-btn pl-more" onclick="event.stopPropagation();openPlMenu('${s.id}')" title="更多" aria-label="更多"><i class="ti ti-dots-vertical"></i></button>
  </div>`;
}
// ── 歌单顶部卡片背景：默认用自带的图，也可以换成自己的图（只存在这台设备）──
const LS_SONG_LIB_PL_BG = 'churchSongLibPlaylistBg';
const SONG_LIB_PL_BG_DEFAULT = 'icons/playlist-bg.jpg';
function songLibPlBgGet() { try { return localStorage.getItem(LS_SONG_LIB_PL_BG) || ''; } catch (e) { return ''; } }
function songLibPlBgStyle() {
  const u = songLibPlBgGet() || SONG_LIB_PL_BG_DEFAULT;
  return `background-image:url('${u.replace(/'/g, "\\'")}')`;
}
function songLibPlBgApply() { document.querySelectorAll('.pl-card').forEach(c => { c.style.cssText = songLibPlBgStyle(); }); }
function openPlBgMenu() {
  document.getElementById('plBgOverlay')?.classList.add('open');
  const rs = document.getElementById('plBgReset'); if (rs) rs.style.display = songLibPlBgGet() ? '' : 'none';
}
function closePlBgMenu(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('plBgOverlay')?.classList.remove('open');
}
function songLibPlBgPick() { document.getElementById('plBgFile')?.click(); }
function songLibPlBgReset() {
  try { localStorage.removeItem(LS_SONG_LIB_PL_BG); } catch (e) { slDiag(e, 'songLibPlBgReset'); }
  songLibPlBgApply(); closePlBgMenu(); showToast('已恢复默认背景');
}
// 选图后缩小压缩再存，避免撑爆本地存储
function songLibPlBgOnFile(input) {
  const f = input.files && input.files[0]; input.value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) { showToast('请选择图片文件'); return; }
  const url = URL.createObjectURL(f), img = new Image();
  img.onload = () => {
    try {
      const max = 1000, r = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      localStorage.setItem(LS_SONG_LIB_PL_BG, cv.toDataURL('image/jpeg', 0.8));
      songLibPlBgApply(); closePlBgMenu(); showToast('背景已更换');
    } catch (e) { slDiag(e, 'songLibPlBgOnFile'); showToast('图片太大，保存失败，换一张小一点的试试'); }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); showToast('图片读取失败'); };
  img.src = url;
}
function songLibPlaylistListHtml(list) {
  const wk = songLibWeekIdSet(true);
  const week = list.filter(x => wk.has(x.id)), mine = list.filter(x => !wk.has(x.id));
  let n = 0;
  const group = (title, note, arr, isWeek) => arr.length
    ? `<div class="pl-group"><span>${title}</span><small>${note}</small></div><div class="pl-list">${arr.map(x => songLibPlRowHtml(x, ++n, isWeek)).join('')}</div>` : '';
  const hn = typeof hymnPlaylistCount === 'function' ? hymnPlaylistCount() : 0;   // 歌单里的「诗歌本音乐」（hymnmusic.js）
  const playable = list.filter(x => getAudioLinksForTitle(x.title).length).length + hn;
  const sub = [week.length ? `本周 ${week.length} 首` : '', mine.length ? `我加入的 ${mine.length} 首` : '', hn ? `诗歌本音乐 ${hn} 首` : ''].filter(Boolean).join(' · ');
  return `<div class="pl-card" style="${songLibPlBgStyle()}">
      <button type="button" class="pl-bg-btn" onclick="openPlBgMenu()" title="自定义背景" aria-label="自定义背景"><i class="ti ti-photo-edit"></i></button>
      <div class="pl-head">
        <div class="pl-cover"><i class="ti ti-playlist"></i></div>
        <div class="pl-head-info"><div class="pl-head-title">我的歌单</div><div class="pl-head-sub">共 ${list.length + hn} 首${sub ? ' · ' + sub : ''}</div></div>
      </div>
      <div class="pl-actions">
        <button type="button" class="pl-playall" onclick="songLibPlaylistPlayAll()"><i class="ti ti-player-play-filled"></i>播放全部<span>${playable} 首可听</span></button>
        ${list.length ? '<button type="button" class="pl-lookall" onclick="openLightboxFromLibraryGrid(0)"><i class="ti ti-book-2"></i>看谱</button>' : ''}
      </div>
    </div>
        ${group('本周诗歌', '自动加入', week, true)}${group('我加入的', '手动保留', mine, false)}${hn ? hymnPlaylistGroupHtml(n) : ''}`;
}
function songLibPlRowPlay(title) {
  const cur = songLibNowTitleKey();
  if (cur && cur === String(title || '').trim().toLowerCase()) { toggleFloatingAudioPlay(); return; }
  quickPlaySongAudio(title);
}
function songLibPlaylistPlayAll() {
  const first = getFilteredSongLibrary().find(x => getAudioLinksForTitle(x.title).length);
  if (!first) {
    if (typeof hymnPlaylistCount === 'function' && hymnPlaylistCount()) { hymnPlayAll(); return; }   // 只有诗歌本音乐时，播放那一组
    showToast('歌单里的歌暂时都没有可播放的音频'); return;
  }
  quickPlaySongAudio(first.title);   // 默认「列表播放」，会按歌单顺序一首接一首
}
// 每首歌右边的「⋯」菜单
function openPlMenu(id) {
  const song = songLibrary.find(x => x.id === id); if (!song) return;
  const st = songLibPlState(id, true), fav = isSongLibFavorite(id);
  document.getElementById('plMenuTitle').textContent = song.title;
  const items = [
    ['ti-photo', '看谱', `closePlMenu();openLightboxFromLibraryGrid(${Math.max(0, getFilteredSongLibrary().findIndex(x => x.id === id))})`],
    ['ti-info-circle', '查看详情', `closePlMenu();openSongLibDetailDirect('${id}')`],
    [fav ? 'ti-heart-filled' : 'ti-heart', fav ? '取消收藏' : '收藏', `closePlMenu();toggleSongLibFavorite('${id}')`],
    [st === 'mine' ? 'ti-playlist-x' : 'ti-pin', st === 'mine' ? '移出我的歌单' : st === 'week' ? '保留到我的歌单（过了本周也在）' : '加入我的歌单', `closePlMenu();toggleSongLibPlaylist('${id}')`],
  ];
  document.getElementById('plMenuBody').innerHTML = items.map(x => `<button type="button" class="pl-sheet-item${x[0] === 'ti-playlist-x' ? ' danger' : ''}" onclick="${x[2]}"><i class="ti ${x[0]}"></i>${x[1]}</button>`).join('');
  document.getElementById('plMenuOverlay').classList.add('open');
}
function closePlMenu(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('plMenuOverlay')?.classList.remove('open');
}
function openSongLibDetailDirect(id) {   // （长辈模式里没有「⋯」菜单，所以这里直接打开详情页即可）
  openSongLibDetail(id);
}
function songLibPlaylistBadgeHtml(s) {   // 在「我的歌单」里给本周的歌打个小标记
  if (songLibTab !== 'playlist') return '';
  try { if (songLibWeekSongs().some(x => x.id === s.id)) return '<span class="song-lib-plbadge">本周</span>'; } catch (e) { return ''; }
  return '';
}

const LS_SONG_LIB_CATEGORIES = 'churchSongLibCategories';

let songLibCategories = [];

function normalizeSongLibCategoryList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach(c => {
    const v = String(c || '').trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
}

function loadSongLibCategories() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIB_CATEGORIES);
    songLibCategories = normalizeSongLibCategoryList(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibCategories = []; }
}

function persistSongLibCategories() {
  try { localStorage.setItem(LS_SONG_LIB_CATEGORIES, JSON.stringify(songLibCategories)); } catch (e) { slDiag(e, 'persistSongLibCategories'); }
}

async function syncSongLibCategoriesToRemote() {
  try { await syncRemoteField('song_lib_categories', songLibCategories); } catch (e) { slDiag(e, 'syncSongLibCategoriesToRemote'); }
}

const LS_SONG_LIB_SONGBOOKS = 'churchSongLibSongbooks';

let songLibSongbooks = [];

function normalizeSongLibSongbookList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach(c => {
    const v = String(c || '').trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
}

function loadSongLibSongbooks() {
  try {
    const raw = localStorage.getItem(LS_SONG_LIB_SONGBOOKS);
    songLibSongbooks = normalizeSongLibSongbookList(raw ? JSON.parse(raw) : []);
  } catch (e) { songLibSongbooks = []; }
}

function persistSongLibSongbooks() {
  try { localStorage.setItem(LS_SONG_LIB_SONGBOOKS, JSON.stringify(songLibSongbooks)); } catch (e) { slDiag(e, 'persistSongLibSongbooks'); }
}

async function syncSongLibSongbooksToRemote() {
  try { await syncRemoteField('song_lib_songbooks', songLibSongbooks); } catch (e) { slDiag(e, 'syncSongLibSongbooksToRemote'); }
}

// ── 主题标签：每首歌可以有多个；标签库可自定义（新增 / 重命名 / 删除），样式与「诗歌本」一致 ──
const LS_SONG_LIB_TAGS = 'churchSongLibTags';
let songLibTags = [];          // 标签库（含还没被任何歌使用的标签）
let songLibTagFilter = [];     // 筛选：选中的标签（歌曲需同时包含）
function normalizeSongLibTagList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  raw.forEach(c => {
    const v = String(c || '').trim().slice(0, 20);
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
}
function loadSongLibTags() {
  try { const raw = localStorage.getItem(LS_SONG_LIB_TAGS); songLibTags = normalizeSongLibTagList(raw ? JSON.parse(raw) : []); }
  catch (e) { songLibTags = []; }
}
function persistSongLibTags() { try { localStorage.setItem(LS_SONG_LIB_TAGS, JSON.stringify(songLibTags)); } catch (e) { slDiag(e, 'persistSongLibTags'); } }
async function syncSongLibTagsToRemote() { try { await syncRemoteField('song_lib_tags', songLibTags); } catch (e) { slDiag(e, 'syncSongLibTagsToRemote'); } }
function getSongLibTags() {
  const set = new Map();
  songLibTags.forEach(t => set.set(t.toLowerCase(), t));
  songLibrary.forEach(s => (s.tags || []).forEach(t => { if (!set.has(t.toLowerCase())) set.set(t.toLowerCase(), t); }));
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'zh'));
}
function songLibHasTag(s, t) { const k = t.toLowerCase(); return (s.tags || []).some(x => x.toLowerCase() === k); }
function songLibTagCount(t) { return songLibrary.filter(s => songLibHasTag(s, t)).length; }

// ── 主题标签防丢：单独存一份「歌曲 id → 标签」到云端 song_lib_song_tags 字段 ──
// 老版本保存 song_library 时会把不认识的 tags 字段整个去掉；标签单独放在老版本根本不读也不写的字段里，
// 老版本怎么存都动不了它，打开新版本时再把标签按歌曲 id 贴回去。
// 需要先在 Supabase 执行 supabase_song_tags.sql 加这一列；没加之前自动退回老做法（标签仍跟着 song_library 走）。
const SONG_TAGS_FIELD = 'song_lib_song_tags';
let songTagsSplit = false;      // 云端已有 song_lib_song_tags 这一列
let slSongTagMap = {};          // 最近一次读到 / 写成功的云端「歌曲 id → 标签」
function slBuildTagMap() {
  const m = {};
  songLibrary.forEach(s => { m[s.id] = normalizeSongLibTagList(s.tags); });
  return m;
}
// 把云端标签表贴到歌曲上：表里有这首歌就以表为准（含「已清空」），没有就保持原样（旧数据 / 还没同步的新歌）
function slApplyTagMap(list, map) {
  if (!songTagsSplit || !_isObj(map)) return list;
  (list || []).forEach(s => { if (Object.prototype.hasOwnProperty.call(map, s.id)) s.tags = normalizeSongLibTagList(map[s.id]); });
  return list;
}
function slTagMapEqual(a, b) {
  const x = normalizeSongLibTagList(a), y = normalizeSongLibTagList(b);
  return x.length === y.length && x.every((t, i) => t.toLowerCase() === y[i].toLowerCase());
}
// 有歌带标签、但云端标签表里还没有（或不一样）：管理员打开页面时自动补写一次，之后老版本就清不掉了
async function slSongTagsMigrate() {
  if (!songTagsSplit || !isAdmin) return;
  const need = songLibrary.some(s => s.tags && s.tags.length && !(Object.prototype.hasOwnProperty.call(slSongTagMap, s.id) && slTagMapEqual(slSongTagMap[s.id], s.tags)));
  if (!need) return;
  try { await slSyncSongTags(); } catch (e) { slDiag(e, 'slSongTagsMigrate'); }
}
async function slSyncSongTags() {
  const mine = slBuildTagMap();
  await syncRemoteField(SONG_TAGS_FIELD, mine);
  slSongTagMap = (_lastSyncOut != null && _isObj(_lastSyncOut)) ? _lastSyncOut : mine;
}

const LS_SONGLIB_SB_CONFIG = 'churchSongLibSbConfig';

let songLibSupabaseConfig = { url: '', anonKey: '', bucket: 'songs' };

let songLibSupabaseClient = null;

let songLibSupabaseClientKey = '';

function normalizeSongLibSbConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    url: typeof o.url === 'string' ? o.url.trim() : '',
    anonKey: typeof o.anonKey === 'string' ? o.anonKey.trim() : '',
    bucket: (typeof o.bucket === 'string' && o.bucket.trim()) ? o.bucket.trim() : 'songs',
  };
}

function loadSongLibSupabaseConfig() {
  try {
    const raw = localStorage.getItem(LS_SONGLIB_SB_CONFIG);
    songLibSupabaseConfig = normalizeSongLibSbConfig(raw ? JSON.parse(raw) : {});
  } catch (e) { songLibSupabaseConfig = normalizeSongLibSbConfig({}); }
}

function persistSongLibSupabaseConfig() {
  try { localStorage.setItem(LS_SONGLIB_SB_CONFIG, JSON.stringify(songLibSupabaseConfig)); } catch (e) { slDiag(e, 'persistSongLibSupabaseConfig'); }
}

function getSongLibSupabaseClient() {
  const cfg = songLibSupabaseConfig;
  if (!cfg.url || !cfg.anonKey || !window.supabase) return null;
  const key = cfg.url + '|' + cfg.anonKey;
  if (!songLibSupabaseClient || songLibSupabaseClientKey !== key) {
    songLibSupabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    songLibSupabaseClientKey = key;
  }
  return songLibSupabaseClient;
}

function fillSongLibStorageSettingsInputs() {
  const u = document.getElementById('songLibSbUrl');
  const k = document.getElementById('songLibSbAnonKey');
  const b = document.getElementById('songLibSbBucket');
  if (u) u.value = songLibSupabaseConfig.url || '';
  if (k) k.value = songLibSupabaseConfig.anonKey || '';
  if (b) b.value = songLibSupabaseConfig.bucket || 'songs';
}

async function saveSongLibStorageConfig() {
  if (!isAdmin) return;
  const url = (document.getElementById('songLibSbUrl').value || '').trim();
  const anonKey = (document.getElementById('songLibSbAnonKey').value || '').trim();
  const bucket = (document.getElementById('songLibSbBucket').value || '').trim() || 'songs';
  songLibSupabaseConfig = normalizeSongLibSbConfig({ url, anonKey, bucket });
  songLibSupabaseClient = null; // 强制用新配置重新建立连接
  persistSongLibSupabaseConfig();
  showToast('✅ 诗歌库存储配置已保存');
  try { await syncRemoteField('song_lib_storage_config', songLibSupabaseConfig); } catch (e) { slDiag(e, 'saveSongLibStorageConfig'); }
}

async function uploadMusicMp3File(file) {
  const client = getSongLibSupabaseClient();
  if (!client) throw new Error('尚未配置诗歌库 Supabase 存储，请联系管理员在"设置"中配置');
  const bucket = songLibSupabaseConfig.bucket || 'songs';
  const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  const filePath = `${Date.now()}_${safeName}`;
  const { error } = await client.storage.from(bucket).upload(filePath, file, {
    contentType: file.type || 'audio/mpeg',
    upsert: true,
  });
  if (error) throw new Error(error.message || '上传失败');
  const { data } = client.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

async function handleMusicLinkMp3Select(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const errEl = document.getElementById('musicLinkAddError');
  const urlInput = document.getElementById('musicLinkAddUrl');
  const labelInput = document.getElementById('musicLinkAddLabel');
  errEl.classList.remove('show');
  urlInput.disabled = true;
  const prevPlaceholder = urlInput.placeholder;
  urlInput.value = '';
  urlInput.placeholder = '⏳ 正在上传 mp3…';
  try {
    const publicUrl = await uploadMusicMp3File(file);
    urlInput.value = publicUrl;
    if (!labelInput.value.trim()) labelInput.value = file.name.replace(/\.[^.]+$/, '');
    showToast('✅ mp3 上传成功');
  } catch (e) {
    errEl.textContent = e.message || '上传失败，请检查诗歌库存储设置';
    errEl.classList.add('show');
  } finally {
    urlInput.disabled = false;
    urlInput.placeholder = prevPlaceholder;
    input.value = '';
  }
}

function genSongLibId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeSongLibrary(raw) {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set();
  return raw.map(item => {
    let id = item?.id || genSongLibId();
    while (seenIds.has(id)) id = id + '_' + Math.random().toString(36).slice(2, 4);
    seenIds.add(id);
    let keys;
    if (Array.isArray(item?.keys)) {
      const seenKeyIds = new Set();
      keys = item.keys.map(k => {
        let kid = k?.id || genSongLibId();
        while (seenKeyIds.has(kid)) kid = kid + '_' + Math.random().toString(36).slice(2, 4);
        seenKeyIds.add(kid);
        return { id: kid, label: (k?.label || '').trim(), src: k?.src || '' };
      }).filter(k => k.src);
    } else {
      keys = [];
    }
    // 旧数据迁移：早期版本每首歌只有单个 src 字段，没有"调"的概念，
    // 迁移成 keys 数组里唯一一项，标签留空（显示为"默认"）
    if (!keys.length && item?.src) {
      keys = [{ id: genSongLibId(), label: '', src: item.src }];
    }
    let music;
    if (Array.isArray(item?.music)) {
      const seenMusicIds = new Set();
      music = item.music.map(m => {
        let mid = m?.id || genSongLibId();
        while (seenMusicIds.has(mid)) mid = mid + '_' + Math.random().toString(36).slice(2, 4);
        seenMusicIds.add(mid);
        return { id: mid, label: (m?.label || '').trim(), url: (m?.url || '').trim() };
      }).filter(m => m.url);
    } else {
      music = [];
    }
    return {
      id,
      title: (item?.title || '').trim(),
      category: (item?.category || '').trim(),
      band: (item?.band || '').trim(),
      songbook: (item?.songbook || '').trim(),
      tags: normalizeSongLibTagList(item?.tags),
      lyrics: item?.lyrics || '',
      lyricsLrc: item?.lyricsLrc || '',
      keys,
      music,
      lastPlayedAt: item?.lastPlayedAt || null,
      createdAt: item?.createdAt || new Date().toISOString(),
    };
  }).filter(item => item.title);
}

function ensureSongInLibrary(title, src) {
  const t = (title || '').trim();
  if (!t) return null;
  let entry = songLibrary.find(s => s.title === t);
  if (entry) {
    if (src && !entry.keys.length) entry.keys.push({ id: genSongLibId(), label: '', src });
    return entry;
  }
  entry = {
    id: genSongLibId(),
    title: t,
    category: '',
    band: '',
    songbook: '',
    tags: [],
    lyrics: '',
    lyricsLrc: '',
    keys: src ? [{ id: genSongLibId(), label: '', src }] : [],
    music: [],
    lastPlayedAt: null,
    createdAt: new Date().toISOString(),
  };
  songLibrary.unshift(entry);
  return entry;
}

function findDuplicateSongInLibrary(title) {
  const t = (title || '').trim().toLowerCase();
  if (!t) return null;
  return songLibrary.find(s => s.title.trim().toLowerCase() === t) || null;
}

function removeSongFromLibrary(id) {
  songLibrary = songLibrary.filter(s => s.id !== id);
}

function getSongLibCategories() {
  const set = new Set();
  songLibrary.forEach(s => { if (s.category) set.add(s.category); });
  songLibCategories.forEach(c => { if (c) set.add(c); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

function getSongLibBands() {
  const set = new Set();
  songLibrary.forEach(s => { if (s.band) set.add(s.band); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

function getSongLibSongbooks() {
  const set = new Set();
  songLibrary.forEach(s => { if (s.songbook) set.add(s.songbook); });
  songLibSongbooks.forEach(sb => { if (sb) set.add(sb); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

function getSongLibSongbookChipOptions() {
  const set = new Set();
  songLibrary.forEach(s => {
    if (songLibCategoryFilter && s.category !== songLibCategoryFilter) return;
    if (s.songbook) set.add(s.songbook);
  });
  songLibSongbooks.forEach(sb => { if (sb) set.add(sb); });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

function getSongLibKeyDisplayLabel(key) {
  return key?.label ? key.label : '默认';
}

function findSongLibEntryByTitle(title) {
  const t = (title || '').trim().toLowerCase();
  if (!t) return null;
  return songLibrary.find(s => s.title.trim().toLowerCase() === t) || null;
}

function escapeRegExpChars(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function highlightKeyword(text, keyword){
  const t = text || '';
  const kw = (keyword || '').trim();
  if (!kw) return escapeHtml(t);
  const parts = kw.split(/\s+/).filter(Boolean).slice(0, 5).sort((a, b) => b.length - a.length);   // 多个关键词：长的先匹配
  const re = new RegExp(parts.map(escapeRegExpChars).join('|'), 'ig');
  let result = '', lastIndex = 0, m;
  while ((m = re.exec(t)) !== null) {
    result += escapeHtml(t.slice(lastIndex, m.index));
    result += `<mark class="song-lib-hl">${escapeHtml(m[0])}</mark>`;
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  result += escapeHtml(t.slice(lastIndex));
  return result;
}

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = (values || []).map(c => `<option value="${escapeHtml(c)}">`).join('');
}

function getMusicLinksForTitle(title) {
  const s = findSongLibEntryByTitle(title);
  return s?.music || [];
}

function getAudioLinksForTitle(title) {
  return getMusicLinksForTitle(title).filter(l => detectMusicPlatform(l.url) === 'audio');
}

function detectMusicPlatform(url) {
  const u = (url || '').toLowerCase();
  if (/youtu\.?be/.test(u)) return 'youtube';
  if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?|#|$)/.test(u)) return 'audio';
  return 'link';
}

function getYoutubeEmbedSrc(url) {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /youtube\.com\/embed\/([^?&]+)/, /youtube\.com\/shorts\/([^?&]+)/];
  let id = '';
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) { id = m[1]; break; }
  }
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : '';
}

function getMusicPlatformIcon(platform) {
  return platform === 'youtube' ? 'ti-brand-youtube' : platform === 'audio' ? 'ti-file-music' : 'ti-link';
}

function getMusicPlatformLabel(platform) {
  return platform === 'youtube' ? 'YouTube' : platform === 'audio' ? '音频文件' : '外部链接';
}

function findSongUsageWeeks(title) {
  const t = (title || '').trim();
  if (!t) return [];
  return Object.keys(songData)
    .filter(key => (songData[key] || []).some(s => s.title === t))
    .sort((a, b) => b.localeCompare(a));
}

async function syncSongLibraryToRemote(successMsg) {
  if (!initSupabaseClient()) return false;
  try {
    if (songTagsSplit) {
      // 标签单独存（先写标签，再写歌曲）；song_library 里不再放 tags，老版本重写它也就丢不了东西
      try { await slSyncSongTags(); }
      catch (e) { if (isMissingRemoteColumnError(e, SONG_TAGS_FIELD)) songTagsSplit = false; else throw e; }
    }
    await syncRemoteField('song_library', songLibrary.map(({ lastPlayedAt, tags, ...rest }) => songTagsSplit ? rest : { ...rest, tags }));   // 播放时间不上传
    if (!songTagsSplit && isAdmin && !syncSongLibraryToRemote._warned && songLibrary.some(s => s.tags && s.tags.length)) {
      syncSongLibraryToRemote._warned = true;
      showToast('⚠️ 云端还没加「标签备份」字段，老版本仍会清掉标签。请在 Supabase 执行 supabase_song_tags.sql', 6000);
    }
    if (successMsg) showToast(successMsg);
    return true;
  } catch (e) {
    console.error('同步歌单库失败', e);
    if (isMissingRemoteColumnError(e, 'song_library')) {
      showToast('后端缺少 song_library 字段，请先执行修复 SQL');
    } else {
      showToast('已保存到本地，但云端同步失败');
    }
    return false;
  }
}

function getSafeExternalUrl(url) {
  const val = String(url || '').trim();
  if(!val) return '';
  try {
    const parsed = new URL(val);
    return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
  } catch(e) {
    return '';
  }
}

function normalizeExternalUrlInput(url) {
  const val = String(url || '').trim();
  if(!val) return '';
  if(/^https?:\/\//i.test(val)) return val;
  if(/^\/\//.test(val)) return `https:${val}`;
  if(/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(val)) return `https://${val}`;
  return val;
}

function escapeHtml(str){ return String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

let selectedSunday=null, pickerYear=new Date().getFullYear(), headerCollapsed=false, scheduleCollapsed=false, isAdmin=false, viewMode='card';

let lightboxSongs=[], lightboxIndex=0;
// ── 大图查看器（看图模式）：缩放 / 拖动 / 双击放大 / 双指缩放 / 滑动切歌 / 滚轮 / 键盘 ──
const lbv={lyrics:false,open:false,gen:0,scale:1,x:0,y:0,pts:new Map(),pinchD:0,pinchS:1,moved:false,lastTap:0,drag:null,swiping:false,bound:false,bodyOverflow:''};
function lbvEl(id){ return document.getElementById(id); }
function lbvClamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
// 通用底层方法：传入任意 {title, src} 数组与起始索引即可打开大图查看器，
function openLightboxWithList(list, index, opts){
  lightboxSongs=(list||[]).filter(s=>s && (s.src || s.loader)).map(s=>Object.assign({},s));   // 复制一份：切换调时不会改动原数据
  if(!lightboxSongs.length) return;
  lightboxIndex=Math.max(0, Math.min(index||0, lightboxSongs.length-1));
  mkFlush(); mk.on=false; mk.show=true;
  lightboxBind();
  if(!lbv.open){ lbv.bodyOverflow=document.body.style.overflow; document.body.style.overflow='hidden'; }
  lbv.open=true;
  lbvEl('lightbox').classList.add('open');
  document.removeEventListener('keydown', onLightboxKeydown);
  document.addEventListener('keydown', onLightboxKeydown);
  showLightboxImage();
  if(opts && opts.mark) mkEnter();
}
function lightboxApplyTransform(){
  const img=lbvEl('lightboxImg');
  img.style.transform=`translate(${lbv.x}px,${lbv.y}px) scale(${lbv.scale})`;
  lbvEl('lightboxZoom').textContent=Math.round(lbv.scale*100)+'%';
  const st=lbvEl('lightboxStage');
  st.classList.toggle('zoomed', lbv.scale>1);
  mkApplyTransform();
}
function lightboxResetView(){ lbv.scale=1; lbv.x=0; lbv.y=0; lightboxApplyTransform(); }
function lightboxZoomAt(factor, cx, cy){
  const rect=lbvEl('lightboxStage').getBoundingClientRect();
  const ox=cx-rect.left-rect.width/2, oy=cy-rect.top-rect.height/2;
  const ns=lbvClamp(lbv.scale*factor,1,8), r=ns/lbv.scale;
  lbv.x=ox-(ox-lbv.x)*r; lbv.y=oy-(oy-lbv.y)*r; lbv.scale=ns;
  if(ns===1){ lbv.x=0; lbv.y=0; }
  lightboxApplyTransform();
}
function lightboxZoomCenter(f){ const r=lbvEl('lightboxStage').getBoundingClientRect(); lightboxZoomAt(f, r.left+r.width/2, r.top+r.height/2); }
function showLightboxImage(force){
  const s=lightboxSongs[lightboxIndex];
  if(!s) return;
  const gen=++lbv.gen;
  const img=lbvEl('lightboxImg'), msg=lbvEl('lightboxMsg');
  lightboxResetView();
  mkOnSong(s);
  lbvRenderTitle(s);
  const total=lightboxSongs.length;
  lbvEl('lightboxCounter').textContent=total>1?`${lightboxIndex+1} / ${total}`:'';
  lbvRenderExtras(s);
  lbvEl('lightboxPrev').style.display=total>1?'flex':'none';
  lbvEl('lightboxNext').style.display=total>1?'flex':'none';
  lbvEl('lightboxPrev').disabled=lightboxIndex<=0;
  lbvEl('lightboxNext').disabled=lightboxIndex>=total-1;
  img.style.visibility='hidden';
  msg.textContent='加载中…';
  // 懒加载歌谱（诗歌本 / 赞美网搜索结果）：翻到这一首时才去取图片地址
  if(!s.src && s.loader){
    img.removeAttribute('src');
    const pr=s._p || (s._p=Promise.resolve().then(()=>s.loader(!!s._retry)));
    pr.then(urls=>{
      urls=[].concat(urls).filter(Boolean);
      if(!urls.length) throw new Error('该歌谱暂无图片');
      s.src=urls[0];
      if(urls.length>1 && !s._expanded){
        s._expanded=true;
        const base=s.title; s.title=`${base}（1/${urls.length}）`;
        const extra=urls.slice(1).map((u,k)=>({title:`${base}（${k+2}/${urls.length}）`,src:u,noLib:true}));
        const at=lightboxSongs.indexOf(s);
        if(at>=0) lightboxSongs.splice(at+1,0,...extra);
      }
      if(gen===lbv.gen) showLightboxImage();
    }).catch(e=>{ s._p=null; s._retry=true; if(gen===lbv.gen) msg.textContent='加载失败：'+((e&&e.message)||e)+'\n点击屏幕重试'; });
    lbvPrefetchNeighbors();
    return;
  }
  img.onload=()=>{ if(gen===lbv.gen){ img.style.visibility='visible'; msg.textContent=''; mkLayout(); } };
  img.onerror=()=>{ if(gen===lbv.gen){ if(s.loader){ s.src=''; s._p=null; s._retry=true; } msg.textContent='图片加载失败（链接过期或被拒）。\n点击屏幕重试'; } };
  img.removeAttribute('src');
  img.src=s.src+(force && !/^data:/.test(s.src) ? (s.src.includes('?')?'&':'?')+'_r='+Date.now() : '');
  lbvPrefetchNeighbors();
}
function lbvPrefetchNeighbors(){
  [lightboxIndex-1, lightboxIndex+1].forEach(k=>{
    const n=lightboxSongs[k];
    if(!n) return;
    if(n.src && !/^data:/.test(n.src)){ const im=new Image(); im.referrerPolicy='no-referrer'; im.src=n.src; }
    else if(!n.src && n.loader && !n._p){
      n._p=Promise.resolve().then(()=>n.loader(false));
      n._p.then(urls=>{ urls=[].concat(urls).filter(Boolean); if(urls[0]){ const im=new Image(); im.referrerPolicy='no-referrer'; im.src=urls[0]; } }).catch(()=>{ n._p=null; });
    }
  });
}
// ── 看图模式：歌词 + 多调切换（歌曲在诗歌库里能对上号时才有；专属搜索的结果没有）──
function lbvEntry(s){
  if(!s || s.noLib) return null;
  let e=null;
  if(s.songId) e=songLibrary.find(x=>x.id===s.songId)||null;
  if(!e){
    const t=String(s.title||'');
    e=findSongLibEntryByTitle(t) || findSongLibEntryByTitle(t.replace(/\s*[（(][^（()）]*[）)]\s*$/,''));
  }
  if(e) s.songId=e.id;
  return e;
}
// 看图标题：这首是本周教歌时，标题后面带一个「教歌」小标签
function lbvTeachOn(s){ try { return !!(s && (typeof s.teachState === 'function' ? s.teachState() : s.teach)); } catch (_) { return false; } }
function lbvRenderTitle(s){
  const el=lbvEl('lightboxTitle'); if(!el) return;
  el.textContent=(s && s.title)||'';
  if(lbvTeachOn(s)){ const b=document.createElement('span'); b.className='lb-teach-tag'; b.innerHTML='<i class="ti ti-school"></i>教歌'; el.appendChild(b); }
}
// 专属搜索 / 诗歌本里的歌（不在库里）：歌词从诗歌本接口现取（item.lyricsLoader，见 hymnmusic.js）
function lbvRenderExtLyrics(s){
  lbvEl('lightboxLyricsTitle').textContent=(s.title||'')+' · 歌词';
  const body=lbvEl('lightboxLyricsBody');
  const show=(txt,empty)=>{ body.classList.toggle('empty',!!empty); body.textContent=txt; };
  body.scrollTop=0;
  if(s._lyrics!=null){ const t=String(s._lyrics).trim(); show(t||'接口里没有这首歌的歌词', !t); return; }
  show('正在获取歌词…', true);
  Promise.resolve().then(()=>s.lyricsLoader()).then(t=>{
    s._lyrics=String(t||'');
    if(lightboxSongs[lightboxIndex]===s && lbv.lyrics) lbvRenderExtLyrics(s);
  }, ()=>{
    if(lightboxSongs[lightboxIndex]===s && lbv.lyrics) show('歌词获取失败，请稍后再点一次「歌词」重试', true);
  });
}
function lbvRenderExtras(s){
  const e=lbvEntry(s);
  const ext=(!e && s && s.noLib && typeof s.lyricsLoader==='function') ? s : null;
  const btn=lbvEl('lightboxLyricsBtn');
  btn.style.display=(e||ext)?'':'none';
  lbvEl('lightboxRenameBtn').style.display=(e && isAdmin)?'':'none';
  const open=!!((e||ext) && lbv.lyrics);
  btn.classList.toggle('on', open);
  lbvEl('lightbox').classList.toggle('lyrics-open', open);
  const keys=e?e.keys.filter(k=>k && k.src):[];
  const kb=lbvEl('lightboxKeys');
  if(keys.length>1 || (isAdmin && keys.length===1)){
    const ai=keys.findIndex(k=>k.src===s.src);
    kb.innerHTML=keys.map((k,i)=>`<button type="button" class="${i===ai?'on':''}" onclick="lightboxPickKey(${i})">${escapeHtml(k.label?k.label:'默认')}</button>`).join('') +
      (isAdmin ? `<button type="button" class="lb-keyedit" onclick="lightboxRenameKey()" title="修改当前这个调的名称（管理员）"><i class="ti ti-pencil"></i> 改调名</button>` : '');
    kb.style.display='flex';
  } else { kb.style.display='none'; kb.innerHTML=''; }
  if(open && ext){ lbvRenderExtLyrics(ext); }
  else if(open){
    lbvEl('lightboxLyricsTitle').textContent=e.title+' · 歌词';
    const body=lbvEl('lightboxLyricsBody'), txt=(e.lyrics||'').trim();
    body.classList.toggle('empty', !txt);
    body.textContent=txt || '这首诗歌还没有录入歌词，可在诗歌库详情页添加';
    body.scrollTop=0;
  }
}
// 管理员在看图模式里直接改歌名 / 调名：改完标题、调按钮立刻更新，图片和缩放位置不动
async function lightboxRenameSong(){
  const s=lightboxSongs[lightboxIndex], e=lbvEntry(s);
  if(!e) return;
  const mine=lightboxSongs.filter(x=>lbvEntry(x)===e);   // 先认出同一首歌的各页（改名后再按歌名找就找不到了）
  await renameSongLibSong(e, { onRenamed:(old,nt)=>{
    mine.forEach(x=>{ if(String(x.title||'').startsWith(old)) x.title=nt+String(x.title).slice(old.length); });
    const cur=lightboxSongs[lightboxIndex]; if(cur) lbvRenderTitle(cur);
    if(cur) lbvRenderExtras(cur);
  }});
}
async function lightboxRenameKey(){
  const s=lightboxSongs[lightboxIndex], e=lbvEntry(s);
  if(!e) return;
  const k=e.keys.find(x=>x && x.src===s.src);
  if(!k){ showToast('找不到这个调'); return; }
  const mine=lightboxSongs.filter(x=>lbvEntry(x)===e && x.src===k.src);
  await renameSongLibKey(k.id, e, { onRenamed:(oldLab,nl)=>{
    mine.forEach(x=>{
      const suf=oldLab?'（'+oldLab+'）':'';
      if(suf && String(x.title||'').endsWith(suf)) x.title=String(x.title).slice(0,-suf.length)+(nl?'（'+nl+'）':'');
    });
    const cur=lightboxSongs[lightboxIndex]; if(cur){ lbvRenderTitle(cur); lbvRenderExtras(cur); }
  }});
}
function lightboxToggleLyrics(){
  const s=lightboxSongs[lightboxIndex]; if(!s || !(lbvEntry(s) || (s.noLib && typeof s.lyricsLoader==='function'))) return;
  lbv.lyrics=!lbv.lyrics;
  lightboxResetView();
  lbvRenderExtras(s);
}
function lightboxPickKey(i){
  const s=lightboxSongs[lightboxIndex], e=lbvEntry(s); if(!e) return;
  const keys=e.keys.filter(k=>k && k.src), k=keys[i]; if(!k) return;
  s.src=k.src; s.title=`${e.title}${k.label?'（'+k.label+'）':''}`;
  showLightboxImage();
}
function lightboxStepKey(d){
  const s=lightboxSongs[lightboxIndex], e=lbvEntry(s); if(!e) return;
  const keys=e.keys.filter(k=>k && k.src); if(keys.length<2) return;
  const cur=Math.max(0, keys.findIndex(k=>k.src===s.src));
  lightboxPickKey((cur+d+keys.length)%keys.length);
}
function stepLightbox(delta){
  const newIdx=lightboxIndex+delta;
  if(newIdx<0||newIdx>=lightboxSongs.length) return false;
  lightboxIndex=newIdx;
  showLightboxImage();
  return true;
}
function onLightboxKeydown(e){
  if(!lbv.open) return;
  if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k=e.key;
  if(k==='Escape'){ if(mk.on) mkExit(); else closeLightbox(); }
  else if(mk.on && (k==='z'||k==='Z') && (e.ctrlKey||e.metaKey)){ e.preventDefault(); mkUndo(); }
  else if(k==='ArrowLeft') stepLightbox(-1);
  else if(k==='ArrowRight') stepLightbox(1);
  else if(k==='+'||k==='=') lightboxZoomCenter(1.4);
  else if(k==='-') lightboxZoomCenter(1/1.4);
  else if(k==='0') lightboxResetView();
  else if(k==='l'||k==='L') lightboxToggleLyrics();
  else if(k==='ArrowUp'){ e.preventDefault(); lightboxStepKey(-1); }
  else if(k==='ArrowDown'){ e.preventDefault(); lightboxStepKey(1); }
}
function closeLightbox(){
  mkFlush(); mk.on=false; mk.song=null; mk.cur=null; mk.holding=null; mk.strokes=[]; mk.redo=[]; mkHideTextBox(); mkSyncUI();
  lbv.open=false; lbv.gen++; lbv.lyrics=false;
  lbvEl('lightbox').classList.remove('lyrics-open');
  lbvEl('lightbox').classList.remove('open');
  document.removeEventListener('keydown', onLightboxKeydown);
  document.body.style.overflow=lbv.bodyOverflow||'';
  const img=lbvEl('lightboxImg'); img.removeAttribute('src');
  lbv.pts.clear(); lbv.drag=null; lbv.swiping=false;
}
function openLightboxOriginal(){
  const s=lightboxSongs[lightboxIndex];
  if(s && s.src) window.open(s.src,'_blank','noopener');
}
function lightboxBind(){
  if(lbv.bound) return; lbv.bound=true;
  const st=lbvEl('lightboxStage'), img=lbvEl('lightboxImg'), msg=lbvEl('lightboxMsg');
  st.addEventListener('wheel', e=>{ e.preventDefault(); lightboxZoomAt(e.deltaY<0?1.2:1/1.2, e.clientX, e.clientY); }, {passive:false});
  st.addEventListener('pointerdown', e=>{
    if(e.target.closest('.lightbox-nav,.lb-textbox')) return;
    try{ st.setPointerCapture(e.pointerId); }catch (_) { slDiag(_, 'lightboxBind'); }
    lbv.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    lbv.moved=false;
    if(mk.on){
      if(lbv.pts.size===1){ if(mkBegin(e)){ mk.holding=e.pointerId; return; } }
      else mkCancel();
    }
    if(lbv.pts.size===2){
      const [a,b]=[...lbv.pts.values()];
      lbv.pinchD=Math.hypot(a.x-b.x,a.y-b.y); lbv.pinchS=lbv.scale; lbv.drag=null; lbv.pinchMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(lbv.swiping){ lbv.swiping=false; if(lbv.scale===1){ lbv.x=0; lightboxApplyTransform(); } }
    } else lbv.drag={sx:e.clientX,sy:e.clientY,ox:lbv.x,oy:lbv.y};
  });
  st.addEventListener('pointermove', e=>{
    if(!lbv.pts.has(e.pointerId)) return;
    lbv.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(mk.holding===e.pointerId){ mkMove(e); return; }
    if(lbv.pts.size===2 && lbv.pinchD){
      const [a,b]=[...lbv.pts.values()];
      const d=Math.hypot(a.x-b.x,a.y-b.y);
      const target=lbvClamp(lbv.pinchS*d/lbv.pinchD,1,8);
      lightboxZoomAt(target/lbv.scale,(a.x+b.x)/2,(a.y+b.y)/2); lbv.moved=true;
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(lbv.pinchMid && lbv.scale>1){ lbv.x+=mid.x-lbv.pinchMid.x; lbv.y+=mid.y-lbv.pinchMid.y; lightboxApplyTransform(); }
      lbv.pinchMid=mid;
    } else if(lbv.drag){
      const dx=e.clientX-lbv.drag.sx, dy=e.clientY-lbv.drag.sy;
      if(Math.abs(dx)+Math.abs(dy)>4) lbv.moved=true;
      if(lbv.scale>1){ lbv.x=lbv.drag.ox+dx; lbv.y=lbv.drag.oy+dy; lightboxApplyTransform(); st.classList.add('grabbing'); }
      else if(!mk.on && (lbv.swiping || Math.abs(dx)>Math.abs(dy))){ lbv.swiping=true; lbv.x=dx*0.9; lightboxApplyTransform(); }
    }
  });
  const end=e=>{
    if(!lbv.pts.has(e.pointerId)) return;
    if(mk.holding===e.pointerId){ mkEnd(e); lbv.pts.delete(e.pointerId); lbv.drag=null; return; }
    const wasSingle=lbv.pts.size===1;
    lbv.pts.delete(e.pointerId); lbv.drag=null; lbv.pinchD=0; st.classList.remove('grabbing');
    if(wasSingle && lbv.swiping){
      lbv.swiping=false;
      const dx=lbv.x, need=Math.min(80, st.clientWidth*0.2);
      if(e.type==='pointerup' && Math.abs(dx)>need && stepLightbox(dx<0?1:-1)) return;
      img.style.transition='transform .18s ease'; lbv.x=0; lightboxApplyTransform();
      setTimeout(()=>{ img.style.transition=''; }, 200);
      return;
    }
    if(lbv.pts.size===1){ const [p]=[...lbv.pts.values()]; lbv.drag={sx:p.x,sy:p.y,ox:lbv.x,oy:lbv.y}; }
    if(wasSingle && !lbv.moved && e.type==='pointerup'){
      if(/失败|重试/.test(msg.textContent)){ showLightboxImage(true); return; }
      const now=Date.now();
      if(now-lbv.lastTap<300){ lbv.lastTap=0; if(lbv.scale>1) lightboxResetView(); else lightboxZoomAt(2.5,e.clientX,e.clientY); }
      else lbv.lastTap=now;
    }
  };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
  if(window.ResizeObserver) new ResizeObserver(()=>mkLayout()).observe(st);
  window.addEventListener('resize', ()=>mkLayout());
  const tb=lbvEl('lbTextBox');
  tb.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); mkCommitText(); } else if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); mkHideTextBox(); } });
  tb.addEventListener('blur', ()=>{ setTimeout(mkCommitText, 60); });
  lbvEl('lightboxPrev').addEventListener('click', e=>{ e.stopPropagation(); stepLightbox(-1); });
  lbvEl('lightboxNext').addEventListener('click', e=>{ e.stopPropagation(); stepLightbox(1); });
}

async function downloadLightboxImage(){
  const s=lightboxSongs[lightboxIndex];
  if(!s || !s.src) return;
  if(mk.song===s && mk.strokes.length && (mk.show||mk.on)){ if(await mkDownloadMarked(s)) return; }
  await downloadImageFile(s.src, s.title);
}

async function downloadImageFile(src, title){
  const safeName=(title||'诗歌图片').replace(/[\\/:*?"<>|]/g,'_');
  try{
    if(src.startsWith('data:')){
      // 本地 base64 图片：直接触发下载
      const a=document.createElement('a');
      a.href=src;
      a.download=safeName;
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    // 远程图片：fetch 成 blob 后下载，避免点击直接跳转到图片新标签页
    const resp=await fetch(src, {mode:'cors'});
    if(!resp.ok) throw new Error('fetch failed');
    const blob=await resp.blob();
    const ext=(blob.type && blob.type.split('/')[1]) ? '.'+blob.type.split('/')[1].replace('jpeg','jpg') : '';
    const blobUrl=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=blobUrl;
    a.download=safeName.match(/\.[a-zA-Z0-9]+$/)?safeName:(safeName+ext);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobUrl), 4000);
  }catch(err){
    // 跨域等原因 fetch 失败时，退而求其次在新标签页打开，用户可手动长按/右键保存
    console.error('下载图片失败，改为新标签页打开', err);
    window.open(src, '_blank');
    showToast('该图片暂不支持直接下载，已为您在新标签页打开，请长按或右键保存');
  }
}


let songLibSearchKeyword = '';

let songLibCategoryFilter = '';

let songLibSongbookFilter = '';

let songLibTab = 'all'; // 'all'（首页）| 'favorite' | 'playlist'（我的歌单）| 'recent' | 'books'（诗歌本）
// 排序：created = 收录时间；pinyin = 拼音首字母；used = 最近使用时间（取自每周排班）
let songLibSortKey = 'created', songLibSortReverse = false;
try {
  const o = JSON.parse(localStorage.getItem('songLibSort') || '{}');
  if (o && ['created', 'pinyin', 'used', 'count'].includes(o.key)) { songLibSortKey = o.key; songLibSortReverse = !!o.rev; }
  if (o && o.scope === 'all') songLibCountScope = 'all';
} catch (e) { slDiag(e, 'downloadImageFile'); }

function openSongLibrary(){
  document.getElementById('songLibSearchInput').value = '';
  songLibSearchKeyword = '';
  songLibCategoryFilter = '';
  songLibSongbookFilter = ''; songLibTagFilter = []; songLibUsageFilter = '';
  songLibTab = 'all';
  songLibSearchOpen = false;
  songLibSearchMode = 'lib';
  songLibScope = 'all';
  slScopeSync();
  document.getElementById('songLibraryOverlay').classList.remove('ds-mode');
  songLibPlaceViewSwitch();
  document.querySelectorAll('#songLibDsSwitch button').forEach(b => b.classList.toggle('active', b.dataset.mode === 'lib'));
  document.getElementById('songLibSearchWrap')?.classList.remove('open');
  document.getElementById('songLibSearchToggleBtn')?.classList.remove('active');
  document.getElementById('songLibSearchClear').classList.remove('visible');
  renderSongLibTabs();
  renderSongLibFilterBar();
  updateSongLibViewSwitch();
  updateSongLibSearchUI();
  songLibBeginSkeleton();                 // 刚进界面先显示骨架，稍后换成真实内容
  updateSongLibImportHint();
  if (!songLibResizeBound) { songLibResizeBound = true; window.addEventListener('resize', songLibOnResize); }
  document.getElementById('songLibraryOverlay').classList.add('open');
}

function renderSongLibTabs(){
  const wrap = document.getElementById('songLibTabs');
  if (!wrap) return;
  // 电脑 / 平板：顶部标签（5 个）；手机（≤640px）：底部导航，只显示 4 个，「最近使用」藏起来，从首页工具栏的「最近」进入
  const tabs = [
    { id: 'all', label: '首页', icon: 'ti-home-2' },
    { id: 'recent', label: '最近使用', icon: 'ti-history', navHide: true },
    { id: 'books', label: '诗歌本', icon: 'ti-books' },
    { id: 'playlist', label: '我的歌单', icon: 'ti-playlist' },   // 本周选好的歌会自动进来
    { id: 'favorite', label: '我的收藏', icon: 'ti-heart' },       // 放在最右边
  ];
  wrap.setAttribute('role', 'tablist');
  const clsOf = t => 'song-lib-tab' + (songLibTab === t.id ? ' active' : '') + (t.navHide ? ' nav-hide' : '') + (t.id === 'all' && songLibTab === 'recent' ? ' sub-active' : '');
  // 按钮已经存在就只改样式，不重建：重建会让正被按住的按钮瞬间消失再出现，看起来像抖了一下
  if (wrap.children.length === tabs.length) {
    tabs.forEach((t, i) => {
      const b = wrap.children[i];
      b.className = clsOf(t);
      b.setAttribute('aria-selected', String(songLibTab === t.id));
    });
    return;
  }
  wrap.innerHTML = tabs.map(t =>
    `<button class="${clsOf(t)}" role="tab" aria-selected="${songLibTab === t.id}" onclick="setSongLibTab('${t.id}')"><i class="ti ${t.icon} sl-tab-ico"></i><span class="sl-tab-txt">${t.label}</span></button>`
  ).join('');
}

function setSongLibTab(tab){
  // 点的就是当前标签：不重画列表（重画会清空再重建，滚动位置会跳），只平滑回到顶部
  if (tab === songLibTab && tab !== 'books' && songLibSearchMode === 'lib') {   // 诗歌本除外：再点一次它要从歌本详情回到列表
    document.querySelector('.song-lib-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  songLibTab = tab;
  {  // 换标签时内容一帧内整块出现 / 消失（搜索框、本周卡片、列表），加一个很短的淡入，肉眼就不会觉得是「跳」或「抖」
    const m = document.querySelector('.song-lib-main');
    if (m) { m.classList.remove('sl-swap'); void m.offsetWidth; m.classList.add('sl-swap'); setTimeout(() => m.classList.remove('sl-swap'), 220); }
  }
  document.querySelector('.song-lib-main')?.scrollTo({ top: 0 });   // 换标签先回顶部，免得新内容比旧的短时滚动位置被硬拽
  songLibCancelSkeleton();
  // 搜索只在「首页」常驻；切到其他标签时收起搜索并清掉关键词，要用再点右上角放大镜
  if (tab !== 'all') {
    songLibSearchOpen = false;
    songLibSearchKeyword = '';
    const inp = document.getElementById('songLibSearchInput');
    if (inp) { inp.value = ''; inp.blur(); }
    document.getElementById('songLibSearchClear')?.classList.remove('visible');
  }
  renderSongLibTabs();
  updateSongLibSearchUI();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  if (tab === 'books') songLibBooksEnter();
}
// 首页：搜索框常驻；其他标签：隐藏搜索框，右上角出现放大镜，点开才显示
function updateSongLibSearchUI(){
  const page = document.getElementById('songLibraryOverlay');
  if (!page) return;
  const home = songLibTab === 'all';
  page.classList.toggle('tab-home', home);
  page.classList.toggle('search-open', !home && songLibSearchOpen);
  document.getElementById('songLibSearchToggleBtn')?.classList.toggle('active', !home && songLibSearchOpen);
}
// ── 骨架加载：刚进诗歌库时先显示占位卡片 ──
let songLibSkelOn = false, songLibSkelMinDone = false, songLibSkelWait = false, songLibSkelT1 = 0, songLibSkelT2 = 0;
function songLibSkeletonHtml(host){
  const bar = (cls) => `<div class="skel-block ${cls}"></div>`;
  if (songLibViewMode === 'list') {
    return Array.from({ length: 8 }, () => `<div class="song-lib-skel-row">${bar('skel-thumb')}<div class="skel-lines">${bar('skel-line w70')}${bar('skel-line w45 short')}</div></div>`).join('');
  }
  const ratios = [1.35, 1.0, 1.6, 1.2, 1.45, 0.95, 1.3, 1.1];   // 高/宽，错落一点像瀑布流
  const n = songLibWfCols(host);
  let cols = '';
  for (let c = 0; c < n; c++) {
    let cards = '';
    for (let k = 0; k < 3; k++) {
      const r = ratios[(c * 3 + k * 2 + c) % ratios.length];
      cards += `<div class="song-lib-skel-card"><div class="skel-block skel-thumb" style="aspect-ratio:1/${r}"></div><div class="skel-info">${bar('skel-line w70')}${bar('skel-line w45 short')}</div></div>`;
    }
    cols += `<div class="song-lib-wcol">${cards}</div>`;
  }
  return `<div class="song-lib-wf song-lib-skel-wf">${cols}</div>`;
}
function songLibRenderSkeleton(){
  const grid = document.getElementById('songLibGrid');
  const countEl = document.getElementById('songLibCount');
  if (!grid) return;
  grid.className = 'song-lib-grid ' + (songLibViewMode === 'list' ? 'view-list' : 'view-wf');
  grid.innerHTML = songLibSkeletonHtml(grid);
  if (countEl) countEl.innerHTML = '<span class="skel-block skel-count"></span>';
  songLibRenderWeekCard();
}
// minMs：骨架至少显示多久；独立页面首次打开且本机没有缓存时，会一直等到云端数据回来（最多 6 秒）
function songLibBeginSkeleton(minMs){
  clearTimeout(songLibSkelT1); clearTimeout(songLibSkelT2);
  songLibSkelOn = true; songLibSkelMinDone = false;
  songLibRenderSkeleton();
  songLibSkelT1 = setTimeout(() => { songLibSkelMinDone = true; songLibTryEndSkeleton(); }, minMs || 450);
  if (songLibSkelWait) songLibSkelT2 = setTimeout(songLibReleaseSkeleton, 6000);
}
function songLibTryEndSkeleton(){
  if (!songLibSkelOn || !songLibSkelMinDone || songLibSkelWait) return;
  songLibSkelOn = false;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}
function songLibReleaseSkeleton(){ songLibSkelWait = false; clearTimeout(songLibSkelT2); songLibTryEndSkeleton(); }
function songLibCancelSkeleton(){ songLibSkelOn = false; songLibSkelWait = false; clearTimeout(songLibSkelT1); clearTimeout(songLibSkelT2); }

function getUnimportedHistoricalSongs(){
  const byTitle = new Map();
  Object.keys(songData).forEach(key => {
    (songData[key] || []).forEach(s => {
      const title = (s?.title || '').trim();
      if (!title) return;
      const existing = byTitle.get(title);
      if (!existing || (!existing.src && s.src)) byTitle.set(title, { title, src: s.src || '' });
    });
  });
  const libTitles = new Set(songLibrary.map(s => s.title));
  return Array.from(byTitle.values()).filter(s => !libTitles.has(s.title));
}

function updateSongLibImportHint(){
  try { updateSongLibDupHint(); } catch (e) { slDiag(e, 'updateSongLibImportHint'); }
  const hint = document.getElementById('songLibImportHint');
  if (!hint) return;
  if (!isAdmin) { hint.classList.remove('show'); return; }
  const pending = getUnimportedHistoricalSongs();
  document.getElementById('songLibImportCount').textContent = pending.length;
  hint.classList.toggle('show', pending.length > 0);
}

async function importHistoricalSongs(){
  const hint = document.getElementById('songLibImportHint');
  const pending = getUnimportedHistoricalSongs();
  if (!pending.length) return;
  hint.classList.add('importing');
  pending.forEach(s => ensureSongInLibrary(s.title, s.src));
  persistSongLibrary();
  updateSongLibImportHint();
  renderSongLibraryGrid();
  hint.classList.remove('importing');
  showToast(`✅ 已导入 ${pending.length} 首历史诗歌到歌单库`);
  await syncSongLibraryToRemote('☁️ 歌单库已同步到云端');
}

async function triggerFileDownload(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return true;
  } catch (e) {
    console.error('下载失败，改为新窗口打开', e);
    window.open(url, '_blank');
    return false;
  }
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

function sanitizeFileName(str) {
  return String(str || '').replace(/[\/\\:*?"<>|]/g, '_').trim() || '未命名';
}

let songLibAddPendingSrc = '';

function openSongLibAdd(){
  document.getElementById('songLibAddName').value = '';
  document.getElementById('songLibAddCategory').value = '';
  document.getElementById('songLibAddBand').value = '';
  document.getElementById('songLibAddSongbook').value = '';
  document.getElementById('songLibAddKeyLabel').value = '';
  document.getElementById('songLibAddUrl').value = '';
  document.getElementById('songLibAddLyrics').value = '';
  songLibTagSel.add = []; renderSongLibTagPicker('add');
  document.getElementById('songLibAddFileInput').value = '';
  songLibAddPendingSrc = '';
  document.getElementById('songLibAddPreview').classList.remove('show');
  document.getElementById('songLibAddDupHint').classList.remove('show');
  document.getElementById('songLibAddError').classList.remove('show');
  document.getElementById('songLibAddSubmitBtn').disabled = false;
  document.getElementById('songLibAddSubmitBtn').textContent = isAdmin ? '上传' : '提交审核';
  const addSub = document.getElementById('songLibAddSub');
  if (addSub) addSub.textContent = isAdmin ? '管理员上传，提交后立即生效' : '提交后需管理员审核，通过后才会收进诗歌库';
  const fillDatalist = (id, values) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = values.map(c => `<option value="${escapeHtml(c)}">`).join('');
  };
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  fillDatalist('songLibBandDatalist', getSongLibBands());
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  document.getElementById('songLibAddOverlay').classList.add('open');
}

function closeSongLibAdd(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibAddOverlay').classList.remove('open');
}

function onSongLibAddNameInput(){
  const name = document.getElementById('songLibAddName').value;
  const dup = findDuplicateSongInLibrary(name);
  document.getElementById('songLibAddDupHint').classList.toggle('show', !!dup);
  document.getElementById('songLibAddError').classList.remove('show');
}

function handleSongLibAddFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    songLibAddPendingSrc = ev.target.result;
    const preview = document.getElementById('songLibAddPreview');
    preview.innerHTML = `<img src="${songLibAddPendingSrc}" alt="封面预览"><span>${escapeHtml(file.name)}</span><button onclick="clearSongLibAddPreview()"><i class="ti ti-x"></i></button>`;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
}

function clearSongLibAddPreview(){
  songLibAddPendingSrc = '';
  document.getElementById('songLibAddFileInput').value = '';
  document.getElementById('songLibAddPreview').classList.remove('show');
  document.getElementById('songLibAddPreview').innerHTML = '';
}

async function submitSongLibAdd(){
  const name = document.getElementById('songLibAddName').value.trim();
  const errEl = document.getElementById('songLibAddError');
  if (!name) {
    errEl.textContent = '请输入诗歌名称';
    errEl.classList.add('show');
    return;
  }
  const dup = findDuplicateSongInLibrary(name);
  if (dup) {
    errEl.textContent = `歌单库中已经有《${dup.title}》了，无法重复上传`;
    errEl.classList.add('show');
    document.getElementById('songLibAddDupHint').classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const category = document.getElementById('songLibAddCategory').value.trim();
  const band = document.getElementById('songLibAddBand').value.trim();
  const songbook = document.getElementById('songLibAddSongbook').value.trim();
  const keyLabel = document.getElementById('songLibAddKeyLabel').value.trim();
  const lyrics = document.getElementById('songLibAddLyrics').value.trim();
  const urlInput = document.getElementById('songLibAddUrl').value.trim();
  const src = songLibAddPendingSrc || urlInput || '';
  const submitBtn = document.getElementById('songLibAddSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = isAdmin ? '上传中…' : '提交中…';
  try {
    if (!isAdmin) {   // 非管理员：先交给管理员审核，通过后才收进诗歌库（见 review.js）
      if (!window.SU) { showToast('审核功能没加载出来，请刷新页面后重试'); return; }
      const sent = await SU.submit({ title: name, category, band, songbook, keyLabel, lyrics, tags: normalizeSongLibTagList(songLibTagSel.add), src });
      if (sent) closeSongLibAdd();
      return;
    }
    let finalSrc = src;
    // 本地图片优先上传到 Storage 换取真实链接，避免歌单库长期存着巨大的 base64
    if (finalSrc.startsWith('data:') && typeof uploadSongDataUrl === 'function' && initSupabaseClient()) {
      try {
        finalSrc = await uploadSongDataUrl('song-library', finalSrc, Date.now());
      } catch (e) {
        console.error('图片上传到 Storage 失败，保留本地图片', e);
        // 失败时不阻断流程，退回本地 base64，至少在本机可用
      }
    }
    const entry = ensureSongInLibrary(name, '');
    entry.category = category;
    entry.band = band;
    entry.songbook = songbook;
    entry.tags = normalizeSongLibTagList(songLibTagSel.add);
    entry.lyrics = lyrics;
    if (finalSrc) entry.keys.push({ id: genSongLibId(), label: keyLabel, src: finalSrc });
    persistSongLibrary();
    closeSongLibAdd();
    renderSongLibFilterBar();
    renderSongLibraryGrid();
    updateSongLibImportHint();
    showToast(`✅ 《${entry.title}》已上传到歌单库`);
    await syncSongLibraryToRemote();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isAdmin ? '上传' : '提交审核';
  }
}

function closeSongLibrary(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibraryOverlay').classList.remove('open');
}

let songLibSearchOpen = false;
// 搜索框常驻显示；点「搜索」：专属搜索发请求，诗歌库内搜索则立即应用并收起键盘
function onSongLibSearchGo(){
  songLibRecordSearch(document.getElementById('songLibSearchInput').value);
  if (songLibSearchMode === 'ds') { songLibDsSearch(); return; }
  onSongLibrarySearch();
  document.getElementById('songLibSearchInput')?.blur();
  songLibAutoDsIfEmpty();
}
// 诗歌库里搜不到时，直接帮忙用专属搜索去诗歌本 / 赞美网找（只在按回车 / 点「搜索」时触发，边打字不会乱跳）
function songLibAutoDsIfEmpty(){
  if (songLibSearchMode !== 'lib' || songLibTab !== 'all' || !songLibSearchKeyword) return;
  if (songLibCategoryFilter || songLibSongbookFilter || songLibTagFilter.length || songLibUsageFilter) return;   // 有筛选条件时空结果不代表库里没有
  if (songLibScope !== 'all') return;   // 只搜歌词 / 标签时空结果不代表库里没有这首歌
  if (getFilteredSongLibrary().length) return;
  showToast(`诗歌库里没有「${songLibSearchKeyword}」，已自动用专属搜索查找`, 3000);
  songLibDsRows = [];   // 清掉上一次的结果，切过去就会按当前关键词重新搜
  setSongLibSearchMode('ds');
  setTimeout(() => document.getElementById('songLibSearchInput')?.blur(), 120);   // 不弹键盘，直接看结果
}
function toggleSongLibSearch(){
  const input = document.getElementById('songLibSearchInput');
  if (songLibTab === 'all') { input?.focus(); return; }
  songLibSearchOpen = !songLibSearchOpen;
  if (!songLibSearchOpen) {            // 再点一次放大镜：收起并清掉关键词
    if (input) input.value = '';
    songLibSearchKeyword = '';
    document.getElementById('songLibSearchClear')?.classList.remove('visible');
    updateSongLibSearchUI();
    renderSongLibraryGrid();
    return;
  }
  updateSongLibSearchUI();
  setTimeout(() => input?.focus(), 60);
}

function onSongLibrarySearch(){
  const kw = document.getElementById('songLibSearchInput').value.trim();
  document.getElementById('songLibSearchClear').classList.toggle('visible', kw.length > 0);
  try { songLibSuggUpdate(kw); } catch (e) { slDiag(e, 'songLibSuggUpdate'); }
  if (songLibSearchMode === 'ds') return;   // 专属搜索要按回车 / 点「搜索」才发请求
  songLibSearchKeyword = kw;
  renderSongLibraryGrid();
}

function clearSongLibrarySearch(){
  document.getElementById('songLibSearchInput').value = '';
  songLibSearchKeyword = '';
  document.getElementById('songLibSearchClear').classList.remove('visible');
  if (songLibSearchMode === 'ds') { songLibDsGen++; songLibDsRows = []; document.getElementById('songLibDsList').innerHTML = ''; document.getElementById('songLibDsMore').hidden = true; songLibDsStatus('输入歌名后按回车或点「搜索」，在诗歌本、赞美网里找歌谱。'); }
  else renderSongLibraryGrid();
  document.getElementById('songLibSearchInput').focus();
}

function renderSongLibFilterBar(){
  if (!isAdmin && songLibUsageFilter) songLibUsageFilter = '';   // 退出登录后别留着看不见的筛选条件
  renderSongLibSortBar();
  const wp = document.getElementById('songLibWeekPrefBar');
  if (wp) wp.innerHTML = [['show', 'ti-eye', '显示'], ['hide', 'ti-eye-off', '隐藏']].map(([v, ic, t]) =>
    `<button class="song-lib-filter-chip${songLibWeekCardPref === v ? ' active' : ''}" onclick="setSongLibWeekCardPref('${v}')"><i class="ti ${ic}"></i>${t}</button>`).join('');
  renderSongLibTagBar();
  renderSongLibUsageBar();
  const options = getSongLibSongbookChipOptions();
  const countOf = sb => sb ? songLibrary.filter(s => s.songbook === sb).length : songLibrary.length;
  const chips = [{ label: '全部', value: '' }, ...options.map(sb => ({ label: sb, value: sb }))];
  const bar = document.getElementById('songLibFilterBar');
  if (bar) {
    bar.innerHTML = chips.map(c => {
      const safeVal = escapeHtml(c.value).replace(/'/g,"\\'");
      const editBtn = (isAdmin && c.value) ? `<span class="song-lib-filter-chip-ico" onclick="event.stopPropagation();renameSongLibSongbook('${safeVal}')" title="重命名诗歌本"><i class="ti ti-pencil"></i></span>` : '';
      const delBtn = (isAdmin && c.value) ? `<span class="song-lib-filter-chip-ico" onclick="event.stopPropagation();deleteSongLibSongbook('${safeVal}')" title="删除诗歌本"><i class="ti ti-x"></i></span>` : '';
      return `<button class="song-lib-filter-chip${songLibSongbookFilter === c.value ? ' active' : ''}" onclick="setSongLibSongbookFilter('${safeVal}')">${escapeHtml(c.label)}<small>${countOf(c.value)}</small>${editBtn}${delBtn}</button>`;
    }).join('') + (isAdmin ? `<button class="song-lib-filter-chip add" onclick="addSongLibSongbookPrompt()"><i class="ti ti-plus"></i>诗歌本</button>` : '');
  }
  const btn = document.getElementById('songLibFilterBtn');
  if (btn) {
    const sortActive = songLibSortKey !== 'created' || songLibSortReverse;
    const sortLabel = (SONGLIB_SORTS.find(x => x.id === songLibSortKey) || SONGLIB_SORTS[0]).label;
    const tagLabel = songLibTagFilter.length === 1 ? songLibTagFilter[0] : (songLibTagFilter.length ? songLibTagFilter.length + '个标签' : '');
    btn.classList.toggle('active', !!songLibSongbookFilter || !!songLibTagFilter.length || !!songLibUsageFilter || sortActive);
    document.getElementById('songLibFilterBtnLabel').textContent = songLibSongbookFilter || tagLabel || (songLibUsageFilter ? (songLibUsageFilter === 'stale' ? '久未使用' : '从未使用') : '') || (sortActive ? sortLabel : '筛选');
  }
}
// ── 排序：收录时间 / 拼音首字母 / 最近使用时间 ──
const SONGLIB_SORTS = [
  { id: 'created', label: '收录时间',   icon: 'ti-calendar-plus',          dir: ['新 → 旧', '旧 → 新'] },
  { id: 'pinyin',  label: '拼音首字母', icon: 'ti-sort-ascending-letters', dir: ['A → Z', 'Z → A'] },
  { id: 'used',    label: '最近使用',   icon: 'ti-history',                dir: ['近 → 远', '远 → 近'] },
  { id: 'count',   label: '使用次数',   icon: 'ti-trophy',                 dir: ['多 → 少', '少 → 多'] },
];
function renderSongLibSortBar(){
  const bar = document.getElementById('songLibSortBar');
  const box = document.getElementById('songLibSortBox');
  if (box) box.style.display = songLibTab === 'recent' ? 'none' : '';   // 「最近使用」本来就按周分组，不需要排序
  if (!bar) return;
  bar.innerHTML = SONGLIB_SORTS.map(o =>
    `<button class="song-lib-filter-chip${songLibSortKey === o.id ? ' active' : ''}" onclick="setSongLibSort('${o.id}')"><i class="ti ${o.icon}"></i>${o.label}</button>`
  ).join('');
  const cur = SONGLIB_SORTS.find(o => o.id === songLibSortKey) || SONGLIB_SORTS[0];
  const lbl = document.getElementById('songLibSortDirLabel');
  if (lbl) lbl.textContent = cur.dir[songLibSortReverse ? 1 : 0];
  const sc = document.getElementById('songLibScopeBar');
  if (sc) {
    const on = songLibSortKey === 'count';
    sc.style.display = on ? '' : 'none';
    sc.innerHTML = on
      ? `<span class="song-lib-scope-lbl">统计范围</span>` + [['year', new Date().getFullYear() + ' 年'], ['all', '全部历史']].map(([v, t]) =>
          `<button class="song-lib-filter-chip${songLibCountScope === v ? ' active' : ''}" onclick="setSongLibCountScope('${v}')">${t}</button>`).join('')
      : '';
  }
}
function persistSongLibSort(){
  try { localStorage.setItem('songLibSort', JSON.stringify({ key: songLibSortKey, rev: songLibSortReverse, scope: songLibCountScope })); } catch (e) { slDiag(e, 'persistSongLibSort'); }
}
function setSongLibSort(id){
  if (songLibSortKey !== id) { songLibSortKey = id; songLibSortReverse = false; }
  persistSongLibSort();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}
function toggleSongLibSortDir(){
  songLibSortReverse = !songLibSortReverse;
  persistSongLibSort();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}
// ── 使用次数 / 最近使用日期：统计每首歌在每周排班里的使用情况（不含还没到的下周）──
let songLibWeekCardPref = 'show';   // 本周卡片：'show' 显示 | 'hide' 隐藏（搜索 / 筛选时无论如何都隐藏）
try { if (localStorage.getItem('songLibWeekCard') === 'hide') songLibWeekCardPref = 'hide'; } catch (e) { slDiag(e, 'toggleSongLibSortDir'); }
let songLibWeekLayout = 'grid';   // 本周卡片样式：'grid' 2×2 序号（默认）| 'thumb' 缩略图
try { if (localStorage.getItem('songLibWeekLayout') === 'thumb') songLibWeekLayout = 'thumb'; } catch (e) { slDiag(e, 'songLibWeekLayout.load'); }
function setSongLibWeekLayout(v){
  songLibWeekLayout = v === 'grid' ? 'grid' : 'thumb';
  try { localStorage.setItem('songLibWeekLayout', songLibWeekLayout); } catch (e) { slDiag(e, 'setSongLibWeekLayout'); }
  songLibRenderWeekCard();
}
let songLibCountScope = 'year';   // 'year' = 今年 | 'all' = 全部历史
let songLibStatsCache = null, songLibRankCache = null;
function songLibBrDate(d){   // Date -> DD/MM（往年 DD/MM/YYYY）
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === new Date().getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${d.getFullYear()}`;
}
function songLibResetStatsCache(){ songLibStatsCache = null; songLibRankCache = null; songLibStaleCache = null; }
// 标题 -> { count: 统计范围内用过几次（按周算，同一周重复出现只算一次）, last: 最近一次使用的日期 'YYYY-MM-DD'（不限范围） }
function songLibUsageStats(){
  if (songLibStatsCache) return songLibStatsCache;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const sun = new Date(now); sun.setDate(now.getDate() + (7 - now.getDay()) % 7);
  const curKey = songLibDateKey(sun);
  const yearPrefix = now.getFullYear() + '-';
  const map = new Map();
  Object.keys(songData || {}).forEach(k => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > curKey) return;
    const inScope = songLibCountScope === 'all' || k.startsWith(yearPrefix);
    const seen = new Set();
    (songData[k] || []).forEach(s => {
      const ti = (s && s.title || '').trim();
      if (!ti || seen.has(ti)) return;
      seen.add(ti);
      let st = map.get(ti);
      if (!st) { st = { count: 0, last: '' }; map.set(ti, st); }
      if (inScope) st.count++;
      if (k > st.last) st.last = k;
    });
  });
  songLibStatsCache = map;
  return map;
}
// 排名：按使用次数从多到少依次编号 1、2、3…（次数相同时最近用过的在前，不并列）；统计范围内没用过的不上榜
function songLibRankMap(){
  if (songLibRankCache) return songLibRankCache;
  const st = songLibUsageStats();
  const created = s => { const v = Date.parse(s.createdAt); return isNaN(v) ? 0 : v; };
  const info = s => st.get((s.title || '').trim()) || {};
  const arr = songLibrary
    .map(s => ({ s, c: info(s).count || 0, last: info(s).last || '' }))
    .filter(x => x.c > 0)
    .sort((a, b) => (b.c - a.c) || b.last.localeCompare(a.last) || created(b.s) - created(a.s));
  const m = new Map();
  arr.forEach((x, i) => m.set(x.s.id, i + 1));
  songLibRankCache = m;
  return m;
}
// 排行榜名次徽章：只在「使用次数」排序下出现。mode: 'list' 列表 | 'wf' 瀑布流
function songLibRankBadge(s, mode){
  if (songLibSortKey !== 'count') return '';
  const r = songLibRankMap().get(s.id);
  if (!r) return '';
  return `<span class="song-lib-rank ${mode}${r <= 3 ? ' top' + r : ''}">${r === 1 ? '<i class="ti ti-crown"></i>' : ''}${r}</span>`;
}
// 最近一次使用的日期（巴西样式，先日后月）：今年的显示 DD/MM，往年的显示 DD/MM/YYYY
function songLibLastUsedLabel(title){
  const st = songLibUsageStats().get((title || '').trim());
  if (!st || !st.last) return '';
  const y = +st.last.slice(0, 4), m = +st.last.slice(5, 7), d = +st.last.slice(8, 10);
  const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0');   // 巴西日期：先日后月
  return y === new Date().getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${y}`;
}
// 卡片上的使用信息：平时显示「最近使用 M/D」；按使用次数排序时前面多显示「N次」
function songLibUsedHtml(s, mode){
  const st = songLibUsageStats().get((s.title || '').trim());
  const last = songLibLastUsedLabel(s.title);
  const tag = mode === 'list' ? songLibStaleTagHtml(s) : '';   // 瀑布流卡片底部太窄，标签放到卡片的标签行里
  if (!st || !last) return tag;
  const lastTxt = mode === 'list' ? `最近使用 ${last}` : `最近 ${last}`;
  if (songLibSortKey === 'count' && st.count > 0) {
    const dot = mode === 'list' ? '<span class="ulib-dot"> · </span>' : ' · ';
    return `<i class="ti ti-repeat"></i>${st.count}次${dot}${lastTxt}${tag}`;
  }
  return `<i class="ti ti-calendar-event"></i>${lastTxt}${tag}`;
}
function setSongLibWeekCardPref(v){
  songLibWeekCardPref = v === 'hide' ? 'hide' : 'show';
  try { localStorage.setItem('songLibWeekCard', songLibWeekCardPref); } catch (e) { slDiag(e, 'setSongLibWeekCardPref'); }
  renderSongLibFilterBar();
  songLibRenderWeekCard();
}
function setSongLibCountScope(v){
  songLibCountScope = v === 'all' ? 'all' : 'year';
  persistSongLibSort();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}
// 拼音首字母：用浏览器自带的中文拼音排序规则，按 23 个声母的「分界字」判断；英文取首字母，数字及其他归 #
const songLibCollator = (() => { try { return new Intl.Collator('zh-Hans-CN-u-co-pinyin', { numeric: true }); } catch (e) { return new Intl.Collator('zh', { numeric: true }); } })();
const SONGLIB_PY_BOUNDS = [['A','阿'],['B','八'],['C','嚓'],['D','搭'],['E','蛾'],['F','发'],['G','噶'],['H','哈'],['J','击'],['K','喀'],['L','垃'],['M','妈'],['N','拿'],['O','哦'],['P','啪'],['Q','期'],['R','然'],['S','撒'],['T','塌'],['W','挖'],['X','昔'],['Y','压'],['Z','匝']];
const songLibInitialCache = new Map();
function songLibInitial(title){
  const raw = (title || '').trim();
  if (songLibInitialCache.has(raw)) return songLibInitialCache.get(raw);
  let res = '#';
  for (const ch of raw.normalize('NFKC')) {
    if (/[A-Za-z]/.test(ch)) { res = ch.toUpperCase(); break; }
    if (/[\u4e00-\u9fff]/.test(ch)) {
      for (const [letter, bound] of SONGLIB_PY_BOUNDS) { if (songLibCollator.compare(bound, ch) <= 0) res = letter; }
      break;
    }
    if (/\d/.test(ch)) break;   // 数字开头归 #
  }
  songLibInitialCache.set(raw, res);
  return res;
}
// 这首歌最近一次出现在哪一周的排班里（不含还没到的下周）：标题 -> 'YYYY-MM-DD'
function songLibBuildLastUsedMap(){
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const sun = new Date(now); sun.setDate(now.getDate() + (7 - now.getDay()) % 7);
  const curKey = songLibDateKey(sun);
  const map = new Map();
  Object.keys(songData || {}).forEach(k => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > curKey) return;
    (songData[k] || []).forEach(s => {
      const ti = (s && s.title || '').trim();
      if (ti && (!map.has(ti) || map.get(ti) < k)) map.set(ti, k);
    });
  });
  return map;
}
function sortSongLibList(list){
  const rev = songLibSortReverse;
  const created = s => { const v = Date.parse(s.createdAt); return isNaN(v) ? 0 : v; };
  if (songLibSortKey === 'pinyin') {
    const dir = rev ? -1 : 1;
    const rank = s => { const l = songLibInitial(s.title); return l === '#' ? 99 : l.charCodeAt(0) - 64; };
    return list.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return (ra === 99 || rb === 99) ? ra - rb : (ra - rb) * dir;   // # 永远排最后
      return songLibCollator.compare(a.title, b.title) * dir || created(b) - created(a);
    });
  }
  if (songLibSortKey === 'count') {
    const st = songLibUsageStats();
    const cnt = s => (st.get((s.title || '').trim()) || {}).count || 0;
    const lastOf = s => (st.get((s.title || '').trim()) || {}).last || '';
    return list.sort((a, b) => {
      const ca = cnt(a), cb = cnt(b);
      if (!ca && !cb) return created(b) - created(a);
      if (!ca) return 1;                // 范围内没用过的永远排最后
      if (!cb) return -1;
      if (ca !== cb) return rev ? ca - cb : cb - ca;
      const la = lastOf(a), lb = lastOf(b);
      if (la !== lb) return lb.localeCompare(la);   // 次数相同，最近用过的在前
      return created(b) - created(a);
    });
  }
  if (songLibSortKey === 'used') {
    const m = songLibBuildLastUsedMap();
    return list.sort((a, b) => {
      const ka = m.get((a.title || '').trim()) || '', kb = m.get((b.title || '').trim()) || '';
      if (!ka && !kb) return created(b) - created(a);
      if (!ka) return 1;                // 从没用过的永远排最后
      if (!kb) return -1;
      if (ka !== kb) return rev ? ka.localeCompare(kb) : kb.localeCompare(ka);
      return created(b) - created(a);
    });
  }
  return list.sort((a, b) => rev ? created(a) - created(b) : created(b) - created(a));
}

function openSongLibFilter(){
  renderSongLibFilterBar();
  document.getElementById('songLibFilterOverlay').classList.add('open');
}

function closeSongLibFilter(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibFilterOverlay').classList.remove('open');
}

function resetSongLibFilter(){
  songLibSongbookFilter = ''; songLibCategoryFilter = ''; songLibTagFilter = []; songLibUsageFilter = '';
  songLibSortKey = 'created'; songLibSortReverse = false; songLibCountScope = 'year'; persistSongLibSort();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  closeSongLibFilter();
}

function openSongLibCategoryAdd(){
  document.getElementById('songLibCategoryAddInput').value = '';
  document.getElementById('songLibCategoryAddError').classList.remove('show');
  document.getElementById('songLibCategoryAddOverlay').classList.add('open');
  setTimeout(() => document.getElementById('songLibCategoryAddInput')?.focus(), 100);
}

function closeSongLibCategoryAdd(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibCategoryAddOverlay').classList.remove('open');
}

async function submitSongLibCategoryAdd(){
  const val = document.getElementById('songLibCategoryAddInput').value.trim();
  const errEl = document.getElementById('songLibCategoryAddError');
  if (!val) { errEl.textContent = '请输入分类名称'; errEl.classList.add('show'); return; }
  const exists = getSongLibCategories().some(c => c.toLowerCase() === val.toLowerCase());
  if (exists) { errEl.textContent = '这个分类已经存在了'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');
  songLibCategories.push(val);
  persistSongLibCategories();
  closeSongLibCategoryAdd();
  renderSongLibFilterBar();
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  showToast(`✅ 已添加分类「${val}」`);
  await syncSongLibCategoriesToRemote();
}

async function renameSongLibCategory(oldCat){
  const val = await slPrompt(`将分类「${oldCat}」重命名为：`, oldCat);
  if (val === null) return;
  const newCat = val.trim();
  if (!newCat) { showToast('分类名称不能为空'); return; }
  if (newCat.toLowerCase() === oldCat.toLowerCase() && newCat === oldCat) return; // 没有变化
  if (newCat.toLowerCase() !== oldCat.toLowerCase() && getSongLibCategories().some(c => c.toLowerCase() === newCat.toLowerCase())) {
    showToast(`分类「${newCat}」已经存在，不能重复`);
    return;
  }
  const idx = songLibCategories.findIndex(c => c.toLowerCase() === oldCat.toLowerCase());
  if (idx !== -1) songLibCategories[idx] = newCat; else songLibCategories.push(newCat);
  persistSongLibCategories();
  let changed = 0;
  songLibrary.forEach(s => { if (s.category && s.category.toLowerCase() === oldCat.toLowerCase()) { s.category = newCat; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibCategoryFilter.toLowerCase() === oldCat.toLowerCase()) songLibCategoryFilter = newCat;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  showToast(`✅ 已重命名为「${newCat}」${changed ? `，同步更新了 ${changed} 首歌曲` : ''}`);
  await syncSongLibCategoriesToRemote();
  if (changed) await syncSongLibraryToRemote();
}

async function deleteSongLibCategory(cat){
  const usageCount = songLibrary.filter(s => s.category === cat).length;
  const msg = usageCount > 0
    ? `有 ${usageCount} 首歌正在使用「${cat}」这个分类，删除后这些歌曲的分类会一并清空。确定要删除吗？`
    : `确定要删除分类「${cat}」吗？`;
  if (!await slConfirm(msg)) return;
  songLibCategories = songLibCategories.filter(c => c.toLowerCase() !== cat.toLowerCase());
  persistSongLibCategories();
  let changed = 0;
  songLibrary.forEach(s => { if (s.category === cat) { s.category = ''; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibCategoryFilter === cat) songLibCategoryFilter = '';
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibCategoryDatalist', getSongLibCategories());
  showToast(`✅ 已删除分类「${cat}」${changed ? `，${changed} 首歌曲的分类已清空` : ''}`);
  await syncSongLibCategoriesToRemote();
  if (changed) await syncSongLibraryToRemote();
}

// ── 主题标签：筛选抽屉里的标签条（管理员可新增 / 重命名 / 删除）──
function renderSongLibTagBar(){
  const bar = document.getElementById('songLibTagBar');
  if (!bar) return;
  const tags = getSongLibTags();
  const allActive = !songLibTagFilter.length;
  bar.innerHTML = `<button class="song-lib-filter-chip${allActive ? ' active' : ''}" data-tagact="clear">全部<small>${songLibrary.length}</small></button>` +
    tags.map(t => {
      const on = songLibTagFilter.some(x => x.toLowerCase() === t.toLowerCase());
      const ico = isAdmin ? `<span class="song-lib-filter-chip-ico" data-tagact="rename" title="重命名标签"><i class="ti ti-pencil"></i></span><span class="song-lib-filter-chip-ico" data-tagact="delete" title="删除标签"><i class="ti ti-x"></i></span>` : '';
      return `<button class="song-lib-filter-chip${on ? ' active' : ''}" data-tag="${escapeHtml(t)}" data-tagact="toggle">${escapeHtml(t)}<small>${songLibTagCount(t)}</small>${ico}</button>`;
    }).join('') +
    (isAdmin ? `<button class="song-lib-filter-chip add" data-tagact="add"><i class="ti ti-plus"></i>标签</button>` : '') +
    (!tags.length && !isAdmin ? '<span class="song-lib-tag-empty">还没有主题标签</span>' : '');
  if (!bar._bound) {
    bar._bound = true;
    bar.addEventListener('click', e => {
      const act = e.target.closest('[data-tagact]'); if (!act) return;
      const chip = act.closest('[data-tag]'), tag = chip ? chip.dataset.tag : '';
      e.stopPropagation();
      const a = act.dataset.tagact;
      if (a === 'clear') { songLibTagFilter = []; songLibRefreshAfterTagFilter(); }
      else if (a === 'toggle') {
        const i = songLibTagFilter.findIndex(x => x.toLowerCase() === tag.toLowerCase());
        if (i >= 0) songLibTagFilter.splice(i, 1); else songLibTagFilter.push(tag);
        songLibRefreshAfterTagFilter();
      }
      else if (a === 'rename') renameSongLibTag(tag);
      else if (a === 'delete') deleteSongLibTag(tag);
      else if (a === 'add') addSongLibTagPrompt();
    });
  }
}
function songLibRefreshAfterTagFilter(){ renderSongLibFilterBar(); renderSongLibraryGrid(); }
async function addSongLibTagPrompt(){
  if (!isAdmin) return;
  const v = songLibTagAddCore((await slPrompt('新增主题标签（如：感恩、圣餐、圣诞、盼望）：') || ''));
  if (v) { showToast(`✅ 已添加标签「${v}」`); }
}
// 新增一个标签到标签库（已存在就返回已有的写法）；不弹窗，供多处复用
function songLibTagAddCore(raw){
  const v = String(raw || '').trim().slice(0, 20);
  if (!v) return '';
  const exist = getSongLibTags().find(t => t.toLowerCase() === v.toLowerCase());
  if (exist) return exist;
  songLibTags.push(v);
  persistSongLibTags();
  renderSongLibFilterBar();
  syncSongLibTagsToRemote();
  return v;
}
async function renameSongLibTag(oldT){
  if (!isAdmin) return;
  const val = await slPrompt(`将标签「${oldT}」重命名为：`, oldT);
  if (val === null) return;
  const nv = val.trim().slice(0, 20);
  if (!nv) { showToast('标签名称不能为空'); return; }
  if (nv === oldT) return;
  if (nv.toLowerCase() !== oldT.toLowerCase() && getSongLibTags().some(t => t.toLowerCase() === nv.toLowerCase())) { showToast(`标签「${nv}」已经存在，不能重复`); return; }
  const lo = oldT.toLowerCase();
  const i = songLibTags.findIndex(t => t.toLowerCase() === lo);
  if (i >= 0) songLibTags[i] = nv; else songLibTags.push(nv);
  persistSongLibTags();
  let changed = 0;
  songLibrary.forEach(s => { if (songLibHasTag(s, oldT)) { s.tags = s.tags.map(t => t.toLowerCase() === lo ? nv : t); changed++; } });
  if (changed) persistSongLibrary();
  songLibTagFilter = songLibTagFilter.map(t => t.toLowerCase() === lo ? nv : t);
  songLibRefreshAfterTagFilter();
  showToast(`✅ 已重命名为「${nv}」${changed ? `，同步更新了 ${changed} 首歌曲` : ''}`);
  await syncSongLibTagsToRemote();
  if (changed) await syncSongLibraryToRemote();
}
async function deleteSongLibTag(t){
  if (!isAdmin) return;
  const n = songLibTagCount(t);
  if (!await slConfirm(n > 0 ? `有 ${n} 首歌正在使用标签「${t}」，删除后这些歌曲会一并去掉这个标签。确定要删除吗？` : `确定要删除标签「${t}」吗？`)) return;
  const lo = t.toLowerCase();
  songLibTags = songLibTags.filter(x => x.toLowerCase() !== lo);
  persistSongLibTags();
  let changed = 0;
  songLibrary.forEach(s => { if (songLibHasTag(s, t)) { s.tags = s.tags.filter(x => x.toLowerCase() !== lo); changed++; } });
  if (changed) persistSongLibrary();
  songLibTagFilter = songLibTagFilter.filter(x => x.toLowerCase() !== lo);
  songLibRefreshAfterTagFilter();
  showToast(`✅ 已删除标签「${t}」${changed ? `，${changed} 首歌曲已去掉该标签` : ''}`);
  await syncSongLibTagsToRemote();
  if (changed) await syncSongLibraryToRemote();
}
// ── 给歌曲选标签（上传窗口 / 详情页编辑共用）：点选已有标签，或点「新标签」自己写一个 ──
const songLibTagSel = { add: [], edit: [] };
function renderSongLibTagPicker(mode){
  const box = document.getElementById(mode === 'add' ? 'songLibAddTags' : 'songLibEditTags');
  if (!box) return;
  const sel = songLibTagSel[mode];
  box.innerHTML = `<div class="song-lib-tagpick-l">主题标签（可多选）</div><div class="song-lib-tagpick-chips">` +
    getSongLibTags().map(t => `<button type="button" class="song-lib-tagchip${sel.some(x => x.toLowerCase() === t.toLowerCase()) ? ' on' : ''}" data-t="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('') +
    (isAdmin ? `<button type="button" class="song-lib-tagchip add" data-add="1"><i class="ti ti-plus"></i>新标签</button>` : '') + `</div>`;
  box.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    let t = b.dataset.t;
    if (b.dataset.add) {
      if (!isAdmin) return;
      t = songLibTagAddCore(await slPrompt('新标签名称（如：感恩、圣餐、圣诞、盼望）：') || '');
      if (!t) return;
      if (!sel.some(x => x.toLowerCase() === t.toLowerCase())) sel.push(t);
    } else {
      const i = sel.findIndex(x => x.toLowerCase() === t.toLowerCase());
      if (i >= 0) sel.splice(i, 1); else sel.push(t);
    }
    renderSongLibTagPicker(mode);
  };
}
// 歌曲上显示的标签小胶囊（max：最多显示几个，其余折叠成 +N）
function songLibTagPillsHtml(s, cls, max, useHit){
  let tags = (s && s.tags) || [];
  if (!tags.length) return '';
  const mi = useHit && songLibMatchInfo && songLibMatchInfo.get(s.id);
  const hit = mi && mi.tags.length ? mi.tags : null;
  if (hit) tags = hit.concat(tags.filter(t => !hit.includes(t)));
  const shown = max ? tags.slice(0, max) : tags;
  return shown.map(t => `<span class="${cls}${hit && hit.includes(t) ? ' hit' : ''}">${escapeHtml(t)}</span>`).join('') + (max && tags.length > max ? `<span class="${cls} more">+${tags.length - max}</span>` : '');
}

// ── 批量选择 / 批量打标签（管理员）──
let songLibSelMode = false;
const songLibSel = new Set();
let songLibBatchAdd = [], songLibBatchRemove = [];
function songLibBatchSyncBtn(){
  const b = document.getElementById('songLibBatchBtn'); if (!b) return;
  const ok = !!isAdmin && (songLibTab === 'all' || songLibTab === 'favorite') && songLibSearchMode === 'lib';
  b.hidden = !ok;
  b.classList.toggle('active', songLibSelMode);
  if (!ok && songLibSelMode) songLibBatchExit();
}
function songLibBatchToggle(){ if (songLibSelMode) songLibBatchExit(); else songLibBatchEnter(); }
function songLibBatchEnter(){
  if (!isAdmin) { showToast('批量设置需要管理员登录'); return; }
  songLibSelMode = true; songLibSel.clear();
  document.getElementById('songLibraryOverlay').classList.add('sel-mode');
  document.getElementById('songLibSelBar').classList.add('show');
  if (!songLibBatchBound) {
    songLibBatchBound = true;
    // 选择模式下，点卡片（含缩略图）只切换勾选，不打开详情 / 大图
    document.getElementById('songLibGrid').addEventListener('click', e => {
      if (!songLibSelMode) return;
      const c = e.target.closest('[data-sid]'); if (!c) return;
      e.preventDefault(); e.stopPropagation();
      const id = c.dataset.sid;
      if (songLibSel.has(id)) songLibSel.delete(id); else songLibSel.add(id);
      c.classList.toggle('sel', songLibSel.has(id));
      songLibBatchUpdateBar();
    }, true);
  }
  songLibBatchSyncBtn(); songLibBatchUpdateBar();
}
let songLibBatchBound = false;
function songLibBatchExit(){
  songLibSelMode = false; songLibSel.clear();
  document.getElementById('songLibraryOverlay')?.classList.remove('sel-mode');
  document.getElementById('songLibSelBar')?.classList.remove('show');
  document.querySelectorAll('#songLibGrid .sel').forEach(el => el.classList.remove('sel'));
  document.getElementById('songLibBatchBtn')?.classList.remove('active');
}
function songLibBatchUpdateBar(){
  const n = songLibSel.size;
  document.getElementById('songLibSelCount').textContent = `已选 ${n} 首`;
  const vis = getFilteredSongLibrary();
  const all = vis.length > 0 && vis.every(x => songLibSel.has(x.id));
  document.getElementById('songLibSelAllBtn').textContent = all ? '取消全选' : '全选';
}
function songLibSelAll(){
  const vis = getFilteredSongLibrary();
  const all = vis.length > 0 && vis.every(x => songLibSel.has(x.id));
  vis.forEach(x => { if (all) songLibSel.delete(x.id); else songLibSel.add(x.id); });
  document.querySelectorAll('#songLibGrid [data-sid]').forEach(el => el.classList.toggle('sel', songLibSel.has(el.dataset.sid)));
  songLibBatchUpdateBar();
}
function songLibBatchSelected(){ return songLibrary.filter(x => songLibSel.has(x.id)); }
function songLibBatchOpen(){
  if (!isAdmin) return;
  const sel = songLibBatchSelected();
  if (!sel.length) { showToast('先点选要设置的歌曲'); return; }
  songLibBatchAdd = []; songLibBatchRemove = [];
  document.getElementById('songLibBatchSongbook').value = '';
  const dl = document.getElementById('songLibSongbookDatalist');
  if (dl) dl.innerHTML = getSongLibSongbooks().map(c => `<option value="${escapeHtml(c)}">`).join('');
  songLibBatchRender();
  document.getElementById('songLibBatchOverlay').classList.add('open');
}
function songLibBatchClose(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibBatchOverlay').classList.remove('open');
}
function songLibBatchRender(){
  const sel = songLibBatchSelected();
  document.getElementById('songLibBatchTitle').textContent = `批量设置 · 已选 ${sel.length} 首`;
  const has = (arr, t) => arr.some(x => x.toLowerCase() === t.toLowerCase());
  const addBox = document.getElementById('songLibBatchAdd'), rmBox = document.getElementById('songLibBatchRemove');
  addBox.innerHTML = getSongLibTags().map(t => `<button type="button" class="song-lib-filter-chip${has(songLibBatchAdd, t) ? ' active' : ''}" data-t="${escapeHtml(t)}" data-k="add">${escapeHtml(t)}</button>`).join('') +
    `<button type="button" class="song-lib-filter-chip add" data-k="new"><i class="ti ti-plus"></i>新标签</button>`;
  const present = new Map();
  sel.forEach(x => (x.tags || []).forEach(t => { const k = t.toLowerCase(); present.set(k, { t, n: (present.get(k)?.n || 0) + 1 }); }));
  rmBox.innerHTML = present.size ? [...present.values()].map(({ t, n }) => `<button type="button" class="song-lib-filter-chip${has(songLibBatchRemove, t) ? ' active rm' : ''}" data-t="${escapeHtml(t)}" data-k="rm">${escapeHtml(t)}<small>${n}</small></button>`).join('')
    : '<span class="song-lib-tag-empty">所选歌曲还没有标签</span>';
  const parts = [];
  if (songLibBatchAdd.length) parts.push('添加 ' + songLibBatchAdd.map(t => '#' + t).join(' '));
  if (songLibBatchRemove.length) parts.push('移除 ' + songLibBatchRemove.map(t => '#' + t).join(' '));
  const sb = (document.getElementById('songLibBatchSongbook').value || '').trim();
  if (sb) parts.push('诗歌本设为「' + sb + '」');
  document.getElementById('songLibBatchSum').textContent = parts.length ? '将对所选歌曲：' + parts.join('；') : '还没有选择要修改的内容';
  if (!addBox._bound) {
    addBox._bound = true; rmBox._bound = true;
    const h = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.k, t = b.dataset.t;
      const toggle = (arr, v) => { const i = arr.findIndex(x => x.toLowerCase() === v.toLowerCase()); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
      const drop = (arr, v) => { const i = arr.findIndex(x => x.toLowerCase() === v.toLowerCase()); if (i >= 0) arr.splice(i, 1); };
      if (k === 'new') { const v = songLibTagAddCore(await slPrompt('新标签名称（如：感恩、圣餐、圣诞、盼望）：') || ''); if (!v) return; if (!songLibBatchAdd.some(x => x.toLowerCase() === v.toLowerCase())) songLibBatchAdd.push(v); drop(songLibBatchRemove, v); }
      else if (k === 'add') { toggle(songLibBatchAdd, t); drop(songLibBatchRemove, t); }
      else if (k === 'rm') { toggle(songLibBatchRemove, t); drop(songLibBatchAdd, t); }
      songLibBatchRender();
    };
    addBox.addEventListener('click', h); rmBox.addEventListener('click', h);
    document.getElementById('songLibBatchSongbook').addEventListener('input', songLibBatchRender);
  }
}
async function songLibBatchApply(){
  if (!isAdmin) return;
  const sel = songLibBatchSelected();
  const sb = (document.getElementById('songLibBatchSongbook').value || '').trim();
  if (!sel.length) return;
  if (!songLibBatchAdd.length && !songLibBatchRemove.length && !sb) { showToast('还没有选择要修改的内容'); return; }
  const rm = new Set(songLibBatchRemove.map(t => t.toLowerCase()));
  sel.forEach(x => {
    const cur = (x.tags || []).filter(t => !rm.has(t.toLowerCase()));
    songLibBatchAdd.forEach(t => { if (!cur.some(c => c.toLowerCase() === t.toLowerCase())) cur.push(t); });
    x.tags = cur;
    if (sb) x.songbook = sb;
  });
  persistSongLibrary();
  songLibBatchClose();
  const n = sel.length;
  songLibBatchExit();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  showToast(`✅ 已更新 ${n} 首歌曲`);
  await syncSongLibraryToRemote();
}

async function addSongLibSongbookPrompt(){
  const val = (await slPrompt('新增诗歌本名称（如：生命圣诗、赞美之泉）：') || '').trim();
  if (!val) return;
  if (getSongLibSongbooks().some(sb => sb.toLowerCase() === val.toLowerCase())) { showToast('这个诗歌本已经存在了'); return; }
  songLibSongbooks.push(val);
  persistSongLibSongbooks();
  renderSongLibFilterBar();
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  showToast(`✅ 已添加诗歌本「${val}」`);
  await syncSongLibSongbooksToRemote();
}

async function renameSongLibSongbook(oldSb){
  const val = await slPrompt(`将诗歌本「${oldSb}」重命名为：`, oldSb);
  if (val === null) return;
  const newSb = val.trim();
  if (!newSb) { showToast('诗歌本名称不能为空'); return; }
  if (newSb.toLowerCase() === oldSb.toLowerCase() && newSb === oldSb) return; // 没有变化
  if (newSb.toLowerCase() !== oldSb.toLowerCase() && getSongLibSongbooks().some(sb => sb.toLowerCase() === newSb.toLowerCase())) {
    showToast(`诗歌本「${newSb}」已经存在，不能重复`);
    return;
  }
  const idx = songLibSongbooks.findIndex(sb => sb.toLowerCase() === oldSb.toLowerCase());
  if (idx !== -1) songLibSongbooks[idx] = newSb; else songLibSongbooks.push(newSb);
  persistSongLibSongbooks();
  let changed = 0;
  songLibrary.forEach(s => { if (s.songbook && s.songbook.toLowerCase() === oldSb.toLowerCase()) { s.songbook = newSb; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibSongbookFilter.toLowerCase() === oldSb.toLowerCase()) songLibSongbookFilter = newSb;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  showToast(`✅ 已重命名为「${newSb}」${changed ? `，同步更新了 ${changed} 首歌曲` : ''}`);
  await syncSongLibSongbooksToRemote();
  if (changed) await syncSongLibraryToRemote();
}

async function deleteSongLibSongbook(sb){
  const usageCount = songLibrary.filter(s => s.songbook === sb).length;
  const msg = usageCount > 0
    ? `有 ${usageCount} 首歌正在使用「${sb}」这个诗歌本，删除后这些歌曲的诗歌本会一并清空。确定要删除吗？`
    : `确定要删除诗歌本「${sb}」吗？`;
  if (!await slConfirm(msg)) return;
  songLibSongbooks = songLibSongbooks.filter(x => x.toLowerCase() !== sb.toLowerCase());
  persistSongLibSongbooks();
  let changed = 0;
  songLibrary.forEach(s => { if (s.songbook === sb) { s.songbook = ''; changed++; } });
  if (changed) persistSongLibrary();
  if (songLibSongbookFilter === sb) songLibSongbookFilter = '';
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
  showToast(`✅ 已删除诗歌本「${sb}」${changed ? `，${changed} 首歌曲的诗歌本已清空` : ''}`);
  await syncSongLibSongbooksToRemote();
  if (changed) await syncSongLibraryToRemote();
}

function setSongLibCategoryFilter(cat){
  songLibCategoryFilter = cat;
  songLibSongbookFilter = ''; // 联动：切换分类后，诗歌本可选项会变，之前选的诗歌本筛选先清空
  renderSongLibFilterBar();
  renderSongLibraryGrid();
}

function setSongLibSongbookFilter(sb){
  songLibSongbookFilter = sb;
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  setTimeout(() => closeSongLibFilter(), 120);   // 选好就收起抽屉
}

function getFilteredSongLibrary(){
  let list = songLibrary.slice();
  if (songLibTab === 'favorite') {
    list = list.filter(s => isSongLibFavorite(s.id));
    sortSongLibList(list);
  } else if (songLibTab === 'playlist') {
    list = songLibPlaylistSongs().all;   // 本周的歌在前、按选歌顺序；后面是手动加入的，不重新排序
  } else if (songLibTab === 'recent') {
    list = list.filter(s => s.lastPlayedAt);
    list.sort((a,b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));
  } else {
    sortSongLibList(list);
  }
  if (songLibCategoryFilter) list = list.filter(s => s.category === songLibCategoryFilter);
  if (songLibSongbookFilter) list = list.filter(s => s.songbook === songLibSongbookFilter);
  if (songLibTagFilter.length) list = list.filter(s => songLibTagFilter.every(t => songLibHasTag(s, t)));
  list = songLibApplyUsageFilter(list);
  songLibMatchInfo = null;
  if (!songLibSearchKeyword) return list;
  const toks = songLibSearchTokens(songLibSearchKeyword);
  if (!toks.length) return list;
  const scope = songLibSearchMode === 'lib' ? songLibScope : 'all';
  const info = new Map(), out = [];
  list.forEach((s, i) => { const m = songLibMatch(s, toks, scope); if (m) { m.i = i; info.set(s.id, m); out.push(s); } });
  out.sort((a, b) => (info.get(b.id).score - info.get(a.id).score) || (info.get(a.id).i - info.get(b.id).i));   // 相关度高的在前，同分保持原来的排序
  songLibMatchInfo = info;
  return out;
}

// ── 库内搜索：歌名 / 歌词 / 标签 / 歌手…… 打分匹配 ──────────────────────────
// 相关度：歌名完全相同 100 > 歌名开头 80 > 歌名包含 60 > 拼音首字母 50 > 标签 40~45 > 歌手/歌本/分类 30 > 歌词 10
// 多个关键词用空格分开，要同时满足；歌词至少 2 个字才查，免得输入「爱」就命中大半个库
const SL_PUNCT = /[\s\u3000·\-_—–,.!?:;'"《》<>、，。！？：；“”‘’()（）\[\]【】{}…~～*#/\\|]/;
function slNormKw(t){ let o = ''; for (const ch of String(t || '').normalize('NFKC').toLowerCase()) if (!SL_PUNCT.test(ch)) o += ch; return o; }
function songLibSearchTokens(kw){
  return String(kw || '').trim().split(/\s+/).filter(Boolean).slice(0, 5).map(t => ({ raw: t.toLowerCase(), n: slNormKw(t) })).filter(t => t.raw);
}
// 歌词索引：去掉 LRC 时间轴 / 标点 / 空白后的小写串 + 回到原文的位置表。用 WeakMap 挂在歌曲对象外面，不会被同步进云端数据
const songLibLyCache = new WeakMap();
function songLibLyIndex(s){
  const lyr = s.lyrics || '', lrc = s.lyricsLrc || '';
  let c = songLibLyCache.get(s);
  if (c && c.a === lyr && c.b === lrc) return c;
  const raw = String(lyr || lrc).normalize('NFKC')
    .replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '').replace(/\[[a-z]{2,}:[^\]]*\]/gi, '')
    .replace(/\r/g, '').replace(/\s*\n\s*/g, ' ').trim();
  let n = ''; const map = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (SL_PUNCT.test(ch)) continue;
    const lc = ch.toLowerCase();
    n += lc; for (let k = 0; k < lc.length; k++) map.push(i);
  }
  c = { a: lyr, b: lrc, raw, n, map };
  songLibLyCache.set(s, c);
  return c;
}
function songLibLySnippet(ix, tok, ctx){
  ctx = ctx || 14;
  const p = ix.n.indexOf(tok); if (p < 0) return null;
  const a = ix.map[p], b = ix.map[p + tok.length - 1] + 1;
  const from = Math.max(0, a - ctx), to = Math.min(ix.raw.length, b + ctx);
  return { pre: (from > 0 ? '…' : '') + ix.raw.slice(from, a), mid: ix.raw.slice(a, b), post: ix.raw.slice(b, to) + (to < ix.raw.length ? '…' : '') };
}
function songLibMatch(s, toks, scope){
  const title = (s.title || '').toLowerCase(), titleN = slNormKw(s.title);
  const useTitle = scope === 'all' || scope === 'title', useTag = scope === 'all' || scope === 'tag';
  const useMeta = scope === 'all', useLy = scope === 'all' || scope === 'lyrics';
  const info = { score: 0, title: false, tags: [], meta: false, lyric: null, kind: '' };
  for (const t of toks) {
    let best = 0;
    if (useTitle) {
      if (t.n && titleN === t.n) best = 100;
      else if (title.includes(t.raw) || (t.n && titleN.includes(t.n))) best = (t.n && titleN.startsWith(t.n)) ? 80 : 60;
      else if (songLibPyMatch(s.title, t.raw)) best = 50;
      if (best) info.title = true;
    }
    if (useTag && (s.tags || []).length) {
      const hits = s.tags.filter(g => g.toLowerCase().includes(t.raw));
      if (hits.length) { hits.forEach(h => { if (!info.tags.includes(h)) info.tags.push(h); }); best = Math.max(best, hits.some(g => g.toLowerCase() === t.raw) ? 45 : 40); }
    }
    if (useMeta && best < 30 && [s.category, s.band, s.songbook].some(x => (x || '').toLowerCase().includes(t.raw))) { info.meta = true; best = Math.max(best, 30); }
    if (useLy && best < 60 && t.n.length >= 2 && (s.lyrics || s.lyricsLrc)) {
      const ix = songLibLyIndex(s);
      if (ix.n.includes(t.n)) { if (!info.lyric) info.lyric = { ix, tok: t.n }; best = Math.max(best, 10); }
    }
    if (!best) return null;
    info.score += best;
  }
  info.kind = info.title ? 'title' : info.tags.length ? 'tag' : info.meta ? 'meta' : 'lyric';
  return info;
}
// 卡片上的「歌词」命中片段（歌名已经命中时不显示，免得重复）
function songLibLyHitHtml(s){
  const mi = songLibMatchInfo && songLibMatchInfo.get(s.id);
  if (!mi || !mi.lyric || mi.title) return '';
  const sn = songLibLySnippet(mi.lyric.ix, mi.lyric.tok); if (!sn) return '';
  return `<div class="song-lib-lyhit"><span class="song-lib-lyhit-k">歌词</span><span class="song-lib-lyhit-t">${escapeHtml(sn.pre)}<mark class="song-lib-hl">${escapeHtml(sn.mid)}</mark>${escapeHtml(sn.post)}</span></div>`;
}
// 数量行后面的「歌名 5 · 标签 3 · 歌词 12」（只在范围是「全部」、并且有非歌名命中时显示）
function songLibCountBreakdown(list){
  if (!songLibMatchInfo || songLibSearchMode !== 'lib' || songLibScope !== 'all') return '';
  const c = { title: 0, tag: 0, meta: 0, lyric: 0 };
  list.forEach(s => { const m = songLibMatchInfo.get(s.id); if (m) c[m.kind]++; });
  if (c.title === list.length) return '';
  const parts = [['歌名', c.title], ['标签', c.tag], ['歌手/歌本', c.meta], ['歌词', c.lyric]].filter(x => x[1] > 0).map(x => `${x[0]} ${x[1]}`);
  return parts.length ? ' · ' + parts.join(' · ') : '';
}

// ── 首页「本周诗歌」卡片：样式沿用「最近使用」的每周卡片；本周没选歌时给「我是主领，我要选歌」按钮（需登录）──
function songLibCurWeekKey(){
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const sun = new Date(now); sun.setDate(now.getDate() + (7 - now.getDay()) % 7);   // 今天是主日就是今天，否则是接下来的第一个主日
  return songLibDateKey(sun);
}
let songLibWeekDataState = 'ok';   // 独立页面里云端数据还没回来时是 'pending'，读取失败是 'fail'（此时不显示本周卡片，免得误报「暂未选歌」）
// 这周的主领：取自排班表里的「主领」，请假的人会标出来
function songLibWeekLead(key){
  const sh = ((typeof scheduleData !== 'undefined' && scheduleData && scheduleData[key]) || []).find(s => s && s.role === '主领');
  if (!sh) return null;
  const persons = Array.isArray(sh.persons) && sh.persons.length ? sh.persons : String(sh.name || '').split('/').map(x => x.trim()).filter(Boolean);
  if (!persons.length) return null;
  const leave = new Set(Array.isArray(sh.leavePersons) ? sh.leavePersons : []);
  return persons.map(p => ({ name: p, leave: leave.has(p) }));
}
function songLibLeadHtml(lead){
  if (!lead) return '';
  return `<div class="song-lib-weeklead"><i class="ti ti-microphone"></i><span class="song-lib-weeklead-lbl">主领</span>${
    lead.map(p => `<span class="song-lib-leadchip${p.leave ? ' leave' : ''}"${p.leave ? ' title="已请假"' : ''}>${escapeHtml(p.name)}${p.leave ? '<i class="ti ti-calendar-off"></i>' : ''}</span>`).join('')
  }</div>`;
}
// ── 本周卡片「⋯」菜单 ──
function slWkMenuClose(){
  const m = document.getElementById('slWkMenu'); if (m) m.hidden = true;
  const b = document.querySelector('#songLibWeekHost .sl-wkm-btn'); if (b) b.setAttribute('aria-expanded', 'false');
}
function slWkMenuToggle(e){
  if (e) e.stopPropagation();
  const m = document.getElementById('slWkMenu'); if (!m) return;
  const open = m.hidden;
  m.hidden = !open;
  const b = document.querySelector('#songLibWeekHost .sl-wkm-btn'); if (b) b.setAttribute('aria-expanded', String(open));
}
function slWkMenuGo(act){
  slWkMenuClose();
  if (act === 'recent') setSongLibTab('recent');
  else if (act === 'layout') setSongLibWeekLayout(songLibWeekLayout === 'grid' ? 'thumb' : 'grid');
  else if (act === 'edit') songLibPickWeekSongs();
}
document.addEventListener('pointerdown', e => {
  const m = document.getElementById('slWkMenu');
  if (m && !m.hidden && !(e.target.closest && e.target.closest('.sl-wkm-wrap'))) slWkMenuClose();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') slWkMenuClose(); });

// 本周卡片的骨架屏：结构跟真实卡片一致（标题 + 日期 / 分享 + ⋯ / 主领主题两行 / 2×2 序号或缩略图），数据回来时不会跳
function songLibWeekSkeletonHtml(){
  const bar = (cls, st) => `<div class="skel-block ${cls}"${st ? ` style="${st}"` : ''}></div>`;
  const grid = !document.documentElement.classList.contains('elder') && songLibWeekLayout === 'grid';
  const head = `<div class="song-lib-weekhead"><div class="song-lib-weekhead-l">${bar('skel-line', 'width:40px')}${bar('skel-line', 'width:78px')}${bar('skel-line', 'width:34px')}</div><span class="song-lib-weekhead-r">${bar('skel-wk-pill')}${bar('skel-wk-pill dot')}</span></div>`;
  const lead = `<div class="skel-wk-lead">${bar('skel-line short', 'width:62%')}${bar('skel-line short', 'width:48%')}</div>`;
  const body = grid
    ? `<div class="song-lib-weekgrid">${Array.from({ length: 4 }, (_, i) => `<div class="wg-item">${bar('skel-wk-n')}${bar('skel-line', `width:${i % 2 ? 52 : 68}%`)}</div>`).join('')}</div>`
    : `<div class="song-lib-weekrow">${Array.from({ length: 3 }, () => `<div class="song-lib-weekitem"><div class="skel-block song-lib-weekthumb"></div>${bar('skel-line w70', 'margin-top:8px')}</div>`).join('')}</div>`;
  return `<section class="song-lib-weekcard current" aria-busy="true">${head}${lead}${body}</section>`;
}
function songLibRenderWeekCard(){
  const host = document.getElementById('songLibWeekHost');
  if (!host) return;
  document.getElementById('songLibraryOverlay')?.classList.toggle('wk-recent-tb', songLibWeekCardPref === 'hide' || songLibWeekDataState === 'fail');   // 平时「最近」在本周卡片上；卡片被隐藏 / 读取失败时才回到工具栏
  const show = songLibWeekCardPref !== 'hide' && songLibTab === 'all' && songLibSearchMode === 'lib' && !songLibSearchKeyword && !songLibSongbookFilter && !songLibCategoryFilter && !songLibTagFilter.length && !songLibUsageFilter;
  if (!show) { host.innerHTML = ''; return; }
  if (songLibSkelOn || songLibWeekDataState === 'pending') {
    host.innerHTML = songLibWeekSkeletonHtml();
    return;
  }
  if (songLibWeekDataState === 'fail') { host.innerHTML = ''; return; }
  const key = songLibCurWeekKey();
  const arr = songData[key] || [];
  const items = arr.map((s, i) => ({ s, i })).filter(x => x.s && x.s.title);
  const leadHtml = songLibLeadHtml(songLibWeekLead(key));
  if (items.length) {
    const share = `<button class="song-lib-weekedit share" type="button" onclick="songLibOpenWeekShare()"><i class="ti ti-share-3"></i>分享</button>`;
    const elderOn = document.documentElement.classList.contains('elder');   // 长辈模式有自己的竖排样式，不用 2×2
    const layout = !elderOn && songLibWeekLayout === 'grid' ? 'grid' : 'thumb';
    // 右上角只留「分享」和「⋯」；最近使用 / 切换样式 / 修改本周选歌 都收进「⋯」菜单
    const more = `<span class="sl-wkm-wrap"><button class="song-lib-weekedit share sl-wkm-btn" type="button" title="更多" aria-label="更多" aria-haspopup="menu" aria-expanded="false" onclick="slWkMenuToggle(event)"><i class="ti ti-dots"></i></button><span class="sl-wkm" id="slWkMenu" role="menu" hidden>`
      + `<button type="button" role="menuitem" onclick="slWkMenuGo('recent')"><i class="ti ti-history"></i>最近使用</button>`
      + `<button type="button" role="menuitem" onclick="slWkMenuGo('layout')"><i class="ti ${layout === 'grid' ? 'ti-photo' : 'ti-list-numbers'}"></i>${layout === 'grid' ? '切换为缩略图样式' : '切换为 2×2 样式'}</button>`
      + (isAdmin ? `<button type="button" role="menuitem" onclick="slWkMenuGo('edit')"><i class="ti ti-pencil"></i>修改本周选歌</button>` : '')
      + `</span></span>`;
    host.innerHTML = songLibRecentCardHtml({ key, curKey: key, items, extraHead: share + more, leadHtml, layout });
    return;
  }
  const d = new Date(key + 'T00:00:00');
  host.innerHTML = `<section class="song-lib-weekcard current song-lib-weekempty">
    <div class="song-lib-weekhead">
      <div class="song-lib-weekhead-l"><span class="song-lib-weektitle">本周</span><span class="song-lib-weekdate">${d.getMonth() + 1}月${d.getDate()}日</span></div>
      <span class="song-lib-weekhead-r"><button class="song-lib-weekedit share" type="button" data-act="recent" onclick="setSongLibTab('recent')"><i class="ti ti-history"></i>最近</button></span>
    </div>
    ${leadHtml}
    <div class="song-lib-weekempty-body">
      <i class="ti ti-music-off"></i>
      <div class="song-lib-weekempty-txt">本周暂未选歌</div>
      <button class="song-lib-weekpick-btn" type="button" onclick="songLibPickWeekSongs()"><i class="ti ti-microphone-2"></i>我是主领，我要选歌</button>
    </div>
  </section>`;
}
// ── 分享本周诗歌：海报图 / 文字 / 链接 ──
const SONGLIB_CHURCH_NAME = '巴西华人基督教会';
let weekShareKey = '';
function songLibWeekShareUrl(key){
  const u = new URL('index.html', location.href);   // 链接打开诗歌库页面，直接看这周的歌谱
  u.search = ''; u.hash = '';
  u.searchParams.set('week', key);
  return u.toString();
}
function songLibWeekTitles(key){ return (songData[key] || []).filter(s => s && s.title).map(s => s.title); }
function songLibWeekTeachTitles(key){ return (songData[key] || []).filter(s => s && s.title && s.teach).map(s => s.title); }
function songLibWeekShareText(key){
  const d = new Date(key + 'T00:00:00');
  const lead = (songLibWeekLead(key) || []).filter(p => !p.leave);   // 请假的人不写进分享内容
  const lines = [`🎵 本周诗歌 · ${d.getMonth() + 1}月${d.getDate()}日（周日）`];
  if (lead.length) lines.push(`🎤 主领：${lead.map(p => p.name).join('、')}`);
  const teach = songLibWeekTeachTitles(key);
  songLibWeekTitles(key).forEach((t, i) => lines.push(`${i + 1}. ${t}${teach.includes(t) ? '  🎓教歌' : ''}`));
  if (teach.length) lines.push(`🎓 本周教歌：${teach.join('、')}`);
  lines.push(`🔗 查看歌谱：${songLibWeekShareUrl(key)}`);
  return lines.join('\n');
}
function songLibOpenWeekShare(){
  const key = songLibCurWeekKey();
  const titles = songLibWeekTitles(key);
  if (!titles.length) { showToast('本周还没选歌'); return; }
  weekShareKey = key;
  const d = new Date(key + 'T00:00:00');
  const lead = (songLibWeekLead(key) || []).filter(p => !p.leave);
  const teachSet = songLibWeekTeachTitles(key);
  const rows = titles.map((t, i) => {
    const e = findSongLibEntryByTitle(t);
    return `<li><span class="n">${i + 1}</span><span class="t">${escapeHtml(t)}</span>${teachSet.includes(t) ? '<span class="tag tc">教歌</span>' : ''}${e && e.songbook ? `<span class="tag">${escapeHtml(e.songbook)}</span>` : ''}</li>`;
  }).join('');
  document.getElementById('weekShareCard').innerHTML = `
    <div class="wsc-head">
      <div class="wsc-church">${SONGLIB_CHURCH_NAME}</div>
      <div class="wsc-title">本周诗歌</div>
      <div class="wsc-date">${d.getMonth() + 1}月${d.getDate()}日 · 主日</div>
    </div>
    ${lead.length ? `<div class="wsc-lead">主领　${lead.map(p => escapeHtml(p.name)).join('　')}</div>` : ''}
    <ol class="wsc-list">${rows}</ol>
    <div class="wsc-foot"><div class="wsc-foot-txt">扫码或打开链接<br>查看本周歌谱</div><canvas id="weekShareQr" width="88" height="88"></canvas></div>`;
  const qr = document.getElementById('weekShareQr');
  if (qr) {
    if (typeof QRCode !== 'undefined') QRCode.toCanvas(qr, songLibWeekShareUrl(key), { width: 88, margin: 0, color: { dark: '#1a3d33', light: '#ffffff' } }, err => { if (err) console.error('二维码生成失败：', err); });
    else { qr.style.display = 'none'; console.error('二维码生成失败：QRCode 库未加载'); }
  }
  let canShareFile = false;
  try { canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }); } catch (e) { slDiag(e, 'songLibOpenWeekShare'); }
  document.getElementById('weekShareImgLabel').textContent = canShareFile ? '分享图片' : '保存图片';
  document.getElementById('weekShareOverlay').classList.add('open');
}
function closeWeekShare(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('weekShareOverlay').classList.remove('open');
}
async function songLibCopyText(text, okMsg){
  try { await navigator.clipboard.writeText(text); showToast(okMsg); return; } catch (e) { slDiag(e, 'songLibCopyText'); }
  let ok = false;
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { ok = document.execCommand('copy'); } catch (e) { slDiag(e, 'songLibCopyText'); }
  ta.remove();
  showToast(ok ? okMsg : '复制失败，请长按手动复制');
}
function weekShareCopyText(){ songLibCopyText(songLibWeekShareText(weekShareKey), '✅ 文字已复制，可以直接发到群里'); }
function weekShareCopyLink(){ songLibCopyText(songLibWeekShareUrl(weekShareKey), '✅ 链接已复制'); }
// 保存 / 分享海报：和单曲分享一样，直接把屏幕上看到的卡片截图，所见即所得
async function weekShareSaveImage(){
  showToast('海报生成组件加载中…');
  if (!(await ensureHtml2canvas())) { showToast('海报生成组件加载失败，请检查网络后重试'); return; }
  showToast('海报生成中…');
  const key = weekShareKey;
  try {
    const canvas = await html2canvas(document.getElementById('weekShareCard'), {
      backgroundColor: '#ffffff', scale: Math.max(3, (window.devicePixelRatio || 1) * 2), useCORS: true, logging: false,
    });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('toBlob 失败');
    const fname = `本周诗歌-${key}.png`;
    try {
      const file = new File([blob], fname, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '本周诗歌', text: songLibWeekShareText(key) });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }   // 用户自己取消了分享
    const a = document.createElement('a');
    a.download = fname; a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('✅ 海报已生成，正在下载');
  } catch (e) {
    console.error('生成海报失败', e);
    showToast('海报生成失败，可以先用「复制文字」发到群里');
  }
}
// 打开别人分享的「本周诗歌」链接（?week=日期）：直接看那一周的歌谱
function songLibOpenSharedWeek(key){
  const arr = songLibWeekLbList(key);
  if (!arr.length) { showToast('这一周的歌谱还没上传'); return; }
  openLightboxWithList(arr, 0);
}
// ── 最近使用：本月用过的诗歌，按周分组（近的在前），每周一张卡片，歌谱横向排列 ──
function songLibDateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function songLibRecentWeeks(){
  const now = new Date(); now.setHours(0,0,0,0);
  // 「本周」= 今天（若是主日）或接下来的第一个主日；主日已过的那一周就算「上周」，依此类推
  const sun = new Date(now); sun.setDate(now.getDate() + (7 - now.getDay()) % 7);
  const curKey = songLibDateKey(sun);
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-`;
  const kw = (songLibSearchKeyword || '').toLowerCase();
  const buildWeek = (k) => {
    const items = [];
    (songData[k] || []).forEach((s, i) => {
      if (!s || !s.title) return;
      const e = findSongLibEntryByTitle(s.title);
      if (songLibCategoryFilter && (!e || e.category !== songLibCategoryFilter)) return;
      if (songLibSongbookFilter && (!e || e.songbook !== songLibSongbookFilter)) return;
      if (songLibTagFilter.length && (!e || !songLibTagFilter.every(t => songLibHasTag(e, t)))) return;
      if (kw && !s.title.toLowerCase().includes(kw)) return;
      items.push({ s, i });
    });
    // 这一周一张谱图都没上传的（含本周还没传）就不显示，所以没传时自然只到上周
    return items.some(x => x.s.src) ? { key: k, curKey, items } : null;
  };
  const allKeys = Object.keys(songData || {}).filter(k => k <= curKey).sort((a, b) => b.localeCompare(a));   // 不含还没到的下周，近的在前
  const weeks = [];
  allKeys.filter(k => k.startsWith(monthPrefix) || k === curKey).forEach(k => { const w = buildWeek(k); if (w) weeks.push(w); });
  // 本月第一周、本周还没选歌（本月一周都没有）：默认显示上周（可能在上个月）
  songLibRecentFallback = false;
  if (!weeks.length && Number(curKey.slice(8, 10)) <= 7) {
    for (const k of allKeys) {
      if (k === curKey || k.startsWith(monthPrefix)) continue;
      const w = buildWeek(k);
      if (w) { weeks.push(w); songLibRecentFallback = true; break; }
    }
  }
  return weeks;
}
let songLibRecentFallback = false;
function songLibRecentWeekTitle(key, curKey){
  const diff = Math.round((new Date(key + 'T00:00:00') - new Date(curKey + 'T00:00:00')) / (7 * 86400000));
  if (diff === 0) return '本周';
  if (diff === -1) return '上周';
  if (diff === -2) return '上上周';
  return `第${Math.ceil(Number(key.slice(8, 10)) / 7)}周`;
}
function songLibRecentCardHtml(w){
  const d = new Date(w.key + 'T00:00:00');
  const title = songLibRecentWeekTitle(w.key, w.curKey);
  const items = w.items.map(({ s, i }) => {
    const thumb = s.src
      ? `<img src="${s.src}" alt="${escapeHtml(s.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : `<i class="ti ti-photo"></i>`;
    const clickable = s.src ? ` onclick="songLibRecentOpenImage('${w.key}',${i})"` : '';
    const mkBadge = (s.marks && Object.keys(s.marks).length) ? '<span class="mk-badge"><i class="ti ti-writing"></i>标记</span>' : '';
    const tcBadge = s.teach ? '<span class="tc-badge"><i class="ti ti-school"></i>教歌</span>' : '';
    return `<div class="song-lib-weekitem">
      <div class="song-lib-weekthumb${s.src ? ' has-img' : ''}"${clickable}>${thumb}${tcBadge}${mkBadge}</div>
      <div class="song-lib-weeksong" title="${escapeHtml(s.title)}" onclick="songLibRecentOpenDetail('${w.key}',${i})">${highlightKeyword(s.title, songLibSearchKeyword)}</div>
    </div>`;
  }).join('');
  const teachItems = w.items.filter(x => x.s.teach);
  const teachHtml = teachItems.length ? `<div class="song-lib-weekteach"><i class="ti ti-school"></i><span class="lbl">教歌</span>${
    teachItems.map(({ s, i }) => `<button type="button" class="song-lib-teachchip" onclick="songLibRecentOpenDetail('${w.key}',${i})">${escapeHtml(s.title)}</button>`).join('')
  }</div>` : '';
  const asGrid = w.layout === 'grid';   // 首页本周卡片可选「2×2 序号」样式；默认仍是缩略图
  const gridHtml = asGrid ? `<div class="song-lib-weekgrid">${w.items.map(({ s, i }, n) =>
    `<button type="button" class="wg-item" title="${escapeHtml(s.title)}" onclick="songLibRecentOpenDetail('${w.key}',${i})"><span class="wg-n">${n + 1}</span><span class="wg-t">${highlightKeyword(s.title, songLibSearchKeyword)}</span>${s.teach ? '<span class="wg-tc">教歌</span>' : ''}</button>`
  ).join('')}</div>` : '';
  return `<section class="song-lib-weekcard${w.key === w.curKey ? ' current' : ''}">
    <div class="song-lib-weekhead">
      <div class="song-lib-weekhead-l"><span class="song-lib-weektitle">${title}</span><span class="song-lib-weekdate">${d.getMonth()+1}月${d.getDate()}日</span><span class="song-lib-weekcount">· ${w.items.length} 首</span></div>
      <span class="song-lib-weekhead-r">${w.extraHead || ''}</span>
    </div>
    ${w.leadHtml || ''}
    ${asGrid ? gridHtml : teachHtml + `<div class="song-lib-weekrow">${items}</div>`}
  </section>`;
}
// 点谱图：以这一周的全部歌谱为列表打开大图查看器
function songLibWeekLbList(key){
  return (songData[key] || []).filter(s => s && s.src).map(e => Object.assign({}, e, { markOwner: e }));   // 只读：显示标记，不能改
}
function songLibRecentOpenImage(key, i){
  const raw = songData[key] || [];
  const list = songLibWeekLbList(key);
  openLightboxWithList(list, Math.max(0, list.findIndex(x => x.markOwner === raw[i])));
}
// 点歌名：诗歌库里有这首歌就打开详情
function songLibRecentOpenDetail(key, i){
  const s = (songData[key] || [])[i];
  const e = s && findSongLibEntryByTitle(s.title);
  if (e) openSongLibDetail(e.id);
  else if (s && s.src) songLibRecentOpenImage(key, i);
}
function songLibRenderRecent(grid, countEl){
  const weeks = songLibRecentWeeks();
  const total = weeks.reduce((n, w) => n + w.items.length, 0);
  const filtered = !!(songLibSearchKeyword || songLibCategoryFilter || songLibSongbookFilter || songLibTagFilter.length || songLibUsageFilter);
  countEl.textContent = filtered ? `找到 ${total} 首` : (songLibRecentFallback ? `本周还没选歌 · 先看上周 ${total} 首` : `本月 ${weeks.length} 周 · ${total} 首`);
  if (!weeks.length) {
    grid.className = 'song-lib-grid view-list';
    grid.innerHTML = `<div class="song-lib-empty"><i class="ti ${filtered ? 'ti-search-off' : 'ti-history'}"></i>${filtered ? '本月没有找到匹配的诗歌' : '本月还没有使用记录，排入每周诗歌后会显示在这里'}</div>` + songLibSearchCtaHtml();
    return;
  }
  grid.className = 'song-lib-grid view-recent';
  grid.innerHTML = weeks.map(songLibRecentCardHtml).join('') + songLibSearchCtaHtml();
}
function renderSongLibraryGrid(){
  songLibResetStatsCache();
  document.getElementById('songLibraryOverlay')?.classList.toggle('tab-books', songLibTab === 'books');
  if (songLibTab === 'books') { if (songLibSelMode) songLibBatchExit(); return; }   // 「诗歌本」标签有自己的页面（songLibBooksEnter）
  songLibBatchSyncBtn();
  const grid = document.getElementById('songLibGrid');
  const countEl = document.getElementById('songLibCount');
  const overlayEl = document.getElementById('songLibraryOverlay');
  songLibRenderWeekCard();
  try { songLibUpdateStaleHint(); } catch (e) { slDiag(e, 'songLibUpdateStaleHint'); }
  if (songLibSkelOn) { songLibRenderSkeleton(); return; }   // 骨架还没结束时，云端数据回来也先不刷新
  if (overlayEl) { overlayEl.classList.toggle('tab-recent', songLibTab === 'recent'); overlayEl.classList.toggle('tab-playlist', songLibTab === 'playlist'); }
  _slWeekIdSet = null;
  if (songLibTab === 'recent') { songLibRenderRecent(grid, countEl); return; }
  const list = getFilteredSongLibrary();
  const filtered = !!(songLibSearchKeyword || songLibCategoryFilter || songLibSongbookFilter || songLibTagFilter.length || songLibUsageFilter);
  if (songLibTab === 'favorite') {
    countEl.textContent = filtered ? `找到 ${list.length} 首` : `共收藏 ${list.length} 首`;
  } else if (songLibTab === 'playlist') {
    const pl = songLibPlaylistSongs();
    const hn = typeof hymnPlaylistCount === 'function' ? hymnPlaylistCount() : 0;
    const baseTxt = filtered ? `找到 ${list.length} 首` : (pl.week.length ? `本周 ${pl.week.length} 首` + (pl.mine.length ? ` · 我加入的 ${pl.mine.length} 首` : '') : `共 ${list.length} 首`);
    countEl.textContent = hn ? (list.length ? baseTxt + ' · ' : '') + `诗歌本音乐 ${hn} 首` : baseTxt;
  } else if (songLibTab === 'recent') {
    countEl.textContent = filtered ? `找到 ${list.length} 首` : `最近使用 ${list.length} 首`;
  } else {
    if (songLibSortKey === 'count' && !filtered) {
      const scopeTxt = songLibCountScope === 'all' ? '历史' : new Date().getFullYear() + ' 年度';
      countEl.textContent = `${scopeTxt}使用排行 · ${songLibRankMap().size} 首上榜`;
    } else countEl.textContent = filtered ? `找到 ${list.length} 首` : `共收录 ${songLibrary.length} 首诗歌`;
  }
  if (songLibSearchKeyword && list.length) countEl.textContent += songLibCountBreakdown(list);
  if (!list.length && !(songLibTab === 'playlist' && typeof hymnPlaylistCount === 'function' && hymnPlaylistCount())) {   // 歌单里只有诗歌本音乐时，也不算空
    let emptyIcon = filtered ? 'ti-search-off' : 'ti-music-off';
    let emptyMsg = filtered ? '没有找到匹配的诗歌' : '歌单库还是空的，上传诗歌后会自动收录';
    if (songLibSearchKeyword && songLibSearchMode === 'lib' && songLibScope !== 'all') {
      const lbl = { title: '歌名', lyrics: '歌词', tag: '标签' }[songLibScope];
      const short = songLibScope === 'lyrics' && songLibSearchTokens(songLibSearchKeyword).every(t => t.n.length < 2);
      emptyMsg = short ? '搜歌词请至少输入 2 个字' : `没有找到匹配的诗歌<br><small style="color:var(--text-4)">当前只搜「${lbl}」，点搜索框左边的按钮可改回「全部」</small>`;
    }
    if (!filtered && songLibTab === 'playlist') { emptyIcon = 'ti-playlist'; emptyMsg = '本周还没有选歌。选好后，本周的歌会自动出现在这里；也可以在歌曲详情页点「加入歌单」自己添加'; }
    if (!filtered && songLibTab === 'favorite') { emptyIcon = 'ti-heart'; emptyMsg = '还没有收藏任何诗歌，点击♡即可收藏'; }
    if (!filtered && songLibTab === 'recent') { emptyIcon = 'ti-history'; emptyMsg = '还没有播放记录，播放过的诗歌会显示在这里'; }
    grid.className = 'song-lib-grid view-list';
    grid.innerHTML = `<div class="song-lib-empty"><i class="ti ${emptyIcon}"></i>${emptyMsg}</div>` + songLibSearchCtaHtml();
    return;
  }
  if (songLibTab === 'playlist') { grid.className = 'song-lib-grid view-playlist'; grid.innerHTML = songLibPlaylistListHtml(list); songLibSyncPlaylistRows(); return; }
  if (songLibViewMode === 'waterfall') { grid.className = 'song-lib-grid view-wf'; songLibRenderWaterfall(grid, list); return; }
  grid.className = 'song-lib-grid view-list';
  grid.innerHTML = list.map((s,i) => {
    const firstSrc = s.keys[0]?.src || '';
    const thumb = firstSrc
      ? `<img src="${firstSrc}" alt="${escapeHtml(s.title)}" loading="lazy" onclick="event.stopPropagation();openLightboxFromLibraryGrid(${i})"><div class="song-lib-zoom-hint" onclick="event.stopPropagation();openLightboxFromLibraryGrid(${i})"><i class="ti ti-maximize"></i></div>`
      : `<i class="ti ti-photo"></i>`;
    const d = new Date(s.createdAt);
    const dateLabel = isNaN(d) ? '' : `${songLibBrDate(d)}收录`;
    const metaParts = [];
    const usedHtml = songLibUsedHtml(s, 'list');
    if (usedHtml) metaParts.push(usedHtml);
    if (dateLabel) metaParts.push(dateLabel);
    const meta = metaParts.length
      ? metaParts.join('<span class="ulib-dot"> · </span>')
      : '<span style="color:#ccc">暂无使用记录</span>';
    const badges = [];
    { const pb = songLibPlaylistBadgeHtml(s); if (pb) badges.push(pb); }
    if (s.category) badges.push(`<span class="song-lib-category-badge">${highlightKeyword(s.category, songLibSearchKeyword)}</span>`);
    if (s.keys.length > 1) badges.push(`<span class="song-lib-key-count-badge">${s.keys.length}个调</span>`);
    const sourceParts = [];
    if (s.band) sourceParts.push(`<i class="ti ti-users"></i>${highlightKeyword(s.band, songLibSearchKeyword)}`);
    const sourceLine = sourceParts.length
      ? `<div class="song-lib-card-source">${sourceParts.join('<span class="ulib-dot"> · </span>')}</div>`
      : '';
    const safeTitle=escapeHtml(s.title).replace(/'/g,"\\'");
    const isFav = isSongLibFavorite(s.id);
    return `<div class="song-lib-card${songLibSel.has(s.id) ? ' sel' : ''}" data-sid="${s.id}" onclick="openSongLibDetail('${s.id}')">
      <span class="song-lib-selmark"><i class="ti ti-check"></i></span>
      ${songLibRankBadge(s, 'list')}
      <div class="song-lib-card-thumb${firstSrc?' has-img':''}">${thumb}</div>
      <div class="song-lib-card-info">
        <div class="song-lib-card-title-row"><div class="song-lib-card-title">${highlightKeyword(s.title, songLibSearchKeyword)}</div>${badges.join('')}</div>
        ${sourceLine}
        ${(s.tags && s.tags.length) ? `<div class="song-lib-card-tags">${songLibTagPillsHtml(s, 'song-lib-tagpill', 3, true)}</div>` : ''}
        ${songLibLyHitHtml(s)}
        <div class="song-lib-card-meta">${meta}</div>
      </div>
      <div class="song-lib-card-actions">
        <button class="song-lib-card-play-btn${getAudioLinksForTitle(s.title).length ? '' : ' no-audio'}" data-title="${escapeHtml(s.title)}" onclick="event.stopPropagation();quickPlaySongAudio('${safeTitle}')" title="列表播放"><i class="ti ti-player-play"></i></button>
        <button class="song-lib-card-fav-btn${isFav?' active':''}" onclick="event.stopPropagation();toggleSongLibFavorite('${s.id}')" title="${isFav?'取消收藏':'收藏'}"><i class="ti ${isFav?'ti-heart-filled':'ti-heart'}"></i></button>
      </div>
    </div>`;
  }).join('') + songLibSearchCtaHtml();
}

let songLibViewMode = 'waterfall';

const songLibThumbRatios = {};

let songLibResizeBound = false, songLibResizeT = 0;

function updateSongLibViewSwitch(){
  document.querySelectorAll('#songLibViewSwitch button').forEach(b => b.classList.toggle('active', b.dataset.view === songLibViewMode));
}

function setSongLibViewMode(mode){
  songLibViewMode = mode === 'list' ? 'list' : 'waterfall';
  try { localStorage.setItem('songLibViewMode', songLibViewMode); } catch (e) { slDiag(e, 'setSongLibViewMode'); }
  updateSongLibViewSwitch();
  if (songLibSearchMode === 'ds') { if (songLibDsRows.length) songLibDsRender(0); }
  else renderSongLibraryGrid();
}

function songLibWfCols(host){
  const w = host.clientWidth || window.innerWidth || 390;
  return w >= 1100 ? 4 : w >= 700 ? 3 : 2;
}

function songLibWfEnsure(host){
  const n = songLibWfCols(host);
  let wf = host.querySelector(':scope > .song-lib-wf');
  if (!wf || wf.children.length !== n) {
    if (wf) wf.remove();
    wf = document.createElement('div');
    wf.className = 'song-lib-wf';
    for (let k = 0; k < n; k++) { const c = document.createElement('div'); c.className = 'song-lib-wcol'; c.dataset.h = '0'; wf.appendChild(c); }
    host.insertBefore(wf, host.firstChild);
  }
  return wf;
}

function songLibWfAppend(wf, html, est){
  let col = wf.children[0];
  for (const c of wf.children) if (Number(c.dataset.h) < Number(col.dataset.h)) col = c;
  col.insertAdjacentHTML('beforeend', html);
  col.dataset.h = String(Number(col.dataset.h) + est);
}

function songLibNoteRatio(img, id){
  const el = img.parentNode;
  if (img.naturalWidth && img.naturalHeight) songLibThumbRatios[id] = img.naturalWidth / img.naturalHeight;
  if (el) el.classList.add('loaded');
}

function songLibWCardHtml(s, i){
  const firstSrc = s.keys[0]?.src || '';
  const ratio = songLibThumbRatios[s.id];
  const style = ratio ? ` style="aspect-ratio:${ratio.toFixed(4)}"` : '';
  const thumb = firstSrc
    ? `<div class="song-lib-wthumb has-img"${style}><img src="${firstSrc}" alt="${escapeHtml(s.title)}" loading="lazy" decoding="async" onload="songLibNoteRatio(this,'${s.id}')" onclick="event.stopPropagation();openLightboxFromLibraryGrid(${i})">${s.keys.length > 1 ? `<span class="song-lib-wthumb-badge">${s.keys.length}个调</span>` : ''}</div>`
    : `<div class="song-lib-wthumb noimg"><i class="ti ti-photo"></i></div>`;
  const pills = [];
  { const pb = songLibPlaylistBadgeHtml(s); if (pb) pills.push(pb); }
  if (s.songbook) pills.push(`<span class="song-lib-wpill">${highlightKeyword(s.songbook, songLibSearchKeyword)}</span>`);
  pills.push(songLibStaleTagHtml(s));
  pills.push(songLibTagPillsHtml(s, 'song-lib-wpill tag', 3, true));
  if (s.category) pills.push(`<span class="song-lib-wpill plain">${highlightKeyword(s.category, songLibSearchKeyword)}</span>`);
  if (s.band) pills.push(`<span><i class="ti ti-users"></i> ${highlightKeyword(s.band, songLibSearchKeyword)}</span>`);
  const d = new Date(s.createdAt);
  const foot = songLibUsedHtml(s, 'wf') || (isNaN(d) ? '' : `${songLibBrDate(d)}收录`);
  const rankHtml = songLibRankBadge(s, 'wf');
  const safeTitle = escapeHtml(s.title).replace(/'/g,"\\'");
  const isFav = isSongLibFavorite(s.id);
  return `<div class="song-lib-wcard${rankHtml ? ' ranked' : ''}${songLibSel.has(s.id) ? ' sel' : ''}" data-sid="${s.id}" onclick="openSongLibDetail('${s.id}')">
    <span class="song-lib-selmark"><i class="ti ti-check"></i></span>
    ${rankHtml}${thumb}
    <div class="song-lib-winfo">
      <div class="song-lib-wtitle">${highlightKeyword(s.title, songLibSearchKeyword)}</div>
      ${pills.length ? `<div class="song-lib-wmeta">${pills.join('')}</div>` : ''}
      ${songLibLyHitHtml(s)}
      <div class="song-lib-wfoot">
        <span class="song-lib-wfoot-txt">${foot}</span>
        <div class="song-lib-wfoot-btns">
          <button class="song-lib-card-play-btn${getAudioLinksForTitle(s.title).length ? '' : ' no-audio'}" data-title="${escapeHtml(s.title)}" onclick="event.stopPropagation();quickPlaySongAudio('${safeTitle}')" title="列表播放"><i class="ti ti-player-play"></i></button>
          <button class="song-lib-card-fav-btn${isFav ? ' active' : ''}" onclick="event.stopPropagation();toggleSongLibFavorite('${s.id}')" title="${isFav ? '取消收藏' : '收藏'}"><i class="ti ${isFav ? 'ti-heart-filled' : 'ti-heart'}"></i></button>
        </div>
      </div>
    </div>
  </div>`;
}

function songLibRenderWaterfall(grid, list){
  grid.innerHTML = '';
  const wf = songLibWfEnsure(grid);
  list.forEach((s, i) => {
    const r = songLibThumbRatios[s.id] || (s.keys[0]?.src ? 0.75 : 1.8);
    songLibWfAppend(wf, songLibWCardHtml(s, i), 100 / r + 90);
  });
  grid.insertAdjacentHTML('beforeend', songLibSearchCtaHtml());
}

function songLibOnResize(){
  clearTimeout(songLibResizeT);
  songLibResizeT = setTimeout(() => {
    if (songLibViewMode !== 'waterfall') return;
    if (songLibTab === 'books') { const h = document.getElementById('songLibBkSongs'); const w = h && h.querySelector(':scope > .song-lib-wf'); if (w && w.children.length !== songLibWfCols(h) && songLibDsRows.length) songLibDsRender(0, 'songLibBkSongs'); return; }
    const overlay = document.getElementById('songLibraryOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    const ds = songLibSearchMode === 'ds';
    const host = document.getElementById(ds ? 'songLibDsList' : 'songLibGrid');
    const wf = host && host.querySelector(':scope > .song-lib-wf');
    if (!wf || wf.children.length === songLibWfCols(host)) return;
    if (ds) { if (songLibDsRows.length) songLibDsRender(0); } else renderSongLibraryGrid();
  }, 150);
}

function songLibSearchCtaHtml(){
  if (!songLibSearchKeyword || songLibTab !== 'all') return '';
  return `<button class="song-lib-search-cta" onclick="setSongLibSearchMode('ds')"><i class="ti ti-world-search"></i>没找到想要的？用「专属搜索」去诗歌本 / 赞美网搜「${escapeHtml(songLibSearchKeyword)}」</button>`;
}

const SONGLIB_DS_DEFAULTS = {
  apiBase: 'https://12180.net:8819/api',               // 诗歌本接口
  imageApiBase: 'https://23.400400.icu:9003/api',      // 诗歌本歌谱图片接口
  azmBase: 'https://azmapi.djshgzs233.workers.dev/',   // 赞美网接口
};

function songLibDsCfg(){
  let o = {};
  try { o = JSON.parse(localStorage.getItem('songLibDsCfg') || '{}') || {}; } catch (e) { slDiag(e, 'songLibDsCfg'); }
  return Object.assign({}, SONGLIB_DS_DEFAULTS, o);
}

const SONGLIB_DS_APP_ID = 'hymnweb';

const SONGLIB_DS_APP_SECRET = 'jAZf5lkMJ4aKG6';

const SONGLIB_DS_APP_VER = '26.10.9';

const SONGLIB_DS_KEY_LOCAL_ID = 'HymnDeviceId';

const SONGLIB_DS_F_C = 'hymn2026ka9f';

const SONGLIB_DS_D_C = 'zx7Qv2pwm3';

const SONGLIB_DS_AZM_PS = 10;

const SONGLIB_DS_BOOK_FALLBACK = { 172:'灵栖清泉', 218:'灵栖清泉2', 138:'挖晒谱', 223:'和弦简谱', 47:'赞美之泉', 77:'生命诗歌', 12:'迦南诗选', 2:'补充本' };

const SONGLIB_DS_BOOKS_KEY = 'HymnBooks.v1';

let songLibDeviceSignId = '';

let songLibDeviceSignSecret = '';

let songLibSearchMode = 'lib';

let songLibDsSource = 'all';
try { const v = localStorage.getItem('songLibDsSource'); if (v === 'all' || v === 'hymn' || v === 'azm') songLibDsSource = v; } catch (e) { slDiag(e, 'songLibDsSource'); }

// 库内搜索范围：all 全部 | title 歌名 | lyrics 歌词 | tag 标签。只对「诗歌库」来源生效，不存本地（刷新后回到「全部」）
let songLibScope = 'all';
let songLibMatchInfo = null;   // Map<歌曲 id, 命中信息>，由 getFilteredSongLibrary 在有关键词时生成，卡片用它显示歌词片段 / 标签高亮

let songLibDsBookId = null;

let songLibDsRows = [];

let songLibDsGen = 0;

let songLibDsAzm = { q: '', page: 1, done: true, loading: false };

let songLibDsObserver = null;

function songLibDsHasCrypto(){ return typeof CryptoJS !== 'undefined'; }

function songLibDsRandomHex(bytes){
  const b = new Uint8Array(bytes);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function songLibDsLocalDeviceId(){
  let id = '';
  try { id = localStorage.getItem(SONGLIB_DS_KEY_LOCAL_ID) || ''; } catch (e) { slDiag(e, 'songLibDsLocalDeviceId'); }
  if (!id) { id = songLibDsRandomHex(8); try { localStorage.setItem(SONGLIB_DS_KEY_LOCAL_ID, id); } catch (e) { slDiag(e, 'songLibDsLocalDeviceId'); } }
  return id;
}

function songLibDsDeriveDeviceKey(id){
  let scrambled = '';
  for (let i = 1; i < id.length; i += 2) scrambled += id[i];
  for (let i = 0; i < id.length; i += 2) scrambled += id[i];
  const hash = CryptoJS.SHA256(SONGLIB_DS_F_C + scrambled + SONGLIB_DS_D_C);
  return CryptoJS.lib.WordArray.create(hash.words.slice(0, 4), 16);
}

function songLibDsDecryptDeviceSecret(id, encrypted){
  try {
    const b64 = CryptoJS.enc.Base64.parse(encrypted);
    if (b64.sigBytes <= 16) return '';
    const iv = CryptoJS.lib.WordArray.create(b64.words.slice(0, 4), 16);
    const ct = CryptoJS.lib.WordArray.create(b64.words.slice(4), b64.sigBytes - 16);
    return CryptoJS.AES.decrypt({ ciphertext: ct }, songLibDsDeriveDeviceKey(id), { iv }).toString(CryptoJS.enc.Utf8);
  } catch (e) { return ''; }
}

function songLibDsAuthHeaders(){
  const h = {};
  if (!songLibDsHasCrypto()) return h;
  const ts = String(Date.now());
  h.appid = SONGLIB_DS_APP_ID;
  h.timestamp = ts;
  h.token = CryptoJS.MD5(SONGLIB_DS_APP_ID + SONGLIB_DS_APP_SECRET + ts).toString();
  // 与专属搜索页共用登录态（如果在那边填过 loginName / token）
  let loginName = '', authToken = '';
  try { loginName = (JSON.parse(localStorage.getItem('HymnSettings.v1') || '{}').loginName || '').trim(); } catch (e) { slDiag(e, 'songLibDsAuthHeaders'); }
  try { authToken = (sessionStorage.getItem('HymnToken') || '').trim(); } catch (e) { slDiag(e, 'songLibDsAuthHeaders'); }
  if (loginName) h.loginName = loginName;
  if (loginName && authToken) h.Authorization = 'Bearer ' + authToken;
  return h;
}

function songLibDsDeviceSignHeaders(){
  if (!songLibDeviceSignId || !songLibDsHasCrypto()) return {};
  const h = { 'X-Device-Id': songLibDeviceSignId };
  if (!songLibDeviceSignSecret) return h;
  const ts = String(Date.now());
  const nonce = songLibDsRandomHex(16);
  h['X-Device-Timestamp'] = ts;
  h['X-Device-Nonce'] = nonce;
  h['X-Device-Sign'] = CryptoJS.HmacSHA256(songLibDeviceSignId + ts + nonce, songLibDeviceSignSecret).toString(CryptoJS.enc.Hex);
  return h;
}

function songLibDsMakeHeaders(){ return Object.assign({}, songLibDsAuthHeaders(), songLibDsDeviceSignHeaders()); }

function songLibDsDetectOS(){
  const ua = navigator.userAgent;
  return /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'web';
}

let songLibDsLastRegErr = '';

async function songLibDsRegisterDevice(attempt = 0){
  if (attempt === 0) {
    songLibDsLastRegErr = '';
    let until = 0; try { until = Number(localStorage.getItem('HymnRegCool') || 0); } catch (e) { slDiag(e, 'songLibDsRegisterDevice'); }
    if (until > Date.now()) { songLibDsLastRegErr = `设备注册过于频繁，已暂停，请约 ${Math.ceil((until - Date.now()) / 60000)} 分钟后再试`; return null; }
  }
  if (!songLibDsHasCrypto()) return null;
  const base = songLibDsCfg().apiBase.trim().replace(/\/+$/, '');
  if (!base) return null;
  const body = { DeviceId: songLibDsLocalDeviceId(), AppName: '诗歌本Web', Ver: SONGLIB_DS_APP_VER, OS: songLibDsDetectOS() };
  try {
    const res = await fetch(base + '/statistics/v2', {
      method: 'POST',
      headers: Object.assign({}, songLibDsAuthHeaders(), { 'Content-Type': 'application/json; charset=utf-8' }),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(data && (data.msg || data.message)) || text}`);
    if (data.msg) throw new Error(data.msg);
    const r = data.result;
    if (!r || typeof r !== 'object') throw new Error('注册响应结构异常');
    const status = (r.deviceStatus ?? '').toString();
    if (status === 'unknown') {
      if (attempt >= 2) { songLibDsLastRegErr = '服务器多次返回设备状态 unknown'; return null; }
      songLibDeviceSignId = ''; songLibDeviceSignSecret = '';
      return songLibDsRegisterDevice(attempt + 1);
    }
    if (status !== 'ok') { songLibDsLastRegErr = '服务器返回设备状态：' + (status || '空'); return null; }
    const newId = (r.deviceId ?? '').toString();
    if (!newId) throw new Error('响应缺少 deviceId');
    songLibDeviceSignSecret = songLibDsDecryptDeviceSecret(newId, (r.deviceSecret ?? '').toString());
    songLibDeviceSignId = newId;
    return { deviceId: newId };
  } catch (err) {
    console.error('[songLibDsRegisterDevice]', err);
    songLibDsLastRegErr = (err && err.message) || String(err);
    if (/频繁|too\s*many|rate/i.test(songLibDsLastRegErr)) { try { localStorage.setItem('HymnRegCool', String(Date.now() + 10 * 60 * 1000)); } catch (e) { slDiag(e, 'songLibDsRegisterDevice'); } }
    return null;
  }
}

const songLibDsQueue = [];

let songLibDsActive = 0;

function songLibDsEnqueue(fn){
  return new Promise((resolve, reject) => { songLibDsQueue.push({ fn, resolve, reject }); songLibDsPump(); });
}

function songLibDsPump(){
  while (songLibDsActive < 4 && songLibDsQueue.length) {
    const t = songLibDsQueue.shift(); songLibDsActive++;
    t.fn().then(t.resolve, t.reject).finally(() => { songLibDsActive--; songLibDsPump(); });
  }
}

const songLibDsTicketCache = new Map();

const songLibDsTicketInflight = new Map();

function songLibDsExtractTicket(payload){
  if (payload?.result?.ticket) return payload.result;
  if (payload?.data?.ticket) return payload.data;
  if (payload?.ticket) return payload;
  return null;
}

async function songLibDsRequestImageUrl(id){
  const base = songLibDsCfg().imageApiBase.trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置诗歌本图片接口地址');
  if (!songLibDsHasCrypto()) throw new Error('CryptoJS 未加载，无法签名请求');
  if (!songLibDeviceSignId) await songLibDsRegisterDevice();
  const url = new URL(base + '/download/ticket');
  url.searchParams.set('id', String(id));
  url.searchParams.set('type', 'image');
  let res;
  try { res = await fetch(url.toString(), { headers: songLibDsMakeHeaders() }); }
  catch (e) { throw new Error('无法读取票据接口（跨域或网络不可达）'); }
  const raw = await res.text();
  let payload; try { payload = JSON.parse(raw); } catch (e) { payload = { raw }; }
  if (!res.ok) throw new Error('获取凭证失败 HTTP ' + res.status + '：' + (payload.msg || payload.message || raw).toString().slice(0, 120));
  if (payload?.msg) throw new Error(payload.msg);
  const t = songLibDsExtractTicket(payload);
  if (!t || !t.ticket || t.expires == null) throw new Error('响应中未找到 ticket / expires');
  const u = new URL(base + '/download/image');
  u.searchParams.set('id', String(id));
  u.searchParams.set('expires', String(t.expires));
  u.searchParams.set('ticket', String(t.ticket));
  return { url: u.toString(), expires: Number(t.expires) };
}

function songLibDsGetImageUrl(id, force = false){
  const c = songLibDsTicketCache.get(id);
  if (!force && c && c.expires * 1000 > Date.now() + 60000) return Promise.resolve(c.url);
  if (!force && songLibDsTicketInflight.has(id)) return songLibDsTicketInflight.get(id);
  const p = songLibDsEnqueue(() => songLibDsRequestImageUrl(id))
    .then(r => { songLibDsTicketCache.set(id, r); return r.url; })
    .finally(() => songLibDsTicketInflight.delete(id));
  songLibDsTicketInflight.set(id, p);
  return p;
}

function songLibDsNormBook(x){ return String(x || '').replace(/[《》\s()（）]/g, '').replace(/硒/g, '晒').toLowerCase(); }

function songLibDsBooks(){
  let learned = {};
  try { const t = JSON.parse(localStorage.getItem(SONGLIB_DS_BOOKS_KEY) || '{}'); if (t && typeof t === 'object') learned = t; } catch (e) { slDiag(e, 'songLibDsBooks'); }
  const m = Object.assign({}, learned, SONGLIB_DS_BOOK_FALLBACK);
  const first = [172, 218, 138, 223, 47, 77, 12, 2];   // 常用歌本固定排在前面，其余「学到」的按 ID 排
  const ids = Object.keys(m).map(Number).filter(id => id > 0 && m[id]);
  ids.sort((a, b) => { const x = first.indexOf(a), y = first.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a - b; });
  return ids.map(id => ({ id, name: m[id] }));
}

function songLibDsLearnBooks(rows){
  let learned = {}, changed = false;
  try { const t = JSON.parse(localStorage.getItem(SONGLIB_DS_BOOKS_KEY) || '{}'); if (t && typeof t === 'object') learned = t; } catch (e) { slDiag(e, 'songLibDsLearnBooks'); }
  (rows || []).forEach(r => {
    const id = r.bookId ?? r.bookID ?? r.songbookId ?? r.mSongbookId;
    const nm = String(r.bookName || r.songbookName || r.mSongbook || r.songbook || '').replace(/[《》]/g, '').trim();
    if (id != null && id !== '' && Number(id) > 0 && nm && learned[id] !== nm) { learned[id] = nm; changed = true; }
  });
  if (changed) { try { localStorage.setItem(SONGLIB_DS_BOOKS_KEY, JSON.stringify(learned)); } catch (e) { slDiag(e, 'songLibDsLearnBooks'); } }
}

async function songLibDsHymnGet(url){
  url.searchParams.set('take', '100');
  const res = await fetch(url.toString(), { method: 'GET', headers: songLibDsMakeHeaders() });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  return { res, text, data };
}

function songLibDsNormalizeRows(payload){
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.result)) return payload.result;
  if (payload && payload.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

const songLibDsHymnCache = new Map();   // key: 关键词|歌本ID → { t, rows }
let songLibDsBookByName = false;
async function songLibDsFetchHymn(keyword){
  const base = songLibDsCfg().apiBase.trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置诗歌本接口地址');
  const bookId = songLibDsSource === 'hymn' && songLibDsBookId ? songLibDsBookId : 0;
  const ckey = keyword + '|' + bookId, hit = songLibDsHymnCache.get(ckey);   // 同一关键词 + 歌本 5 分钟内不重复请求（来回切换歌本 / 重新搜索更快）
  if (hit && Date.now() - hit.t < 300000) return hit.rows.map(x => Object.assign({}, x));
  const skipId = bookId > 0 && songLibDsBookByName;   // 这台设备上接口已经拒绝过按歌本 ID 查：直接 bookId=0 + 按歌本名过滤，省掉一次必败的请求
  const url = new URL(base + '/image/searchByName');
  url.searchParams.set('key', keyword);
  url.searchParams.set('bookId', skipId ? '0' : String(bookId));
  url.searchParams.set('musicType', '0');
  if (!songLibDeviceSignId) await songLibDsRegisterDevice();
  let r;
  try { r = await songLibDsHymnGet(url); }
  catch (e) { throw new Error('无法连接（跨域限制或网络不可达）'); }
  const bad = x => !x.res.ok || (x.data && x.data.msg && !Array.isArray(x.data));
  let byName = skipId;
  // 按歌本 ID 被接口拒绝：退回 bookId=0，再按歌本名在结果里过滤
  if (bookId > 0 && !skipId && bad(r)) {
    url.searchParams.set('bookId', '0'); byName = true;
    r = await songLibDsHymnGet(url);
    if (r.res.ok) songLibDsBookByName = true;
  }
  if (!r.res.ok) throw new Error(`HTTP ${r.res.status}：${r.data.msg || r.data.message || r.text.slice(0, 100)}`);
  if (r.data && r.data.msg && !Array.isArray(r.data)) throw new Error(r.data.msg);
  let rows = songLibDsNormalizeRows(r.data).map(x => Object.assign({ _src: 'hymn' }, x));
  songLibDsLearnBooks(rows);
  if (byName) {
    const want = songLibDsNormBook((songLibDsBooks().find(b => b.id === songLibDsBookId) || {}).name);
    if (want) rows = rows.filter(x => songLibDsNormBook(x.bookName || x.songbookName || x.mSongbook || x.songbook) === want);
  }
  if (songLibDsHymnCache.size >= 30) songLibDsHymnCache.delete(songLibDsHymnCache.keys().next().value);
  songLibDsHymnCache.set(ckey, { t: Date.now(), rows: rows.map(x => Object.assign({}, x)) });
  return rows;
}

function songLibDsExtractImgUrls(o){
  if (!o || typeof o !== 'object') return [];
  let arr = o.images || o.imgs || o.pictures || o.image_list;
  if (!Array.isArray(arr)) arr = [o.image || o.image_url || o.img_url || o.direct_url].filter(Boolean);
  return arr.map(m => typeof m === 'string' ? m : (m && (m.direct_url || m.url || m.src))).filter(Boolean);
}

function songLibDsNormalizeAzm(it){
  const imgs = songLibDsExtractImgUrls(it);
  return { _src: 'azm', id: Number(it.mTabId || it.tab_id || it.score_id || it.sheet_id || it.id) || 0,
    name: it.mTitle || it.mTabName || it.title || it.name || '',
    bookName: (it.mSongbook || it.songbook || '').replace(/[《》]/g, ''), artist: it.mArtistName || it.artist || '', category: it.mTags || it.tags || '',
    images: imgs.length ? imgs : undefined,   // undefined = 尚未加载图片，需要时按 id 取
    detailUrl: it.detail_url || it.score_url || it.song_url || it.url || '', tabName: it.mTabName || (it.score_id ? (it.title || '') : ''),
    key: it.mKey || it.key || it.tone || '', date: it.time_signature || '' };
}

function songLibDsAzmUrl(path, params){
  const u = new URL(songLibDsCfg().azmBase.trim());
  if (path) u.pathname = u.pathname.replace(/\/+$/, '') + path;
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

async function songLibDsAzmGet(url){
  let res;
  try { res = await fetch(url); }
  catch (e) { throw new Error('无法读取接口响应（网络不可达或接口未开启 CORS）'); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok || data.success === false) throw new Error(`HTTP ${res.status}：${data.msg || data.message || data.error || text.slice(0, 150)}`);
  return data;
}

function songLibDsPickArr(o, keys){ for (const k of keys) { if (o && Array.isArray(o[k])) return o[k]; } return null; }

function songLibDsFlattenAzm(list, parent){
  const out = [];
  for (const it of list || []) {
    if (!it || typeof it !== 'object') continue;
    const sub = songLibDsPickArr(it, ['scores', 'sheets', 'items']);
    if (sub && !it.mTabId) {
      if (sub.length) { out.push(...songLibDsFlattenAzm(sub, it)); }
      else if (it.song_id || it.id) {   // 该歌曲暂无歌谱：保留卡片，提供原页链接
        const nm = it.mTitle || it.title || it.name || '';
        if (nm) out.push({ _src: 'azm', id: 0, _sid: String(it.song_id || it.id), name: nm, images: [], detailUrl: it.song_url || it.detail_url || '', _noScore: true });
      }
      continue;
    }
    const r = songLibDsNormalizeAzm(it);
    if (!r.name && parent) r.name = parent.mTitle || parent.title || parent.name || '';
    if (!r.detailUrl && parent) r.detailUrl = parent.song_url || parent.detail_url || '';
    if (!r.id) continue;
    out.push(r);
  }
  return out;
}

function songLibDsExtractAzmRows(data){
  for (const o of [data, data && data.data, data && data.result]) {
    if (!o || typeof o !== 'object') continue;
    const list = Array.isArray(o) ? o : songLibDsPickArr(o, ['items', 'scores', 'sheets', 'list', 'results', 'records', 'songs']);
    if (list && list.length) return songLibDsFlattenAzm(list);
  }
  return [];
}

const songLibDsNumOf = (...v) => { for (const x of v) { if (x == null || x === '') continue; const n = Number(x); if (Number.isFinite(n)) return n; } return null; };

function songLibDsEnsureAzmImages(r){
  if (r.images) return Promise.resolve(r.images);
  if (r._imgP) return r._imgP;
  r._imgP = songLibDsEnqueue(async () => {
    const data = await songLibDsAzmGet(songLibDsAzmUrl('', { id: r.id }));
    const cands = [data.item, data.detail, data.data, data.result, Array.isArray(data.items) ? data.items[0] : null, data]
      .filter(o => o && typeof o === 'object' && !Array.isArray(o));
    let imgs = [], meta = null;
    for (const c of cands) { imgs = songLibDsExtractImgUrls(c); if (imgs.length) { meta = c; break; } }
    if (meta && !r.detailUrl) r.detailUrl = meta.detail_url || '';
    r.images = imgs;
    return imgs;
  }).catch(e => { r._imgP = null; throw e; });
  return r._imgP;
}

async function songLibDsFetchAzm(keyword, page){
  const data = await songLibDsAzmGet(songLibDsAzmUrl('', { q: keyword, page, page_size: SONGLIB_DS_AZM_PS, include_images: 0 }));
  const rows = songLibDsExtractAzmRows(data);
  const songsArr = Array.isArray(data.songs) ? data.songs : (data.data && Array.isArray(data.data.songs) ? data.data.songs : null);
  const respPs = songLibDsNumOf(data.page_size, data.data && data.data.page_size) || SONGLIB_DS_AZM_PS;
  const pg = data.pagination || (data.data && data.data.pagination) || {};
  const songTotal = songLibDsNumOf(data.total_pages, pg.total_pages, pg.totalPages, data.data && data.data.total_pages);
  const hm = data.has_more ?? pg.has_more;
  const songCount = songsArr ? songsArr.length : rows.length;
  const songMore = songTotal != null ? page < songTotal : (hm != null ? !!hm : songCount >= respPs);
  return { rows, done: rows.length === 0 || !songMore };
}

// 专属搜索模式下，视图切换按钮并到「全部 / 诗歌本 / 赞美网」同一行；切回诗歌库放回工具栏
function songLibPlaceViewSwitch(){
  const sw = document.getElementById('songLibViewSwitch');
  const row = document.getElementById('songLibDsSrcRow');
  const bar = document.getElementById('songLibToolbar');
  if (!sw || !row || !bar) return;
  const want = songLibSearchMode === 'ds' ? row : bar;
  if (sw.parentNode !== want) want.appendChild(sw);
}
function setSongLibSearchMode(mode){
  songLibSearchMode = mode === 'ds' ? 'ds' : 'lib';
  if (songLibSearchMode === 'ds') document.getElementById('dsPromo')?.classList.remove('dismissed');
  const page = document.getElementById('songLibraryOverlay');
  page.classList.toggle('ds-mode', songLibSearchMode === 'ds');
  songLibPlaceViewSwitch();
  document.querySelectorAll('#songLibDsSwitch button').forEach(b => b.classList.toggle('active', b.dataset.mode === songLibSearchMode));
  const input = document.getElementById('songLibSearchInput');
  slScopeSync();
  if (songLibSearchMode === 'ds') {
    renderSongLibDsChips();
    const kw = input.value.trim();
    if (kw && !songLibDsRows.length) songLibDsSearch();
    else if (!kw) songLibDsStatus('输入歌名后按回车或点「搜索」，在诗歌本、赞美网里找歌谱。');
    setTimeout(() => input.focus(), 50);
  } else {
    songLibSearchKeyword = input.value.trim();
    renderSongLibraryGrid();
  }
}

function onSongLibSearchKey(e){
  if (e.key === 'Enter') {
    songLibRecordSearch(e.target.value);
    if (songLibSearchMode === 'ds') { e.preventDefault(); songLibDsSearch(); }
    else { e.target.blur(); songLibAutoDsIfEmpty(); }   // 收起键盘和历史面板，直接看结果；库里没有就自动专属搜索
  }
}

// ── 搜索框里的「来源 / 范围」胶囊 ──────────────────────────────
const SL_SRC_LABEL = { lib: '诗歌库', all: '全部', hymn: '诗歌本', azm: '赞美网' };
const SL_FLD_LABEL = { all: '全部', title: '歌名', lyrics: '歌词', tag: '标签' };
const SL_FLD_PH = { all: '搜歌名、歌词、标签', title: '歌名或拼音首字母，如 qydn', lyrics: '输入歌词里的一句话', tag: '输入标签，如 敬拜' };
function slScopeCurSrc(){ return songLibSearchMode === 'ds' ? songLibDsSource : 'lib'; }
function slScopeSync(){
  const src = slScopeCurSrc(), lib = src === 'lib';
  const lbl = document.getElementById('slScopeLbl');
  if (lbl) lbl.textContent = SL_SRC_LABEL[src] + (lib && songLibScope !== 'all' ? '·' + SL_FLD_LABEL[songLibScope] : '');
  document.querySelectorAll('#slScopeMenu [data-src]').forEach(b => { const on = b.dataset.src === src; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  document.querySelectorAll('#slScopeMenu [data-fld]').forEach(b => { const on = b.dataset.fld === songLibScope; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  const input = document.getElementById('songLibSearchInput');
  if (input) input.placeholder = lib ? SL_FLD_PH[songLibScope] : '搜歌名，到诗歌本 / 赞美网找歌谱…';
}
function slScopeOpen(){
  const w = document.getElementById('songLibSearchWrap'); if (!w) return;
  document.getElementById('songLibSugg')?.classList.remove('show');
  w.classList.add('sl-scope-open');
  document.getElementById('slScopeBtn')?.setAttribute('aria-expanded', 'true');
}
function slScopeClose(){
  document.getElementById('songLibSearchWrap')?.classList.remove('sl-scope-open');
  document.getElementById('slScopeBtn')?.setAttribute('aria-expanded', 'false');
}
function slScopeToggle(e){
  if (e) e.stopPropagation();
  const w = document.getElementById('songLibSearchWrap');
  if (w && w.classList.contains('sl-scope-open')) slScopeClose(); else { slScopeSync(); slScopeOpen(); }
}
function slScopePickSrc(src){
  if (src === 'lib') { if (songLibSearchMode !== 'lib') setSongLibSearchMode('lib'); }
  else {
    if (songLibSearchMode === 'ds') setSongLibDsSource(src);
    else {
      if (songLibDsSource !== src) { songLibDsRows = []; songLibDsSource = src; try { localStorage.setItem('songLibDsSource', src); } catch (e) { slDiag(e, 'slScopePickSrc'); } }
      setSongLibSearchMode('ds');
    }
  }
  slScopeSync();
  slScopeClose();
}
function slScopePickFld(f){
  if (!SL_FLD_LABEL[f]) return;
  songLibScope = f;
  slScopeSync();
  if (songLibSearchMode === 'lib') renderSongLibraryGrid();   // 菜单不收起，方便接着改别的
}
document.addEventListener('pointerdown', e => {
  const w = document.getElementById('songLibSearchWrap');
  if (!w || !w.classList.contains('sl-scope-open')) return;
  if (e.target.closest && (e.target.closest('#slScopeMenu') || e.target.closest('#slScopeBtn'))) return;
  slScopeClose();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') slScopeClose(); });

function songLibDsStatus(msg){ const el = document.getElementById('songLibDsStatus'); if (el) el.textContent = msg || ''; }

function setSongLibDsSource(src){
  songLibDsSource = src;
  try { localStorage.setItem('songLibDsSource', src); } catch (e) { slDiag(e, 'setSongLibDsSource'); }
  renderSongLibDsChips();
  if (document.getElementById('songLibSearchInput').value.trim()) songLibDsSearch();
}

function setSongLibDsBook(id){
  songLibDsBookId = id ? Number(id) : null;
  renderSongLibDsChips();
  if (document.getElementById('songLibSearchInput').value.trim()) songLibDsSearch();
}

// ── 专属搜索 · 诗歌本来源：歌本只显示几个常用的，其余靠输入名称 / 编号查找 ──
const SL_BK_SHOWN = 4;
function slBkName(id){ const b = songLibDsBooks().find(x => x.id === id); return b ? b.name : ('歌本 ' + id); }
let slBkSugList = [];
function slBkMatches(q){
  const all = songLibDsBooks(), nq = songLibDsNormBook(q);
  if (!nq) return all.slice(0, 8).map(b => ({ id: b.id, label: b.name, sub: '编号 ' + b.id }));
  const hit = all.filter(b => songLibDsNormBook(b.name).includes(nq) || String(b.id) === nq || (/^\d+$/.test(nq) && String(b.id).startsWith(nq)));
  hit.sort((x, y) => (songLibDsNormBook(x.name).startsWith(nq) ? 0 : 1) - (songLibDsNormBook(y.name).startsWith(nq) ? 0 : 1));
  const out = hit.slice(0, 8).map(b => ({ id: b.id, label: b.name, sub: '编号 ' + b.id }));
  if (/^\d+$/.test(nq) && Number(nq) > 0 && !all.some(b => String(b.id) === nq)) out.push({ id: Number(nq), label: '按编号 ' + nq + ' 搜索', sub: '歌本列表里没有这个编号' });
  return out;
}
function slBkSuggest(){
  const inp = document.getElementById('slBkInput'), box = document.getElementById('slBkSug');
  if (!inp || !box) return;
  slBkSugList = slBkMatches(inp.value.trim());
  box.hidden = false;
  box.innerHTML = slBkSugList.length
    ? slBkSugList.map((m, i) => `<button type="button" class="sl-bk-opt" onclick="slBkPick(${m.id})"><span>${escapeHtml(m.label)}</span><small>${escapeHtml(m.sub)}</small></button>`).join('')
    : '<span class="sl-bk-none">没有匹配的歌本，可以直接输入编号</span>';
}
function slBkClose(){ const box = document.getElementById('slBkSug'); if (box) box.hidden = true; }
function slBkPick(id){
  const inp = document.getElementById('slBkInput'); if (inp) inp.value = '';
  slBkClose();
  setSongLibDsBook(id);
}
function slBkKey(e){
  if (e.key === 'Escape') { slBkClose(); e.target.blur(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (slBkSugList.length) slBkPick(slBkSugList[0].id); }
}
document.addEventListener('pointerdown', e => {
  const box = document.getElementById('slBkSug');
  if (box && !box.hidden && !(e.target.closest && e.target.closest('.sl-bk-find'))) slBkClose();
}, true);

function renderSongLibDsChips(){
  const src = [['all', '全部'], ['hymn', '诗歌本'], ['azm', '赞美网']];
  document.getElementById('songLibDsSources').innerHTML = src.map(([v, l]) =>
    `<button class="song-lib-ds-chip${songLibDsSource === v ? ' active' : ''}" onclick="setSongLibDsSource('${v}')">${l}</button>`).join('');
  const bk = document.getElementById('songLibDsBooks');
  if (songLibDsSource !== 'hymn') { bk.innerHTML = ''; bk.style.display = 'none'; return; }
  bk.style.display = '';
  // 只露出几个常用歌本（再加上当前选中的），其余的靠右边的输入框按名称 / 编号查找，不再一次摆出所有歌本
  const all = songLibDsBooks(), shown = all.slice(0, SL_BK_SHOWN).map(b => b.id);
  if (songLibDsBookId && !shown.includes(songLibDsBookId)) shown.push(songLibDsBookId);
  const chip = (id, label) => `<button type="button" class="song-lib-ds-chip small${(songLibDsBookId || 0) === id ? ' active' : ''}" onclick="setSongLibDsBook(${id})">${escapeHtml(label)}</button>`;
  bk.innerHTML = chip(0, '不限歌本') + shown.map(id => chip(id, slBkName(id))).join('') +
    `<span class="sl-bk-find"><i class="ti ti-search"></i><input id="slBkInput" type="text" inputmode="search" enterkeyhint="go" placeholder="输入歌本名或编号" autocomplete="off" aria-label="输入歌本名或编号" oninput="slBkSuggest()" onfocus="slBkSuggest()" onkeydown="slBkKey(event)"><span class="sl-bk-sug" id="slBkSug" hidden></span></span>`;
}

async function songLibDsSearch(){
  const keyword = document.getElementById('songLibSearchInput').value.trim();
  if (!keyword) { songLibDsStatus('请先输入歌名或关键词。'); return; }
  songLibRecordSearch(keyword);
  if (!songLibDsHasCrypto() && songLibDsSource !== 'azm') { songLibDsStatus('CryptoJS 未加载（网络问题），诗歌本接口暂不可用，可先用「赞美网」。'); }
  const gen = ++songLibDsGen;
  songLibDsQueue.length = 0;
  songLibDsRows = [];
  songLibDsAzm = { q: keyword, page: 1, done: true, loading: true };
  const list = document.getElementById('songLibDsList');
  list.innerHTML = '<div class="song-lib-ds-loading"><i class="ti ti-loader-2"></i>正在搜索…</div>';
  document.getElementById('songLibDsMore').hidden = true;
  songLibDsStatus('搜索中，请稍候…');
  const tasks = [];
  if (songLibDsSource === 'all' || songLibDsSource === 'hymn') tasks.push(['诗歌本', () => songLibDsFetchHymn(keyword)]);
  if (songLibDsSource === 'all' || songLibDsSource === 'azm') tasks.push(['赞美网', () => songLibDsFetchAzm(keyword, 1).then(r => { songLibDsAzm.done = r.done; return r.rows; })]);
  const summary = [], errors = [];
  let first = true;
  await Promise.all(tasks.map(async ([label, fn]) => {
    try {
      const rows = await fn();
      if (gen !== songLibDsGen) return;
      summary.push(`${label} ${rows.length}`);
      if (rows.length) {
        if (songLibDsSource === 'all') { rows[0]._groupLabel = label; rows[0]._groupCount = rows.length; }
        if (first) { list.innerHTML = ''; first = false; }
        const from = songLibDsRows.length;
        songLibDsRows = songLibDsRows.concat(rows);
        songLibDsRender(from);
      }
    } catch (e) { if (gen !== songLibDsGen) return; summary.push(`${label} ✕`); errors.push(`${label}：${e?.message || e}`); }
  }));
  if (gen !== songLibDsGen) return;
  songLibDsAzm.loading = false;
  if (!songLibDsRows.length) list.innerHTML = '<div class="song-lib-empty"><i class="ti ti-mood-empty"></i>没有找到结果，可尝试更短的歌名关键词</div>';
  document.getElementById('songLibDsMore').hidden = songLibDsAzm.done || !songLibDsRows.length || songLibDsSource === 'hymn';
  songLibDsStatus(summary.join(' · ') + (songLibDsRows.some(r => !r._noScore) ? ' · 点卡片上的 ＋ 可把歌谱加入诗歌库' : '') + (errors.length ? '\n' + errors.join('\n') : ''));
}

async function songLibDsLoadMore(){
  if (songLibDsAzm.loading || songLibDsAzm.done) return;
  const gen = songLibDsGen;
  songLibDsAzm.loading = true;
  const btn = document.getElementById('songLibDsMore');
  btn.disabled = true; btn.textContent = '加载中…';
  try {
    const page = songLibDsAzm.page + 1;
    const r = await songLibDsFetchAzm(songLibDsAzm.q, page);
    if (gen !== songLibDsGen) return;
    songLibDsAzm.page = page; songLibDsAzm.done = r.done;
    if (r.rows.length) {
      if (songLibDsSource === 'all') { r.rows[0]._groupLabel = '赞美网 · 第 ' + page + ' 页'; r.rows[0]._groupCount = r.rows.length; }
      const from = songLibDsRows.length;
      songLibDsRows = songLibDsRows.concat(r.rows);
      songLibDsRender(from);
    }
    btn.hidden = songLibDsAzm.done;
  } catch (e) { songLibDsStatus('错误：' + (e?.message || e)); }
  finally { songLibDsAzm.loading = false; btn.disabled = false; btn.textContent = '加载更多'; }
}

function songLibDsSongNo(r){ return (r.isAddendum ? '附' : '') + (r.no ?? '') + (r.multiTag || ''); }

function songLibDsAddBtnHtml(r, i){
  if (r._noScore) return '';
  const inLib = !!findDuplicateSongInLibrary(r.name || r.title);
  return `<button type="button" class="song-lib-card-play-btn ds-add-btn${inLib ? ' added' : ''}" onclick="event.stopPropagation();songLibDsAddToLib(${i})" title="${inLib ? '诗歌库里已有，点击可作为另一个谱加入' : '加入诗歌库'}"><i class="ti ${inLib ? 'ti-check' : 'ti-playlist-add'}"></i></button>`;
}

function songLibDsCardList(r, i){
  const name = r.name || r.title || '(未命名歌谱)';
  const no = songLibDsSongNo(r);
  const head = r._groupLabel ? `<div class="song-lib-ds-group">${escapeHtml(r._groupLabel)}${r._groupCount != null ? `<span>${r._groupCount} 条</span>` : ''}</div>` : '';
  const badge = `<span class="song-lib-ds-badge ${r._src}">${r._src === 'azm' ? '赞美网' : '诗歌本'}</span>`;
  const srcParts = [r.bookName, r.artist, r.key].filter(Boolean).map(x => escapeHtml(x));
  const metaParts = [];
  if (no) metaParts.push('编号 ' + escapeHtml(no));
  if (r.category) metaParts.push(escapeHtml(r.category));
  if (r.matched) metaParts.push('匹配 ' + escapeHtml(r.matched));
  const detail = r._src === 'azm' && r.detailUrl
    ? `<a class="song-lib-card-play-btn" href="${escapeHtml(r.detailUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="原页"><i class="ti ti-external-link"></i></a>` : '';
  return head + `<div class="song-lib-card song-lib-ds-card" data-i="${i}" onclick="songLibDsOpen(${i})">
    <div class="song-lib-card-thumb song-lib-ds-thumb" data-i="${i}"><i class="ti ti-photo"></i></div>
    <div class="song-lib-card-info">
      <div class="song-lib-card-title-row"><div class="song-lib-card-title">${escapeHtml(name)}</div>${badge}</div>
      ${srcParts.length ? `<div class="song-lib-card-source">${srcParts.join('<span class="ulib-dot"> · </span>')}</div>` : ''}
      <div class="song-lib-card-meta">${metaParts.length ? metaParts.join('<span class="ulib-dot"> · </span>') : (r._noScore ? '该歌曲暂无歌谱' : '点击查看歌谱')}</div>
    </div>
    <div class="song-lib-card-actions">${detail}${typeof hymnCardBtnsHtml === 'function' ? hymnCardBtnsHtml(r, i) : ''}${songLibDsAddBtnHtml(r, i)}<button class="song-lib-card-play-btn" onclick="event.stopPropagation();songLibDsOpen(${i})" title="查看歌谱"><i class="ti ti-zoom-in"></i></button></div>
  </div>`;
}

function songLibDsCardWf(r, i){
  const name = r.name || r.title || '(未命名歌谱)';
  const no = songLibDsSongNo(r);
  const pills = [];
  if (no) pills.push(`<span class="song-lib-wpill">编号 ${escapeHtml(no)}</span>`);
  if (r.bookName) pills.push(`<span class="song-lib-wpill plain">${escapeHtml(r.bookName)}</span>`);
  if (r.key) pills.push(`<span class="song-lib-wpill plain">${escapeHtml(r.key)}调</span>`);
  if (r.artist) pills.push(`<span><i class="ti ti-user"></i> ${escapeHtml(r.artist)}</span>`);
  if (r.category) pills.push(`<span>${escapeHtml(r.category)}</span>`);
  const detail = r._src === 'azm' && r.detailUrl
    ? `<a class="song-lib-card-play-btn" href="${escapeHtml(r.detailUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="原页"><i class="ti ti-external-link"></i></a>` : '';
  return `<div class="song-lib-wcard song-lib-ds-card" data-i="${i}" onclick="songLibDsOpen(${i})">
    <div class="song-lib-wthumb song-lib-ds-thumb${r._noScore ? ' noimg' : ''}" data-i="${i}"><i class="ti ti-photo"></i><span class="song-lib-wthumb-badge ${r._src}">${r._src === 'azm' ? '赞美网' : '诗歌本'}</span></div>
    <div class="song-lib-winfo">
      <div class="song-lib-wtitle">${escapeHtml(name)}</div>
      ${pills.length ? `<div class="song-lib-wmeta">${pills.join('')}</div>` : ''}
      <div class="song-lib-wfoot">
        <span class="song-lib-wfoot-txt">${r._noScore ? '该歌曲暂无歌谱' : ''}</span>
        <div class="song-lib-wfoot-btns">${detail}${typeof hymnCardBtnsHtml === 'function' ? hymnCardBtnsHtml(r, i) : ''}${songLibDsAddBtnHtml(r, i)}<button class="song-lib-card-play-btn" onclick="event.stopPropagation();songLibDsOpen(${i})" title="查看歌谱"><i class="ti ti-zoom-in"></i></button></div>
      </div>
    </div>
  </div>`;
}

function songLibDsRender(from, hostId){
  const host = document.getElementById(hostId || 'songLibDsList');
  const wfMode = songLibViewMode === 'waterfall';
  if (from === 0) { if (songLibDsObserver) songLibDsObserver.disconnect(); host.innerHTML = ''; }
  host.className = 'song-lib-ds-list ' + (wfMode ? 'view-wf' : 'view-list');
  const rows = songLibDsRows.slice(from);
  if (wfMode) {
    const wf = songLibWfEnsure(host);
    rows.forEach((r, k) => songLibWfAppend(wf, songLibDsCardWf(r, from + k), 133 + 90));
  } else {
    host.insertAdjacentHTML('beforeend', rows.map((r, k) => songLibDsCardList(r, from + k)).join(''));
  }
  if (!songLibDsObserver || from === 0) {
    const gen = songLibDsGen;
    songLibDsObserver = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { songLibDsObserver.unobserve(en.target); songLibDsLoadThumb(en.target, gen); } });
    }, { rootMargin: '300px 0px' });
  }
  host.querySelectorAll('.song-lib-ds-thumb').forEach(t => { if (Number(t.dataset.i) >= from) songLibDsObserver.observe(t); });
}

function songLibDsRowImage(r, page = 0, force = false){
  if (r._src === 'azm') {
    if (force) r._imgP = null;
    return songLibDsEnsureAzmImages(r).then(imgs => {
      if (!imgs.length) { const e = new Error('该歌谱暂无图片'); e.noImg = true; throw e; }
      return imgs[page] || imgs[0];
    });
  }
  if (!(Number(r.id) > 0)) { const e = new Error('无图片'); e.noImg = true; throw e; }
  return songLibDsGetImageUrl(Number(r.id), force);
}

async function songLibDsLoadThumb(el, gen){
  const r = songLibDsRows[Number(el.dataset.i)];
  if (!r || r._noScore) return;
  try {
    const url = await songLibDsRowImage(r, 0);
    if (gen !== songLibDsGen) return;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => { el.querySelectorAll(':scope > i').forEach(n => n.remove()); el.classList.add('has-img', 'loaded'); el.insertBefore(img, el.firstChild); };
    img.onerror = () => { const ic = el.querySelector(':scope > i'); if (ic) ic.className = 'ti ti-photo-off'; };
    img.src = url;
  } catch (e) {
    if (gen !== songLibDsGen) return;
    const ic = el.querySelector(':scope > i'); if (ic) ic.className = 'ti ti-photo-off';
  }
}

// ═══════════════════════════════════════════════════════════════
// 诗歌本（歌本分类）——从「专属歌谱搜索」页移植：独立标签页，不嵌在专属搜索里
// 歌本列表来自云端 church_app_state.song_books；点进歌本读取本书全部歌谱，可按第几首查找；管理员可增删改歌本。
// ═══════════════════════════════════════════════════════════════
const SONGLIB_BOOK_PAGE = 80;
let songLibBookSrv = { list: [], at: 0, ok: false };
let songLibBookCur = null;     // 当前打开的歌本 {id,name,intro,cover}
let songLibBookKw = '';        // 歌本列表的搜索词
const songLibBookIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h10a3 3 0 0 1 3 3v12.5a.5.5 0 0 1-.8.4L15 17.2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1.5 4v2h7V7h-7Zm0 4v2h5v-2h-5Z"/></svg>';
function songLibBookCoverHtml(c){
  return c
    ? `<img src="${escapeHtml(c)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ld');this.parentNode.classList.add('has-img')" onerror="this.remove()">${songLibBookIcon}<span>暂无封面图</span>`
    : `${songLibBookIcon}<span>暂无封面图</span>`;
}
function songLibBooksMerged(){
  return (songLibBookSrv.list || []).filter(b => b && b.id != null).map(b => ({
    id: Number(b.id), name: String(b.name || ('歌本 ' + b.id)).trim(), intro: b.intro || '', cover: b.cover || ''
  }));
}
function songLibBookById(id){ return songLibBooksMerged().find(b => b.id === Number(id)) || { id: Number(id), name: '歌本 ' + id, intro: '', cover: '' }; }
async function songLibBooksFetch(force){
  if (!force && songLibBookSrv.ok && Date.now() - songLibBookSrv.at < 5 * 60 * 1000) return songLibBookSrv.list;
  if (!initSupabaseClient()) return songLibBookSrv.list;
  try {
    const { data, error } = await supabaseClient.from(SUPABASE_CONFIG.table).select('song_books').eq('id', SUPABASE_CONFIG.rowId).maybeSingle();
    if (error) { songLibBookSrv.ok = false; return songLibBookSrv.list; }   // 字段不存在等
    songLibBookSrv = { list: Array.isArray(data && data.song_books) ? data.song_books : [], at: Date.now(), ok: true };
    remoteBaseSet('song_books', songLibBookSrv.list);
  } catch (e) { songLibBookSrv.ok = false; }
  return songLibBookSrv.list;
}
function songLibBookSkel(n){
  return Array.from({ length: n }, (_, i) => `<div class="song-lib-bk-skel" style="--d:${Math.min(i, 8) * 70}ms"><div class="song-lib-bk-cover"></div><div class="song-lib-bk-info"><div class="ln"></div><div class="ln s"></div><div class="ln xs"></div></div></div>`).join('');
}
// 进入「诗歌本」标签
function songLibBooksEnter(){
  songLibBookKw = '';
  const inp = document.getElementById('songLibBkSearch'); if (inp) inp.value = '';
  document.getElementById('songLibBkSearchClear')?.classList.remove('visible');
  songLibBookCur = null;
  songLibBooksShowList(true);
}
function songLibBooksUpdateAdminUI(){
  const on = !!isAdmin;
  const a = document.getElementById('songLibBkAdminBtn'); if (a) a.hidden = !on;
  const e = document.getElementById('songLibBkEdit'); if (e) e.hidden = !on;
}
async function songLibBooksShowList(force){
  const listWrap = document.getElementById('songLibBkList'), detail = document.getElementById('songLibBkDetail');
  if (!listWrap || !detail) return;
  songLibBookCur = null; songLibDsGen++;
  detail.hidden = true; listWrap.hidden = false;
  songLibBooksUpdateAdminUI();
  const grid = document.getElementById('songLibBkGrid'), cnt = document.getElementById('songLibBkCount');
  const fresh = !songLibBookSrv.ok || force;
  if (!songLibBookSrv.list.length) { grid.innerHTML = songLibBookSkel(6); cnt.textContent = '正在读取歌本列表…'; }
  await songLibBooksFetch(!!force && fresh);
  if (songLibTab !== 'books' || songLibBookCur) return;
  songLibBooksRenderList();
}
function songLibBooksRenderList(){
  const grid = document.getElementById('songLibBkGrid'), cnt = document.getElementById('songLibBkCount');
  if (!grid) return;
  const kw = songLibBookKw.trim().toLowerCase(), nk = songLibDsNormBook(songLibBookKw);
  let list = songLibBooksMerged();
  if (kw) list = list.filter(b => String(b.id) === kw || songLibDsNormBook(b.name).includes(nk) || (b.intro || '').toLowerCase().includes(kw));
  list.sort((a, b) => (!!(b.cover || b.intro) - !!(a.cover || a.intro)) || a.id - b.id);
  const total = list.length;
  cnt.textContent = !songLibBookSrv.ok ? '' : (kw ? `找到 ${total} 本` : `共 ${total} 本歌本`);
  if (!songLibBookSrv.ok && !total) {
    grid.innerHTML = '<div class="song-lib-empty"><i class="ti ti-cloud-off"></i>读取歌本列表失败，请检查网络；管理员还需确认数据库已创建 song_books 字段<br><button class="song-lib-bk-retry" onclick="songLibBooksShowList(true)">重试</button></div>';
    return;
  }
  const admin = !!isAdmin;
  grid.innerHTML = total
    ? list.slice(0, SONGLIB_BOOK_PAGE).map((b, k) => `<div class="song-lib-bk-card" style="animation-delay:${Math.min(k, 8) * 40}ms" onclick="songLibBookOpen(${b.id})">
        <div class="song-lib-bk-cover">${songLibBookCoverHtml(b.cover)}</div>
        <div class="song-lib-bk-info"><div class="song-lib-bk-name">${escapeHtml(b.name)}</div>
          <div class="song-lib-bk-meta"><span class="song-lib-wpill">ID ${b.id}</span></div>
          <div class="song-lib-bk-intro">${escapeHtml(b.intro || '暂无介绍')}</div></div>
        ${admin ? `<button type="button" class="song-lib-bk-editbtn" onclick="event.stopPropagation();songLibBookAdminOpen(${b.id})" aria-label="编辑"><i class="ti ti-pencil"></i></button>` : ''}
      </div>`).join('') + (total > SONGLIB_BOOK_PAGE ? `<div class="song-lib-empty" style="padding:14px">仅显示前 ${SONGLIB_BOOK_PAGE} 本，共 ${total} 本；请输入歌本名或编号缩小范围。</div>` : '')
    : `<div class="song-lib-empty"><i class="ti ti-books"></i>${kw ? '没有找到这个歌本，可换个名字或直接输入歌本编号' : (admin ? '还没有添加歌本：点右上角「歌本管理」添加' : '还没有添加歌本')}</div>`;
}
function onSongLibBookSearch(){
  const inp = document.getElementById('songLibBkSearch');
  songLibBookKw = inp.value;
  document.getElementById('songLibBkSearchClear')?.classList.toggle('visible', !!inp.value);
  songLibBooksRenderList();
}
function clearSongLibBookSearch(){
  const inp = document.getElementById('songLibBkSearch'); inp.value = ''; onSongLibBookSearch(); inp.focus();
}
// ── 歌本里的歌曲：读取 /catalogue/image（整本一次取回），失败退回 /image/searchByName ──
async function songLibDsCatGet(path, params){
  const base = songLibDsCfg().apiBase.trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置诗歌本接口地址');
  if (!songLibDeviceSignId) await songLibDsRegisterDevice();
  const url = new URL(base + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  let res, text;
  try { res = await fetch(url.toString(), { headers: songLibDsMakeHeaders() }); text = await res.text(); }
  catch (e) { throw new Error('无法连接（跨域限制或网络不可达）'); }
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}：${(data && (data.msg || data.message)) || text.slice(0, 100)}`);
  if (data && data.msg && !Array.isArray(data)) throw new Error(data.msg);
  return songLibDsNormalizeRows(data);
}
async function songLibBookFetchSongs(bookId, key){
  try {
    let rows = (await songLibDsCatGet('/catalogue/image', { bookId, ts: 0 })).filter(r => r && !r.isDeleted);
    const bk = songLibBookById(bookId);
    rows.forEach(r => { if (!r.bookName) r.bookName = bk.name; if (r.bookId == null) r.bookId = bookId; });
    rows = rows.map(r => Object.assign({ _src: 'hymn' }, r));
    const k = String(key || '').trim();
    if (k && !/^\d+$/.test(k)) { const n = k.toLowerCase(); rows = rows.filter(r => String(r.name || '').toLowerCase().includes(n) || String(r.artist || '').toLowerCase().includes(n)); }
    songLibDsLearnBooks(rows);
    return rows;
  } catch (e) { console.warn('[catalogue/image] 失败，回退 searchByName', e); }
  const base = songLibDsCfg().apiBase.trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置诗歌本接口地址');
  const url = new URL(base + '/image/searchByName');
  url.searchParams.set('key', key || ''); url.searchParams.set('bookId', String(bookId)); url.searchParams.set('musicType', '0');
  if (!songLibDeviceSignId) await songLibDsRegisterDevice();
  let out;
  try { out = await songLibDsHymnGet(url); } catch (e) { throw new Error('无法连接（跨域限制或网络不可达）'); }
  if (!out.res.ok) throw new Error(`HTTP ${out.res.status}：${(out.data && (out.data.msg || out.data.message)) || out.text.slice(0, 100)}`);
  if (out.data && out.data.msg && !Array.isArray(out.data)) throw new Error(out.data.msg);
  const rows = songLibDsNormalizeRows(out.data).map(r => Object.assign({ _src: 'hymn' }, r));
  songLibDsLearnBooks(rows);
  return rows;
}
async function songLibBookOpen(id, query){
  let book = songLibBookById(id);
  songLibBookCur = book;
  const listWrap = document.getElementById('songLibBkList'), detail = document.getElementById('songLibBkDetail');
  listWrap.hidden = true; detail.hidden = false;
  document.getElementById('songLibBkdCover').innerHTML = songLibBookCoverHtml(book.cover);
  document.getElementById('songLibBkdName').textContent = book.name;
  document.getElementById('songLibBkdMeta').innerHTML = `<span class="song-lib-wpill">ID ${book.id}</span>`;
  document.getElementById('songLibBkdIntro').textContent = book.intro || '暂无介绍';
  const noEl = document.getElementById('songLibBkdNo');
  if (query != null) noEl.value = query;
  songLibBooksUpdateAdminUI();
  const wrapTop = document.getElementById('songLibBooksView'); if (wrapTop) wrapTop.scrollIntoView({ block: 'start' });
  await songLibBookLoadSongs();
}
async function songLibBookLoadSongs(){
  const book = songLibBookCur; if (!book) return;
  const gen = ++songLibDsGen;
  songLibDsQueue.length = 0; songLibDsRows = [];
  const host = document.getElementById('songLibBkSongs'), st = document.getElementById('songLibBkdStatus');
  host.className = 'song-lib-ds-list ' + (songLibViewMode === 'waterfall' ? 'view-wf' : 'view-list');
  host.innerHTML = '<div class="song-lib-ds-loading"><i class="ti ti-loader-2"></i>正在读取《' + escapeHtml(book.name) + '》的歌谱…</div>';
  st.textContent = '';
  if (!songLibDsHasCrypto()) { st.textContent = 'CryptoJS 未加载（网络问题），诗歌本接口暂不可用。'; }
  const no = (document.getElementById('songLibBkdNo').value || '').trim();
  try {
    let rows = await songLibBookFetchSongs(book.id, no);
    if (gen !== songLibDsGen) return;
    rows = rows.filter(r => String(r.bookId ?? r.bookID ?? book.id) === String(book.id) || r.bookId == null);
    let note = '';
    if (no && /^\d+$/.test(no)) {
      const hit = rows.filter(r => String(r.no) === String(Number(no)));
      if (hit.length) rows = hit; else if (rows.length) note = `没有精确的第 ${no} 首，下面是相近结果。`;
    } else {
      rows.sort((a, b) => (!!a.isAddendum - !!b.isAddendum) || ((Number(a.no) || 1e9) - (Number(b.no) || 1e9)) || String(a.multiTag || '').localeCompare(String(b.multiTag || '')));
    }
    songLibDsRows = rows;
    document.getElementById('songLibBkdCount').textContent = `${book.name}（${rows.length} 首）`;
    if (!rows.length) { host.innerHTML = `<div class="song-lib-empty"><i class="ti ti-mood-empty"></i>${no ? `本书里没有找到第 ${escapeHtml(no)} 首` : '没有读到本书歌曲，可在上方输入第几首查找'}</div>`; st.textContent = ''; return; }
    host.innerHTML = '';
    songLibDsRender(0, 'songLibBkSongs');
    st.textContent = note || '点击歌谱图可放大查看。';
  } catch (e) {
    if (gen !== songLibDsGen) return;
    document.getElementById('songLibBkdCount').textContent = '读取未完成';
    host.innerHTML = '<div class="song-lib-empty"><i class="ti ti-alert-circle"></i>请求失败，请稍后重试</div>';
    st.textContent = '错误：' + (e?.message || e);
  }
}
function songLibBookFind(e){ if (e) e.preventDefault(); songLibBookLoadSongs(); }
function songLibBookBack(){
  document.getElementById('songLibBkdNo').value = '';
  songLibBooksShowList(false);
}

// ── 歌本管理（管理员；写入云端 church_app_state.song_books）──
function songLibBookAdminOpen(id){
  if (!isAdmin) return;
  const ov = document.getElementById('songLibBkAdminOverlay'); if (!ov) return;
  ov.classList.add('open');
  songLibBookAdminFill(id == null ? null : songLibBookById(id));
  songLibBookAdminMsg('');
}
function songLibBookAdminClose(e){
  if (e && e.target && e.target.id !== 'songLibBkAdminOverlay') return;
  document.getElementById('songLibBkAdminOverlay')?.classList.remove('open');
}
function songLibBookAdminFill(b){
  document.getElementById('songLibBkAdmId').value = b ? b.id : '';
  document.getElementById('songLibBkAdmName').value = b ? b.name : '';
  document.getElementById('songLibBkAdmIntro').value = b ? (b.intro || '') : '';
  document.getElementById('songLibBkAdmCover').value = b ? (b.cover || '') : '';
  document.getElementById('songLibBkAdmId').readOnly = !!b;
  songLibBookAdminPrev();
}
function songLibBookAdminMsg(t, bad){ const el = document.getElementById('songLibBkAdmMsg'); if (el) { el.textContent = t || ''; el.style.color = bad ? '#d9534f' : ''; } }
function songLibBookAdminPrev(){
  const v = document.getElementById('songLibBkAdmCover').value.trim();
  document.getElementById('songLibBkAdmPrev').innerHTML = songLibBookCoverHtml(v);
  document.getElementById('songLibBkAdmSize').textContent = v.startsWith('data:') ? `已内嵌图片，约 ${Math.round(v.length / 1024)} KB` : '';
}
function songLibBookCompress(file, maxW, q){
  return new Promise((ok, no) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, maxW / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      ok(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(u); no(new Error('img')); };
    img.src = u;
  });
}
async function songLibBookAdminUpload(inp){
  const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
  try { document.getElementById('songLibBkAdmCover').value = await songLibBookCompress(f, 360, .82); songLibBookAdminPrev(); songLibBookAdminMsg('图片已压缩并内嵌，记得点保存。'); }
  catch (e) { songLibBookAdminMsg('图片读取失败，请换一张。', true); }
}
async function songLibBookWrite(arr){
  if (!initSupabaseClient()) throw new Error('云端未连接');
  try { await syncRemoteField('song_books', arr); }
  catch (error) {
    const m = (error && error.message) || String(error);
    if (/song_books|column|PGRST204|42703/i.test(m + ((error && error.code) || ''))) throw new Error('数据库里还没有 song_books 字段，请先在 Supabase 执行：alter table church_app_state add column if not exists song_books jsonb default \'[]\'::jsonb;');
    throw new Error(m);
  }
  songLibBookSrv = { list: _lastSyncOut != null ? _lastSyncOut : arr, at: Date.now(), ok: true };   // 有合并时用合并后的结果
}
async function songLibBookAdminSave(){
  const id = Number.parseInt(document.getElementById('songLibBkAdmId').value, 10);
  const name = document.getElementById('songLibBkAdmName').value.trim();
  if (!Number.isFinite(id) || id < 0) { songLibBookAdminMsg('请填写歌本 ID（数字）。', true); return; }
  if (!name) { songLibBookAdminMsg('请填写歌本名。', true); return; }
  const cover = document.getElementById('songLibBkAdmCover').value.trim();
  if (cover.length > 400 * 1024) { songLibBookAdminMsg('封面图太大（超过约 400 KB），请换小一点的图或使用图片链接。', true); return; }
  const btn = document.getElementById('songLibBkAdmSave'); btn.disabled = true; songLibBookAdminMsg('保存中…');
  try {
    const cur = (await songLibBooksFetch(true)).slice();
    if (!songLibBookSrv.ok) throw new Error('读不到 song_books 字段，请先在 Supabase 创建该字段。');
    const item = { id, name, intro: document.getElementById('songLibBkAdmIntro').value.trim(), cover };
    const i = cur.findIndex(x => Number(x.id) === id);
    if (i >= 0) cur[i] = item; else cur.push(item);
    await songLibBookWrite(cur);
    songLibBookAdminMsg('已保存。');
    if (songLibBookCur && songLibBookCur.id === id) { songLibBookCur = songLibBookById(id); songLibBookOpen(id); } else if (!songLibBookCur) songLibBooksRenderList();
  } catch (e) { songLibBookAdminMsg('保存失败：' + (e?.message || e), true); }
  finally { btn.disabled = false; }
}
async function songLibBookAdminDelete(){
  const id = Number.parseInt(document.getElementById('songLibBkAdmId').value, 10);
  if (!Number.isFinite(id)) { songLibBookAdminMsg('请先选择一个歌本。', true); return; }
  if (!await slConfirm('确定删除这本歌本的资料（封面和介绍）？')) return;
  try {
    const cur = (await songLibBooksFetch(true)).slice();
    if (!songLibBookSrv.ok) throw new Error('读不到 song_books 字段。');
    await songLibBookWrite(cur.filter(x => Number(x.id) !== id));
    songLibBookAdminFill(null); songLibBookAdminMsg('已删除。');
    if (songLibBookCur && songLibBookCur.id === id) songLibBooksShowList(false); else songLibBooksRenderList();
  } catch (e) { songLibBookAdminMsg('删除失败：' + (e?.message || e), true); }
}

// 诗歌本的图片地址带有效期：尽量下载后存进自己的 Storage；赞美网的图片地址长期有效，直接引用
async function songLibDsPersistImage(url, expiring){
  if (!expiring || !initSupabaseClient()) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const dataUrl = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
    return await uploadSongDataUrl('song-library', dataUrl, Date.now());
  } catch (e) { slDiag(e, 'songLibDsPersistImage'); return url; }
}

const songLibDsAdding = new Set();
// 把专属搜索里找到的歌谱直接加入诗歌库（库里已有同名歌时，作为另一个谱加进去）
async function songLibDsAddToLib(i){
  const r = songLibDsRows[i];
  if (!r || r._noScore || songLibDsAdding.has(r)) return;
  const name = String(r.name || r.title || '').trim();
  if (!name) { showToast('这首歌没有歌名，没法加入诗歌库'); return; }
  const dup = findDuplicateSongInLibrary(name);
  if (dup && !(await slConfirm(`诗歌库里已经有《${dup.title}》了，把这份歌谱作为另一个谱加进去吗？`, { okText: '加进去', danger: false }))) return;
  songLibDsAdding.add(r);
  const btnOf = () => document.querySelector(`.song-lib-ds-card[data-i="${i}"] .ds-add-btn`);
  btnOf()?.classList.add('busy');
  try {
    const raw = r._src === 'azm' ? await songLibDsEnsureAzmImages(r) : [await songLibDsGetImageUrl(Number(r.id))];
    const urls = [].concat(raw || []).filter(Boolean);
    if (!urls.length) throw new Error('该歌谱暂无图片');
    const expiring = r._src !== 'azm';
    const srcs = [];
    for (const u of urls) srcs.push(await songLibDsPersistImage(u, expiring));
    const unsaved = expiring && srcs.some((x, k) => x === urls[k]);   // 没能转存：图片地址会过期
    let entry = dup;
    if (!entry) {
      entry = ensureSongInLibrary(name, '');
      if (r.bookName) entry.songbook = String(r.bookName).trim();
      if (r.artist) entry.band = String(r.artist).trim();
      if (r._src !== 'azm' && r.category) entry.category = String(r.category).trim();
    }
    srcs.forEach((src, k) => {
      if (entry.keys.some(x => x.src === src)) return;
      entry.keys.push({ id: genSongLibId(), label: ((r.key || '') + (srcs.length > 1 ? ` 第${k + 1}页` : '')).trim(), src });
    });
    let extra = { lyrics: false, music: false, notes: [] };   // 诗歌本的歌：歌词和音乐一起存进去（hymnmusic.js）
    if (r._src !== 'azm' && typeof hymnSaveExtras === 'function') extra = await hymnSaveExtras(r, entry);
    persistSongLibrary();
    renderSongLibFilterBar();
    updateSongLibImportHint();
    document.querySelectorAll('.song-lib-ds-card .ds-add-btn').forEach(b => {
      const card = b.closest('.song-lib-ds-card'); const row = card && songLibDsRows[Number(card.dataset.i)];
      if (row && String(row.name || row.title || '').trim().toLowerCase() === name.toLowerCase()) { b.classList.add('added'); b.innerHTML = '<i class="ti ti-check"></i>'; }
    });
    const withTxt = [extra.lyrics ? '歌词' : '', extra.music ? '音乐' : ''].filter(Boolean).join('、');
    const notesTxt = extra.notes.length ? '；' + extra.notes.join('；') : '';
    showToast(`✅ 《${entry.title}》已加入诗歌库${withTxt ? '，并同时存入' + withTxt : ''}${unsaved ? '（图片没能转存，地址可能会过期；登录管理员后重新加入更稳妥）' : ''}${notesTxt}`, (unsaved || notesTxt) ? 5000 : 2500);
    await syncSongLibraryToRemote();
  } catch (e) {
    slDiag(e, 'songLibDsAddToLib');
    showToast('加入失败：' + ((e && e.message) || e), 3500);
  } finally {
    songLibDsAdding.delete(r);
    btnOf()?.classList.remove('busy');
  }
}

function songLibDsOpen(i){
  const r = songLibDsRows[i];
  if (!r) return;
  if (r._noScore) {
    if (r.detailUrl) window.open(r.detailUrl, '_blank', 'noopener');
    else showToast('该歌曲暂无歌谱');
    return;
  }
  // 把当前列表里所有有歌谱的歌放进大图查看器，左右滑动 / 方向键即可切换上一首、下一首
  const items = [];
  let start = 0;
  songLibDsRows.forEach((row, idx) => {
    if (row._noScore || (row._src !== 'azm' && !(Number(row.id) > 0))) return;
    if (idx === i) start = items.length;
    const name = row.name || row.title || '歌谱';
    const no = songLibDsSongNo(row);
    items.push({
      title: no ? `${name}（${no}）` : name,
      src: '', noLib: true,
      lyricsLoader: (row._src !== 'azm' && Number(row.id) > 0 && typeof hymnGetLyrics === 'function') ? () => hymnGetLyrics(Number(row.id)) : undefined,
      loader: async (force) => {
        if (row._src === 'azm') {
          if (force) row._imgP = null;
          const imgs = await songLibDsEnsureAzmImages(row);
          if (!imgs || !imgs.length) throw new Error('该歌谱暂无图片');
          return imgs;
        }
        return [await songLibDsGetImageUrl(Number(row.id), !!force)];
      },
    });
  });
  openLightboxWithList(items, start);
}

function toggleSongLibFavorite(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  if (songLibFavoriteIds.has(id)) songLibFavoriteIds.delete(id); else songLibFavoriteIds.add(id);
  persistSongLibFavorites();
  renderSongLibraryGrid();
  if (songLibDetailCurrent && songLibDetailCurrent.id === id) renderSongLibDetailFavBtn();
}

function toggleSongLibFavoriteFromDetail(){
  if (!songLibDetailCurrent) return;
  toggleSongLibFavorite(songLibDetailCurrent.id);
}

function renderSongLibDetailFavBtn(){
  const btn = document.getElementById('songLibDetailFavBtn');
  const s = songLibDetailCurrent;
  if (!btn || !s) return;
  const isFav = isSongLibFavorite(s.id);
  btn.classList.toggle('active', isFav);
  btn.title = isFav ? '取消收藏' : '收藏';
  btn.innerHTML = `<i class="ti ${isFav ? 'ti-heart-filled' : 'ti-heart'}"></i>`;
  renderSongLibDetailPlBtn();
}

function markSongLibPlayed(title){
  const s = findSongLibEntryByTitle(title);
  if (!s) return;
  s.lastPlayedAt = new Date().toISOString();
  try { const m = slPlayedMap(); m[s.id] = s.lastPlayedAt; localStorage.setItem(LS_SONG_PLAYED, JSON.stringify(m)); } catch (e) { slDiag(e, 'markSongLibPlayed'); }
  persistSongLibrary();   // 只存本机，不触发云端同步
}

function openLightboxFromLibraryGrid(index){
  const list = getFilteredSongLibrary().map(s => ({ title: s.title, src: s.keys[0]?.src || '', songId: s.id }));
  openLightboxWithList(list, index);
}

let songLibDetailCurrent = null;

let songLibDetailKeyIndex = 0;

function openSongLibDetail(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  songLibDetailCurrent = s;
  songLibDetailKeyIndex = 0;
  closeAddKeyPanel();
  cancelLyricsEdit();
  document.getElementById('songLibDetailTitle').textContent = s.title;
  const rnb = document.getElementById('songLibDetailRenameBtn'); if (rnb) rnb.style.display = isAdmin ? '' : 'none';
  renderSongLibDetailFavBtn();
  document.getElementById('songLibDetailCategory').innerHTML = s.category
    ? `<span class="song-lib-category-badge">${escapeHtml(s.category)}</span>`
    : '';
  songLibSourceEditing = false;
  renderSongLibDetailSource();
  const d = new Date(s.createdAt);
  const dateLabel = isNaN(d) ? '' : `首次收录于 ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  document.getElementById('songLibDetailMeta').textContent = dateLabel;
  renderSongLibDetailKeyChips();
  renderSongLibDetailThumb();
  renderSongLibLyrics();
  renderSongLibLrc();
  const weeks = findSongUsageWeeks(s.title);
  const usageList = document.getElementById('songLibUsageList');
  usageList.innerHTML = weeks.length
    ? weeks.map(key => {
        const wd = new Date(key + 'T00:00:00');
        return `<div class="song-lib-usage-item"><i class="ti ti-calendar-event"></i>${wd.getMonth()+1}月${wd.getDate()}日（周日）</div>`;
      }).join('')
    : `<div class="song-lib-usage-empty">暂无使用记录</div>`;
  const actions = document.getElementById('songLibDetailActions');
  actions.innerHTML = isAdmin
    ? `<button class="btn-cancel" onclick="closeSongLibDetail()">关闭</button>
       <button class="btn-save" style="background:#e74c3c" onclick="deleteSongFromLibrary('${s.id}')">从歌单库删除</button>`
    : `<button class="btn-save" style="flex:1" onclick="closeSongLibDetail()">关闭</button>`;
  document.getElementById('songLibDetailOverlay').classList.add('open');
}

function renderSongLibDetailThumb(){
  const s = songLibDetailCurrent;
  const key = s?.keys[songLibDetailKeyIndex];
  document.getElementById('songLibDetailThumb').innerHTML = key?.src
    ? `<img src="${key.src}" alt="${escapeHtml(s.title)}" style="cursor:zoom-in" onclick="openLightboxFromDetail()">`
    : `<i class="ti ti-photo"></i>`;
  const downloadBtn = document.getElementById('songLibDownloadImgBtn');
  if (downloadBtn) downloadBtn.disabled = !key?.src;
}

function renderSongLibDetailKeyChips(){
  const wrap = document.getElementById('songLibKeyChips');
  const s = songLibDetailCurrent;
  if (!wrap || !s) return;
  const chips = s.keys.map((k, i) => {
    const renBtn = isAdmin
      ? `<button class="song-lib-key-chip-del" onclick="event.stopPropagation();renameSongLibKey('${k.id}')" title="修改调名"><i class="ti ti-pencil"></i></button>`
      : '';
    const delBtn = isAdmin && s.keys.length > 0
      ? `<button class="song-lib-key-chip-del" onclick="event.stopPropagation();deleteSongLibKey('${k.id}')" title="删除此调"><i class="ti ti-x"></i></button>`
      : '';
    return `<button class="song-lib-key-chip${i === songLibDetailKeyIndex ? ' active' : ''}" onclick="selectSongLibDetailKey(${i})">
      <i class="ti ti-music"></i>${escapeHtml(getSongLibKeyDisplayLabel(k))}${renBtn}${delBtn}
    </button>`;
  }).join('');
  wrap.innerHTML = chips + `<button class="song-lib-key-add-chip" onclick="openAddKeyPanel()"><i class="ti ti-plus"></i>添加调</button>`;
}

function selectSongLibDetailKey(idx){
  songLibDetailKeyIndex = idx;
  renderSongLibDetailKeyChips();
  renderSongLibDetailThumb();
}

function openLightboxFromDetail(){
  const s = songLibDetailCurrent;
  const key = s?.keys[songLibDetailKeyIndex];
  if (!key?.src) return;
  const label = getSongLibKeyDisplayLabel(key);
  openLightboxWithList([{ title: `${s.title}${key.label ? '（' + label + '）' : ''}`, src: key.src, songId: s.id }], 0);
}

async function downloadCurrentSongLibKeyImage(){
  const s = songLibDetailCurrent;
  const key = s?.keys[songLibDetailKeyIndex];
  if (!key?.src) return;
  const label = key.label ? `-${key.label}` : '';
  const ext = (key.src.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
  await triggerFileDownload(key.src, `${sanitizeFileName(s.title)}${label}.${/^[a-zA-Z0-9]+$/.test(ext) ? ext : 'jpg'}`);
}

function closeSongLibDetail(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibDetailOverlay').classList.remove('open');
}

async function deleteSongFromLibrary(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  if (!await slConfirm(`确定要从歌单库删除《${s.title}》吗？已经排入各周诗歌列表的记录不会受影响。`)) return;
  removeSongFromLibrary(id);
  persistSongLibrary();
  closeSongLibDetail();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  showToast('已从歌单库删除');
  await syncSongLibraryToRemote();
}

let songLibAddKeyPendingSrc = '';

function openAddKeyPanel(){
  document.getElementById('songLibAddKeyLabelInput').value = '';
  document.getElementById('songLibAddKeyUrl').value = '';
  document.getElementById('songLibAddKeyFileInput').value = '';
  songLibAddKeyPendingSrc = '';
  document.getElementById('songLibAddKeyPreview').classList.remove('show');
  document.getElementById('songLibAddKeyPreview').innerHTML = '';
  document.getElementById('songLibAddKeyError').classList.remove('show');
  document.getElementById('songLibAddKeyPanel').classList.add('show');
}

function closeAddKeyPanel(){
  const panel = document.getElementById('songLibAddKeyPanel');
  if (panel) panel.classList.remove('show');
}

function handleSongLibAddKeyFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    songLibAddKeyPendingSrc = ev.target.result;
    const preview = document.getElementById('songLibAddKeyPreview');
    preview.innerHTML = `<img src="${songLibAddKeyPendingSrc}" alt="预览"><span>${escapeHtml(file.name)}</span><button onclick="clearSongLibAddKeyPreview()"><i class="ti ti-x"></i></button>`;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
}

function clearSongLibAddKeyPreview(){
  songLibAddKeyPendingSrc = '';
  document.getElementById('songLibAddKeyFileInput').value = '';
  document.getElementById('songLibAddKeyPreview').classList.remove('show');
  document.getElementById('songLibAddKeyPreview').innerHTML = '';
}

async function submitAddSongKey(){
  const s = songLibDetailCurrent;
  if (!s) return;
  const label = document.getElementById('songLibAddKeyLabelInput').value.trim();
  const urlInput = document.getElementById('songLibAddKeyUrl').value.trim();
  const src = songLibAddKeyPendingSrc || urlInput || '';
  const errEl = document.getElementById('songLibAddKeyError');
  if (!src) {
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const submitBtn = document.getElementById('songLibAddKeySubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '添加中…';
  try {
    let finalSrc = src;
    if (finalSrc.startsWith('data:') && typeof uploadSongDataUrl === 'function' && initSupabaseClient()) {
      try {
        finalSrc = await uploadSongDataUrl('song-library', finalSrc, Date.now());
      } catch (e) {
        console.error('图片上传到 Storage 失败，保留本地图片', e);
      }
    }
    s.keys.push({ id: genSongLibId(), label, src: finalSrc });
    persistSongLibrary();
    songLibDetailKeyIndex = s.keys.length - 1;
    closeAddKeyPanel();
    renderSongLibDetailKeyChips();
    renderSongLibDetailThumb();
    renderSongLibraryGrid();
    showToast('✅ 已添加新的调');
    await syncSongLibraryToRemote();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '添加';
  }
}

// ── 发谱子到微信：每首歌谱是一张独立图片；选几首就发几张（系统分享面板 → 微信）──
let ssItems = [], ssFallback = false;
function ssSrc(it){ return it.keys.length ? it.keys[Math.min(it.keyIdx, it.keys.length - 1)].src : it.fallbackSrc; }
async function songImageFile(src, name){
  const resp = await fetch(src, { mode: 'cors' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  let blob = await resp.blob();
  if (!/^image\/(jpeg|png)$/.test(blob.type)) {   // 微信只认 jpg / png，webp 等先转成 jpg
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('img')); im.src = url; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error('toBlob');
    } finally { URL.revokeObjectURL(url); }
  }
  const safe = String(name || '歌谱').replace(/[\\/:*?"<>|]/g, '_');
  return new File([blob], `${safe}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type });
}
function songLibOpenScoreShare(key){
  key = key || songLibCurWeekKey();
  const arr = (songData[key] || []).filter(x => x && x.title);
  if (!arr.length) { showToast('这一周还没选歌'); return; }
  document.getElementById('weekShareOverlay')?.classList.remove('open');
  let skipped = 0;
  ssItems = [];
  arr.forEach(x => {
    const e = findSongLibEntryByTitle(x.title);
    const keys = e ? e.keys.filter(k => k.src) : [];
    if (!keys.length && !x.src) { skipped++; return; }
    ssItems.push({ title: x.title, keys, keyIdx: 0, fallbackSrc: x.src || '', sel: true, state: 'idle', file: null, fileSrc: '', url: '' });
  });
  if (!ssItems.length) { showToast('这一周的歌谱都还没上传'); return; }
  let can = false;
  try { can = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] })); } catch (e) { slDiag(e, 'songLibOpenScoreShare'); }
  ssFallback = !can;
  const wx = /MicroMessenger/i.test(navigator.userAgent);
  document.getElementById('ssTip').innerHTML =
    (ssFallback
      ? (wx ? '微信内置浏览器不能直接调用分享。请<b>长按下面的图片 → 发送给朋友</b>，或用系统浏览器（Safari / Chrome）打开本页后再点发送。'
            : '当前浏览器不支持直接发送图片。可<b>长按图片 → 发送给朋友</b>，或点下方按钮把图片保存到相册后再发微信。')
      : '勾选要发的歌谱，点「发送」会弹出系统分享面板，选微信和联系人，<b>每首谱子是一张独立图片</b>。也可以在每一行单独发送。')
    + (skipped ? `　（有 ${skipped} 首还没上传谱子，已略过）` : '');
  ssRender();
  ssItems.forEach(ssPrepare);   // 先把图片准备好，点发送时才能立刻调起分享面板
  document.getElementById('scoreShareOverlay').classList.add('open');
}
function closeScoreShare(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('scoreShareOverlay').classList.remove('open');
  ssItems.forEach(it => { if (it.url) { URL.revokeObjectURL(it.url); it.url = ''; } });
}
function ssPrepare(it){
  const src = ssSrc(it);
  if (!src) { it.state = 'fail'; return; }
  if (it.file && it.fileSrc === src) { it.state = 'ready'; return; }
  it.state = 'loading'; it.file = null;
  const n = String(ssItems.indexOf(it) + 1).padStart(2, '0');
  songImageFile(src, `${n}-${it.title}`).then(f => {
    if (ssSrc(it) !== src) return;
    it.file = f; it.fileSrc = src; it.state = 'ready';
    if (it.url) URL.revokeObjectURL(it.url);
    it.url = ssFallback ? URL.createObjectURL(f) : '';
  }).catch(() => { if (ssSrc(it) === src) it.state = 'fail'; }).finally(ssRender);
}
function ssRender(){
  const box = document.getElementById('ssList'); if (!box) return;
  box.innerHTML = ssItems.map((it, i) => {
    const src = ssSrc(it);
    const st = it.state === 'loading' ? '<small>图片准备中…</small>' : it.state === 'fail' ? '<small class="fail">图片读取失败（可长按图片发送）</small>' : '';
    const keys = it.keys.length > 1 ? `<div class="ss-keys">${it.keys.map((k, ki) => `<button type="button" class="${ki === it.keyIdx ? 'on' : ''}" onclick="ssPickKey(${i},${ki})">${escapeHtml(getSongLibKeyDisplayLabel(k))}</button>`).join('')}</div>` : '';
    const send = ssFallback ? '' : `<button type="button" class="ss-send" onclick="ssSendOne(${i})"${it.state === 'ready' ? '' : ' disabled'}>发送</button>`;
    const big = ssFallback ? `<div class="ss-bigwrap"><img class="ss-big" src="${it.url || src}" alt="${escapeHtml(it.title)}" referrerpolicy="no-referrer"></div>` : '';
    return `<div class="ss-row"><input type="checkbox" ${it.sel ? 'checked' : ''} onchange="ssToggle(${i})">
      <div class="ss-thumb">${src ? `<img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>
      <div class="ss-name">${i + 1}. ${escapeHtml(it.title)}${st}${keys}</div>${send}</div>${big}`;
  }).join('');
  const n = ssItems.filter(it => it.sel).length;
  const btn = document.getElementById('ssSendBtn');
  btn.textContent = ssFallback ? `保存选中的 ${n} 张图片` : `发送选中的 ${n} 首`;
  btn.disabled = n === 0;
  document.getElementById('ssToggleAllBtn').textContent = n === ssItems.length ? '取消全选' : '全选';
}
function ssToggle(i){ ssItems[i].sel = !ssItems[i].sel; ssRender(); }
function ssToggleAll(){ const all = ssItems.every(it => it.sel); ssItems.forEach(it => it.sel = !all); ssRender(); }
function ssPickKey(i, ki){ ssItems[i].keyIdx = ki; ssPrepare(ssItems[i]); ssRender(); }
// 注意：navigator.share 必须在点击后立刻同步调用，所以图片要提前准备好
async function ssShareFiles(files){
  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files })) return 'unsupported';
  try { await navigator.share({ files, title: '诗歌谱子' }); return 'ok'; }
  catch (e) { return e && e.name === 'AbortError' ? 'cancel' : 'unsupported'; }
}
function ssToFallback(){
  ssFallback = true;
  ssItems.forEach(it => { if (it.file && !it.url) it.url = URL.createObjectURL(it.file); });
  document.getElementById('ssTip').innerHTML = '当前浏览器不支持直接发送。请<b>长按图片 → 发送给朋友</b>，或点下方按钮保存到相册再发微信。';
  ssRender();
}
function ssSendOne(i){
  const it = ssItems[i];
  if (!it || !it.file) { showToast('图片还没准备好'); return; }
  ssShareFiles([it.file]).then(r => { if (r === 'unsupported') ssToFallback(); });
}
function ssSendSelected(){
  const sel = ssItems.filter(it => it.sel);
  if (!sel.length) { showToast('先勾选要发的歌谱'); return; }
  if (sel.some(it => it.state === 'loading')) { showToast('图片准备中，请稍候再点'); return; }
  const files = sel.filter(it => it.file).map(it => it.file);
  if (!files.length) { showToast('图片读取失败，请长按图片发送'); if (!ssFallback) ssToFallback(); return; }
  if (files.length < sel.length) showToast(`有 ${sel.length - files.length} 首读取失败，已略过`);
  if (ssFallback) { ssSaveFiles(files); return; }
  ssShareFiles(files).then(r => { if (r === 'unsupported') ssToFallback(); });
}
async function ssSaveFiles(files){
  for (const f of files) {
    const a = document.createElement('a'); const u = URL.createObjectURL(f);
    a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    await new Promise(r => setTimeout(r, 350));
  }
  showToast(`✅ 已保存 ${files.length} 张图片`);
}

// ── 久未使用提醒 ─────────────────────────────────────────────
// 依据每周排班里的使用记录：距离上次使用超过 N 周的歌标「X 周未用」；从没用过的歌标「从未使用」。
// 新收录不满 N 周的歌、已经排进以后某一周的歌，都不算久未使用。
const SONGLIB_STALE_OPTS = [[6, '6周'], [8, '2个月'], [13, '3个月'], [26, '半年']];
let songLibStaleWeeks = 8;
try { const v = +localStorage.getItem('songLibStaleWeeks'); if (SONGLIB_STALE_OPTS.some(o => o[0] === v)) songLibStaleWeeks = v; } catch (e) { slDiag(e, 'staleWeeks'); }
let songLibUsageFilter = '';      // '' 全部 | 'stale' 久未使用 | 'never' 从未使用
let songLibStaleCache = null;
function songLibStaleReady(){     // 使用记录还没读到时不提示，否则每首歌都会被当成「从未使用」
  if (!isAdmin) return false;     // 「久未使用 / 从未使用」只给登录的管理员看，没登录一律不显示
  if (songLibWeekDataState !== 'ok') return false;
  return Object.keys(songData || {}).some(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && (songData[k] || []).some(x => x && x.title));
}
function songLibFutureTitles(){
  if (songLibStaleCache && songLibStaleCache.future) return songLibStaleCache.future;
  const curKey = songLibCurWeekKey(), set = new Set();
  Object.keys(songData || {}).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k > curKey) (songData[k] || []).forEach(x => { if (x && x.title) set.add(x.title.trim()); }); });
  songLibStaleCache = { future: set };
  return set;
}
function songLibWeeksSince(dateStr){
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((t - new Date(dateStr + 'T00:00:00')) / 604800000);
}
// 返回 { state: 'stale' | 'never' | 'ok' | 'unknown', weeks, last }
function songLibUsageState(s){
  if (!songLibStaleReady()) return { state: 'unknown' };
  const ti = (s.title || '').trim();
  if (songLibFutureTitles().has(ti)) return { state: 'ok' };
  const st = songLibUsageStats().get(ti);
  if (st && st.last) {
    const w = songLibWeeksSince(st.last);
    return w >= songLibStaleWeeks ? { state: 'stale', weeks: w, last: st.last } : { state: 'ok', weeks: w, last: st.last };
  }
  const cd = Date.parse(s.createdAt);
  if (!isNaN(cd) && (Date.now() - cd) / 604800000 < songLibStaleWeeks) return { state: 'ok' };   // 新歌还不算
  return { state: 'never' };
}
function songLibStaleText(w){
  if (w >= 52) return '超过1年未用';
  if (w >= 9) return Math.round(w / 4.345) + '个月未用';
  return w + '周未用';
}
function songLibStaleTagHtml(s){
  const u = songLibUsageState(s);
  if (u.state === 'stale') return `<span class="song-lib-stale-tag" title="上次使用：${u.last}"><i class="ti ti-hourglass-high"></i>${songLibStaleText(u.weeks)}</span>`;
  if (u.state === 'never') return `<span class="song-lib-stale-tag never"><i class="ti ti-hourglass-empty"></i>从未使用</span>`;
  return '';
}
function songLibStaleCounts(){
  let stale = 0, never = 0;
  songLibrary.forEach(s => { const u = songLibUsageState(s).state; if (u === 'stale') stale++; else if (u === 'never') never++; });
  return { stale, never };
}
function songLibLastUsedOf(s){ const st = songLibUsageStats().get((s.title || '').trim()); return (st && st.last) || ''; }
function setSongLibUsageFilter(v){
  songLibUsageFilter = songLibUsageFilter === v ? '' : v;
  renderSongLibFilterBar(); renderSongLibraryGrid();
}
function setSongLibStaleWeeks(n){
  songLibStaleWeeks = n; songLibStaleCache = null;
  try { localStorage.setItem('songLibStaleWeeks', String(n)); } catch (e) { slDiag(e, 'setSongLibStaleWeeks'); }
  renderSongLibFilterBar(); renderSongLibraryGrid();
}
function renderSongLibUsageBar(){
  const bar = document.getElementById('songLibUsageBar'); if (!bar) return;
  const sec = document.getElementById('songLibUsageSec');
  if (sec) sec.style.display = isAdmin ? '' : 'none';
  bar.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) { bar.innerHTML = ''; return; }
  if (!songLibStaleReady()) { bar.innerHTML = '<span class="song-lib-scope-lbl">使用记录加载后可用</span>'; return; }
  const c = songLibStaleCounts();
  const chip = (v, ic, t, n) => `<button class="song-lib-filter-chip${songLibUsageFilter === v ? ' active' : ''}" onclick="setSongLibUsageFilter('${v}')"><i class="ti ${ic}"></i>${t}<small>${n}</small></button>`;
  const wk = SONGLIB_STALE_OPTS.map(([n, t]) => `<button class="song-lib-filter-chip${songLibStaleWeeks === n ? ' active' : ''}" onclick="setSongLibStaleWeeks(${n})">${t}</button>`).join('');
  bar.innerHTML = chip('stale', 'ti-hourglass-high', '久未使用', c.stale) + chip('never', 'ti-hourglass-empty', '从未使用', c.never)
    + `<div class="song-lib-scope-bar" style="display:flex;width:100%"><span class="song-lib-scope-lbl">超过多久算「久未使用」</span>${wk}</div>`;
}
function songLibApplyUsageFilter(list){
  if (!songLibUsageFilter || !isAdmin) return list;
  const out = list.filter(s => songLibUsageState(s).state === songLibUsageFilter);
  if (songLibUsageFilter === 'stale') out.sort((a, b) => songLibLastUsedOf(a).localeCompare(songLibLastUsedOf(b)));   // 最久没唱的排前面
  return out;
}
// 首页提醒条：有久未使用的歌时提示，可点进去看；点 × 后 7 天内不再提示
const LS_STALE_HINT_OFF = 'songLibStaleHintOff';
function songLibUpdateStaleHint(){
  const el = document.getElementById('songLibStaleHint'); if (!el) return;
  let off = false;
  try { off = Date.now() < (+localStorage.getItem(LS_STALE_HINT_OFF) || 0); } catch (e) { slDiag(e, 'songLibUpdateStaleHint'); }
  const plain = songLibTab === 'all' && songLibSearchMode === 'lib' && !songLibSearchKeyword && !songLibCategoryFilter && !songLibSongbookFilter && !songLibTagFilter.length && !songLibUsageFilter;
  const n = (plain && !off && songLibStaleReady()) ? songLibStaleCounts().stale : 0;
  document.getElementById('songLibStaleCount').textContent = n;
  document.getElementById('songLibStaleWk').textContent = (SONGLIB_STALE_OPTS.find(o => o[0] === songLibStaleWeeks) || [0, songLibStaleWeeks + '周'])[1];
  el.classList.toggle('show', n > 0);
}
function songLibShowStale(){ songLibUsageFilter = 'stale'; renderSongLibFilterBar(); renderSongLibraryGrid(); document.querySelector('#songLibraryOverlay .song-lib-main')?.scrollTo({ top: 0 }); }
function songLibDismissStaleHint(e){
  if (e) { e.preventDefault(); e.stopPropagation(); }
  try { localStorage.setItem(LS_STALE_HINT_OFF, String(Date.now() + 7 * 86400000)); } catch (err) { slDiag(err, 'songLibDismissStaleHint'); }
  songLibUpdateStaleHint();
}

// ── 搜索历史 / 热门搜索 ──────────────────────────────────────
// 历史只存在本机（localStorage）。「热门」= 本机搜得最多的词；不够时用今年全堂最常唱的歌补上。
const LS_SEARCH_HIST = 'songLibSearchHist';
let songLibSearchHist = [];       // [{ q, n, t }]
try { const a = JSON.parse(localStorage.getItem(LS_SEARCH_HIST) || '[]'); if (Array.isArray(a)) songLibSearchHist = a.filter(x => x && typeof x.q === 'string' && x.q).slice(0, 40); } catch (e) { slDiag(e, 'songLibSearchHist'); }
function persistSongLibSearchHist(){ try { localStorage.setItem(LS_SEARCH_HIST, JSON.stringify(songLibSearchHist)); } catch (e) { slDiag(e, 'persistSongLibSearchHist'); } }
let _songLibLastRec = { q: '', t: 0 };
function songLibRecordSearch(q){
  q = String(q || '').trim();
  if (!q || q.length > 30) return;
  if (_songLibLastRec.q === q && Date.now() - _songLibLastRec.t < 3000) return;   // 回车 + 失焦会连着触发两次
  if (songLibSearchMode === 'lib') {   // 本库没搜到东西的词不记，免得历史里全是打错的
    const toks = songLibSearchTokens(q);
    const hit = toks.length && songLibrary.some(s => songLibMatch(s, toks, 'all'));
    if (!hit) return;
  }
  _songLibLastRec = { q, t: Date.now() };
  const i = songLibSearchHist.findIndex(x => x.q.toLowerCase() === q.toLowerCase());
  if (i >= 0) { const it = songLibSearchHist.splice(i, 1)[0]; it.n = (it.n || 1) + 1; it.t = Date.now(); songLibSearchHist.unshift(it); }
  else songLibSearchHist.unshift({ q, n: 1, t: Date.now() });
  if (songLibSearchHist.length > 40) songLibSearchHist.length = 40;
  persistSongLibSearchHist();
}
function songLibHotTerms(){
  const out = [], seen = new Set();
  songLibSearchHist.filter(x => (x.n || 1) >= 2).sort((a, b) => (b.n - a.n) || (b.t - a.t)).slice(0, 8)
    .forEach(x => { out.push({ q: x.q, n: x.n }); seen.add(x.q.toLowerCase()); });
  if (out.length < 6 && songLibStaleReady()) {   // 补：今年最常唱的歌
    const st = songLibUsageStats();
    songLibrary.map(s => ({ q: s.title, c: (st.get((s.title || '').trim()) || {}).count || 0 })).filter(x => x.c > 0)
      .sort((a, b) => b.c - a.c).forEach(x => { if (out.length < 8 && !seen.has(x.q.toLowerCase())) { out.push({ q: x.q, song: true }); seen.add(x.q.toLowerCase()); } });
  }
  return out;
}
function songLibSuggRender(){
  const box = document.getElementById('songLibSugg'); if (!box) return false;
  const hist = songLibSearchHist.slice(0, 8), hot = songLibHotTerms();
  if (!hist.length && !hot.length) { box.innerHTML = ''; return false; }
  const chip = (q, extra) => `<button type="button" class="sugg-chip" data-q="${escapeHtml(q)}">${extra || ''}${escapeHtml(q)}</button>`;
  box.innerHTML =
    (hist.length ? `<div class="sugg-head"><span><i class="ti ti-history"></i>搜索历史</span><button type="button" class="sugg-clear" data-act="clear">清空</button></div>
      <div class="sugg-row">${hist.map(x => `<span class="sugg-item">${chip(x.q)}<button type="button" class="sugg-x" data-del="${escapeHtml(x.q)}" aria-label="删除这条历史"><i class="ti ti-x"></i></button></span>`).join('')}</div>` : '')
    + (hot.length ? `<div class="sugg-head"><span><i class="ti ti-flame"></i>热门搜索</span></div>
      <div class="sugg-row">${hot.map((x, i) => chip(x.q, `<b class="sugg-rank${i < 3 ? ' top' : ''}">${i + 1}</b>`)).join('')}</div>` : '');
  return true;
}
function songLibSuggUpdate(kw){
  const box = document.getElementById('songLibSugg'); if (!box) return;
  const input = document.getElementById('songLibSearchInput');
  kw = (kw || '').trim();
  if (kw && songLibSearchMode === 'lib' && document.activeElement === input && songLibTab !== 'books') {   // 输入中：给匹配的标签当快捷入口
    const k = kw.toLowerCase();
    const tags = getSongLibTags().filter(t => t.toLowerCase().includes(k) && t.toLowerCase() !== k).slice(0, 8);
    if (tags.length) {
      box.innerHTML = `<div class="sugg-head"><span><i class="ti ti-tag"></i>标签</span></div><div class="sugg-row">${tags.map(t => `<button type="button" class="sugg-chip" data-tagq="${escapeHtml(t)}"># ${escapeHtml(t)}<span style="color:var(--text-4);font-size:11px;margin-left:2px">${songLibTagCount(t)}</span></button>`).join('')}</div>`;
      box.classList.add('show');
      return;
    }
  }
  const want = !kw.length && document.activeElement === input && songLibTab !== 'books';
  box.classList.toggle('show', want && songLibSuggRender());
}
function songLibSuggPickTag(t){   // 点标签建议：范围切到「标签」，并填好关键词
  const input = document.getElementById('songLibSearchInput');
  songLibScope = 'tag'; slScopeSync();
  input.value = t;
  document.getElementById('songLibSugg')?.classList.remove('show');
  onSongLibrarySearch(); songLibRecordSearch(t);
  input.blur();
}
function songLibSuggShow(){ songLibSuggUpdate(document.getElementById('songLibSearchInput').value.trim()); }
function songLibSuggHideSoon(){ setTimeout(() => { if (document.activeElement !== document.getElementById('songLibSearchInput')) document.getElementById('songLibSugg')?.classList.remove('show'); }, 180); }   // 180ms 内又点回输入框就不要收起
function songLibSuggPick(q){
  const input = document.getElementById('songLibSearchInput');
  input.value = q;
  document.getElementById('songLibSugg')?.classList.remove('show');
  if (songLibSearchMode === 'ds') { document.getElementById('songLibSearchClear').classList.add('visible'); songLibRecordSearch(q); songLibDsSearch(); }
  else { onSongLibrarySearch(); songLibRecordSearch(q); }
  input.blur();
}
(function bindSongLibSugg(){
  const box = document.getElementById('songLibSugg'); if (!box || box._bound) return;
  box._bound = true;
  box.addEventListener('pointerdown', e => e.preventDefault());   // 点击时不要让输入框失焦，面板才不会先消失
  box.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { const q = del.dataset.del; songLibSearchHist = songLibSearchHist.filter(x => x.q !== q); persistSongLibSearchHist(); songLibSuggUpdate(''); return; }
    if (e.target.closest('[data-act="clear"]')) { songLibSearchHist = []; persistSongLibSearchHist(); songLibSuggUpdate(''); return; }
    const tg = e.target.closest('[data-tagq]'); if (tg) { songLibSuggPickTag(tg.dataset.tagq); return; }
    const c = e.target.closest('[data-q]'); if (c) songLibSuggPick(c.dataset.q);
  });
})();

// ── 拼音首字母搜索（输入 qydn 即可找到「奇异恩典」）──
const songLibPyCache = new Map();
function songLibPyInitials(title){
  const raw = String(title || '');
  if (songLibPyCache.has(raw)) return songLibPyCache.get(raw);
  let out = '';
  for (const ch of raw.normalize('NFKC')) {
    if (/[A-Za-z]/.test(ch)) out += ch.toLowerCase();
    else if (/[一-鿿]/.test(ch)) {
      let l = '';
      for (const [letter, bound] of SONGLIB_PY_BOUNDS) { if (songLibCollator.compare(bound, ch) <= 0) l = letter; }
      if (l) out += l.toLowerCase();
    }
  }
  songLibPyCache.set(raw, out);
  return out;
}
function songLibPyMatch(title, kw){
  const k = String(kw || '').trim().toLowerCase();
  return /^[a-z]{2,}$/.test(k) && songLibPyInitials(title).includes(k);
}

// ── 同名歌曲合并 ──
function songLibNormTitle(t){
  const x = String(t || '').normalize('NFKC').toLowerCase().replace(/\s*[(\[【][^)\]】]*[)\]】]\s*$/, '');
  return x.replace(/[\s·\-_—,.!?:;'"《》<>、，。！？：；“”‘’]/g, '');
}
function songLibFindDupGroups(){
  const m = new Map();
  songLibrary.forEach(x => { const k = songLibNormTitle(x.title); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.values()].filter(g => g.length > 1);
}
function updateSongLibDupHint(){
  const el = document.getElementById('songLibDupHint'); if (!el) return;
  const n = isAdmin ? songLibFindDupGroups().length : 0;
  document.getElementById('songLibDupCount').textContent = n;
  el.classList.toggle('show', n > 0);
}
let songLibMergeGroups = [];
function openSongLibMerge(){
  if (!isAdmin) { showToast('合并歌曲需要管理员登录'); return; }
  songLibMergeGroups = songLibFindDupGroups();
  renderSongLibMerge();
  document.getElementById('songLibMergeOverlay').classList.add('open');
}
function closeSongLibMerge(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibMergeOverlay').classList.remove('open');
}
function renderSongLibMerge(){
  const box = document.getElementById('songLibMergeList');
  document.getElementById('songLibMergeAllBtn').style.display = songLibMergeGroups.length > 1 ? '' : 'none';
  if (!songLibMergeGroups.length) { box.innerHTML = '<div class="song-lib-empty"><i class="ti ti-circle-check"></i>没有发现同名歌曲</div>'; return; }
  box.innerHTML = songLibMergeGroups.map((g, gi) => {
    const sug = g.slice().sort((a, b) => a.title.length - b.title.length)[0].title.replace(/\s*[(（\[【][^)）\]】]*[)）\]】]\s*$/, '').trim() || g[0].title;
    return `<div class="mg-group" data-g="${gi}">
      <div class="mg-head"><input class="add-song-name-input mg-title" value="${escapeHtml(sug)}" placeholder="合并后的歌名"><button type="button" onclick="songLibMergeGroupDo(${gi})">合并</button></div>
      ${g.map(x => { const src = x.keys[0]?.src || ''; return `<label class="mg-row"><input type="checkbox" value="${x.id}" checked>
        <span class="mg-thumb">${src ? `<img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i class="ti ti-photo"></i>'}</span>
        <span class="mg-name">${escapeHtml(x.title)}<small>${x.keys.length} 个谱${x.songbook ? ' · ' + escapeHtml(x.songbook) : ''}${x.band ? ' · ' + escapeHtml(x.band) : ''}</small></span></label>`; }).join('')}
    </div>`;
  }).join('');
}
// 合并核心：不负责云端同步。保留谱子最多的一首（保住它的 id、收藏、链接），其余并进来
function songLibMergeCore(ids, finalTitle){
  const list = ids.map(id => songLibrary.find(x => x.id === id)).filter(Boolean);
  if (list.length < 2) return { err: '至少选 2 首才能合并' };
  const title = (finalTitle || '').trim();
  if (!title) return { err: '合并后的歌名不能为空' };
  const member = new Set(list.map(x => x.id));
  const clash = songLibrary.find(x => !member.has(x.id) && x.title.trim().toLowerCase() === title.toLowerCase());
  if (clash) return { err: `库里已有另一首《${clash.title}》，请换个名字` };
  list.sort((a, b) => (b.keys.length - a.keys.length) || (new Date(a.createdAt) - new Date(b.createdAt)));
  const p = list[0], others = list.slice(1);
  const oldTitles = new Set(list.map(x => x.title.trim()));
  // 谱子：按图片地址去重，再给没名字 / 重名的谱起名
  const seen = new Set(p.keys.map(k => k.src));
  others.forEach(o => o.keys.forEach(k => {
    if (!k.src || seen.has(k.src)) return;
    seen.add(k.src);
    p.keys.push({ id: genSongLibId(), label: k.label, src: k.src, _from: o });
  }));
  const used = new Set();
  p.keys.forEach((k, i) => {
    let base = (k.label || '').trim();
    if (!base && p.keys.length > 1) base = (k._from && k._from.songbook) ? k._from.songbook : '谱' + (i + 1);
    let lab = base, n = 2;
    while (lab && used.has(lab.toLowerCase())) lab = base + ' (' + (n++) + ')';
    if (lab) used.add(lab.toLowerCase());
    k.label = lab; delete k._from;
  });
  // 音乐链接 / 歌词 / 分类 / 乐团 / 诗歌本 / 标签 / 时间
  const urls = new Set((p.music || []).map(m => m.url));
  p.music = p.music || [];
  others.forEach(o => {
    (o.music || []).forEach(m => { if (m.url && !urls.has(m.url)) { urls.add(m.url); p.music.push({ id: genSongLibId(), label: m.label, url: m.url }); } });
    if (!p.lyrics && o.lyrics) p.lyrics = o.lyrics;
    if (!p.lyricsLrc && o.lyricsLrc) p.lyricsLrc = o.lyricsLrc;
    if (!p.category && o.category) p.category = o.category;
    if (!p.band && o.band) p.band = o.band;
    if (!p.songbook && o.songbook) p.songbook = o.songbook;
    p.tags = normalizeSongLibTagList([...(p.tags || []), ...(o.tags || [])]);
    if (o.lastPlayedAt && (!p.lastPlayedAt || new Date(o.lastPlayedAt) > new Date(p.lastPlayedAt))) p.lastPlayedAt = o.lastPlayedAt;
    if (o.createdAt && new Date(o.createdAt) < new Date(p.createdAt)) p.createdAt = o.createdAt;
    if (songLibFavoriteIds.has(o.id)) songLibFavoriteIds.add(p.id);
    songLibFavoriteIds.delete(o.id);
  });
  p.title = title;
  songLibrary = songLibrary.filter(x => !others.some(o => o.id === x.id));
  // 每周排班里的旧歌名 → 新歌名（同一周出现两次的去重），使用次数才会合到一起
  let changedData = false;
  Object.keys(songData || {}).forEach(k => {
    const arr = songData[k] || [];
    if (!arr.some(x => x && oldTitles.has((x.title || '').trim()) && x.title !== title)) return;
    const out = [], got = new Set();
    arr.forEach(x => {
      if (x && oldTitles.has((x.title || '').trim())) x = Object.assign({}, x, { title });
      if (x && x.title === title) { if (got.has(title)) return; got.add(title); }
      out.push(x);
    });
    songData[k] = out; changedData = true;
  });
  if (musicPlayerSongTitle && oldTitles.has(musicPlayerSongTitle.trim())) musicPlayerSongTitle = title;
  if (nowPlayingSong && !songLibrary.find(x => x.id === nowPlayingSong.id)) nowPlayingSong = p;
  return { ok: true, merged: others.length, changedData, id: p.id };
}
async function songLibMergeFinish(changedData, msg){
  persistSongLibrary(); persistSongLibFavorites();
  if (songLibSelMode) songLibBatchExit();
  document.getElementById('songLibDetailOverlay')?.classList.remove('open');
  renderSongLibFilterBar(); renderSongLibraryGrid(); updateSongLibImportHint();
  showToast(msg);
  await syncSongLibraryToRemote();
  if (changedData) { try { await syncRemoteField('song_data', songData); } catch (e) { console.error(e); showToast('使用记录云端同步失败，请稍后再试'); } }
}
function songLibMergeGroupRead(gi){
  const box = document.querySelector(`#songLibMergeList [data-g="${gi}"]`);
  if (!box) return null;
  return { ids: [...box.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value), title: box.querySelector('.mg-title').value };
}
async function songLibMergeGroupDo(gi){
  if (!isAdmin) return;
  const r = songLibMergeGroupRead(gi); if (!r) return;
  const res = songLibMergeCore(r.ids, r.title);
  if (res.err) { showToast(res.err, 3000); return; }
  await songLibMergeFinish(res.changedData, `✅ 已合并 ${res.merged + 1} 首为《${r.title.trim()}》`);
  songLibMergeGroups = songLibFindDupGroups();
  renderSongLibMerge();
  if (!songLibMergeGroups.length) closeSongLibMerge();
}
async function songLibMergeAll(){
  if (!isAdmin) return;
  if (!await slConfirm(`将按当前的勾选和歌名，一次合并全部 ${songLibMergeGroups.length} 组同名歌曲。确定吗？`)) return;
  let n = 0, changed = false, errs = [];
  for (let gi = 0; gi < songLibMergeGroups.length; gi++) {
    const r = songLibMergeGroupRead(gi); if (!r) continue;
    const res = songLibMergeCore(r.ids, r.title);
    if (res.err) { errs.push(res.err); continue; }
    n++; changed = changed || res.changedData;
  }
  await songLibMergeFinish(changed, `✅ 已合并 ${n} 组${errs.length ? '，' + errs.length + ' 组失败' : ''}`);
  songLibMergeGroups = songLibFindDupGroups();
  renderSongLibMerge();
  if (!songLibMergeGroups.length) closeSongLibMerge();
}
// 批量选择模式下：把选中的几首合并成一首
async function songLibMergeSelected(){
  if (!isAdmin) return;
  const sel = songLibBatchSelected();
  if (sel.length < 2) { showToast('请先选 2 首或以上的歌曲再合并'); return; }
  const sug = sel.slice().sort((a, b) => (b.keys.length - a.keys.length) || (new Date(a.createdAt) - new Date(b.createdAt)))[0].title;
  const name = await slPrompt(`把选中的 ${sel.length} 首合并成一首，谱子都会收进「调/谱」里。\n合并后的歌名：`, sug);
  if (name === null) return;
  const res = songLibMergeCore(sel.map(x => x.id), name);
  if (res.err) { showToast(res.err, 3000); return; }
  await songLibMergeFinish(res.changedData, `✅ 已合并 ${res.merged + 1} 首为《${name.trim()}》`);
}

async function renameSongLibSong(entry, opts){
  if (!isAdmin) { showToast('修改歌名需要管理员登录'); return false; }
  const s = (entry && entry.id) ? entry : songLibDetailCurrent;
  if (!s) return false;
  const val = await slPrompt('修改歌名：', s.title);
  if (val === null) return false;
  const nt = val.trim();
  if (!nt) { showToast('歌名不能为空'); return false; }
  if (nt === s.title) return false;
  const dup = findDuplicateSongInLibrary(nt);
  if (dup && dup.id !== s.id) { showToast(`歌单库中已经有《${dup.title}》了，不能重名`); return false; }
  const old = s.title;
  s.title = nt;
  let changed = 0;
  Object.keys(songData || {}).forEach(k => (songData[k] || []).forEach(x => {
    if (x && (x.title || '').trim() === old.trim()) { x.title = nt; changed++; }
  }));
  if (musicPlayerSongTitle === old) musicPlayerSongTitle = nt;
  // 正在选本周诗歌时：已选名单和标记草稿里的旧歌名一起换掉
  try {
    const wi = weekPickSel.indexOf(old); if (wi >= 0) weekPickSel[wi] = nt;
    if (weekPickMarks[old]) { weekPickMarks[nt] = weekPickMarks[old]; delete weekPickMarks[old]; }
    const ti = weekPickTeach.indexOf(old); if (ti >= 0) weekPickTeach[ti] = nt;
    if (document.getElementById('weekPickOverlay').classList.contains('open')) renderWeekPick();
  } catch (e) { slDiag(e, 'renameSongLibSong'); }
  persistSongLibrary();
  if (songLibDetailCurrent && songLibDetailCurrent.id === s.id) document.getElementById('songLibDetailTitle').textContent = nt;
  if (opts && typeof opts.onRenamed === 'function') { try { opts.onRenamed(old, nt); } catch (e) { console.error(e); } }
  if (nowPlayingSong && nowPlayingSong.id === s.id && document.getElementById('nowPlayingOverlay')?.classList.contains('open')) renderNowPlaying();
  renderSongLibraryGrid();
  showToast(`✅ 歌名已改为《${nt}》${changed ? `，同步更新了 ${changed} 条使用记录` : ''}`);
  await syncSongLibraryToRemote();
  if (changed) { try { await syncRemoteField('song_data', songData); } catch (e) { console.error('同步使用记录失败', e); showToast('歌名已改，但使用记录云端同步失败'); } }
  return true;
}

async function renameSongLibKey(keyId, entry, opts){
  if (!isAdmin) { showToast('修改调名需要管理员登录'); return false; }
  const s = (entry && entry.id) ? entry : songLibDetailCurrent;
  const k = s && s.keys.find(x => x.id === keyId);
  if (!k) return false;
  const val = await slPrompt('修改调名（留空表示「默认」）：', k.label || '');
  if (val === null) return false;
  const nl = val.trim();
  const oldLab = k.label || '';
  if (nl === oldLab) return false;
  if (nl && s.keys.some(x => x.id !== keyId && (x.label || '').toLowerCase() === nl.toLowerCase())) { showToast(`已经有「${nl}」这个调了`); return false; }
  k.label = nl;
  persistSongLibrary();
  if (songLibDetailCurrent && songLibDetailCurrent.id === s.id) renderSongLibDetailKeyChips();
  if (opts && typeof opts.onRenamed === 'function') { try { opts.onRenamed(oldLab, nl); } catch (e) { console.error(e); } }
  if (nowPlayingSong && nowPlayingSong.id === s.id && document.getElementById('nowPlayingOverlay')?.classList.contains('open')) renderNowPlaying();
  renderSongLibraryGrid();
  showToast('✅ 调名已修改');
  await syncSongLibraryToRemote();
  return true;
}

async function deleteSongLibKey(keyId){
  const s = songLibDetailCurrent;
  if (!s) return;
  if (!await slConfirm('确定要删除这个调的图片吗？')) return;
  s.keys = s.keys.filter(k => k.id !== keyId);
  if (songLibDetailKeyIndex >= s.keys.length) songLibDetailKeyIndex = Math.max(0, s.keys.length - 1);
  persistSongLibrary();
  renderSongLibDetailKeyChips();
  renderSongLibDetailThumb();
  renderSongLibraryGrid();
  showToast('已删除该调');
  await syncSongLibraryToRemote();
}

let songLibSourceEditing = false;

function renderSongLibDetailSource(){
  const s = songLibDetailCurrent;
  const wrap = document.getElementById('songLibDetailSource');
  if (!s || !wrap) return;
  if (songLibSourceEditing) {
    const fillDatalist = (id, values) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = values.map(c => `<option value="${escapeHtml(c)}">`).join('');
    };
    fillDatalist('songLibBandDatalist', getSongLibBands());
    fillDatalist('songLibSongbookDatalist', getSongLibSongbooks());
    wrap.innerHTML = `<div class="song-lib-source-edit-panel show">
      <input type="text" id="songLibSourceEditBand" list="songLibBandDatalist" placeholder="乐团（如：敬拜团、青年团契）" value="${escapeHtml(s.band)}">
      <input type="text" id="songLibSourceEditSongbook" list="songLibSongbookDatalist" placeholder="诗歌本（如：生命圣诗、赞美之泉）" value="${escapeHtml(s.songbook)}">
      <div class="song-lib-tagpick" id="songLibEditTags"></div>
      <div class="song-lib-source-edit-actions">
        <button class="btn-cancel" onclick="cancelSourceEdit()">取消</button>
        <button class="btn-save" onclick="saveSourceEdit()">保存</button>
      </div>
    </div>`;
    renderSongLibTagPicker('edit');
    return;
  }
  const parts = [];
  if (s.band) parts.push(`<span><i class="ti ti-users"></i>${escapeHtml(s.band)}</span>`);
  if (s.songbook) parts.push(`<span><i class="ti ti-book-2"></i>${escapeHtml(s.songbook)}</span>`);
  const hasAny = parts.length || (s.tags && s.tags.length);
  const editBtn = !isAdmin ? '' : `<button class="song-lib-source-edit-btn" onclick="openSourceEdit()"><i class="ti ti-edit"></i>${hasAny ? '编辑' : '添加乐团/诗歌本/标签'}</button>`;
  const tagsRow = (s.tags && s.tags.length) ? `<div class="song-lib-detail-tags">${songLibTagPillsHtml(s, 'song-lib-tagpill')}</div>` : '';
  wrap.innerHTML = `<div class="song-lib-detail-source-line">${parts.join('')}${editBtn}</div>${tagsRow}`;
}

function openSourceEdit(){
  if (!isAdmin) { showToast('修改来源和标签需要管理员登录'); return; }
  songLibSourceEditing = true;
  songLibTagSel.edit = ((songLibDetailCurrent && songLibDetailCurrent.tags) || []).slice();
  renderSongLibDetailSource();
}

function cancelSourceEdit(){
  songLibSourceEditing = false;
  if (songLibDetailCurrent) renderSongLibDetailSource();
}

async function saveSourceEdit(){
  const s = songLibDetailCurrent;
  if (!s) return;
  if (!isAdmin) { showToast('修改来源和标签需要管理员登录'); return; }
  s.band = (document.getElementById('songLibSourceEditBand')?.value || '').trim();
  s.songbook = (document.getElementById('songLibSourceEditSongbook')?.value || '').trim();
  s.tags = normalizeSongLibTagList(songLibTagSel.edit);
  persistSongLibrary();
  songLibSourceEditing = false;
  renderSongLibDetailSource();
  renderSongLibFilterBar();
  renderSongLibraryGrid();
  showToast('✅ 已保存来源信息');
  await syncSongLibraryToRemote();
}

let musicPlayerSongTitle = '';

let musicPlayerActiveId = null;

let globalAudioEl = null;

let loadedAudioLinkId = null;

let audioRepeatOne = false;

let audioPlaylistMode = false;

let floatingAudioVisible = false;

function ensureGlobalAudioEl() {
  if (globalAudioEl) return globalAudioEl;
  const el = document.createElement('audio');
  el.id = 'globalAudioEl';
  el.style.width = '100%';
  el.preload = 'auto';
  el.addEventListener('ended', onGlobalAudioEnded);
  el.addEventListener('play', () => { updateFloatingAudioPlayState(); renderNowPlayingTransport(); updateMediaPosition(); });
  el.addEventListener('pause', () => { updateFloatingAudioPlayState(); renderNowPlayingTransport(); updateMediaPosition(); });
  el.addEventListener('timeupdate', () => { updateFloatingAudioProgress(); updateNowPlayingProgress(); });
  el.addEventListener('play', updateMediaSession);
  el.addEventListener('loadedmetadata', () => { updateMediaSession(); updateMediaPosition(); });
  el.addEventListener('durationchange', updateMediaPosition);
  el.addEventListener('seeked', updateMediaPosition);
  el.addEventListener('ratechange', updateMediaPosition);
  document.body.appendChild(el);
  globalAudioEl = el;
  initMediaSessionHandlers();
  return el;
}

// ── 锁屏 / 通知栏 / 耳机的播放控制（Media Session）：显示歌名，能暂停、上一首、下一首、拖进度 ──
function initMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch (e) { /* 这个系统不支持该按钮，忽略 */ } };
  set('play', () => { if (globalAudioEl) globalAudioEl.play().catch(() => {}); });
  set('pause', () => { if (globalAudioEl) globalAudioEl.pause(); });
  set('stop', () => { if (globalAudioEl) globalAudioEl.pause(); });
  set('previoustrack', () => playPrevSongInLibrary());
  set('nexttrack', () => playNextSongInLibrary());
  set('seekbackward', (d) => { if (globalAudioEl) globalAudioEl.currentTime = Math.max(0, globalAudioEl.currentTime - ((d && d.seekOffset) || 10)); updateMediaPosition(); });
  set('seekforward', (d) => { if (globalAudioEl) globalAudioEl.currentTime = Math.min(globalAudioEl.duration || Infinity, globalAudioEl.currentTime + ((d && d.seekOffset) || 10)); updateMediaPosition(); });
  set('seekto', (d) => {
    if (!globalAudioEl || !d || typeof d.seekTime !== 'number') return;
    if (d.fastSeek && 'fastSeek' in globalAudioEl) globalAudioEl.fastSeek(d.seekTime); else globalAudioEl.currentTime = d.seekTime;
    updateMediaPosition();
  });
}
function updateMediaSession() {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    const title = String(musicPlayerSongTitle || '').trim();
    if (!title) return;
    const song = findSongLibEntryByTitle(title);
    const sub = [song && song.songbook, '诗歌库'].filter(Boolean);
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: sub[0] === '诗歌库' ? '诗歌库' : sub[0],
      album: '诗歌库',
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  } catch (e) { slDiag(e, 'updateMediaSession'); }
}
function updateMediaPosition() {
  if (!('mediaSession' in navigator) || !globalAudioEl) return;
  try {
    navigator.mediaSession.playbackState = globalAudioEl.paused ? 'paused' : 'playing';
    const d = globalAudioEl.duration;
    if (navigator.mediaSession.setPositionState && isFinite(d) && d > 0) {
      navigator.mediaSession.setPositionState({ duration: d, playbackRate: globalAudioEl.playbackRate || 1, position: Math.min(globalAudioEl.currentTime || 0, d) });
    }
  } catch (e) { /* 部分浏览器对进度状态较严格，忽略即可 */ }
}

function onGlobalAudioEnded() {
  // 注意：当 loop=true（单曲循环）时浏览器不会触发 ended 事件，因此这里只处理列表播放的场景
  if (!audioPlaylistMode) return;
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  const curIdx = audioLinks.findIndex(l => l.id === loadedAudioLinkId);
  if (curIdx !== -1 && curIdx < audioLinks.length - 1) {
    // 当前这首歌还有其他版本没播完，先接着播完这首歌的所有版本
    playAdjacentAudioLink(1);
  } else {
    // 这首歌的音频都播完了，自动切到歌单库列表中的下一首歌
    playNextSongInLibrary();
  }
}

function playNextSongInLibrary() {
  const list = getFilteredSongLibrary();
  const curTitle = (musicPlayerSongTitle || '').trim().toLowerCase();
  const curIndex = list.findIndex(s => s.title.trim().toLowerCase() === curTitle);
  const n = list.length;
  if (n > 0 && curIndex !== -1) {
    for (let step = 1; step <= n; step++) {
      const candidate = list[(curIndex + step) % n];
      const audioLinks = getAudioLinksForTitle(candidate.title);
      if (audioLinks.length) { startPlaylistSong(candidate.title, audioLinks[0]); return; }
    }
  }
  // 当前歌曲不在筛选列表里，或找不到其他可播放的歌：从头重新播放当前这首
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  if (audioLinks.length) startPlaylistSong(musicPlayerSongTitle, audioLinks[0]);
}

function playPrevSongInLibrary() {
  const list = getFilteredSongLibrary();
  const curTitle = (musicPlayerSongTitle || '').trim().toLowerCase();
  const curIndex = list.findIndex(s => s.title.trim().toLowerCase() === curTitle);
  const n = list.length;
  if (n > 0 && curIndex !== -1) {
    for (let step = 1; step <= n; step++) {
      const candidate = list[((curIndex - step) % n + n) % n];
      const audioLinks = getAudioLinksForTitle(candidate.title);
      if (audioLinks.length) { startPlaylistSong(candidate.title, audioLinks[0]); return; }
    }
  }
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  if (audioLinks.length) startPlaylistSong(musicPlayerSongTitle, audioLinks[0]);
}

function startPlaylistSong(title, link) {
  musicPlayerSongTitle = title;
  musicPlayerActiveId = link.id;
  markSongLibPlayed(title);
  const audioEl = ensureGlobalAudioEl();
  const safeUrl = getSafeExternalUrl(link.url);
  if (!safeUrl) return;
  audioEl.loop = false;
  audioEl.src = safeUrl;
  loadedAudioLinkId = link.id;
  audioEl.play().catch(() => {});
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
  syncNowPlayingToCurrentTrack();
}

function toggleAudioRepeatOne() {
  audioRepeatOne = !audioRepeatOne;
  if (audioRepeatOne) audioPlaylistMode = false;
  if (globalAudioEl) globalAudioEl.loop = audioRepeatOne;
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}

function toggleAudioPlaylistMode() {
  audioPlaylistMode = !audioPlaylistMode;
  if (audioPlaylistMode) { audioRepeatOne = false; if (globalAudioEl) globalAudioEl.loop = false; }
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}

function updateFloatingAudioModeButtons() {
  const loopBtn = document.getElementById('floatingAudioLoopBtn');
  const listBtn = document.getElementById('floatingAudioListBtn');
  if (loopBtn) loopBtn.classList.toggle('active', audioRepeatOne);
  if (listBtn) listBtn.classList.toggle('active', audioPlaylistMode);
}

function playAdjacentAudioLink(dir) {
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  if (audioLinks.length < 2) return;
  const curIdx = audioLinks.findIndex(l => l.id === loadedAudioLinkId);
  let nextIdx = (curIdx === -1 ? 0 : curIdx + dir);
  if (nextIdx < 0) nextIdx = audioLinks.length - 1;
  if (nextIdx >= audioLinks.length) nextIdx = 0;
  musicPlayerActiveId = audioLinks[nextIdx].id;
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar();
}

function renderAudioToolsHtml() {
  const audioLinks = getAudioLinksForTitle(musicPlayerSongTitle);
  const hasMultiple = audioLinks.length > 1;
  return `<div class="music-player-audio-tools">
    <button class="audio-tool-btn${audioRepeatOne ? ' active' : ''}" onclick="toggleAudioRepeatOne()" title="单曲循环播放"><i class="ti ti-repeat-once"></i>循环播放</button>
    ${hasMultiple ? `<button class="audio-tool-btn${audioPlaylistMode ? ' active' : ''}" onclick="toggleAudioPlaylistMode()" title="列表循环播放"><i class="ti ti-repeat"></i>列表播放</button>
    <button class="audio-tool-btn" onclick="playAdjacentAudioLink(-1)" title="上一个音频"><i class="ti ti-player-skip-back"></i>上一个</button>
    <button class="audio-tool-btn" onclick="playAdjacentAudioLink(1)" title="下一个音频"><i class="ti ti-player-skip-forward"></i>下一个</button>` : ''}
  </div>`;
}

function showFloatingAudioBar() {
  const bar = document.getElementById('floatingAudioBar');
  if (!bar || !loadedAudioLinkId || !globalAudioEl) return;
  globalAudioEl.style.display = 'none';
  bar.appendChild(globalAudioEl); // 只是移动 DOM 节点，不会打断播放
  document.getElementById('floatingAudioTitle').textContent = musicPlayerSongTitle || '未知诗歌';
  const link = getMusicLinksForTitle(musicPlayerSongTitle).find(l => l.id === loadedAudioLinkId);
  const songEntry = songLibrary.find(s => s.title.trim().toLowerCase() === (musicPlayerSongTitle || '').trim().toLowerCase());
  const sourceLabel = link?.label || '音频播放中';
  document.getElementById('floatingAudioSub').textContent = songEntry?.band ? `${songEntry.band} · ${sourceLabel}` : sourceLabel;
  const playableSongs = getFilteredSongLibrary().filter(s => getAudioLinksForTitle(s.title).length > 0);
  const hasMultiple = playableSongs.length > 1;
  document.getElementById('floatingAudioPrevBtn').style.display = hasMultiple ? '' : 'none';
  document.getElementById('floatingAudioNextBtn').style.display = hasMultiple ? '' : 'none';
  updateFloatingAudioPlayState();
  updateFloatingAudioProgress();
  updateFloatingAudioModeButtons();
  bar.classList.add('show');
  floatingAudioVisible = true;
}

function hideFloatingAudioBar() {
  const bar = document.getElementById('floatingAudioBar');
  if (bar) bar.classList.remove('show');
  floatingAudioVisible = false;
}

function stopFloatingAudio() {
  if (globalAudioEl) globalAudioEl.pause();
  loadedAudioLinkId = null;
  hideFloatingAudioBar();
  songLibSyncPlaylistRows();
}

function toggleFloatingAudioPlay() {
  if (!globalAudioEl) return;
  if (globalAudioEl.paused) globalAudioEl.play().catch(() => {}); else globalAudioEl.pause();
}

function updateFloatingAudioPlayState() {
  const btn = document.getElementById('floatingAudioPlayBtn');
  if (!btn) return;
  const playing = globalAudioEl && !globalAudioEl.paused;
  btn.innerHTML = playing ? '<i class="ti ti-player-pause"></i>' : '<i class="ti ti-player-play"></i>';
  const icon = document.getElementById('floatingAudioIcon');
  if (icon) icon.classList.toggle('spin', !!playing);
  songLibSyncPlaylistRows(); songLibSyncPlButtons();
}

function updateFloatingAudioProgress() {
  const fill = document.getElementById('floatingAudioProgressFill');
  if (!fill) return;
  if (!globalAudioEl || !globalAudioEl.duration) { fill.style.width = '0%'; return; }
  fill.style.width = `${(globalAudioEl.currentTime / globalAudioEl.duration) * 100}%`;
}

function floatingAudioNext() { playNextSongInLibrary(); }

function floatingAudioPrev() { playPrevSongInLibrary(); }

function reopenFloatingAudio() {
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  if (s) openSongNowPlaying(s.id); else if (musicPlayerSongTitle) openMusicPlayer(musicPlayerSongTitle);
}

function quickPlaySongAudio(title) {
  const audioLinks = getAudioLinksForTitle(title);
  if (!audioLinks.length) {
    // 没有可直接播放的音频文件链接（可能只有 YouTube/外部链接），退回打开音乐弹窗手动选择
    openMusicPlayer(title);
    return;
  }
  markSongLibPlayed(title);
  musicPlayerSongTitle = title;
  musicPlayerActiveId = audioLinks[0].id;
  audioRepeatOne = false;
  audioPlaylistMode = true; // 默认按列表播放
  const audioEl = ensureGlobalAudioEl();
  audioEl.loop = false;
  const safeUrl = getSafeExternalUrl(audioLinks[0].url);
  if (!safeUrl) { showToast('音频链接无效'); return; }
  audioEl.src = safeUrl;
  loadedAudioLinkId = audioLinks[0].id;
  audioEl.play().catch(() => {});
  showFloatingAudioBar();
}

function openMusicPlayer(title) {
  markSongLibPlayed(title);
  // 若悬浮播放条正在播放"同一首诗歌"，重新打开弹窗时保持在当前播放的链接上，不从头重置
  const resuming = floatingAudioVisible && musicPlayerSongTitle === title && loadedAudioLinkId;
  musicPlayerSongTitle = title;
  const links = getMusicLinksForTitle(title);
  if (resuming && links.find(l => l.id === loadedAudioLinkId)) {
    musicPlayerActiveId = loadedAudioLinkId;
  } else {
    musicPlayerActiveId = links[0]?.id || null;
  }
  document.getElementById('musicPlayerTitle').textContent = title;
  closeMusicLinkAddForm();
  hideFloatingAudioBar();
  renderMusicPlayerBody();
  document.getElementById('musicPlayerOverlay').classList.add('open');
}

function closeMusicPlayer(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('musicPlayerOverlay').classList.remove('open');
  closeMusicLinkAddForm();
  if (loadedAudioLinkId && globalAudioEl) {
    // 音频还在播放：不销毁，转为悬浮显示继续收听
    showFloatingAudioBar();
  } else {
    document.getElementById('musicPlayerStage').innerHTML = '';
  }
}

function renderMusicPlayerBody() {
  const links = getMusicLinksForTitle(musicPlayerSongTitle);
  const listWrap = document.getElementById('musicPlayerLinkList');
  const stage = document.getElementById('musicPlayerStage');
  const addChip = `<button class="music-link-add-chip" onclick="openMusicLinkAddForm()"><i class="ti ti-plus"></i>添加链接</button>`;
  if (!links.length) {
    listWrap.innerHTML = isAdmin ? addChip : '';
    stage.innerHTML = `<div class="music-player-empty"><i class="ti ti-music-off"></i>${isAdmin ? '这首诗歌还没有音乐链接，点击上方"添加链接"' : '这首诗歌暂无音乐链接'}</div>`;
    return;
  }
  if (!links.find(l => l.id === musicPlayerActiveId)) musicPlayerActiveId = links[0].id;
  listWrap.innerHTML = links.map(l => {
    const platform = detectMusicPlatform(l.url);
    const editBtn = isAdmin ? `<button class="music-link-chip-edit" onclick="event.stopPropagation();openMusicLinkEdit('${l.id}')" title="修改说明"><i class="ti ti-edit"></i></button>` : '';
    const delBtn = isAdmin ? `<button class="music-link-chip-del" onclick="event.stopPropagation();deleteMusicLink('${l.id}')" title="删除"><i class="ti ti-x"></i></button>` : '';
    return `<button class="music-link-chip${l.id === musicPlayerActiveId ? ' active' : ''}" onclick="selectMusicLink('${l.id}')">
      <i class="ti ${getMusicPlatformIcon(platform)}"></i><span>${escapeHtml(l.label || getMusicPlatformLabel(platform))}</span>${editBtn}${delBtn}
    </button>`;
  }).join('') + (isAdmin ? addChip : '');
  renderMusicStage();
}

function renderMusicStage() {
  const links = getMusicLinksForTitle(musicPlayerSongTitle);
  const link = links.find(l => l.id === musicPlayerActiveId);
  const stage = document.getElementById('musicPlayerStage');
  if (!link) { stage.innerHTML = ''; return; }
  const platform = detectMusicPlatform(link.url);
  const safeUrl = getSafeExternalUrl(link.url);
  if (platform === 'youtube') {
    const embed = getYoutubeEmbedSrc(link.url);
    stage.innerHTML = embed
      ? `<div class="music-player-embed-wrap"><iframe src="${embed}" title="${escapeHtml(musicPlayerSongTitle)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
      : `<div class="music-player-empty"><i class="ti ti-alert-circle"></i>无法解析该 YouTube 链接${safeUrl ? `<br><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">在新标签页打开</a>` : ''}</div>`;
  } else if (platform === 'audio') {
    if (safeUrl) {
      const audioEl = ensureGlobalAudioEl();
      audioEl.controls = true;
      audioEl.style.display = '';
      audioEl.loop = audioRepeatOne;
      stage.innerHTML = '';
      stage.appendChild(audioEl);
      stage.insertAdjacentHTML('beforeend', renderAudioToolsHtml());
      if (loadedAudioLinkId !== link.id) {
        audioEl.src = safeUrl;
        loadedAudioLinkId = link.id;
        audioEl.play().catch(() => {});
      }
    } else {
      loadedAudioLinkId = null;
      stage.innerHTML = `<div class="music-player-empty"><i class="ti ti-alert-circle"></i>音频链接无效</div>`;
    }
  } else {
    stage.innerHTML = `<div class="music-player-empty"><i class="ti ti-external-link"></i>该链接暂不支持内嵌播放${safeUrl ? `<br><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">在新标签页打开收听</a>` : ''}</div>`;
  }
}

function selectMusicLink(id) {
  musicPlayerActiveId = id;
  renderMusicPlayerBody();
}

function openMusicLinkAddForm() {
  document.getElementById('musicLinkAddLabel').value = '';
  document.getElementById('musicLinkAddUrl').value = '';
  document.getElementById('musicLinkAddError').classList.remove('show');
  document.getElementById('musicLinkAddForm').classList.add('show');
}

function closeMusicLinkAddForm() {
  const panel = document.getElementById('musicLinkAddForm');
  if (panel) panel.classList.remove('show');
}

async function submitMusicLinkAdd() {
  const title = musicPlayerSongTitle;
  if (!title) return;
  const label = document.getElementById('musicLinkAddLabel').value.trim();
  const url = normalizeExternalUrlInput(document.getElementById('musicLinkAddUrl').value.trim());
  const errEl = document.getElementById('musicLinkAddError');
  if (!url) {
    errEl.textContent = '请输入音乐链接';
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const entry = ensureSongInLibrary(title, '');
  if (!entry) return;
  if (!Array.isArray(entry.music)) entry.music = [];
  const newLink = { id: genSongLibId(), label, url };
  entry.music.push(newLink);
  musicPlayerActiveId = newLink.id;
  persistSongLibrary();
  closeMusicLinkAddForm();
  renderMusicPlayerBody();
  renderSongLibraryGrid();
  showToast('✅ 已添加音乐链接');
  await syncSongLibraryToRemote();
}

async function deleteMusicLink(id) {
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  if (!s) return;
  if (!await slConfirm('确定要删除这个音乐链接吗？')) return;
  s.music = (s.music || []).filter(m => m.id !== id);
  persistSongLibrary();
  if (musicPlayerActiveId === id) musicPlayerActiveId = s.music[0]?.id || null;
  if (loadedAudioLinkId === id) {
    if (globalAudioEl) globalAudioEl.pause();
    loadedAudioLinkId = null;
    hideFloatingAudioBar();
  }
  renderMusicPlayerBody();
  renderSongLibraryGrid();
  showToast('已删除音乐链接');
  await syncSongLibraryToRemote();
}

let musicLinkEditingId = null;

function openMusicLinkEdit(id) {
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  const link = s?.music?.find(m => m.id === id);
  if (!link) return;
  musicLinkEditingId = id;
  document.getElementById('musicLinkEditLabelInput').value = link.label || '';
  document.getElementById('musicLinkEditOverlay').classList.add('open');
  setTimeout(() => document.getElementById('musicLinkEditLabelInput')?.focus(), 100);
}

function closeMusicLinkEdit(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('musicLinkEditOverlay').classList.remove('open');
  musicLinkEditingId = null;
}

async function submitMusicLinkEdit() {
  if (!musicLinkEditingId) return;
  const s = findSongLibEntryByTitle(musicPlayerSongTitle);
  const link = s?.music?.find(m => m.id === musicLinkEditingId);
  if (!link) return;
  link.label = document.getElementById('musicLinkEditLabelInput').value.trim();
  persistSongLibrary();
  closeMusicLinkEdit();
  renderMusicPlayerBody();
  if (floatingAudioVisible) showFloatingAudioBar(); // 悬浮条上的说明文字同步刷新
  showToast('✅ 已更新链接说明');
  await syncSongLibraryToRemote();
}

let nowPlayingSong = null;

let nowPlayingLrcLines = [];

let nowPlayingLrcActiveIndex = -1;

let nowPlayingKeyIndex = 0;

let nowPlayingSeeking = false;

function openSongNowPlayingFromDetail() {
  if (songLibDetailCurrent) openSongNowPlaying(songLibDetailCurrent.id);
}

function openSongShareFromDetail() {
  if (songLibDetailCurrent) openMusicShare(songLibDetailCurrent.id);
}

function openSongNowPlaying(id) {
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  nowPlayingSong = s;
  nowPlayingKeyIndex = (songLibDetailCurrent && songLibDetailCurrent.id === s.id) ? songLibDetailKeyIndex : 0;
  closeAllNowPlayingPanels();
  renderNowPlaying();
  // 若这首歌还没有在播放，且存在可直接播放的音频文件链接，自动开始播放（列表播放模式）
  const audioLinks = getAudioLinksForTitle(s.title);
  const alreadyPlayingThis = musicPlayerSongTitle === s.title && loadedAudioLinkId;
  if (audioLinks.length && !alreadyPlayingThis) {
    quickPlaySongAudio(s.title);
  } else if (audioLinks.length) {
    musicPlayerSongTitle = s.title;
  }
  document.getElementById('songLibDetailOverlay')?.classList.remove('open');
  document.getElementById('nowPlayingOverlay').classList.add('open');
  renderNowPlayingTransport();
}

function closeNowPlaying() {
  document.getElementById('nowPlayingOverlay').classList.remove('open');
  closeAllNowPlayingPanels();
  closeNowPlayingMoreMenu();
  if (loadedAudioLinkId && globalAudioEl) showFloatingAudioBar();
}

function syncNowPlayingToCurrentTrack() {
  if (!document.getElementById('nowPlayingOverlay')?.classList.contains('open')) return;
  const entry = findSongLibEntryByTitle(musicPlayerSongTitle);
  if (entry) {
    nowPlayingSong = entry;
    nowPlayingKeyIndex = 0;
    renderNowPlaying();
  }
}

function renderNowPlaying() {
  const s = nowPlayingSong;
  if (!s) return;
  const key = s.keys[nowPlayingKeyIndex] || s.keys[0] || null;
  document.getElementById('npSheetImgWrap').innerHTML = key?.src
    ? `<img src="${key.src}" alt="${escapeHtml(s.title)}" onclick="openLightboxFromNowPlaying()">`
    : `<div class="np-sheet-placeholder"><i class="ti ti-music"></i></div>`;
  document.getElementById('npSongTitle').textContent = s.title;
  document.getElementById('npSongBand').textContent = s.band || s.songbook || '';
  renderNowPlayingFavBtn();
  const tags = [];
  if (s.keys.length > 1) tags.push(`<button class="np-tag-chip" onclick="openTransposePanel()">${s.keys.length}个调</button>`);
  tags.push(`<span class="np-tag-chip static">${escapeHtml(getSongLibKeyDisplayLabel(key || {}))}</span>`);
  tags.push(`<span class="np-tag-chip static">简谱</span>`);
  document.getElementById('npTagsRow').innerHTML = tags.join('');
  const lyricsLines = (s.lyrics || '').split('\n').map(l => l.trim()).filter(Boolean);
  nowPlayingLrcLines = parseLrc(s.lyricsLrc);
  nowPlayingLrcActiveIndex = -1;
  const lrcTexts = nowPlayingLrcLines.map(l => l.text).filter(Boolean);
  const previewSource = lrcTexts.length ? lrcTexts : lyricsLines;
  document.getElementById('npLyricsPreview').innerHTML = previewSource.length
    ? previewSource.slice(0, 2).map(l => `<div>${escapeHtml(l)}</div>`).join('')
    : `<div class="np-lyrics-preview-empty">暂无歌词，点击"歌词"添加</div>`;
  renderNowPlayingLyricsPanel();
  renderNowPlayingTransposePanel();
  renderNowPlayingTransport();
}

function renderNowPlayingFavBtn() {
  const s = nowPlayingSong;
  if (!s) return;
  const isFav = isSongLibFavorite(s.id);
  const btn = document.getElementById('npFavBtn');
  if (btn) { btn.classList.toggle('active', isFav); btn.innerHTML = `<i class="ti ${isFav ? 'ti-heart-filled' : 'ti-heart'}"></i>`; }
  const moreBtn = document.getElementById('npMoreFavBtn');
  if (moreBtn) moreBtn.innerHTML = `<i class="ti ${isFav ? 'ti-heart-filled' : 'ti-heart'}"></i>${isFav ? '取消收藏' : '收藏'}`;
  songLibSyncPlButtons();
}

function toggleNowPlayingFavorite() {
  if (!nowPlayingSong) return;
  toggleSongLibFavorite(nowPlayingSong.id);
  renderNowPlayingFavBtn();
}

function openLightboxFromNowPlaying() {
  const s = nowPlayingSong;
  const key = s?.keys[nowPlayingKeyIndex];
  if (!key?.src) return;
  const label = getSongLibKeyDisplayLabel(key);
  openLightboxWithList([{ title: `${s.title}${key.label ? '（' + label + '）' : ''}`, src: key.src, songId: s.id }], 0);
}

function downloadCurrentNowPlayingImage() {
  const s = nowPlayingSong;
  const key = s?.keys[nowPlayingKeyIndex];
  if (!key?.src) { showToast('这首诗歌暂无谱子图片'); return; }
  const label = key.label ? `-${key.label}` : '';
  const ext = (key.src.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
  triggerFileDownload(key.src, `${sanitizeFileName(s.title)}${label}.${/^[a-zA-Z0-9]+$/.test(ext) ? ext : 'jpg'}`);
}

function renderNowPlayingTransport() {
  const playBtn = document.getElementById('npPlayBtn');
  if (playBtn) {
    const playing = globalAudioEl && !globalAudioEl.paused && loadedAudioLinkId && musicPlayerSongTitle === nowPlayingSong?.title;
    playBtn.innerHTML = playing ? '<i class="ti ti-player-pause"></i>' : '<i class="ti ti-player-play"></i>';
  }
  const modeBtn = document.getElementById('npModeBtn');
  if (modeBtn) {
    modeBtn.innerHTML = audioRepeatOne ? '<i class="ti ti-repeat-once"></i>' : '<i class="ti ti-repeat"></i>';
    modeBtn.classList.toggle('active', audioRepeatOne || audioPlaylistMode);
    modeBtn.title = audioRepeatOne ? '单曲循环' : (audioPlaylistMode ? '列表循环' : '顺序播放');
  }
  updateNowPlayingProgress();
}

function updateNowPlayingProgress() {
  const slider = document.getElementById('npProgressSlider');
  const curEl = document.getElementById('npCurTime');
  const durEl = document.getElementById('npDurTime');
  if (!slider || nowPlayingSeeking) return;
  const el = globalAudioEl;
  const isCurrentTrack = el && loadedAudioLinkId && musicPlayerSongTitle === nowPlayingSong?.title;
  if (!isCurrentTrack || !el.duration || isNaN(el.duration)) {
    slider.value = 0; if (curEl) curEl.textContent = '00:00'; if (durEl) durEl.textContent = '00:00';
    return;
  }
  slider.value = Math.round((el.currentTime / el.duration) * 1000);
  if (curEl) curEl.textContent = formatPlayTime(el.currentTime);
  if (durEl) durEl.textContent = formatPlayTime(el.duration);
  updateNowPlayingLrcHighlight();
}

function formatPlayTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function onNowPlayingSeekInput(val) {
  nowPlayingSeeking = true;
  const el = document.getElementById('npCurTime');
  if (el && globalAudioEl?.duration) el.textContent = formatPlayTime((val / 1000) * globalAudioEl.duration);
}

function onNowPlayingSeekChange(val) {
  nowPlayingSeeking = false;
  if (globalAudioEl && globalAudioEl.duration && musicPlayerSongTitle === nowPlayingSong?.title) {
    globalAudioEl.currentTime = (val / 1000) * globalAudioEl.duration;
  }
}

function cycleNowPlayingMode() {
  if (!nowPlayingSong) return;
  const audioLinks = getAudioLinksForTitle(nowPlayingSong.title);
  if (!audioRepeatOne && !audioPlaylistMode) toggleAudioRepeatOne();
  else if (audioRepeatOne) { toggleAudioRepeatOne(); if (audioLinks.length > 1 || getFilteredSongLibrary().length > 1) toggleAudioPlaylistMode(); }
  else toggleAudioPlaylistMode();
  renderNowPlayingTransport();
}

function closeAllNowPlayingPanels() {
  ['npLyricsPanel', 'npTransposePanel', 'npQueuePanel'].forEach(id => document.getElementById(id)?.classList.remove('show'));
  document.getElementById('npSlidePanelBackdrop')?.classList.remove('show');
}

function toggleNowPlayingLyrics() {
  const panel = document.getElementById('npLyricsPanel');
  if (!panel) return;
  if (panel.classList.contains('show')) { closeAllNowPlayingPanels(); return; }
  closeAllNowPlayingPanels();
  renderNowPlayingLyricsPanel();
  panel.classList.add('show');
  document.getElementById('npSlidePanelBackdrop')?.classList.add('show');
}

function renderNowPlayingLyricsPanel() {
  const s = nowPlayingSong;
  const body = document.getElementById('npLyricsPanelBody');
  if (!s || !body) return;
  if (nowPlayingLrcLines.length) {
    body.innerHTML = `<div class="np-lrc-list" id="npLrcList">` +
      nowPlayingLrcLines.map((l, i) => `<div class="np-lrc-line" onclick="seekNowPlayingToLrcLine(${i})">${escapeHtml(l.text || '♪')}</div>`).join('') +
      `</div>`;
    nowPlayingLrcActiveIndex = -1;
    updateNowPlayingLrcHighlight(true);
    return;
  }
  body.innerHTML = s.lyrics
    ? `<div class="np-lyrics-full">${escapeHtml(s.lyrics)}</div>`
    : `<div class="np-lyrics-preview-empty">这首诗歌还没有录入歌词，可前往歌单库详情页添加</div>`;
}

function seekNowPlayingToLrcLine(i) {
  const line = nowPlayingLrcLines[i];
  if (!line || !globalAudioEl || musicPlayerSongTitle !== nowPlayingSong?.title) return;
  globalAudioEl.currentTime = line.time;
  updateNowPlayingProgress();
}

function updateNowPlayingLrcHighlight(force) {
  if (!nowPlayingLrcLines.length) return;
  const el = globalAudioEl;
  const isCurrentTrack = el && loadedAudioLinkId && musicPlayerSongTitle === nowPlayingSong?.title;
  const t = isCurrentTrack ? el.currentTime : 0;
  let idx = -1;
  for (let i = 0; i < nowPlayingLrcLines.length; i++) {
    if (nowPlayingLrcLines[i].time <= t + 0.05) idx = i; else break;
  }
  if (idx === nowPlayingLrcActiveIndex && !force) return;
  nowPlayingLrcActiveIndex = idx;
  const list = document.getElementById('npLrcList');
  if (list) {
    [...list.children].forEach((child, i) => child.classList.toggle('active', i === idx));
    const activeEl = idx >= 0 ? list.children[idx] : null;
    const panel = document.getElementById('npLyricsPanel');
    if (activeEl && panel && panel.classList.contains('show')) {
      activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  const previewEl = document.getElementById('npLyricsPreview');
  if (previewEl) {
    const cur = idx >= 0 ? nowPlayingLrcLines[idx].text : (nowPlayingLrcLines[0]?.text || '');
    const next = nowPlayingLrcLines[idx + 1]?.text || '';
    previewEl.innerHTML = `<div class="np-lrc-preview-cur">${escapeHtml(cur || '♪')}</div>` +
      (next ? `<div class="np-lrc-preview-next">${escapeHtml(next)}</div>` : '');
  }
}

function openTransposePanel() {
  const panel = document.getElementById('npTransposePanel');
  if (!panel) return;
  closeAllNowPlayingPanels();
  renderNowPlayingTransposePanel();
  panel.classList.add('show');
  document.getElementById('npSlidePanelBackdrop')?.classList.add('show');
}

function closeTransposePanel() {
  document.getElementById('npTransposePanel')?.classList.remove('show');
  document.getElementById('npSlidePanelBackdrop')?.classList.remove('show');
}

function renderNowPlayingTransposePanel() {
  const s = nowPlayingSong;
  const wrap = document.getElementById('npTransposeList');
  if (!s || !wrap) return;
  if (!s.keys.length) { wrap.innerHTML = `<div class="np-lyrics-preview-empty">这首诗歌还没有上传谱子图片</div>`; return; }
  wrap.innerHTML = s.keys.map((k, i) => `
    <button class="np-key-option${i === nowPlayingKeyIndex ? ' active' : ''}" onclick="selectNowPlayingKey(${i})">
      <span><i class="ti ti-music" style="margin-right:6px"></i>${escapeHtml(getSongLibKeyDisplayLabel(k))}</span>
      <i class="ti ti-check check"></i>
    </button>`).join('');
}

function selectNowPlayingKey(idx) {
  nowPlayingKeyIndex = idx;
  renderNowPlaying();
  closeTransposePanel();
}

function openNowPlayingQueue() {
  const panel = document.getElementById('npQueuePanel');
  if (!panel) return;
  closeAllNowPlayingPanels();
  renderNowPlayingQueue();
  panel.classList.add('show');
  document.getElementById('npSlidePanelBackdrop')?.classList.add('show');
}

function closeNowPlayingQueue() {
  document.getElementById('npQueuePanel')?.classList.remove('show');
  document.getElementById('npSlidePanelBackdrop')?.classList.remove('show');
}

function renderNowPlayingQueue() {
  const wrap = document.getElementById('npQueueList');
  if (!wrap) return;
  const list = getFilteredSongLibrary().filter(s => getAudioLinksForTitle(s.title).length > 0);
  if (!list.length) { wrap.innerHTML = `<div class="np-queue-empty">歌单库里暂时没有可直接播放的音频文件</div>`; return; }
  wrap.innerHTML = list.map(s => {
    const active = s.title.trim().toLowerCase() === (musicPlayerSongTitle || '').trim().toLowerCase();
    const safeTitle = escapeHtml(s.title).replace(/'/g, "\\'");
    return `<button class="np-queue-item${active ? ' active' : ''}" onclick="playFromNowPlayingQueue('${safeTitle}')">
      <i class="ti ${active ? 'ti-volume' : 'ti-music'} playing-icon"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.title)}</span>
      ${s.band ? `<span style="color:var(--text-4);font-size:11.5px;flex-shrink:0">${escapeHtml(s.band)}</span>` : ''}
    </button>`;
  }).join('');
}

function playFromNowPlayingQueue(title) {
  const s = findSongLibEntryByTitle(title);
  const audioLinks = getAudioLinksForTitle(title);
  if (s && audioLinks.length) {
    startPlaylistSong(title, audioLinks[0]);
    nowPlayingSong = s;
    nowPlayingKeyIndex = 0;
    renderNowPlaying();
  }
  closeNowPlayingQueue();
}

function toggleNowPlayingMoreMenu() {
  const menu = document.getElementById('npMoreMenu');
  if (!menu) return;
  menu.classList.toggle('show');
}

function closeNowPlayingMoreMenu() {
  document.getElementById('npMoreMenu')?.classList.remove('show');
}

let metronomeTimer = null;

let metronomeCtx = null;

const METRONOME_BPM = 80;

function toggleMetronome() {
  const btn = document.getElementById('npMetronomeBtn');
  if (metronomeTimer) {
    clearInterval(metronomeTimer);
    metronomeTimer = null;
    btn?.classList.remove('active');
    showToast('节拍器已停止');
    return;
  }
  try {
    metronomeCtx = metronomeCtx || new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { showToast('当前浏览器不支持节拍器'); return; }
  const tick = () => {
    if (!metronomeCtx) return;
    const osc = metronomeCtx.createOscillator();
    const gain = metronomeCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.16, metronomeCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, metronomeCtx.currentTime + 0.05);
    osc.connect(gain); gain.connect(metronomeCtx.destination);
    osc.start(); osc.stop(metronomeCtx.currentTime + 0.06);
  };
  tick();
  metronomeTimer = setInterval(tick, Math.round(60000 / METRONOME_BPM));
  btn?.classList.add('active');
  showToast(`节拍器已开启 · ${METRONOME_BPM} BPM`);
}

let musicShareSong = null;

function openMusicShare(id) {
  const s = id ? songLibrary.find(x => x.id === id) : nowPlayingSong;
  if (!s) return;
  musicShareSong = s;
  renderMusicShareCard();
  document.getElementById('musicShareOverlay').classList.add('open');
}

function closeMusicShare() {
  document.getElementById('musicShareOverlay').classList.remove('open');
  restoreShareMeta();
}

function getMusicShareUrl(s) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('song', s.id);
  return url.toString();
}

function renderMusicShareCard() {
  const s = musicShareSong;
  if (!s) return;
  const key = s.keys[nowPlayingSong?.id === s.id ? nowPlayingKeyIndex : 0] || s.keys[0] || null;
  document.getElementById('msCardThumb').innerHTML = key?.src
    ? `<img src="${key.src}" alt="${escapeHtml(s.title)}">`
    : `<i class="ti ti-photo"></i>`;
  document.getElementById('msCardTitle').textContent = s.title;
  document.getElementById('msCardBand').textContent = s.band || s.songbook || '诗歌库';
  const tags = [];
  if (s.keys.length) tags.push(`<span><i class="ti ti-music"></i>${s.keys.length}个调</span>`);
  tags.push(`<span><i class="ti ti-layout-grid"></i>简谱</span>`);
  document.getElementById('msCardTags').innerHTML = tags.join('');
  const lyricsLines = (s.lyrics || '').split('\n').map(l => l.trim()).filter(Boolean);
  document.getElementById('msCardQuote').innerHTML = lyricsLines.length
    ? lyricsLines.slice(0, 2).map(l => `<div>${escapeHtml(l)}</div>`).join('')
    : `<div>愿这首诗歌，带给你安慰与力量</div>`;
  const qrCanvas = document.getElementById('msCardQr');
  if (qrCanvas) {
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(qrCanvas, getMusicShareUrl(s), {
        width: 96, margin: 0, color: { dark: '#1a3d33', light: '#ffffff' }
      }, (err) => { if (err) console.error('二维码生成失败：', err); });
    } else {
      // 二维码库没能加载成功（比如 CDN 抽风），别默默什么都不画，
      // 至少在控制台留个线索方便排查，不然看起来像是"卡死"了
      console.error('二维码生成失败：QRCode 库未加载（typeof QRCode === "undefined"）');
    }
  }
  // 动态更新页面标题和 OG 分享信息，这样如果是在微信自带浏览器里，
  // 用户点右上角"⋯"用微信原生的「发送给朋友」/「分享到朋友圈」时，
  // 预览卡片上看到的标题和封面图会是这首歌的，而不是首页的通用标题
  updateShareMeta(`${s.title} · 诗歌库分享`, lyricsLines[0] || '来自诗歌库的分享', key?.src || '');
}

let _origPageMeta = null;
const SHARE_COVER_URL = (() => { try { return new URL('icons/share-cover.jpg', location.href).href; } catch (e) { return 'icons/share-cover.jpg'; } })();   // 默认转发封面（单首歌有谱图时优先用谱图）

function updateShareMeta(title, desc, image) {
  if (!_origPageMeta) {
    _origPageMeta = {
      title: document.title,
      desc: document.getElementById('metaDescTag')?.content || '',
      ogTitle: document.getElementById('metaOgTitleTag')?.content || '',
      ogDesc: document.getElementById('metaOgDescTag')?.content || '',
      ogImage: document.getElementById('metaOgImageTag')?.content || '',
    };
  }
  document.title = title;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.content = val; };
  set('metaDescTag', desc);
  set('metaOgTitleTag', title);
  set('metaOgDescTag', desc);
  set('metaOgImageTag', image || SHARE_COVER_URL);
  set('metaItemImageTag', image || SHARE_COVER_URL);
}

function restoreShareMeta() {
  if (!_origPageMeta) return;
  document.title = _origPageMeta.title;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.content = val; };
  set('metaDescTag', _origPageMeta.desc);
  set('metaOgTitleTag', _origPageMeta.ogTitle);
  set('metaOgDescTag', _origPageMeta.ogDesc);
  set('metaOgImageTag', _origPageMeta.ogImage || SHARE_COVER_URL);
  set('metaItemImageTag', SHARE_COVER_URL);
  _origPageMeta = null;
}

async function copyMusicShareLink() {
  const s = musicShareSong;
  if (!s) return;
  const url = getMusicShareUrl(s);
  try {
    await navigator.clipboard.writeText(url);
    showToast('✅ 链接已复制');
  } catch (e) {
    showToast(url);
  }
}

function saveMusicShareImage() {
  const s = musicShareSong;
  const key = s?.keys[0];
  if (!key?.src) { showToast('这首诗歌暂无谱子图片'); return; }
  const ext = (key.src.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
  triggerFileDownload(key.src, `${sanitizeFileName(s.title)}.${/^[a-zA-Z0-9]+$/.test(ext) ? ext : 'jpg'}`);
}

async function saveMusicSharePoster() {
  const s = musicShareSong;
  if (!s) return;
  showToast('海报生成组件加载中…');
  if (!(await ensureHtml2canvas())) {
    showToast('海报生成组件加载失败，请检查网络后重试');
    return;
  }
  showToast('海报生成中…');
  const cardEl = document.getElementById('msCard');
  try {
    // scale 调高一些，保证导出的图片足够清晰（不会因为手机屏幕本身分辨率一般而显得模糊）
    const scale = Math.max(3, (window.devicePixelRatio || 1) * 2);
    const canvas = await html2canvas(cardEl, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      logging: false,
    });
    const a = document.createElement('a');
    a.download = `${sanitizeFileName(s.title)}-分享海报.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('✅ 海报已生成，正在下载');
  } catch (e) {
    console.error('生成海报失败', e);
    showToast('海报生成失败（可能是图片跨域限制），可尝试"保存图片"');
  }
}

function checkSongShareLinkFromUrl() {
  try {
    const qs = new URLSearchParams(location.search);
    const wk = qs.get('week');
    if (wk && /^\d{4}-\d{2}-\d{2}$/.test(wk)) { setTimeout(() => songLibOpenSharedWeek(wk), 500); return; }
    const id = qs.get('song');
    if (!id) return;
    const s = songLibrary.find(x => x.id === id);
    if (s) setTimeout(() => openSongNowPlaying(s.id), 300);
  } catch (e) { /* ignore */ }
}

let songLibLyricsEditing = false;

function parseLrc(text) {
  if (!text) return [];
  const timeTag = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const result = [];
  text.split('\n').forEach(line => {
    const tags = [...line.matchAll(timeTag)];
    if (!tags.length) return;
    const content = line.replace(timeTag, '').trim();
    tags.forEach(m => {
      const min = parseInt(m[1], 10) || 0;
      const sec = parseInt(m[2], 10) || 0;
      const msRaw = m[3] || '0';
      const ms = parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) || 0;
      result.push({ time: min * 60 + sec + ms / 1000, text: content });
    });
  });
  result.sort((a, b) => a.time - b.time);
  return result;
}

function renderSongLibLyrics(){
  const s = songLibDetailCurrent;
  const actionsEl = document.getElementById('songLibLyricsActions');
  const bodyEl = document.getElementById('songLibLyricsBody');
  if (!s || !actionsEl || !bodyEl) return;
  if (songLibLyricsEditing) {
    actionsEl.innerHTML = '';
    bodyEl.innerHTML = `<div class="song-lib-lyrics-edit">
      <textarea id="songLibLyricsTextarea" placeholder="逐行输入完整歌词…">${escapeHtml(s.lyrics)}</textarea>
      <div class="song-lib-lyrics-edit-actions">
        <button class="btn-cancel" onclick="cancelLyricsEdit()">取消</button>
        <button class="btn-save" onclick="saveLyricsEdit()">保存</button>
      </div>
    </div>`;
    return;
  }
  actionsEl.innerHTML = s.lyrics
    ? `<button class="song-lib-lyrics-link-btn" onclick="copyCurrentSongLibLyrics()"><i class="ti ti-copy"></i>复制歌词</button>
       <button class="song-lib-lyrics-link-btn" onclick="downloadCurrentSongLibLyrics()"><i class="ti ti-download"></i>下载歌词</button>
       ${isAdmin ? '<button class="song-lib-lyrics-link-btn" onclick="openLyricsEdit()"><i class="ti ti-edit"></i>编辑</button>' : ''}`
    : `<button class="song-lib-lyrics-link-btn" onclick="openLyricsEdit()"><i class="ti ti-plus"></i>添加歌词</button>`;
  bodyEl.innerHTML = s.lyrics
    ? `<div class="song-lib-lyrics-preview">${escapeHtml(s.lyrics)}</div>`
    : `<div class="song-lib-lyrics-empty">还没有录入纯文字歌词，添加后即可一键下载不带任何涂鸦/标记的完整歌词</div>`;
}

function openLyricsEdit(){
  if (songLibDetailCurrent && songLibDetailCurrent.lyrics && !isAdmin) { showToast('修改已有歌词需要管理员登录'); return; }
  songLibLyricsEditing = true;
  renderSongLibLyrics();
  const ta = document.getElementById('songLibLyricsTextarea');
  if (ta) ta.focus();
}

function cancelLyricsEdit(){
  songLibLyricsEditing = false;
  if (songLibDetailCurrent) renderSongLibLyrics();
}

async function saveLyricsEdit(){
  const s = songLibDetailCurrent;
  if (!s) return;
  if (s.lyrics && !isAdmin) { showToast('修改已有歌词需要管理员登录'); return; }
  const ta = document.getElementById('songLibLyricsTextarea');
  s.lyrics = (ta?.value || '').trim();
  persistSongLibrary();
  songLibLyricsEditing = false;
  renderSongLibLyrics();
  showToast('✅ 歌词已保存');
  await syncSongLibraryToRemote();
}

// 一键复制歌词（歌名 + 歌词，方便直接发到群里）
function copyCurrentSongLibLyrics(){
  const s = songLibDetailCurrent;
  if (!s || !s.lyrics) { showToast('还没有可复制的歌词'); return; }
  songLibCopyText(`${s.title}\n\n${s.lyrics}`, '✅ 歌词已复制');
}
function copyNowPlayingLyrics(){
  const s = nowPlayingSong; if (!s) return;
  const body = nowPlayingLrcLines.length ? nowPlayingLrcLines.map(l => l.text).filter(Boolean).join('\n') : String(s.lyrics || '').trim();
  if (!body) { showToast('还没有可复制的歌词'); return; }
  songLibCopyText(`${s.title}\n\n${body}`, '✅ 歌词已复制');
}
// 看图页的歌词面板（库里的歌和专属搜索 / 诗歌本的歌都走这里）
function lightboxCopyLyrics(){
  const bodyEl = document.getElementById('lightboxLyricsBody'), titleEl = document.getElementById('lightboxLyricsTitle');
  const txt = bodyEl && !bodyEl.classList.contains('empty') ? bodyEl.textContent.trim() : '';
  if (!txt) { showToast('还没有可复制的歌词'); return; }
  const title = String((titleEl && titleEl.textContent) || '').replace(/\s*·\s*歌词$/, '').trim();
  songLibCopyText(title ? `${title}\n\n${txt}` : txt, '✅ 歌词已复制');
}

function downloadCurrentSongLibLyrics(){
  const s = songLibDetailCurrent;
  if (!s || !s.lyrics) return;
  const content = `${s.title}\n\n${s.lyrics}\n`;
  downloadTextFile(content, `${sanitizeFileName(s.title)}-歌词.txt`);
}

let songLibLrcEditing = false;

function renderSongLibLrc(){
  const s = songLibDetailCurrent;
  const sectionEl = document.getElementById('songLibLrcSection');
  const actionsEl = document.getElementById('songLibLrcActions');
  const bodyEl = document.getElementById('songLibLrcBody');
  if (!sectionEl || !actionsEl || !bodyEl) return;
  if (!s || !isAdmin) { sectionEl.style.display = 'none'; return; }
  sectionEl.style.display = '';
  if (songLibLrcEditing) {
    actionsEl.innerHTML = '';
    bodyEl.innerHTML = `<div class="song-lib-lyrics-edit">
      <textarea id="songLibLrcTextarea" placeholder="逐行输入 LRC 格式歌词，如：&#10;[00:00.72]吹起复兴的风&#10;[00:04.20]我们的神&#10;[00:07.50]来点燃这地 我们呼求">${escapeHtml(s.lyricsLrc)}</textarea>
      <div class="song-lib-lyrics-edit-actions">
        <button class="btn-cancel" onclick="cancelLrcEdit()">取消</button>
        <button class="btn-save" onclick="saveLrcEdit()">保存</button>
      </div>
    </div>`;
    return;
  }
  const parsed = parseLrc(s.lyricsLrc);
  actionsEl.innerHTML = s.lyricsLrc
    ? `<button class="song-lib-lyrics-link-btn" onclick="openLrcEdit()"><i class="ti ti-edit"></i>编辑</button>
       <button class="song-lib-lyrics-link-btn" style="color:#e74c3c" onclick="clearLrcEdit()"><i class="ti ti-trash"></i>清除</button>`
    : `<button class="song-lib-lyrics-link-btn" onclick="openLrcEdit()"><i class="ti ti-plus"></i>添加</button>`;
  bodyEl.innerHTML = s.lyricsLrc
    ? `<div class="song-lib-lyrics-preview">已设置 ${parsed.length} 行同步歌词，播放时会随进度逐行高亮显示</div>`
    : `<div class="song-lib-lyrics-empty">还没有设置动态歌词。录入 LRC 格式的时间轴歌词后，播放页会随播放进度逐行同步高亮</div>`;
}

function openLrcEdit(){
  if (!isAdmin) return;
  songLibLrcEditing = true;
  renderSongLibLrc();
  const ta = document.getElementById('songLibLrcTextarea');
  if (ta) ta.focus();
}

function cancelLrcEdit(){
  songLibLrcEditing = false;
  if (songLibDetailCurrent) renderSongLibLrc();
}

async function saveLrcEdit(){
  const s = songLibDetailCurrent;
  if (!s || !isAdmin) return;
  const ta = document.getElementById('songLibLrcTextarea');
  const raw = (ta?.value || '').trim();
  if (raw && !parseLrc(raw).length) {
    showToast('⚠️ 未识别到时间戳，格式应为 [分:秒.毫秒]歌词，如 [00:00.72]吹起复兴的风');
    return;
  }
  s.lyricsLrc = raw;
  persistSongLibrary();
  songLibLrcEditing = false;
  renderSongLibLrc();
  showToast('✅ 动态歌词已保存');
  if (nowPlayingSong?.id === s.id) { nowPlayingLrcLines = parseLrc(s.lyricsLrc); nowPlayingLrcActiveIndex = -1; renderNowPlayingLyricsPanel(); }
  await syncSongLibraryToRemote();
}

async function clearLrcEdit(){
  const s = songLibDetailCurrent;
  if (!s || !isAdmin) return;
  s.lyricsLrc = '';
  persistSongLibrary();
  songLibLrcEditing = false;
  renderSongLibLrc();
  showToast('✅ 动态歌词已清除');
  if (nowPlayingSong?.id === s.id) { nowPlayingLrcLines = []; nowPlayingLrcActiveIndex = -1; renderNowPlayingLyricsPanel(); }
  await syncSongLibraryToRemote();
}

function showToast(msg, duration=2000) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.75);color:#fff;padding:9px 20px;border-radius:20px;
      font-size:13px;z-index:9999;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.bottom = floatingAudioVisible ? '150px' : '80px';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

const SUPABASE_CONFIG = {
  url: 'https://citorcvisrfqkflwortx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdG9yY3Zpc3JmcWtmbHdvcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTk4NjQsImV4cCI6MjA5NzQ3NTg2NH0.I1G-oO1T3wfWJ5GcmYejT6Y0x2wAJ0xXRQsIcPVPjos',
  table: 'church_app_state',
  rowId: 1,
  songBucket: 'song-images',
  visitsTable: 'site_visits',
  loginLogsTable: 'login_logs',
};

let supabaseClient = null;

function isSupabaseEnabled() {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && window.supabase);
}

function initSupabaseClient() {
  if (!isSupabaseEnabled()) return false;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
  }
  return true;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getSupabaseErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.details || error.hint || error.code || '');
}

function isMissingRemoteColumnError(error, columnName) {
  const msg = getSupabaseErrorMessage(error).toLowerCase();
  return !!(msg && columnName && msg.includes(String(columnName).toLowerCase()));
}

async function upsertRemoteAppState(partial) {
  if (!initSupabaseClient()) return false;
  const payload = Object.assign({
    id: SUPABASE_CONFIG.rowId,
    updated_at: new Date().toISOString(),
  }, partial);
  const { error } = await supabaseClient
    .from(SUPABASE_CONFIG.table)
    .upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  return true;
}

// ── 云端写入防覆盖（乐观锁 + 三方合并） ─────────────────────────────
// 以前：直接把本机整份数据 upsert 上去，两个人同时改会让后保存的人盖掉先保存的人。
// 现在：写之前先读一次云端；云端没人动过就直接写；有人动过就按「歌曲 id / 日期」逐项合并；
//       最后用 updated_at 当版本号做条件更新，写的瞬间又被别人抢先就重来。
const remoteBase = {};   // 字段名 → 上次读到 / 写成功时云端的内容（JSON 字符串），合并时当「共同祖先」
function remoteBaseSet(field, value) { try { remoteBase[field] = JSON.stringify(value === undefined ? null : value); } catch (e) { slDiag(e, 'remoteBaseSet'); } }
const _jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const _isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const _itemKey = it => (_isObj(it) && it.id != null) ? 'id:' + it.id : 'j:' + JSON.stringify(it);

// 三方合并：返回 { value, conflicts }。conflicts 里是「双方都改了同一项且改得不一样」的项，默认先取云端的。
function slMerge3(base, theirs, mine) {
  const conflicts = [];
  if (Array.isArray(theirs) && Array.isArray(mine)) {
    const b = new Map((Array.isArray(base) ? base : []).map(it => [_itemKey(it), it]));
    const t = new Map(theirs.map(it => [_itemKey(it), it]));
    const m = new Map(mine.map(it => [_itemKey(it), it]));
    const out = [];
    const seen = new Set();
    const label = it => (_isObj(it) && (it.title || it.name)) || String(it).slice(0, 20);
    const take = (k) => {
      seen.add(k);
      const hb = b.has(k), ht = t.has(k), hm = m.has(k);
      const vb = b.get(k), vt = t.get(k), vm = m.get(k);
      if (hm && ht) {
        if (_jsonEq(vm, vt)) return vt;
        if (hb && _jsonEq(vm, vb)) return vt;          // 我没动，云端改了
        if (hb && _jsonEq(vt, vb)) return vm;          // 云端没动，我改了
        conflicts.push({ key: k, label: label(vm), mine: vm, theirs: vt }); return vt;
      }
      if (hm && !ht) {                                   // 云端没有这项
        if (!hb) return vm;                              //   我新增的
        if (_jsonEq(vm, vb)) return undefined;           //   别人删了、我没改 → 跟着删
        conflicts.push({ key: k, label: label(vm), mine: vm, theirs: undefined }); return undefined;   // 别人删了、我改了
      }
      if (!hm && ht) {                                   // 我这里没有这项
        if (!hb) return vt;                              //   别人新增的
        if (_jsonEq(vt, vb)) return undefined;           //   我删了、云端没改 → 删
        conflicts.push({ key: k, label: label(vt), mine: undefined, theirs: vt }); return vt;          // 我删了、别人改了
      }
      return undefined;
    };
    // 顺序：先按我这边的顺序，再补上云端新增的
    [...m.keys(), ...t.keys()].forEach(k => { if (seen.has(k)) return; const v = take(k); if (v !== undefined) out.push(v); });
    return { value: out, conflicts };
  }
  if (_isObj(theirs) && _isObj(mine)) {
    const bb = _isObj(base) ? base : {};
    const out = {};
    new Set([...Object.keys(theirs), ...Object.keys(mine)]).forEach(k => {
      const hb = k in bb, ht = k in theirs, hm = k in mine;
      const vb = bb[k], vt = theirs[k], vm = mine[k];
      let v, has = true;
      if (hm && ht) {
        if (_jsonEq(vm, vt)) v = vt;
        else if (hb && _jsonEq(vm, vb)) v = vt;
        else if (hb && _jsonEq(vt, vb)) v = vm;
        else { conflicts.push({ key: k, label: k, mine: vm, theirs: vt }); v = vt; }
      } else if (hm) {
        if (!hb) v = vm; else if (_jsonEq(vm, vb)) has = false; else { conflicts.push({ key: k, label: k, mine: vm, theirs: undefined }); has = false; }
      } else {
        if (!hb) v = vt; else if (_jsonEq(vt, vb)) has = false; else { conflicts.push({ key: k, label: k, mine: undefined, theirs: vt }); v = vt; }
      }
      if (has && v !== undefined) out[k] = v;
    });
    return { value: out, conflicts };
  }
  // 其他类型（基本不会出现）：云端没动过用我的，否则以云端为准
  return { value: theirs == null ? mine : theirs, conflicts: _jsonEq(theirs, mine) ? [] : [{ key: '', label: '整体', mine, theirs }] };
}

// 合并后把结果同步回本机内存 / 本机缓存 / 界面
function applyMergedField(field, value) {
  try {
    if (field === 'song_library') { songLibrary = slApplyTagMap(slApplyPlayedLocal(normalizeSongLibrary(value)), slSongTagMap); persistSongLibrary(); try { renderSongLibFilterBar(); renderSongLibraryGrid(); updateSongLibImportHint(); } catch (e) { slDiag(e, 'applyMergedField.ui'); } }
    else if (field === SONG_TAGS_FIELD) { slSongTagMap = _isObj(value) ? value : {}; slApplyTagMap(songLibrary, slSongTagMap); persistSongLibrary(); try { renderSongLibFilterBar(); renderSongLibraryGrid(); } catch (e) { slDiag(e, 'applyMergedField.ui'); } }
    else if (field === 'song_data') { songData = normalizeSongData(value); try { songLibCacheRemoteState(); songLibRenderWeekCard(); } catch (e) { slDiag(e, 'applyMergedField.ui'); } }
    else if (field === 'song_lib_categories') { songLibCategories = normalizeSongLibCategoryList(value); persistSongLibCategories(); try { renderSongLibFilterBar(); } catch (e) { slDiag(e, 'applyMergedField.ui'); } }
    else if (field === 'song_lib_songbooks') { songLibSongbooks = normalizeSongLibSongbookList(value); persistSongLibSongbooks(); try { renderSongLibFilterBar(); } catch (e) { slDiag(e, 'applyMergedField.ui'); } }
    else if (field === 'song_lib_tags') { songLibTags = normalizeSongLibTagList(value); persistSongLibTags(); try { renderSongLibTagBar(); } catch (e) { slDiag(e, 'applyMergedField.ui'); } }
    else if (field === 'song_lib_storage_config') { songLibSupabaseConfig = normalizeSongLibSbConfig(value); songLibSupabaseClient = null; persistSongLibSupabaseConfig(); }
    else if (field === 'song_books') { songLibBookSrv = { list: Array.isArray(value) ? value : [], at: Date.now(), ok: true }; }
  } catch (e) { slDiag(e, 'applyMergedField ' + field); }
}

async function askSyncConflict(field, conflicts) {
  const lab = c => (field === SONG_TAGS_FIELD ? ((songLibrary.find(x => x.id === c.key) || {}).title || c.label) : c.label);
  const names = conflicts.slice(0, 3).map(c => '《' + lab(c) + '》').join('、') + (conflicts.length > 3 ? ` 等 ${conflicts.length} 项` : '');
  const keepMine = await _slDialog({
    message: `刚才有别人也改了 ${names}，和你这次的修改冲突。\n\n保留你的修改，会覆盖对方的改动；保留云端的，你这几处修改会被放弃。`,
    okText: '保留我的', cancelText: '保留云端的', danger: false,
  });
  return !!keepMine;
}

let _lastSyncOut = null;   // 最近一次 syncRemoteField 最终写到云端的内容
async function syncRemoteField(fieldName, value) {
  _lastSyncOut = null;
  if (!initSupabaseClient()) return false;
  const tbl = SUPABASE_CONFIG.table, rid = SUPABASE_CONFIG.rowId;
  let mine = deepClone(value);
  let decided = null;   // 冲突时用户的选择，同一次保存只问一次
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error } = await supabaseClient.from(tbl).select(fieldName + ',updated_at').eq('id', rid).maybeSingle();
    // 读不了（旧库缺 updated_at 列等）：退回老办法，保证不比以前更差
    if (error) { await upsertRemoteAppState({ [fieldName]: mine }); remoteBaseSet(fieldName, mine); return true; }
    if (!row) { await upsertRemoteAppState({ [fieldName]: mine }); remoteBaseSet(fieldName, mine); return true; }

    const theirs = row[fieldName];
    const hasBase = fieldName in remoteBase;
    const base = hasBase ? JSON.parse(remoteBase[fieldName]) : null;
    let out = mine;
    const untouched = hasBase && _jsonEq(theirs, base);   // 自从上次读取，云端这一项没人动过
    if (!untouched && theirs != null && !_jsonEq(theirs, mine)) {
      // 没有基准（比如离线启动后才第一次保存）时按「空」处理：只会补充不会删除，数据绝不会被整个盖掉
      const r = slMerge3(hasBase ? base : (Array.isArray(theirs) ? [] : {}), theirs, mine);
      out = r.value;
      if (r.conflicts.length) {
        if (decided === null) decided = await askSyncConflict(fieldName, r.conflicts);
        if (decided) {   // 保留我的：冲突项换成我的版本
          const fix = r.conflicts;
          if (Array.isArray(out)) {
            const idx = new Map(out.map((it, i) => [_itemKey(it), i]));
            fix.forEach(c => {
              const i = idx.get(c.key);
              if (c.mine === undefined) { if (i !== undefined) out[i] = null; }
              else if (i !== undefined) out[i] = c.mine; else out.push(c.mine);
            });
            out = out.filter(it => it !== null);
          } else if (_isObj(out)) {
            fix.forEach(c => { if (c.mine === undefined) delete out[c.key]; else out[c.key] = c.mine; });
          }
        }
      }
    }
    const patch = { [fieldName]: out, updated_at: new Date().toISOString() };
    let q = supabaseClient.from(tbl).update(patch).eq('id', rid);
    q = row.updated_at == null ? q.is('updated_at', null) : q.eq('updated_at', row.updated_at);
    const { data: done, error: werr } = await q.select('id');
    if (werr) throw werr;
    if (Array.isArray(done) && done.length) {
      remoteBaseSet(fieldName, out); _lastSyncOut = out;
      if (!_jsonEq(out, mine)) { applyMergedField(fieldName, out); try { showToast('已和云端上别人的改动合并', 2800); } catch (e) { slDiag(e, 'syncRemoteField'); } }
      return true;
    }
    // 0 行被更新：要么是读和写之间别人又保存了，要么是没登录管理员（被权限策略挡掉）。重读一次区分
    const { data: again } = await supabaseClient.from(tbl).select('updated_at').eq('id', rid).maybeSingle();
    if (again && (again.updated_at ?? null) === (row.updated_at ?? null)) throw new Error('没有写入权限（0 行被更新）：请先登录管理员账号');
    mine = out;   // 别人刚保存过：带着合并结果再来一轮
  }
  throw new Error('云端同步冲突次数过多，请稍后重试');
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function uploadSongDataUrl(serviceDate, dataUrl, index) {
  if (!initSupabaseClient()) return dataUrl;
  const blob = await dataUrlToBlob(dataUrl);
  const mime = blob.type || 'image/png';
  const rawExt = mime.split('/')[1] || 'png';
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const filePath = `${serviceDate}/${Date.now()}_${index}.${ext}`;
  const { error } = await supabaseClient.storage
    .from(SUPABASE_CONFIG.songBucket)
    .upload(filePath, blob, {
      contentType: mime,
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabaseClient.storage
    .from(SUPABASE_CONFIG.songBucket)
    .getPublicUrl(filePath);
  return data.publicUrl;
}

/* ═══════════════════════════════════════════════════════════════
   独立页面胶水代码（以上是从排班表 app.js 原样抽出的诗歌库代码）
   ═══════════════════════════════════════════════════════════════ */
const SCHEDULE_PAGE = 'index.html';   // 左上角「返回」回到排班表；单独部署时改成你的排班表地址

// 只拉诗歌库相关的几列（旧库缺列时退回 select('*')）
async function loadRemoteSongState() {
  if (!initSupabaseClient()) return false;
  const cols = 'song_library,song_lib_storage_config,song_lib_categories,song_lib_songbooks,song_lib_tags,' + SONG_TAGS_FIELD + ',song_data,schedule_data';
  let res = await supabaseClient.from(SUPABASE_CONFIG.table).select(cols).eq('id', SUPABASE_CONFIG.rowId).maybeSingle();
  if (res.error) res = await supabaseClient.from(SUPABASE_CONFIG.table).select('*').eq('id', SUPABASE_CONFIG.rowId).maybeSingle();
  if (res.error) throw res.error;
  const row = res.data;
  if (!row) return false;
  if (row.song_data !== undefined) songData = normalizeSongData(row.song_data);
  if (row.schedule_data && typeof row.schedule_data === 'object') scheduleData = row.schedule_data;
  songTagsSplit = row[SONG_TAGS_FIELD] !== undefined;   // 返回里有这一列，说明云端已经加好了
  slSongTagMap = _isObj(row[SONG_TAGS_FIELD]) ? row[SONG_TAGS_FIELD] : {};
  if (row.song_library !== undefined) { songLibrary = slApplyTagMap(slApplyPlayedLocal(normalizeSongLibrary(row.song_library)), slSongTagMap); persistSongLibrary(); }
  if (row.song_lib_storage_config !== undefined) {
    songLibSupabaseConfig = normalizeSongLibSbConfig(row.song_lib_storage_config);
    songLibSupabaseClient = null; persistSongLibSupabaseConfig();
  }
  if (row.song_lib_categories !== undefined) { songLibCategories = normalizeSongLibCategoryList(row.song_lib_categories); persistSongLibCategories(); }
  if (row.song_lib_songbooks !== undefined) { songLibSongbooks = normalizeSongLibSongbookList(row.song_lib_songbooks); persistSongLibSongbooks(); }
  if (row.song_lib_tags !== undefined) { songLibTags = normalizeSongLibTagList(row.song_lib_tags); persistSongLibTags(); }
  ['song_library', 'song_lib_storage_config', 'song_lib_categories', 'song_lib_songbooks', 'song_lib_tags', SONG_TAGS_FIELD, 'song_data'].forEach(f => { if (row[f] !== undefined) remoteBaseSet(f, row[f]); });   // 记下读到的云端内容，保存时用来判断「谁改了什么」
  songLibCacheRemoteState();   // 存一份到本机，离线打开时「本周诗歌 / 最近使用」才有内容
  return true;
}
// ── 使用记录 / 排班的本机缓存：每次成功读到云端就更新；没网时启动页面用它 ──
const LS_SONG_DATA_CACHE = 'songLibSongDataCache', LS_SCHEDULE_CACHE = 'songLibScheduleCache';
function songLibCacheRemoteState() {
  try { localStorage.setItem(LS_SONG_DATA_CACHE, JSON.stringify(songData)); }
  catch (e) {
    try {   // 太大存不下（涂改笔迹多）：只存歌名和谱图地址
      const lite = {};
      Object.keys(songData).forEach(k => { lite[k] = (songData[k] || []).map(x => ({ title: x.title, src: x.src })); });
      localStorage.setItem(LS_SONG_DATA_CACHE, JSON.stringify(lite));
    } catch (e2) { slDiag(e2, 'songLibCacheRemoteState'); }
  }
  try { localStorage.setItem(LS_SCHEDULE_CACHE, JSON.stringify(scheduleData)); } catch (e) { slDiag(e, 'songLibCacheRemoteState'); }
}
function songLibRestoreRemoteStateCache() {
  let ok = false;
  try { const r = localStorage.getItem(LS_SONG_DATA_CACHE); if (r) { songData = normalizeSongData(JSON.parse(r)); ok = true; } } catch (e) { slDiag(e, 'songLibRestoreRemoteStateCache'); }
  try { const r = localStorage.getItem(LS_SCHEDULE_CACHE); if (r) { const o = JSON.parse(r); if (o && typeof o === 'object') scheduleData = o; } } catch (e) { slDiag(e, 'songLibRestoreRemoteStateCache'); }
  return ok;
}
// 排班表里的 normalizeSongData（歌曲历史用到）
function normalizeSongData(raw) {
  const next = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  Object.entries(source).forEach(([key, rows]) => {
    next[key] = Array.isArray(rows)
      ? rows.map(item => {
          const o = { title: item?.title || '', src: item?.src || item?.image_url || '' };
          if (item && item.marks && typeof item.marks === 'object' && Object.keys(item.marks).length) o.marks = item.marks;   // 歌谱标记 / 涂改
          if (item && item.teach) o.teach = true;   // 本周教歌
          return o;
        }).filter(item => item.title || item.src)
      : [];
  });
  return next;
}

// ── 管理员（和排班表同一套 Supabase 账号） ──
function updateAdminUI() {
  try { if (!isAdmin && songLibSelMode) songLibBatchExit(); } catch (e) { slDiag(e, 'updateAdminUI'); }
  try { if (songLibTab === 'books') { songLibBooksUpdateAdminUI(); if (!songLibBookCur) songLibBooksRenderList(); } } catch (e) { slDiag(e, 'updateAdminUI'); }
  document.body.classList.toggle('is-admin', isAdmin);
  const b = document.getElementById('songLibAdminBtn');
  if (b) { b.classList.toggle('active', isAdmin); b.title = isAdmin ? '管理员已登录（点击退出）' : '管理员登录'; b.setAttribute('aria-label', b.title); const bl = b.querySelector('.sl-mi-l'); if (bl) bl.textContent = isAdmin ? '管理员已登录（点此退出）' : '管理员登录'; }
  const sb = document.getElementById('songLibStorageBtn');
  if (sb) sb.style.display = isAdmin ? '' : 'none';
  try { renderSongLibFilterBar(); renderSongLibraryGrid(); updateSongLibImportHint(); } catch (e) { slDiag(e, 'updateAdminUI'); }
  try { if (window.slMoreRefresh) slMoreRefresh(); } catch (e) { slDiag(e, 'updateAdminUI'); }
  if (typeof songLibDetailCurrent !== 'undefined' && songLibDetailCurrent) { try { renderSongLibLrc(); renderSongLibDetailKeyChips(); const rnb = document.getElementById('songLibDetailRenameBtn'); if (rnb) rnb.style.display = isAdmin ? '' : 'none'; } catch (e) { slDiag(e, 'updateAdminUI'); } }
}
async function syncAuthState() {
  if (!initSupabaseClient()) { isAdmin = false; updateAdminUI(); return; }
  const { data } = await supabaseClient.auth.getSession();
  isAdmin = !!data?.session;
  updateAdminUI();
  slSongTagsMigrate();
}
async function onAdminBtnClick() {
  if (isAdmin) { if (await slConfirm('退出管理员登录？')) adminLogout(); return; }
  document.getElementById('adminLoginError').classList.remove('show');
  document.getElementById('adminLoginPass').value = '';
  try { document.getElementById('adminLoginEmail').value = localStorage.getItem('songlibAdminEmail') || ''; } catch (e) { slDiag(e, 'onAdminBtnClick'); }
  document.getElementById('adminLoginOverlay').classList.add('open');
  setTimeout(() => document.getElementById('adminLoginEmail').focus(), 120);
}
function adminLoginTogglePass(btn) {
  const inp = document.getElementById('adminLoginPass');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
  btn.firstElementChild.className = show ? 'ti ti-eye-off' : 'ti ti-eye';
}
function closeAdminLogin(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('adminLoginOverlay').classList.remove('open');
}
async function doAdminLogin() {
  if (!initSupabaseClient()) { showToast('无法连接 Supabase'); return; }
  const email = document.getElementById('adminLoginEmail').value.trim();
  const password = document.getElementById('adminLoginPass').value;
  const btn = document.getElementById('adminLoginSubmit');
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      const el = document.getElementById('adminLoginError'); el.textContent = '登录失败：账号或密码不对'; el.classList.add('show');
      document.getElementById('adminLoginPass').value = ''; document.getElementById('adminLoginPass').focus();
      return;
    }
    try { localStorage.setItem('songlibAdminEmail', email); } catch (e) { slDiag(e, 'doAdminLogin'); }
    isAdmin = true;
    closeAdminLogin();
    updateAdminUI();
    showToast('✅ 已登录管理员');
  } finally { btn.disabled = false; }
}
async function adminLogout() {
  try { if (initSupabaseClient()) await supabaseClient.auth.signOut(); } catch (e) { slDiag(e, 'adminLogout'); }
  isAdmin = false;
  updateAdminUI();
  showToast('已退出管理员');
}
function openSongLibStorageSettings() {
  if (!isAdmin) return;
  fillSongLibStorageSettingsInputs();
  document.getElementById('songLibStorageOverlay').classList.add('open');
}
function closeSongLibStorageSettings(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('songLibStorageOverlay').classList.remove('open');
}
async function saveStorageAndClose() { await saveSongLibStorageConfig(); closeSongLibStorageSettings(); }

// 独立页面里诗歌库就是整个页面：「返回」回到排班表
closeSongLibrary = function () { if (SCHEDULE_PAGE) location.href = SCHEDULE_PAGE; };

// ── 本周选歌（独立页面）：需要管理员登录，从诗歌库里勾选，保存后同步到云端 ──
let songLibPendingPick = false, weekPickSel = [], weekPickTagFilter = [], weekPickTeach = [];   // weekPickTeach：已选歌曲里被设为「教歌」的歌名（草稿，点保存才写入）
function songLibPickWeekSongs(){
  if (!isAdmin) { songLibPendingPick = true; onAdminBtnClick(); return; }   // 先登录，登录成功后自动打开选歌
  openWeekPick();
}
// ── 返回键栈：打开一层「页面 / 抽屉」就压一条浏览器历史，手机返回键 / 浏览器后退只会退这一层，
//    不会把整个诗歌库页面退出去。代码里自己关掉时，会把对应的历史记录一并退掉。
const slNav = { stack: [], ops: [], busy: false, waitDone: null, lastExit: 0, ready: false };
function slNavSuspended() { try { return !!(typeof ob !== 'undefined' && ob.on); } catch (e) { return false; } }   // 引导演示时不压历史
// 对浏览器历史的操作（压入 / 后退）排成队列依次执行：history.go 是异步的，如果紧接着又 pushState，顺序会错乱
function slNavPump() {
  if (slNav.busy) return;
  const op = slNav.ops.shift(); if (!op) return;
  if (op.t === 'push') {
    try { history.pushState({ slnav: op.id }, ''); } catch (e) { slDiag(e, 'slNav.push'); }
    slNavPump(); return;
  }
  slNav.busy = true;
  let finished = false;
  const done = () => { if (finished) return; finished = true; clearTimeout(timer); slNav.waitDone = null; slNav.busy = false; slNavPump(); };
  const timer = setTimeout(done, 700);   // popstate 迟迟不来也别卡死
  slNav.waitDone = done;
  try { history.go(-op.n); } catch (e) { done(); }
}
function slNavOpen(id, onBack, guard) {
  if (slNavSuspended()) return;
  if (slNav.stack.some(x => x.id === id && !x.dead)) return;
  slNav.stack.push({ id, onBack, guard });
  slNav.ops.push({ t: 'push', id }); slNavPump();
}
// 某一层被代码关掉了：如果它是最上面一层，把对应的历史记录退掉；不是最上面的就先标记「已失效」，等上面的层退掉后一起清
function slNavClosed(id) {
  let i = -1;
  for (let k = slNav.stack.length - 1; k >= 0; k--) if (slNav.stack[k].id === id && !slNav.stack[k].dead) { i = k; break; }
  if (i < 0) return;
  if (i < slNav.stack.length - 1) { slNav.stack[i].dead = true; return; }
  slNav.stack.pop();
  let n = 1;
  while (slNav.stack.length && slNav.stack[slNav.stack.length - 1].dead) { slNav.stack.pop(); n++; }
  slNav.ops.push({ t: 'go', n }); slNavPump();
}
// 首页再按返回：第一次只提示，2.5 秒内再按一次才真的离开，免得误触直接退出
function slNavInit() {
  if (slNav.ready) return;
  try {
    const st = history.state;
    if (st && st.slhome) { slNav.ready = true; return; }                          // 刷新页面：已经有首页那一层了
    if (st && st.slnav) { history.replaceState({ slhome: 1 }, ''); slNav.ready = true; return; }   // 在某个弹层里刷新：把当前这条当成首页
    history.replaceState(Object.assign({}, st || {}, { slbase: 1 }), '');
    history.pushState({ slhome: 1 }, '');
    slNav.ready = true;
  } catch (e) { slDiag(e, 'slNavInit'); }
}
function slNavRootBack() {
  if (!slNav.ready) return;
  const now = Date.now();
  if (now - slNav.lastExit < 2500) { slNav.ready = false; try { history.go(-1); } catch (e) { slDiag(e, 'slNavRootBack'); } return; }
  slNav.lastExit = now;
  slNav.ops.push({ t: 'push', id: 'home' }); slNavPump();
  showToast('再按一次返回键，退出诗歌库', 2200);
}
window.addEventListener('popstate', async () => {
  if (slNav.waitDone) { slNav.waitDone(); return; }   // 这次是我们自己 history.go 触发的
  const top = slNav.stack[slNav.stack.length - 1];
  if (!top && slNav.ready && !slNavSuspended() && typeof songLibTab !== 'undefined' && songLibTab !== 'all') {
    // 在「诗歌本 / 歌单 / 收藏 / 最近」按返回：回到首页，并补回被这次返回消耗掉的那条历史（用 pushState，不会抖）
    try { history.pushState({ slnav: 'home' }, ''); } catch (e) { slDiag(e, 'slNav.tabBack'); }
    setSongLibTab('all');
    return;
  }
  if (!top) { slNavRootBack(); return; }
  if (top.guard && !(await top.guard())) { slNav.ops.push({ t: 'push', id: top.id }); slNavPump(); return; }
  slNav.stack.pop();
  try { top.onBack(); } catch (e) { slDiag(e, 'slNav.onBack'); }
  let n = 0;   // 露出来的如果是已经被代码关掉的层，继续往回退
  while (slNav.stack.length && slNav.stack[slNav.stack.length - 1].dead) { slNav.stack.pop(); n++; }
  if (n) { slNav.ops.push({ t: 'go', n }); slNavPump(); }
});
// 所有弹层 / 抽屉 / 播放页（class 里有 modal-overlay、now-playing-page，打开时带 open）自动接入返回栈：
// 手机返回键只会关最上面一层，不会把整个网站退出去。选歌页和大图查看器上面已经单独接好了。
(function () {
  const EXCL = new Set(['weekPickOverlay', 'weekPickFilterOverlay']);
  const isLayer = el => !!(el && el.id && el.classList && !EXCL.has(el.id) && (el.classList.contains('modal-overlay') || el.classList.contains('now-playing-page')));
  const backOf = el => () => {
    if (!el.classList.contains('open')) return;
    if (el.getAttribute('onclick')) el.click();   // 点遮罩本身 = 走它自己的关闭函数
    else if (el.id === 'nowPlayingOverlay' && typeof closeNowPlaying === 'function') closeNowPlaying();
    if (el.classList.contains('open')) el.classList.remove('open');
  };
  const seen = new WeakMap();
  const start = () => new MutationObserver(recs => {
    for (const r of recs) {
      const el = r.target; if (!isLayer(el)) continue;
      const on = el.classList.contains('open');
      if (seen.get(el) === on) continue;
      seen.set(el, on);
      if (on) slNavOpen('ov:' + el.id, backOf(el)); else slNavClosed('ov:' + el.id);
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
// 标签页（最近使用 / 诗歌本 / 我的收藏）、歌本详情、专属搜索也算一层：返回先回到上一级
(function () {
  // 切标签（首页 / 诗歌本 / 歌单 / 收藏 / 最近）不再压浏览器历史：
  // 以前切到非首页会 pushState、点回首页会 history.go(-1)，手机上这次异步的历史回退会让整个页面（导航栏和内容）一起抖一下。
  // 返回键的行为由 popstate 里「在非首页标签按返回 → 回首页」接管，效果不变。
  const _mode = setSongLibSearchMode;
  setSongLibSearchMode = function (mode) {
    const r = _mode.apply(this, arguments);
    if (mode === 'ds') slNavOpen('ds', () => _mode('lib')); else slNavClosed('ds');
    return r;
  };
  const _bo = songLibBookOpen, _bl = songLibBooksShowList;
  songLibBookOpen = function () {
    const r = _bo.apply(this, arguments);
    if (songLibBookCur) slNavOpen('book', () => songLibBookBack());
    return r;
  };
  songLibBooksShowList = function () { slNavClosed('book'); return _bl.apply(this, arguments); };
})();
// 大图查看器也接入：看图时按返回只关大图，回到选歌页 / 诗歌库
(function () {
  const _open = openLightboxWithList, _close = closeLightbox;
  openLightboxWithList = function () {
    const r = _open.apply(this, arguments);
    if (lbv.open) slNavOpen('lightbox', () => _close());
    return r;
  };
  closeLightbox = function () { _close.apply(this, arguments); slNavClosed('lightbox'); };
})();

let weekPickInit = '', weekPickSelOpen = false;
function weekPickSnapshot(){ return JSON.stringify([weekPickSel, weekPickMarks, weekPickTeach.slice().sort()]); }
function weekPickDirty(){ return weekPickSnapshot() !== weekPickInit; }
function openWeekPick(){
  const key = songLibCurWeekKey();
  weekPickSel = (songData[key] || []).filter(s => s && s.title).map(s => s.title);
  weekPickTeach = (songData[key] || []).filter(s => s && s.title && s.teach).map(s => s.title);
  const d = new Date(key + 'T00:00:00');
  document.getElementById('weekPickSub').textContent = `${d.getMonth() + 1}月${d.getDate()}日（周日）`;
  document.getElementById('weekPickSearch').value = '';
  weekPickTagFilter = []; weekPickStale = false; weekPickUnusedMonth = false; weekPickCountSort = ''; weekPickOnlySel = false;
  weekPickMarks = {};
  (songData[key] || []).forEach(s => { if (s && s.title && s.marks && typeof s.marks === 'object') weekPickMarks[s.title] = { marks: JSON.parse(JSON.stringify(s.marks)) }; });
  weekPickSelOpen = false;
  weekPickInit = weekPickSnapshot();
  renderWeekPick();
  document.getElementById('weekPickOverlay').classList.add('open');
  const ls = document.getElementById('weekPickList'); if (ls) ls.scrollTop = 0;
  slNavOpen('weekpick', weekPickDoClose, weekPickGuard);
}
function weekPickDoClose(){
  document.getElementById('weekPickFilterOverlay').classList.remove('open');
  slNavClosed('weekpickfilter');
  document.getElementById('weekPickOverlay').classList.remove('open');
}
async function weekPickGuard(){ return !weekPickDirty() || await slConfirm('有还没保存的修改，确定放弃吗？', { okText: '放弃修改', danger: true }); }
async function closeWeekPick(){
  if (!(await weekPickGuard())) return;
  weekPickDoClose();
  slNavClosed('weekpick');
}
function openWeekPickFilter(){
  renderWeekPick();
  document.getElementById('weekPickFilterOverlay').classList.add('open');
  slNavOpen('weekpickfilter', () => document.getElementById('weekPickFilterOverlay').classList.remove('open'));
}
function closeWeekPickFilter(e){
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('weekPickFilterOverlay').classList.remove('open');
  slNavClosed('weekpickfilter');
}
function resetWeekPickFilter(){
  weekPickTagFilter = []; weekPickStale = false; weekPickUnusedMonth = false; weekPickCountSort = ''; weekPickOnlySel = false;
  renderWeekPick();
}
function toggleWeekPickSel(){
  if (!weekPickSel.length) return;
  weekPickSelOpen = !weekPickSelOpen;
  renderWeekPick();
}
let weekPickView = [];
let weekPickStale = false;   // 只看久未使用
let weekPickUnusedMonth = false, weekPickCountSort = '';   // 本月未选 / 次数排序：'' | 'desc' | 'asc'
let weekPickOnlySel = false, weekPickMarks = {};   // 只看已选 / 标记草稿（title → {marks}），点「保存」才写入
function weekPickStats(){
  const key = songLibCurWeekKey();
  const ym = key.slice(0, 7), y = key.slice(0, 4) + '-';
  const map = new Map();
  Object.keys(songData || {}).forEach(k => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k === key) return;
    const seen = new Set();
    (songData[k] || []).forEach(x => {
      const t = (x && x.title || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      let st = map.get(t);
      if (!st) { st = { year: 0, month: 0, last: '' }; map.set(t, st); }
      if (k.startsWith(y)) st.year++;
      if (k.startsWith(ym)) st.month++;
      if (k < key && k > st.last) st.last = k;
    });
  });
  return map;
}
function renderWeekPick(){
  songLibResetStatsCache();
  weekPickTeach = weekPickTeach.filter(t => weekPickSel.includes(t));   // 歌被移出本周歌单，教歌标记一起去掉
  const kw = (document.getElementById('weekPickSearch').value || '').trim().toLowerCase();
  const stats = weekPickStats();
  if (!weekPickSel.length) weekPickOnlySel = false;
  const stOf = s => stats.get((s.title || '').trim()) || { year: 0, month: 0, last: '' };
  let list = songLibrary.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .filter(s => !kw || s.title.toLowerCase().includes(kw) || songLibPyMatch(s.title, kw) || (s.tags || []).some(t => t.toLowerCase().includes(kw)))
    .filter(s => !weekPickTagFilter.length || weekPickTagFilter.every(t => songLibHasTag(s, t)))
    .filter(s => !weekPickUnusedMonth || stOf(s).month === 0)
    .filter(s => !weekPickStale || ['stale', 'never'].includes(songLibUsageState(s).state))
    .filter(s => !weekPickOnlySel || weekPickSel.includes(s.title));
  if (weekPickCountSort) {
    const dir = weekPickCountSort === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const sa = stOf(a), sb = stOf(b);
      if (sa.year !== sb.year) return (sa.year - sb.year) * dir;
      return sb.last.localeCompare(sa.last);
    });
  }
  const fb = document.getElementById('weekPickFilterBar');
  const monthLbl = (parseInt(songLibCurWeekKey().slice(5, 7), 10)) + '月';
  fb.innerHTML =
    (weekPickSel.length ? `<button type="button" class="week-pick-tag${weekPickOnlySel ? ' on' : ''}" data-f="sel"><i class="ti ti-checks"></i>只看已选 ${weekPickSel.length}</button>` : '') +
    `<button type="button" class="week-pick-tag warn${weekPickUnusedMonth ? ' on' : ''}" data-f="month"><i class="ti ti-calendar-off"></i>${monthLbl}未选</button>` +
    `<button type="button" class="week-pick-tag warn${weekPickStale ? ' on' : ''}" data-f="stale"><i class="ti ti-hourglass-high"></i>久未使用</button>` +
    `<button type="button" class="week-pick-tag rank${weekPickCountSort ? ' on' : ''}" data-f="count"><i class="ti ti-trophy"></i>次数${weekPickCountSort === 'desc' ? ' 多→少' : weekPickCountSort === 'asc' ? ' 少→多' : ''}</button>`;
  if (!fb._bound) {
    fb._bound = true;
    fb.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.f === 'month') weekPickUnusedMonth = !weekPickUnusedMonth;
      else if (b.dataset.f === 'stale') weekPickStale = !weekPickStale;
      else if (b.dataset.f === 'sel') weekPickOnlySel = !weekPickOnlySel;
      else weekPickCountSort = weekPickCountSort === '' ? 'desc' : weekPickCountSort === 'desc' ? 'asc' : '';
      renderWeekPick();
    });
  }
  const tagBar = document.getElementById('weekPickTagBar');
  const allTags = getSongLibTags();
  tagBar.style.display = allTags.length ? '' : 'none';
  tagBar.innerHTML = allTags.length ? `<button type="button" class="week-pick-tag${weekPickTagFilter.length ? '' : ' on'}" data-t="">全部标签</button>` +
    allTags.map(t => `<button type="button" class="week-pick-tag${weekPickTagFilter.some(x => x.toLowerCase() === t.toLowerCase()) ? ' on' : ''}" data-t="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('') : '';
  if (!tagBar._bound) {
    tagBar._bound = true;
    tagBar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const t = b.dataset.t;
      if (!t) weekPickTagFilter = [];
      else { const i = weekPickTagFilter.findIndex(x => x.toLowerCase() === t.toLowerCase()); if (i >= 0) weekPickTagFilter.splice(i, 1); else weekPickTagFilter.push(t); }
      renderWeekPick();
    });
  }
  weekPickView = list;
  document.getElementById('weekPickResultCount').textContent = songLibrary.length ? `共 ${list.length} 首${(weekPickUnusedMonth || weekPickStale || weekPickTagFilter.length || kw || weekPickOnlySel) ? '（已筛选）' : ''} · 次数为今年已用次数` : '';
  const nFilter = (weekPickUnusedMonth ? 1 : 0) + (weekPickStale ? 1 : 0) + (weekPickOnlySel ? 1 : 0) + (weekPickCountSort ? 1 : 0) + weekPickTagFilter.length;
  const fbtn = document.getElementById('weekPickFilterBtn');
  if (fbtn) {
    fbtn.classList.toggle('active', nFilter > 0);
    document.getElementById('weekPickFilterBtnLabel').textContent = nFilter ? `筛选 · ${nFilter}` : '筛选';
  }
  const fc = document.getElementById('weekPickFilterCount'); if (fc) fc.textContent = list.length;
  if (!weekPickSel.length) weekPickSelOpen = false;
  const selToggle = document.getElementById('weekPickSelToggle');
  selToggle.classList.toggle('empty', !weekPickSel.length);
  selToggle.innerHTML = weekPickSel.length
    ? `<span><i class="ti ti-checks"></i> 已选 ${weekPickSel.length} 首${weekPickTeach.length ? ` · 教歌 ${weekPickTeach.length}` : ''} · ${weekPickSelOpen ? '收起' : '点开调整顺序 / 设教歌'}</span><i class="ti ti-chevron-${weekPickSelOpen ? 'down' : 'up'}"></i>`
    : '<span>还没选歌，点击下面的诗歌加入</span>';
  document.getElementById('weekPickChips').classList.toggle('collapsed', !weekPickSelOpen);
  document.getElementById('weekPickChips').innerHTML = weekPickSel.length
    ? `<div class="week-pick-selhead">可用箭头调整演唱顺序；要教大家的歌，点 <i class="ti ti-school"></i> 设为<b>教歌</b></div>` + weekPickSel.map((t, i) =>
      `<div class="week-pick-sel"><span class="n">${i + 1}</span><span class="t">${escapeHtml(t)}${weekPickTeach.includes(t) ? '<span class="week-pick-tcbadge"><i class="ti ti-school"></i>教歌</span>' : ''}${weekPickMarkCount(t) ? '<i class="mkdot ti ti-writing"></i>' : ''}</span>` +
      `<button type="button" class="tc${weekPickTeach.includes(t) ? ' on' : ''}" onclick="weekPickToggleTeach(${i})" aria-label="${weekPickTeach.includes(t) ? '取消教歌' : '设为教歌'}" title="${weekPickTeach.includes(t) ? '取消教歌' : '设为教歌（这周要教大家唱）'}"><i class="ti ti-school"></i></button>` +
      `<button type="button" class="mk" onclick="weekPickMarkSong(${i})" aria-label="标记歌谱" title="在歌谱上标记 / 涂改"><i class="ti ti-writing"></i></button>` +
      `<button type="button" onclick="weekPickMove(${i},-1)"${i === 0 ? ' disabled' : ''} aria-label="上移"><i class="ti ti-arrow-up"></i></button>` +
      `<button type="button" onclick="weekPickMove(${i},1)"${i === weekPickSel.length - 1 ? ' disabled' : ''} aria-label="下移"><i class="ti ti-arrow-down"></i></button>` +
      `<button type="button" class="x" onclick="weekPickRemove(${i})" aria-label="移除"><i class="ti ti-x"></i></button></div>`).join('') +
      (weekPickTeach.length ? `<div class="week-pick-teachsum"><i class="ti ti-school"></i> 本周教歌（${weekPickTeach.length}）：${weekPickSel.filter(t => weekPickTeach.includes(t)).map(escapeHtml).join('、')}</div>` : '')
    : '';
  document.getElementById('weekPickList').innerHTML = list.length ? list.map(s => {
    const idx = weekPickSel.indexOf(s.title);
    const src = s.keys[0]?.src || '';
    const st = stOf(s);
    const usage = `<span class="week-pick-usage">今年 <b>${st.year}</b> 次${st.last ? ' · 最近 ' + songLibBrDate(new Date(st.last + 'T00:00:00')) : ''}${st.month > 0 ? ' · <span class="warn">本月已用</span>' : ''}${(() => { const u = songLibUsageState(s); return u.state === 'stale' ? ' · <span class="warn">' + songLibStaleText(u.weeks) + '</span>' : u.state === 'never' ? ' · <span class="warn">从未使用</span>' : ''; })()}</span>`;
    return `<div class="week-pick-row${idx >= 0 ? ' on' : ''}" onclick="weekPickToggle('${s.id}')">
      <div class="week-pick-thumb${src ? ' pv' : ''}"${src ? ` onclick="event.stopPropagation();weekPickPreview('${s.id}')" title="点击预览歌谱"` : ''}>${src ? `<img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i class="ti ti-photo"></i>'}</div>
      <span class="week-pick-name">${escapeHtml(s.title)}${idx >= 0 && weekPickTeach.includes(s.title) ? '<span class="week-pick-tcbadge"><i class="ti ti-school"></i>教歌</span>' : ''}${idx >= 0 && weekPickMarkCount(s.title) ? '<span class="week-pick-mkbadge"><i class="ti ti-writing"></i>已标记</span>' : ''}${usage}${(s.tags && s.tags.length) ? `<span class="week-pick-tags">${s.tags.map(t => '#' + escapeHtml(t)).join(' ')}</span>` : ''}</span>
      <button type="button" class="week-pick-rn" onclick="event.stopPropagation();weekPickRename('${s.id}')" title="修改歌名（管理员）" aria-label="修改歌名"><i class="ti ti-pencil"></i></button>
      ${getAudioLinksForTitle(s.title).length ? `<button type="button" class="week-pick-play" onclick="event.stopPropagation();weekPickPlay('${s.id}')" title="试听"><i class="ti ti-player-play"></i></button>` : ''}
      <span class="week-pick-mark">${idx >= 0 ? idx + 1 : ''}</span>
    </div>`;
  }).join('') : `<div class="week-pick-empty">${songLibrary.length ? '没有找到匹配的诗歌' : '诗歌库还是空的，先上传诗歌'}</div>`;
}
function weekPickToggle(id){
  const s = songLibrary.find(x => x.id === id);
  if (!s) return;
  const i = weekPickSel.indexOf(s.title);
  if (i >= 0) weekPickSel.splice(i, 1); else weekPickSel.push(s.title);
  renderWeekPick();
}
function weekPickRemove(i){ weekPickSel.splice(i, 1); renderWeekPick(); }
// 在已选歌曲里设置 / 取消「教歌」（只能从本周已选的歌里选）
function weekPickToggleTeach(i){
  const t = weekPickSel[i]; if (t == null) return;
  const k = weekPickTeach.indexOf(t);
  if (k >= 0) weekPickTeach.splice(k, 1); else weekPickTeach.push(t);
  renderWeekPick();
}
function weekPickMove(i, d){
  const j = i + d;
  if (j < 0 || j >= weekPickSel.length) return;
  const t = weekPickSel[i]; weekPickSel[i] = weekPickSel[j]; weekPickSel[j] = t;
  renderWeekPick();
}
function weekPickPreview(id){
  const withSrc = weekPickView.filter(x => x.keys[0] && x.keys[0].src);
  const idx = withSrc.findIndex(x => x.id === id);
  if (idx < 0) return;
  openLightboxWithList(withSrc.map(x => weekPickLbItem(x.title, x.id)), idx);
}
// ── 选歌时的歌谱标记：草稿存在 weekPickMarks，点「保存」时和歌单一起写入、同步云端 ──
function weekPickHolder(title){ return weekPickMarks[title] || (weekPickMarks[title] = {}); }
function weekPickMarkCount(title){
  const h = weekPickMarks[title];
  return h && h.marks ? Object.values(h.marks).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) : 0;
}
function weekPickSrcOf(title){
  const old = (songData[songLibCurWeekKey()] || []).find(s => s && s.title === title);
  return (old && old.src) || (findSongLibEntryByTitle(title)?.keys?.[0]?.src) || '';
}
function weekPickLbItem(title, songId){
  return {
    title, src: weekPickSrcOf(title), songId,
    getMarkOwner: () => weekPickSel.includes(title) ? weekPickHolder(title) : null,
    markHint: '标记会在点「保存」后和本周歌单一起保存',
    pickState: () => weekPickSel.includes(title),
    teachState: () => weekPickTeach.includes(title),
    teachToggle: () => {
      if (!weekPickSel.includes(title)) return false;
      const k = weekPickTeach.indexOf(title);
      if (k >= 0) weekPickTeach.splice(k, 1); else weekPickTeach.push(title);
      renderWeekPick();
      return k < 0;
    },
    pickToggle: () => {
      const i = weekPickSel.indexOf(title);
      if (i >= 0) weekPickSel.splice(i, 1); else weekPickSel.push(title);
      renderWeekPick();
      return i < 0;
    },
  };
}
function weekPickMarkSong(i){
  const items = []; let at = 0;
  weekPickSel.forEach((t, k) => {
    const lib = findSongLibEntryByTitle(t);
    if (!weekPickSrcOf(t)) return;
    if (k === i) at = items.length;
    items.push(weekPickLbItem(t, lib && lib.id));
  });
  if (!items.length) { showToast('这首歌还没有歌谱图片，没法标记'); return; }
  openLightboxWithList(items, at, { mark: true });
}
function weekPickRename(id){
  const x = songLibrary.find(y => y.id === id);
  if (x) renameSongLibSong(x);   // 改完会自动刷新选歌列表，已选名单和标记草稿里的歌名一起换
}
function weekPickPlay(id){
  const x = songLibrary.find(y => y.id === id);
  if (x) quickPlaySongAudio(x.title);
}
async function saveWeekPick(){
  if (!isAdmin) { showToast('请先登录管理员'); return; }
  const key = songLibCurWeekKey();
  const old = songData[key] || [];
  songData[key] = weekPickSel.map(title => {
    const o = old.find(s => s.title === title);
    let src = (o && o.src) || (findSongLibEntryByTitle(title)?.keys?.[0]?.src) || '';
    if (src.startsWith('data:')) src = '';   // 不把巨大的 base64 图片塞进每周排班数据
    const item = { title, src };
    const h = weekPickMarks[title];
    if (h && h.marks && Object.keys(h.marks).length) item.marks = h.marks;   // 歌谱标记 / 涂改
    if (weekPickTeach.includes(title)) item.teach = true;   // 本周教歌
    return item;
  });
  weekPickDoClose();
  slNavClosed('weekpick');
  renderSongLibraryGrid();
  try {
    await syncRemoteField('song_data', songData);
    showToast('☁️ 本周诗歌已保存');
  } catch (e) {
    console.error('同步本周诗歌失败', e);
    showToast('已显示在页面上，但云端保存失败，请稍后再试', 3500);
  }
}
(function () {
  const _doAdminLogin = doAdminLogin;
  doAdminLogin = async function () {
    const wasPending = songLibPendingPick;
    await _doAdminLogin.apply(this, arguments);
    if (isAdmin && wasPending) { songLibPendingPick = false; openWeekPick(); }
  };
  const _closeAdminLogin = closeAdminLogin;
  closeAdminLogin = function () {
    _closeAdminLogin.apply(this, arguments);
    if (!document.getElementById('adminLoginOverlay').classList.contains('open')) setTimeout(() => { songLibPendingPick = false; }, 0);
  };
})();

// ══════ 歌谱标记 / 涂改（看图模式里的画布层）══════
// 笔迹以「相对图片宽高的 0~1 坐标」保存，所以放大缩小、换屏幕尺寸都对得上；按图片地址分别保存（多调各有各的标记）。
const MK_COLORS = ['#e53935', '#1e66f5', '#111111', '#1fa971', '#ffc800', '#ff5fa2'];
const MK_BASE = { pen: 0.0035, hl: 0.026, wo: 0.03, er: 0.03 };
const MK_SIZES = [0.55, 1, 1.9];
const mk = { on: false, tool: 'pen', color: MK_COLORS[0], size: 1, show: true, song: null, key: '', strokes: [], redo: [], dirty: false, cur: null, holding: null, pending: null, res: 1, rt: 0, autoT: 0, raf: 0, textPos: null };
function mkHash(str){ let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function mkKeyOf(s){ return s && s.src ? mkHash(String(s.src).replace(/\?.*$/, '')) : ''; }
function mkOwner(s){ if (!s) return null; try { return typeof s.getMarkOwner === 'function' ? s.getMarkOwner() : (s.markOwner || null); } catch (_) { return null; } }
function mkCanEdit(s){ return !!(s && s.src && isAdmin && typeof s.getMarkOwner === 'function' && mkOwner(s)); }   // 只有「选本周诗歌」里打开的谱子才能涂改
function mkStrokesOf(s){ const o = mkOwner(s), k = mkKeyOf(s), a = o && o.marks && o.marks[k]; return Array.isArray(a) ? a : []; }
function mkR4(v){ return Math.round(v * 10000) / 10000; }
function mkClone(a){ return JSON.parse(JSON.stringify(a)); }

function mkOnSong(s){
  mkFlush();
  mk.song = s; mk.key = mkKeyOf(s);
  mk.strokes = mkClone(mkStrokesOf(s)); mk.redo = []; mk.dirty = false; mk.cur = null; mk.holding = null; mk.pending = null;
  mkHideTextBox();
  if (mk.on && !mkCanEdit(s)) mk.on = false;
  const c = lbvEl('lightboxMarks'); if (c) c.style.display = 'none';
  mkSyncUI();
}
// 把当前这页的改动写回所属数据（本周歌单草稿 / 每周排班），并通知保存
function mkFlush(){
  clearTimeout(mk.autoT);
  if (!mk.song || !mk.dirty) return;
  const s = mk.song, o = mkOwner(s);
  mk.dirty = false;
  if (!o || !mk.key) return;
  if (mk.strokes.length) { o.marks = o.marks || {}; o.marks[mk.key] = mkClone(mk.strokes); }
  else if (o.marks) { delete o.marks[mk.key]; if (!Object.keys(o.marks).length) delete o.marks; }
  if (typeof s.markCommit === 'function') { try { s.markCommit(o); } catch (e) { console.error(e); } }
}
function mkAutoSave(){ clearTimeout(mk.autoT); mk.autoT = setTimeout(mkFlush, 2500); }

// 画布尺寸 / 位置始终贴合图片；放大后按倍数提高清晰度
function mkLayout(){
  const c = lbvEl('lightboxMarks'), img = lbvEl('lightboxImg');
  if (!c || !img || !img.offsetWidth || !lbv.open) return;
  const W = img.offsetWidth, H = img.offsetHeight, f = Math.min(window.devicePixelRatio || 1, 2) * mk.res;
  c.style.left = img.offsetLeft + 'px'; c.style.top = img.offsetTop + 'px';
  c.style.width = W + 'px'; c.style.height = H + 'px';
  const cw = Math.min(4096, Math.round(W * f)), ch = Math.max(1, Math.round(cw * H / W));
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  mkApplyTransform(); mkRender(); mkSyncCanvasVis();
}
function mkApplyTransform(){
  const c = lbvEl('lightboxMarks'), img = lbvEl('lightboxImg'); if (!c || !img) return;
  c.style.transform = img.style.transform;
  clearTimeout(mk.rt);
  mk.rt = setTimeout(() => { const want = Math.max(1, Math.min(3, Math.ceil(lbv.scale))); if (want !== mk.res) { mk.res = want; mkLayout(); } }, 160);
}
function mkSyncCanvasVis(){
  const c = lbvEl('lightboxMarks'); if (!c) return;
  const img = lbvEl('lightboxImg');
  c.style.display = ((mk.show || mk.on) && (mk.strokes.length || mk.on || mk.cur) && img.style.visibility !== 'hidden') ? 'block' : 'none';
}
function mkRender(){
  const c = lbvEl('lightboxMarks'); if (!c || !c.width) return;
  const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
  if (!(mk.show || mk.on)) return;
  mk.strokes.forEach(st => mkDraw(ctx, st, c.width, c.height));
  if (mk.cur) mkDraw(ctx, mk.cur, c.width, c.height);
}
function mkDraw(ctx, st, W, H){
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (st.t === 'tx') {
    ctx.font = `700 ${Math.max(8, st.f * W)}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillStyle = st.c; ctx.textBaseline = 'middle';
    ctx.fillText(st.s, st.x * W, st.y * H);
    ctx.restore(); return;
  }
  const p = st.p || [];
  if (p.length < 2) { ctx.restore(); return; }
  ctx.lineWidth = Math.max(1, st.w * W);
  if (st.t === 'er') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = ctx.fillStyle = '#000'; }
  else if (st.t === 'wo') { ctx.strokeStyle = ctx.fillStyle = '#fff'; }
  else if (st.t === 'hl') { ctx.globalAlpha = 0.38; ctx.strokeStyle = ctx.fillStyle = st.c; }
  else { ctx.strokeStyle = ctx.fillStyle = st.c; }
  if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
  else {
    ctx.beginPath(); ctx.moveTo(p[0] * W, p[1] * H);
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i] * W, p[i + 1] * H, (p[i] + p[i + 2]) / 2 * W, (p[i + 1] + p[i + 3]) / 2 * H);
    ctx.lineTo(p[p.length - 2] * W, p[p.length - 1] * H);
    ctx.stroke();
  }
  ctx.restore();
}

// ── 触摸 / 鼠标落笔 ──
function mkPt(e){ const r = lbvEl('lightboxMarks').getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
function mkBegin(e){
  const s = mk.song;
  if (!mk.on || !s || mk.tool === 'move') return false;
  const img = lbvEl('lightboxImg');
  if (img.style.visibility === 'hidden' || !img.offsetWidth) return false;
  const [x, y] = mkPt(e);
  if (x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02) return false;
  if (mk.tool === 'tx') { mk.pending = { cx: e.clientX, cy: e.clientY, x, y }; return true; }
  const t = mk.tool;
  mk.cur = { t, c: mk.color, w: +(MK_BASE[t] * MK_SIZES[mk.size]).toFixed(5), p: [mkR4(x), mkR4(y)] };
  mkSyncCanvasVis(); mkRender();
  return true;
}
function mkMove(e){
  if (!mk.cur) return;
  const [x, y] = mkPt(e), p = mk.cur.p, lx = p[p.length - 2], ly = p[p.length - 1];
  if (Math.hypot(x - lx, y - ly) < 0.0012) return;
  p.push(mkR4(x), mkR4(y));
  if (!mk.raf) mk.raf = requestAnimationFrame(() => { mk.raf = 0; mkRender(); });
}
function mkEnd(e){
  mk.holding = null;
  if (mk.pending) { const p = mk.pending; mk.pending = null; if (e.type === 'pointerup') mkShowTextBox(p); return; }
  if (!mk.cur) return;
  if (e.type === 'pointercancel') { mkCancel(); return; }
  mk.strokes.push(mk.cur); mk.cur = null; mk.redo = []; mk.dirty = true;
  mkRender(); mkSyncUI(); mkAutoSave();
}
function mkCancel(){ mk.cur = null; mk.holding = null; mk.pending = null; mkRender(); }

// ── 文字标记 ──
function mkShowTextBox(p){
  const st = lbvEl('lightboxStage'), r = st.getBoundingClientRect(), box = lbvEl('lbTextBox');
  mk.textPos = [mkR4(p.x), mkR4(p.y)];
  box.style.left = Math.max(4, Math.min(p.cx - r.left - 14, r.width - 158)) + 'px';
  box.style.top = Math.max(4, p.cy - r.top - 24) + 'px';
  box.value = ''; box.style.display = 'block';
  setTimeout(() => { try { box.focus(); } catch (_) { slDiag(_, 'mkShowTextBox'); } }, 150);
}
function mkHideTextBox(){ const b = lbvEl('lbTextBox'); if (b) { b.style.display = 'none'; b.value = ''; } mk.textPos = null; }
function mkCommitText(){
  const box = lbvEl('lbTextBox'); if (!box || box.style.display === 'none' || !mk.textPos) return;
  const v = (box.value || '').trim();
  if (v) {
    mk.strokes.push({ t: 'tx', s: v.slice(0, 40), c: mk.color, f: +(0.034 * MK_SIZES[mk.size]).toFixed(4), x: mk.textPos[0], y: mk.textPos[1] });
    mk.redo = []; mk.dirty = true; mkRender(); mkSyncUI(); mkAutoSave();
  }
  mkHideTextBox();
}

// ── 工具栏动作 ──
function mkEnter(){
  const s = mk.song || lightboxSongs[lightboxIndex]; if (!s) return;
  if (!isAdmin) { showToast('管理员登录后才能标记歌谱'); return; }
  if (!mkCanEdit(s)) { showToast(typeof s.pickToggle === 'function' ? '先把这首歌选入本周，再标记' : '这首歌暂时不能标记'); return; }
  mk.on = true; mk.show = true; mkSyncUI(); mkLayout();
}
function mkExit(){ mkCommitText(); mkFlush(); mk.on = false; mk.cur = null; mk.holding = null; mkHideTextBox(); mkSyncUI(); mkRender(); }
function mkToggleMode(){ if (mk.on) mkExit(); else mkEnter(); }
function mkToggleShow(){ mk.show = !mk.show; mkRender(); mkSyncUI(); }
function mkSetTool(t){ mkCommitText(); mk.tool = t; mkSyncUI(); }
function mkSetColor(i){ mk.color = MK_COLORS[i] || MK_COLORS[0]; mkSyncUI(); }
function mkSetSize(i){ mk.size = i; mkSyncUI(); }
function mkUndo(){ if (!mk.strokes.length) return; mk.redo.push(mk.strokes.pop()); mk.dirty = true; mkRender(); mkSyncUI(); mkAutoSave(); }
function mkRedo(){ if (!mk.redo.length) return; mk.strokes.push(mk.redo.pop()); mk.dirty = true; mkRender(); mkSyncUI(); mkAutoSave(); }
async function mkClearAll(){
  if (!mk.strokes.length) return;
  if (!await slConfirm('清除这一页上的全部标记和涂改？（可以用「重做」找回）')) return;
  mk.redo = mk.strokes.slice().reverse(); mk.strokes = []; mk.dirty = true;
  mkRender(); mkSyncUI(); mkAutoSave();
}
function lightboxToggleTeach(){
  const s = lightboxSongs[lightboxIndex];
  if (s && typeof s.teachToggle === 'function') {
    if (typeof s.pickState === 'function' && !s.pickState()) { showToast('先把这首歌选入本周，再设为教歌'); return; }
    const on = s.teachToggle(); showToast(on ? '已设为本周教歌' : '已取消教歌'); mkSyncUI();
  }
}
function lightboxTogglePick(){
  const s = lightboxSongs[lightboxIndex];
  if (s && typeof s.pickToggle === 'function') { const on = s.pickToggle(); showToast(on ? '已选入本周' : '已从本周移除'); mkSyncUI(); }
}
function mkSyncUI(){
  const lb = lbvEl('lightbox'); if (!lb) return;
  const s = mk.song, ctxOk = !!(s && typeof s.getMarkOwner === 'function' && s.src && isAdmin), canPick = !!(s && typeof s.pickToggle === 'function');
  const hasMarks = mk.strokes.length > 0;
  lb.classList.toggle('mk-on', mk.on);
  lb.dataset.mkTool = mk.tool;
  const pb = lbvEl('lightboxPickBtn'), mb = lbvEl('lightboxMarkBtn'), tg = lbvEl('lightboxMarksToggle');
  pb.style.display = canPick ? '' : 'none';
  if (canPick) { const on = !!s.pickState(); pb.classList.toggle('on', on); pb.querySelector('i').className = 'ti ' + (on ? 'ti-circle-check' : 'ti-circle-plus'); pb.querySelector('span').textContent = on ? '已选入本周' : '选入本周'; }
  mb.style.display = ctxOk ? '' : 'none';
  tg.style.display = hasMarks ? '' : 'none';
  tg.classList.toggle('on', mk.show);
  tg.querySelector('i').className = 'ti ' + (mk.show ? 'ti-eye' : 'ti-eye-off');
  const tcb = lbvEl('lightboxTeachBtn');
  const canTeach = !!(canPick && typeof s.teachToggle === 'function' && s.pickState());
  if (tcb) {
    tcb.style.display = canTeach ? '' : 'none';
    if (canTeach) { const on = !!s.teachState(); tcb.classList.toggle('on', on); tcb.querySelector('span').textContent = on ? '已设为教歌' : '设为教歌'; }
  }
  if (s) lbvRenderTitle(s);
  lbvEl('lightboxTools').style.display = (ctxOk || hasMarks || canPick) ? 'flex' : 'none';
  lb.querySelectorAll('.lb-tool').forEach(b => b.classList.toggle('on', b.dataset.tool === mk.tool));
  const row = lbvEl('lbColorRow');
  const showColors = mk.tool === 'pen' || mk.tool === 'hl' || mk.tool === 'tx';
  if (!row._built) {
    row._built = true;
    row.innerHTML = MK_COLORS.map((c, i) => `<button type="button" class="lb-dot" data-i="${i}" style="background:${c}" onclick="mkSetColor(${i})" aria-label="颜色"></button>`).join('') +
      '<span class="lb-sep"></span>' + [8, 12, 17].map((d, i) => `<button type="button" class="lb-size" data-i="${i}" onclick="mkSetSize(${i})" aria-label="粗细"><span style="width:${d}px;height:${d}px"></span></button>`).join('');
  }
  row.querySelectorAll('.lb-dot').forEach(b => { b.style.display = showColors ? '' : 'none'; b.classList.toggle('on', MK_COLORS[+b.dataset.i] === mk.color); });
  row.querySelectorAll('.lb-sep').forEach(b => { b.style.display = showColors ? '' : 'none'; });
  row.querySelectorAll('.lb-size').forEach(b => b.classList.toggle('on', +b.dataset.i === mk.size));
  lbvEl('lbUndo').disabled = !mk.strokes.length; lbvEl('lbRedo').disabled = !mk.redo.length;
  const hint = {
    move: '移动模式：拖动 / 双指缩放看谱，不会留下笔迹',
    pen: '画笔：圈、划、写；手指拖动画线，双指缩放',
    hl: '荧光笔：划过歌词或小节做重点',
    wo: '涂白：盖住谱上写错的地方，再用画笔重写；橡皮可以擦掉涂白',
    er: '橡皮：擦掉你画的标记 / 涂白（不会擦到原谱）',
    tx: '文字：点谱面想写字的地方，输入后回车',
  }[mk.tool] || '';
  lbvEl('lbMkHint').textContent = '';
  lb.querySelectorAll('.lb-tool').forEach(b => { b.title = b.dataset.tool === mk.tool ? hint : ''; });
  mkSyncCanvasVis();
}

// 每周排班里的标记：停笔后自动同步到云端
let songLibMarksT = 0;
function songLibWeekMarksCommit(){
  clearTimeout(songLibMarksT);
  songLibMarksT = setTimeout(async () => {
    try { songLibMarksT = 0; renderSongLibraryGrid(); } catch (e) { slDiag(e, 'songLibWeekMarksCommit'); }
    try {
      const ok = await syncRemoteField('song_data', songData);
      showToast(ok === false ? '标记已记录，但没有连上云端，刷新后会丢失' : '☁️ 标记已保存', ok === false ? 3500 : 2000);
    } catch (e) {
      console.error('同步标记失败', e);
      showToast('标记已显示，但云端保存失败，请稍后再试', 3500);
    }
  }, 500);
}

// 「保存」：有标记时导出「原谱 + 标记」合成的 PNG（涂白会盖住原谱）
async function mkDownloadMarked(s){
  let revoke = '';
  try {
    let url = s.src;
    if (!/^data:/.test(url)) { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error('fetch'); revoke = URL.createObjectURL(await r.blob()); url = revoke; }
    const im = new Image();
    await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = url; });
    const W = im.naturalWidth, H = im.naturalHeight;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d'); octx.drawImage(im, 0, 0, W, H);
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const lctx = layer.getContext('2d');
    mk.strokes.forEach(st => mkDraw(lctx, st, W, H));
    octx.drawImage(layer, 0, 0);
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('toBlob');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (s.title || '歌谱').replace(/[\\/:*?"<>|]/g, '_') + '（标记）.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('已保存带标记的歌谱');
    return true;
  } catch (e) {
    console.error('导出带标记图片失败', e);
    showToast('带标记的图片导出失败（图片不允许跨域读取），改为保存原图', 3200);
    return false;
  } finally { if (revoke) URL.revokeObjectURL(revoke); }
}

// ══════ 首次进入引导：诗歌库小助手 ══════
const OB_KEY = 'songlibOnboardDone_v1';
const OB_SONG = '吹起复兴的风';
const ob = { on: false, i: 0, steps: [], tk: 0, typeT: 0, posT: 0, block: null, spot: null, tip: null, keyH: null };

function obDemoSong() { return songLibrary.find(s => (s.title || '').includes(OB_SONG)) || null; }
function obImgSong() {
  const hasImg = s => s.keys.some(k => k.src);
  const d = obDemoSong();
  return (d && hasImg(d)) ? d : (songLibrary.find(hasImg) || null);
}
function obEl(sel) { try { return typeof sel === 'function' ? sel() : (sel ? document.querySelector(sel) : null); } catch (e) { return null; } }
const obPhone = () => { try { return window.matchMedia('(max-width:640px)').matches; } catch (e) { return false; } };   // 手机宽度：标签栏在底部，只有 4 项
function obVisible(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
function obSetMainSearch(v) {
  if (songLibSearchMode === 'ds') setSongLibSearchMode('lib');
  const inp = document.getElementById('songLibSearchInput');
  inp.value = v; songLibSearchKeyword = v;
  document.getElementById('songLibSearchClear').classList.toggle('visible', !!v);
  renderSongLibraryGrid();
}

const OB_FIRST_CARD = () => document.querySelector('#songLibGrid [data-sid]');
const OB_STEPS = [
  // ── 开场 ──
  { title: '你好，我是诗歌库小助手 👋', state: { tab: 'all' }, next: '开始导览',
    text: '接下来我会带你把诗歌库从头到尾走一遍，一共 9 个小章节：<br>① 认识首页　② 搜索诗歌　③ 看谱与听歌　④ 分类与筛选　⑤ 上传诗歌　⑥ 管理员　⑦ 主领选歌　⑧ 离线与备份　⑨ 点歌与主题推荐<br>每一步都会<b>高亮</b>对应的位置，点「下一步」继续，随时可以「跳过」。' },

  // ── ① 认识首页 ──
  { part: '认识首页', title: '顶部工具栏', target: '#slMoreBtn', state: { tab: 'all' },
    text: '标题右边只有一个<b>⋯「更多」</b>按钮（切到其他标签页时旁边会多一个<b>放大镜</b>用来搜索）。<b>离线与备份、使用引导（随时重看）、长辈模式、字号、上传诗歌、管理员登录</b>都收在里面，首页就清爽多了。管理员登录后，⋯ 上出现<b>红点</b>，说明有事情待处理（下面细说）。' },
  { part: '认识首页', title: '长辈模式与字号', target: () => { const r = document.getElementById('slMoreElder'); return obVisible(r) ? r : document.getElementById('elderToggleBtn'); }, state: { tab: 'all', search: '', more: true }, skip: () => !document.getElementById('elderToggleBtn'),
    text: '给长辈用很方便：「更多」菜单里的<b>长辈模式</b>一键切换——字更大、界面更简洁、只留搜歌和看谱；菜单里的<b>字号</b>可在「标准 / 大 / 特大」之间轮流切换。有音频的歌曲还会显示一个绿色<b>播放键</b>，看谱页顶部也有大号的「听歌」按钮，点一下就能边看谱边听。设置会记在这台设备上，点「标准版」就能切回来。<br>把链接后面加上 <b>?elder=1</b> 发给长辈，他们打开就直接是大字版。' },
  { part: '认识首页', title: '待处理提醒（红点）', target: '#slMoreTodo', state: { tab: 'all', search: '', more: true },
    skip: () => { try { if (window.slMoreRefresh) slMoreRefresh(); } catch (e) { slDiag(e, 'ob'); } return !document.querySelector('#slMoreTodo .sl-mi'); },
    text: '管理员登录后，如果有<b>历史排班里唱过、但诗歌库还没收录</b>的歌、有<b>同名歌曲</b>可以合并，或者有歌<b>很久没唱</b>了，「⋯」上就会出现<b>红点</b>，点开这里就能看到，点一下就能处理（久未使用那条点右边的 ✕ 可以 7 天内不再提示）。' },
  { part: '认识首页', title: '本周诗歌卡片', target: '#songLibWeekHost', state: { tab: 'all' },
    text: '首页最上面是<b>本周主日的诗歌</b>：按顺序排成 2×2（可在右上角「⋯」里切换成谱子缩略图）；有排班的话还会显示<b>主领</b>（请假的人会被划掉）。点歌名看歌曲详情和谱子（缩略图样式下点缩略图可<b>放大看谱</b>）。<br>搜索或筛选时这张卡片会自动收起。' },
  { part: '认识首页', title: '分享 / 更多', target: () => document.querySelector('#songLibWeekHost .song-lib-weekhead-r') || document.getElementById('songLibWeekHost'), state: { tab: 'all' },
    text: '<b>⋯</b>：里面有<b>最近使用</b>（按周看本月唱过的歌）、<b>切换样式</b>（2×2 / 缩略图）；管理员还有<b>修改本周选歌</b>。<br><b>分享</b>：生成「本周诗歌」海报，可保存图片、复制文字、复制链接，别人点链接就能看本周歌谱；海报窗口里还有<b>发谱子</b>，把每首歌的谱子拆成独立图片，一键发到微信群。' },

  // ── ② 搜索诗歌 ──
  { part: '搜索诗歌', title: '搜歌：输入歌名', target: '#songLibSearchWrap', state: { tab: 'all', search: '' }, type: 'main',
    text: '首页的搜索框一直都在。我来帮你搜「<b>' + OB_SONG + '</b>」～<br>除了歌名，还能搜<b>诗歌本、乐团、主题标签</b>；不会打字？输入<b>拼音首字母</b>也行，比如 <b>cqfxdf</b>。' },
  { part: '搜索诗歌', title: '搜索结果', target: () => OB_FIRST_CARD() || document.getElementById('songLibGrid'), state: { tab: 'all', search: OB_SONG },
    text: () => OB_FIRST_CARD()
      ? '搜到啦！匹配的字会<b>高亮</b>。每张卡片会显示：谱子缩略图、歌名、<b>诗歌本</b>和<b>主题标签</b>、有几个调，以及<b>最近使用日期</b>。点卡片进详情，点缩略图放大看谱。<br>搜索框右边点「搜索」可收起键盘，点 ✕ 清空。'
      : '诗歌库里暂时没有这首歌，所以这里是空的。别担心，下面两步的「专属搜索」可以去别的诗歌本里找。' },
  { part: '搜索诗歌', title: '库里没有？切到专属搜索', target: '#songLibDsSwitch', state: { tab: 'all', ds: true },
    text: '搜索框下面有两个模式：<b>诗歌库</b>（只搜本库）和<b>专属搜索</b>。刚才的搜索如果没结果，页面也会出现一个「用专属搜索去诗歌本 / 赞美网搜」的按钮。现在我已经帮你切到了专属搜索界面。' },
  { part: '搜索诗歌', title: '专属搜索：选来源', target: '#songLibDsSources', state: { tab: 'all', ds: true },
    text: '来源有三个：<b>全部</b>、<b>诗歌本</b>、<b>赞美网</b>。选「诗歌本」后还能指定歌本（如灵栖清泉、赞美之泉）；赞美网结果多时可点「加载更多」。<br>输入歌名后按<b>回车</b>或点「搜索」开始找；结果点开后可<b>全屏看谱，左右滑动切歌</b>。这里我就不真的联网搜了，导览结束后你可以自己试试。' },

  // ── ③ 看谱与听歌 ──
  { part: '看谱与听歌', title: '歌曲卡片', target: OB_FIRST_CARD, state: { tab: 'all', search: '' }, skip: () => !songLibrary.length,
    text: '回到全部诗歌。每首歌是一张卡片：点<b>谱子缩略图</b>放大看谱；点<b>歌名或卡片空白处</b>进入歌曲详情；右下角两个小按钮分别是<b>播放</b>和<b>收藏</b>。' },
  { part: '看谱与听歌', title: '播放按钮', target: () => document.querySelector('#songLibGrid .song-lib-card-play-btn'), state: { tab: 'all', search: '' }, skip: () => !songLibrary.length,
    text: '点 <b>▶</b> 直接播放这首歌的音频（管理员上传过 mp3 才有声音；只有 YouTube 等链接时会打开播放窗口）。播放后<b>底部会出现迷你播放条</b>，可以暂停、上一首 / 下一首、切换<b>单曲循环 / 列表播放</b>，关掉窗口也不会断。' },
  { part: '看谱与听歌', title: '收藏按钮', target: () => document.querySelector('#songLibGrid .song-lib-card-fav-btn'), state: { tab: 'all', search: '' }, skip: () => !songLibrary.length,
    text: '点 <b>♡</b> 把歌收藏起来，之后在「<b>我的收藏</b>」标签页里集中查看。收藏只保存在你自己的手机 / 浏览器里，不会影响别人。' },
  { part: '看谱与听歌', title: '看谱模式：缩放与翻页', target: '.lightbox-foot', state: { tab: 'all', search: '', lightbox: true }, skip: () => !obImgSong(),
    text: '这是点谱图后的<b>全屏看谱</b>。<b>双击</b>或<b>双指</b>缩放，放大后<b>拖动</b>查看细节；底部的 ＋ － 也能缩放，「适应屏幕」一键还原。<br>在列表里打开时，<b>左右滑动</b>（电脑用方向键）就能切换上一首、下一首。' },
  { part: '看谱与听歌', title: '看谱模式：顶部按钮', target: '.lightbox-acts', state: { tab: 'all', search: '', lightbox: true }, skip: () => !obImgSong(),
    text: '<b>歌词</b>：在谱子旁边展开完整歌词，对照着看；<b>保存</b>：下载谱子图片；<b>新窗口原图</b>：电脑上用新标签页看原图；<b>关闭</b>：回到列表。<br>主领在谱上留下的<b>标记</b>（圈点、荧光笔、文字等）会直接显示出来，点「保存」时连标记一起存成图片；这里<b>只能看标记，不能涂改</b>。管理员还会在标题旁看到 ✎，可以直接<b>改歌名</b>。' },
  { part: '看谱与听歌', title: '发现谱子有错？点「纠错」', target: '#lightboxFixBtn', state: { tab: 'all', search: '', lightbox: true }, skip: () => !obImgSong(),
    text: '看谱时发现音符、歌词、调号不对，或者图片缺页不清楚，点底部的<b>「纠错」</b>就能告诉管理员，<b>不用登录</b>。（专属搜索里的外部谱子不收纠错。）' },
  { part: '看谱与听歌', title: '提交纠错', target: '#fxOverlay .song-lib-filter-drawer', state: { tab: 'all', search: '', lightbox: true, fix: true }, skip: () => !obImgSong(),
    text: '先选<b>问题类型</b>（音符 / 歌词 / 调号 / 记号 / 缺页 / 其他），再写一句<b>哪里不对</b>，位置写得越具体越好改，比如「第二段第三行第 5 个音应该是 6」。称呼可以不填。提交后管理员核对再修改歌谱。每台设备每天最多提交 10 条。现在只是演示，不会真的提交。' },
  { part: '看谱与听歌', title: '看谱模式：切换调', target: '#lightboxKeys',
    state: { tab: 'all', search: '', lightbox: true },
    skip: () => { const s = obImgSong(); return !(s && s.keys.filter(k => k.src).length > 1); },
    text: '一首歌有多个调 / 多个谱时，底部会出现<b>调的按钮</b>，点一下就换成对应的谱子，电脑上也可用 ↑ ↓ 切换。管理员还会多一个「<b>改调名</b>」按钮，可以直接修改当前这个调的名称。' },
  { part: '看谱与听歌', title: '详情：谱图与播放', target: '.song-lib-detail-thumb-wrap', state: { tab: 'all', search: '', detail: true }, skip: () => !songLibrary.length,
    text: '这是<b>歌曲详情</b>。大图点一下可放大看谱；右下角绿色圆形按钮进入<b>「正在播放」页</b>：有进度条、<b>变调</b>（切换不同的调）、<b>节拍器</b>、<b>歌词</b>（有时间轴的会随歌曲逐行高亮）和播放列表。' },
  { part: '看谱与听歌', title: '详情：收藏与分享', target: '.song-lib-detail-title-row', state: { tab: 'all', search: '', detail: true }, skip: () => !songLibrary.length,
    text: '歌名旁边：<b>♡</b> 收藏；<b>分享</b>会生成一张带二维码的<b>分享海报</b>，可保存海报、保存谱图或复制链接；管理员还会看到 <b>✎</b>，可以修改歌名（使用记录会一起更新）。' },
  { part: '看谱与听歌', title: '详情：来源与主题标签', target: () => { const e = document.getElementById('songLibDetailSource'); return obVisible(e) ? e : document.querySelector('.song-lib-detail-title-row'); }, state: { tab: 'all', search: '', detail: true }, skip: () => !songLibrary.length,
    text: '标题下面会列出这首歌的<b>乐团、诗歌本</b>和<b>主题标签</b>（如感恩、圣餐、圣诞）。这些标签也能在首页搜索和筛选里用。管理员在这里会看到「<b>编辑</b>」，可以补充乐团、诗歌本和标签。' },
  { part: '看谱与听歌', title: '详情：调 / 谱', target: '#songLibKeyChips', state: { tab: 'all', search: '', detail: true }, skip: () => !songLibrary.length,
    text: '一首歌可以有<b>多个调</b>（比如 C 调、D 调、不同诗歌本的谱）。点一下切换上面的谱图；点「<b>＋ 添加调</b>」可以给这首歌补上新的谱子，同样支持图片链接或本地上传。管理员在调旁边会看到 ✎，可以<b>修改调名</b>（留空表示「默认」）。' },
  { part: '看谱与听歌', title: '详情：下载与歌词', target: '#songLibDownloadImgBtn', state: { tab: 'all', search: '', detail: true }, skip: () => !songLibrary.length,
    text: '<b>下载当前调的诗歌图片</b>，方便打印或发给别人。再往下是<b>完整歌词</b>，可以一键下载成不带任何涂鸦的纯文字；还没有歌词的话，点「添加歌词」就能补上。' },
  { part: '看谱与听歌', title: '详情：使用记录', target: '#songLibUsageList', state: { tab: 'all', search: '', detail: true }, skip: () => !songLibrary.length,
    text: '最下面是<b>使用记录</b>：这首歌在哪些主日唱过。选歌时参考它，就不会连续几周唱同一首啦。' },

  // ── ④ 分类与筛选 ──
  { part: '分类与筛选', title: () => obPhone() ? '底部导航栏' : '五个标签页', target: '#songLibTabs', state: { tab: 'all', search: '' },
    text: () => obPhone()
      ? '屏幕<b>最下面</b>有 4 个按钮：<b>首页</b>：全部诗歌；<b>诗歌本</b>：按歌本浏览；<b>我的歌单</b>：<b>本周选好的歌会自动出现在这里</b>，也可以在详情页点「加入歌单」自己添加；<b>我的收藏</b>：你点过 ♡ 的歌。<br>还有一个<b>最近使用</b>，入口在首页「本周诗歌」卡片的右上角，下一步指给你看。'
      : '<b>首页</b>：全部诗歌；<b>最近使用</b>：按周看本月唱过的歌；<b>诗歌本</b>：按歌本浏览；<b>我的歌单</b>：<b>本周选好的歌会自动出现在这里</b>，也可以在详情页点「加入歌单」自己添加；<b>我的收藏</b>：你点过 ♡ 的歌。下面我带你各看一眼。' },
  { part: '分类与筛选', title: '「最近」按钮', target: () => document.querySelector('#songLibWeekHost .sl-wkm-btn') || document.querySelector('#songLibWeekHost [data-act="recent"]') || document.getElementById('songLibRecentBtn'), state: { tab: 'all', search: '' }, skip: () => !obPhone(),
    text: '点首页「本周诗歌」卡片右上角的<b>「⋯」</b>，选<b>「最近使用」</b>，就能看<b>最近使用</b>：按周看本月唱过的歌。看完点底部的「首页」就回来了。下面我带你各看一眼。' },
  { part: '分类与筛选', title: '最近使用', target: () => document.querySelector('#songLibGrid .song-lib-weekcard') || document.getElementById('songLibGrid'), state: { tab: 'recent' },
    text: '本月<b>每一周一张卡片</b>，最近的在最前面，标着「本周 / 上周 / 上上周」；卡片里的歌谱<b>横向排开</b>，歌名在图下面。想看某首歌上周唱了没有，来这里一眼就知道。点歌名看详情，点缩略图看谱。' },
  { part: '分类与筛选', title: '我的歌单', target: '#songLibGrid', state: { tab: 'playlist' },
    text: '<b>本周主领选好的歌，会自动出现在这里</b>（带「本周」小标记，按选歌顺序排在最前面），聚会前想把本周的歌过一遍，来这里就行，不用自己再找。<br>想长期留着的歌，在<b>歌曲详情页</b>点标题旁的「加入歌单」按钮，它会排在本周的歌后面，过了本周也还在。歌单只存在这台设备上。' },
  { part: '分类与筛选', title: '我的收藏', target: '#songLibGrid', state: { tab: 'favorite' },
    text: () => songLibrary.some(s => isSongLibFavorite(s.id))
      ? '这里是你收藏的歌，用法和首页一样，支持搜索和排序。'
      : '这里是你收藏的歌。你还没有收藏任何诗歌，点歌曲卡片上的 <b>♡</b> 就会出现在这里。' },
  { part: '分类与筛选', title: '诗歌本', target: '#songLibBkList .song-lib-bk-top', state: { tab: 'books' },
    text: '这里按<b>歌本</b>浏览，上面可以搜歌本名或编号。点进某一本歌本后，能看到本书所有歌谱；输入「<b>第几首</b>」点查找，就能直接定位，比如第 123 首。管理员还有「歌本管理」，可以设置歌本封面和介绍。' },
  { part: '分类与筛选', title: '筛选按钮', target: '#songLibFilterBtn', state: { tab: 'all', search: '' },
    text: '回到首页，工具栏上的<b>「筛选」</b>按钮可以打开筛选抽屉。我帮你打开看看 👉' },
  { part: '分类与筛选', title: '排序', target: '#songLibSortBox', state: { tab: 'all', search: '', filter: true },
    text: '<b>排序</b>有四种：<b>收录时间</b>、<b>拼音首字母</b>、<b>最近使用</b>、<b>使用次数</b>。右边的小按钮可以切换正序 / 倒序。选「使用次数」会变成<b>排行榜</b>，前三名有金银铜奖牌，还能选统计范围是<b>今年</b>还是<b>全部历史</b>。' },
  { part: '分类与筛选', title: '本周卡片显示', target: '#songLibWeekPrefBar', state: { tab: 'all', search: '', filter: true },
    text: '不想在首页看到「本周诗歌」卡片？在这里选<b>隐藏</b>就行，随时可以再改回<b>显示</b>。' },
  { part: '分类与筛选', title: '按诗歌本、标签筛选', target: '#songLibFilterBar', state: { tab: 'all', search: '', filter: true },
    text: '<b>诗歌本</b>：点一个就只看这本里的歌（数字是歌曲数量）。往下的<b>主题标签</b>（如感恩、圣餐、圣诞）可以<b>多选</b>，歌曲需要同时包含所选标签才会显示。管理员还能在这里新增、重命名、删除诗歌本和标签。' },
  { part: '分类与筛选', title: '瀑布流 / 列表', target: '#songLibViewSwitch', state: { tab: 'all', search: '' },
    text: '工具栏右边可以切换视图：<b>瀑布流</b>以谱图为主，适合快速浏览；<b>列表</b>更紧凑，一屏能看到更多歌名。你的选择会被记住。' },

  // ── ⑤ 上传诗歌 ──
  { part: '上传诗歌', title: '上传入口', target: 'button[onclick="openSongLibAdd()"]', state: { tab: 'all', search: '', more: true },
    text: '「⋯」菜单里的<b>上传诗歌</b>，<b>任何人</b>都可以用，提交后立即生效。我帮你打开上传窗口看看 👉' },
  { part: '上传诗歌', title: '填写歌曲信息', target: '#songLibAddName', state: { tab: 'all', search: '', add: true },
    text: '<b>诗歌名称</b>是必填项。如果库里已经有同名歌，会立刻提示「已经有同名诗歌了」，避免重复上传。下面还可以填<b>分类、乐团、诗歌本</b>，并点选<b>主题标签</b>。' },
  { part: '上传诗歌', title: '添加谱子', target: '#songLibAddOverlay .local-upload-btn', state: { tab: 'all', search: '', add: true },
    text: '谱子有两种方式：贴一个<b>图片链接</b>，或者点这里<b>从手机 / 电脑上传图片</b>。「调」一栏可以填 C 调、原调等；上传的图片会自动存到云端。' },
  { part: '上传诗歌', title: '歌词与提交', target: '#songLibAddSubmitBtn', state: { tab: 'all', search: '', add: true },
    text: '歌词可以顺手粘贴（以后能一键下载纯文字歌词）。都填好后点「<b>上传</b>」就收录啦。现在只是演示，我会帮你把窗口关掉，什么也不会提交。' },

  // ── ⑥ 管理员 ──
  { part: '管理员', title: '管理员登录入口', target: '#songLibAdminBtn', state: { tab: 'all', search: '', more: true },
    text: '「⋯」菜单里的<b>管理员登录</b>（盾牌图标）。登录后这一行会变成高亮色，再点一下可以退出。普通用户不登录也能搜歌、看谱、听歌、上传。' },
  { part: '管理员', title: '登录窗口', target: '#adminLoginEmail', state: { tab: 'all', search: '', login: true }, skip: () => isAdmin,
    text: '输入管理员的<b>邮箱和密码</b>就能登录，账号和排班表是同一套。主领选歌也需要先登录，没登录时点「我要选歌」会自动弹出这个窗口，登录成功后直接进入选歌。' },
  { part: '管理员', title: '管理员能做什么', target: '#songLibAdminBtn', state: { tab: 'all', search: '', more: true },
    text: '登录后会多出这些功能：<b>选本周诗歌</b>、<b>修改歌名 / 调名</b>、<b>批量选择</b>歌曲统一设置标签和诗歌本、<b>合并同名歌曲</b>、管理<b>诗歌本和标签</b>、设置<b>动态歌词</b>（LRC 时间轴）、<b>音乐存储设置</b>、选歌时在谱子上<b>标记涂改</b>，以及查看大家提交的歌谱<b>纠错反馈</b>。下面几步挑最常用的演示（只有管理员登录后才会看到）。' },

  { part: '管理员', title: '批量选择', target: '#songLibBatchBtn', state: { tab: 'all', search: '' }, skip: () => !isAdmin,
    text: '工具栏上的<b>「批量」</b>按钮可以一次改很多首歌：进入后点卡片就是<b>勾选</b>（不会打开详情）。下面我帮你进入批量模式看看 👉' },
  { part: '管理员', title: '批量操作条', target: '#songLibSelBar', state: { tab: 'all', search: '', batch: 'bar' }, skip: () => !isAdmin || !songLibrary.length,
    text: '底部出现操作条：显示<b>已选几首</b>，可以<b>全选</b>；「<b>合并</b>」把勾选的几首同名歌合成一首；「<b>设置标签</b>」统一加标签、去标签、改诗歌本。点「取消」退出批量模式。' },
  { part: '管理员', title: '批量设置标签 / 诗歌本', target: '#songLibBatchOverlay .song-lib-filter-drawer', state: { tab: 'all', search: '', batch: 'drawer' }, skip: () => !isAdmin || !songLibrary.length,
    text: '<b>添加标签</b>：点选的标签会加到所有已选歌曲上，也能点「＋新标签」现建一个；<b>移除标签</b>：列出已选歌曲里已有的标签，点选后统一去掉；<b>设置诗歌本</b>：留空表示不修改。点「应用」才会生效，并同步到云端。现在只是演示，我不会应用。' },
  { part: '管理员', title: '歌谱纠错反馈收件箱', target: '#fxInboxBtn', state: { tab: 'all', search: '', more: true }, skip: () => !isAdmin || !document.getElementById('fxInboxBtn'),
    text: '菜单里的<b>歌谱纠错反馈</b>（旗子图标）收着大家提交的纠错，后面的红色数字表示还有<b>未处理</b>的。点开可以<b>看谱</b>定位到那一页、标为<b>已处理</b>或删除；也可以点「显示已处理」翻旧账。看谱时点「纠错」，还能看到这首歌已有的纠错。' },
  { part: '管理员', title: '音乐存储设置', target: '#songLibStorageBtn', state: { tab: 'all', search: '', more: true }, skip: () => !isAdmin,
    text: '菜单里的<b>音乐存储设置</b>（齿轮图标）用来配置存放 mp3 的 Supabase 存储（项目地址、anon key、bucket 名称，默认 songs）。配好后，给歌曲添加音乐链接时就能<b>直接上传 mp3</b>，不用再另外找地方存。只需要设置一次。' },

  // ── ⑦ 主领选歌 ──
  { part: '主领选歌', title: '主领从这里开始', target: '#songLibWeekHost', state: { tab: 'all', search: '' },
    text: '本周还没选歌时，首页顶部会出现「<b>我是主领，我要选歌</b>」按钮；已经选过的话，点卡片上的「<b>修改</b>」。没登录会先让你登录。下面我打开选歌窗口演示 👉' },
  { part: '主领选歌', title: '① 搜歌', target: '#weekPickSearch', state: { pick: true, pickSearch: '', pickSel: false }, type: 'pick',
    text: '选歌窗口里也有搜索框，支持歌名、<b>拼音首字母</b>和标签。我来搜「<b>' + OB_SONG + '</b>」。<br>（现在只是演示，<b>不会保存</b>任何东西。）' },
  { part: '主领选歌', title: '② 点选歌曲', target: () => document.querySelector('#weekPickList .week-pick-row') || document.getElementById('weekPickList'), state: { pick: true, pickSearch: OB_SONG, pickSel: false },
    text: '每行是一首歌：左边<b>缩略图</b>（点一下可预览谱子）、歌名、<b>今年用过几次 · 最近什么时候用</b>，有「本月已用」会提醒你；右边 <b>✎</b> 改名、<b>▶</b> 试听。<b>点一下整行就选中</b>，右侧出现序号。' },
  { part: '主领选歌', title: '③ 已选歌曲与顺序', target: () => { const c = document.getElementById('weekPickChips'); return (c && c.children.length) ? c : document.getElementById('weekPickList'); }, state: { pick: true, pickSearch: OB_SONG, pickSel: true, pickOpen: true },
    text: () => obDemoSong()
      ? '看，「' + OB_SONG + '」已经被选中，列在上方的<b>已选名单</b>里了。用 <b>↑ ↓</b> 调整演唱顺序，点 <b>✕</b> 移除。顺序就是首页本周卡片里的顺序。<br>这周要<b>教大家唱</b>的歌，点旁边的<b>🎓 帽子图标</b>设为「<b>教歌</b>」（只能从已选的歌里挑），首页本周卡片上会单独列出<b>本周教歌</b>。'
      : '选中的歌会列在上方的<b>已选名单</b>里，用 <b>↑ ↓</b> 调整演唱顺序，点 <b>✕</b> 移除。顺序就是首页本周卡片里的顺序。<br>这周要<b>教大家唱</b>的歌，点旁边的<b>🎓 帽子图标</b>设为「<b>教歌</b>」（只能从已选的歌里挑），首页本周卡片上会单独列出<b>本周教歌</b>。' },
  { part: '主领选歌', title: '④ 在谱子上做标记', target: () => document.querySelector('#weekPickChips .week-pick-sel .mk') || document.getElementById('weekPickList'), state: { pick: true, pickSearch: OB_SONG, pickSel: true, pickOpen: true },
    text: '已选歌曲旁边的<b>笔图标</b>进入标记 / 涂改模式：<b>画笔、荧光笔、涂白</b>（盖住写错的地方）、<b>橡皮、文字</b>，还有<b>撤销 / 重做 / 清空这一页</b>。比如标出间奏、升调、重复几遍，标过的歌会显示「已标记」。<br>涂改<b>只在选歌时</b>才能用，其他地方的看图模式只能看标记。标记点「保存」后和歌单一起同步，大家看谱时就能看到。' },
  { part: '主领选歌', title: '⑤ 避免重复选歌', target: '#weekPickFilterBar', state: { pick: true, pickSearch: '', pickSel: true, pickFilter: true },
    text: '点搜索框旁边的「<b>筛选</b>」按钮，里面有：<br><b>只看已选</b>：只显示选中的歌；<b>本月未选</b>：只看这个月还没唱过的歌；<b>久未使用</b>：很久没唱、或从没唱过的歌；<b>次数</b>：按今年使用次数<b>多→少 / 少→多</b>排序，想让大家多唱老歌或新歌都方便。' },
  { part: '主领选歌', title: '⑥ 按标签筛选', target: '#weekPickTagBar', state: { pick: true, pickSearch: '', pickSel: true, pickFilter: true }, skip: () => !getSongLibTags().length,
    text: '有主题标签时，这里可以<b>点标签筛选</b>，比如选「感恩」就只列出感恩主题的歌，可以多选。' },
  { part: '主领选歌', title: '⑦ 保存', target: '#weekPickSave', state: { pick: true, pickSearch: '', pickSel: true },
    text: '最后点「<b>保存</b>」，本周诗歌就会<b>同步到云端</b>，大家刷新首页就能看到。演示到这里，我不会保存，也会把选歌窗口关掉，放心～' },
  { part: '主领选歌', title: '选完之后', target: '#songLibWeekHost', state: { tab: 'all', search: '' },
    text: '保存后首页的「本周诗歌」就会显示你选的歌。你可以再点<b>分享</b>生成海报（里面还能「发谱子」到微信群），大家就能提前准备啦。' },

  // ── ⑧ 离线与备份 ──
  { part: '离线与备份', title: '离线与备份入口', target: '#olOpenBtn', state: { tab: 'all', search: '', more: true },
    text: '「⋯」菜单里的<b>离线与备份</b>（云朵图标）。离线歌谱、导出 PDF 歌本、数据备份、问题排查都收在这里，首页就不会塞太多按钮。下面我帮你打开看看 👉' },
  { part: '离线与备份', title: '离线歌谱包', target: '#olBody', state: { ol: true },
    text: '教会没信号怎么办？选一周或一个诗歌本，点「<b>下载</b>」把谱图存到这台设备里，<b>没信号也能看谱</b>。每周选了新歌后，回来点「<b>更新</b>」补齐。上面的小条会显示网络和存储状态。' },
  { part: '离线与备份', title: '导出 PDF 歌本', target: '#songLibExportBtn', state: { ol: true },
    text: '<b>导出 PDF 歌本</b>已经从首页挪到了这里：可以把诗歌库导出成 PDF，方便打印或发给别人。点这个按钮会打开导出设置，我带你看一眼 👉' },
  { part: '离线与备份', title: '导出设置', target: '#expScopeBar', state: { exp: true },
    text: '先选<b>导出范围</b>（当前列表、批量选中的歌、全部歌曲），再选<b>内容</b>：「<b>含歌谱图片</b>」和「<b>每首的所有调</b>」。不勾图片就只生成目录，文件很小。最后点「<b>生成 PDF</b>」，完成后可以<b>保存或分享</b>。现在只是演示，我不会真的生成。' },
  { part: '离线与备份', title: '数据备份', target: () => Array.from(document.querySelectorAll('#olOverlay .ol-sec-title')).find(e => (e.textContent || '').includes('数据备份')) || document.getElementById('olOverlay'), state: { ol: true },
    text: '<b>导出备份</b>会把整个诗歌库（歌曲、标签、分类、诗歌本、使用记录、收藏）存成一个文件；换设备或出问题时，点「<b>导入备份</b>」就能恢复。建议隔一段时间导出一份留底。' },
  { part: '离线与备份', title: '问题排查', target: '#olDiagInfo', state: { ol: true },
    text: '页面出错时会自动记在本机（<b>不含密码和账号</b>）。遇到问题时点「<b>复制诊断信息</b>」或「<b>导出</b>」，发给管理员就能快速定位。' },

  // ── ⑨ 点歌建议箱与主题推荐 ──
  { part: '点歌与主题推荐', title: '本周主题与点歌箱', target: '#songLibCongHost', state: { tab: 'all', search: '' }, skip: () => !(window.SG && SG.enabled()),
    text: '首页本周诗歌下面有一张<b>会众小卡片</b>：上面是<b>本周主题</b>（自动取自排班表里的本周证道讲题），下面是<b>点歌建议箱</b>。人人都能看、能点，<b>不用登录</b>。不想看到这张卡片，点右上角的 ✕ 就能隐藏，想恢复到「筛选 → 会众卡片」里打开。' },
  { part: '点歌与主题推荐', title: '点歌建议箱', target: '#sgForm', state: { sg: 'box' }, skip: () => !(window.SG && SG.enabled()),
    text: '想唱哪首？输入<b>歌名或拼音首字母</b>，库里有的会自动提示；可以写一句<b>原因</b>，称呼不填就显示「匿名」。每人每周最多点 <b>3 首</b>，同一首只能点一次。<br>点歌只是给主领的<b>参考</b>，是否安排由主领和同工决定。（现在只是演示，不会真的提交。）' },
  { part: '点歌与主题推荐', title: '大家想唱的歌', target: '#sgList', state: { sg: 'box' }, skip: () => !(window.SG && SG.enabled()),
    text: '下面是<b>本周大家想唱的歌</b>，按人数排序。看到也想唱的，点「<b>＋1</b>」就行（也算你的 3 首之一）；已经排进本周歌单的会标出来。管理员还能把点歌<b>一键加入本周歌单</b>，或<b>忽略</b>不合适的。' },
  { part: '点歌与主题推荐', title: '按主题推荐', target: '#sgThemeBody', state: { sg: 'theme' }, skip: () => !(window.SG && SG.enabled()),
    text: '点主题那一行，会看到<b>主题推荐</b>：根据主题里的<b>标签和关键词</b>，到歌名、标签、歌词里找相关的歌，并写明理由，比如「标签：感恩」「歌词含「盼望」」。<b>从未用过、很久没唱</b>的排前面，<b>上周刚唱过</b>的会提醒。会众也可以提前看看、听听。' },
  { part: '点歌与主题推荐', title: '设置本周主题（管理员）', target: '#sgThemeEditBtn', state: { sg: 'theme' }, skip: () => !(window.SG && SG.enabled()) || !isAdmin,
    text: '本周证道的<b>讲题和经文</b>会自动同步过来。管理员点「<b>补充关键词 / 标签</b>」，再填几个<b>关键词</b>、点选几个<b>主题标签</b>，保存后大家就能看到。关键词越具体、歌曲的标签越全，推荐就越准。（排班表里还没填证道时，这里仍可直接设置主题。）' },
  { part: '点歌与主题推荐', title: '选歌时直接用推荐', target: '#weekPickThemeBox', state: { pick: true, pickSearch: '', pickSel: true }, skip: () => !(window.SG && SG.enabled()),
    text: '主领选歌窗口顶部有两排：<b>主题推荐</b>和<b>会众点歌</b>。点一下歌名就加入已选名单，再点一下移出，不用再来回搜。选好后照常点「保存」。' },

  // ── 结束 ──
  { title: '导览完成 🎉', state: { tab: 'all', search: '' }, next: '完成',
    text: '你已经掌握诗歌库的全部功能啦：<b>搜歌 → 看谱 → 听歌 → 收藏 → 筛选 → 上传 → 选歌 → 分享 → 离线与备份 → 点歌与主题</b>。<br>以后想再看一遍，点右上角的 <b>⋯</b>，选「使用引导」就行。愿诗歌带领大家一起敬拜 🙏' },
];

function obApply(st) {
  st = st || {};
  const tab = st.tab || 'all';
  const q = id => document.getElementById(id);
  if (!st.lightbox && lbv.open) closeLightbox();
  if (!st.detail) q('songLibDetailOverlay').classList.remove('open');
  if (!st.pick && q('weekPickOverlay').classList.contains('open')) { weekPickDoClose(); slNavClosed('weekpick'); }
  if (!st.ol) q('olOverlay').classList.remove('open');
  if (!st.exp) q('songLibExportOverlay').classList.remove('open');
  if (!st.add) q('songLibAddOverlay').classList.remove('open');
  if (!st.fix) { const fo = q('fxOverlay'); if (fo) fo.classList.remove('open'); }
  if (!st.batch && songLibSelMode) songLibBatchExit();
  if (st.batch !== 'drawer') q('songLibBatchOverlay').classList.remove('open');
  if (!st.login) q('adminLoginOverlay').classList.remove('open');
  if (!st.more && window.slMoreClose) slMoreClose();
  if (!st.filter) q('songLibFilterOverlay').classList.remove('open');
  if (!st.ds && songLibSearchMode === 'ds') { q('songLibSearchInput').value = ''; setSongLibSearchMode('lib'); }
  if (songLibTab !== tab) setSongLibTab(tab);
  if (tab === 'all') {
    if (st.ds) {
      q('songLibSearchInput').value = ''; songLibSearchKeyword = '';
      q('songLibSearchClear').classList.remove('visible');
      if (songLibSearchMode !== 'ds') { setSongLibSearchMode('ds'); setTimeout(() => { try { document.activeElement && document.activeElement.blur(); } catch (e) { slDiag(e, 'obApply'); } }, 120); }
    } else {
      const want = st.search || '', inp = q('songLibSearchInput');
      if (inp.value !== want || songLibSearchKeyword !== want) obSetMainSearch(want);
    }
  }
  if (st.batch && isAdmin) {   // 演示批量模式：进入选择模式，自动勾上第一张卡片
    if (!songLibSelMode) songLibBatchEnter();
    if (!songLibSel.size) { const c = OB_FIRST_CARD(); if (c && c.dataset.sid) { songLibSel.add(c.dataset.sid); c.classList.add('sel'); try { songLibBatchUpdateBar(); } catch (e) { slDiag(e, 'obApply'); } } }
    if (st.batch === 'drawer' && !q('songLibBatchOverlay').classList.contains('open')) songLibBatchOpen();
  }
  if (st.filter && !q('songLibFilterOverlay').classList.contains('open')) openSongLibFilter();
  if (window.SG) SG.obApply(st.sg || null);
  if (st.ol && window.OL && !q('olOverlay').classList.contains('open')) OL.open();
  if (st.exp && window.SLPDF && !q('songLibExportOverlay').classList.contains('open')) SLPDF.open();
  if (st.add && !q('songLibAddOverlay').classList.contains('open')) openSongLibAdd();
  if (st.login) q('adminLoginOverlay').classList.add('open');
  if (st.more && window.slMoreOpen) slMoreOpen();
  if (st.detail && !q('songLibDetailOverlay').classList.contains('open')) {
    const s = obDemoSong() || songLibrary[0]; if (s) openSongLibDetail(s.id);
  }
  if (st.lightbox && !lbv.open) {
    const s = obImgSong(), k = s && s.keys.find(x => x.src);
    if (s && k) openLightboxWithList([{ title: s.title, src: k.src, songId: s.id }], 0);
  }
  if (st.fix && lbv.open && window.FX && !q('fxOverlay')?.classList.contains('open')) FX.open();
  if (st.pick) {
    if (!q('weekPickOverlay').classList.contains('open')) openWeekPick();
    q('weekPickSearch').value = st.pickSearch || '';
    const d = obDemoSong();
    if (d) {
      const i = weekPickSel.indexOf(d.title);
      if (st.pickSel && i < 0) weekPickSel.push(d.title);
      else if (!st.pickSel && i >= 0) weekPickSel.splice(i, 1);
    }
    weekPickSelOpen = !!st.pickOpen;
    const fo = q('weekPickFilterOverlay'); if (fo) fo.classList.toggle('open', !!st.pickFilter);
    renderWeekPick();
  }
}

function obCreate() {
  const block = document.createElement('div'); block.className = 'ob-block';
  block.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  block.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  const spot = document.createElement('div'); spot.className = 'ob-spot none';
  const tip = document.createElement('div'); tip.className = 'ob-tip'; tip.setAttribute('role', 'dialog');
  tip.innerHTML = `<div class="ob-head"><span class="ob-avatar"><i class="ti ti-music"></i></span>
      <div class="ob-head-txt"><div class="ob-name">诗歌库小助手</div><div class="ob-step"></div></div>
      <button type="button" class="ob-x" aria-label="跳过引导"><i class="ti ti-x"></i></button></div>
    <div class="ob-title"></div><div class="ob-text"></div>
    <div class="ob-bar"><div class="ob-fill"></div></div>
    <div class="ob-foot"><button type="button" class="ob-skip">跳过</button><span class="ob-sp"></span>
      <button type="button" class="ob-prev">上一步</button><button type="button" class="ob-next">下一步</button></div>`;
  document.body.append(block, spot, tip);
  tip.querySelector('.ob-x').onclick = () => obEnd();
  tip.querySelector('.ob-skip').onclick = () => obEnd();
  tip.querySelector('.ob-prev').onclick = () => { if (ob.i > 0) obShow(ob.i - 1); };
  tip.querySelector('.ob-next').onclick = () => obNext();
  ob.block = block; ob.spot = spot; ob.tip = tip;
}
function obNext() { if (ob.i >= ob.steps.length - 1) obEnd(); else obShow(ob.i + 1); }
function obRenderTip(s) {
  const tip = ob.tip, total = ob.steps.length, i = ob.i;
  tip.querySelector('.ob-step').textContent = `第 ${i + 1} / ${total} 步` + (s.part ? ' · ' + s.part : '');
  tip.querySelector('.ob-fill').style.width = ((i + 1) / total * 100) + '%';
  tip.querySelector('.ob-title').textContent = typeof s.title === 'function' ? s.title() : s.title;
  tip.querySelector('.ob-text').innerHTML = typeof s.text === 'function' ? s.text() : s.text;
  tip.querySelector('.ob-prev').style.display = i === 0 ? 'none' : '';
  tip.querySelector('.ob-skip').style.display = i === total - 1 ? 'none' : '';
  tip.querySelector('.ob-next').textContent = s.next || '下一步';
}
function obPosition() {
  if (!ob.on) return;
  const s = ob.steps[ob.i], tip = ob.tip, spot = ob.spot;
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let el = obEl(s.target); if (!obVisible(el)) el = null;
  let top, left, right, bottom;
  if (el) {
    const r = el.getBoundingClientRect();
    top = Math.max(r.top - 6, 4); left = Math.max(r.left - 6, 4);
    right = Math.min(r.right + 6, vw - 4); bottom = Math.min(r.bottom + 6, vh - 4);
    if (bottom <= top || right <= left) el = null;
  }
  if (!el) {
    spot.className = 'ob-spot none';
    spot.style.left = (vw / 2) + 'px'; spot.style.top = (vh / 2) + 'px'; spot.style.width = '0px'; spot.style.height = '0px';
    tip.style.left = Math.max(12, (vw - tw) / 2) + 'px'; tip.style.top = Math.max(12, (vh - th) / 2) + 'px';
    return;
  }
  spot.className = 'ob-spot';
  spot.style.left = left + 'px'; spot.style.top = top + 'px'; spot.style.width = (right - left) + 'px'; spot.style.height = (bottom - top) + 'px';
  const below = vh - bottom, above = top;
  let ty;
  if (below >= th + 14) ty = bottom + 12;
  else if (above >= th + 14) ty = top - th - 12;
  else ty = (top + bottom) / 2 > vh / 2 ? 12 : vh - th - 12;
  const tx = Math.min(Math.max(left + (right - left) / 2 - tw / 2, 12), Math.max(12, vw - tw - 12));
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
}
function obType(inp, text, onInput) {
  clearInterval(ob.typeT);
  let n = 0; inp.value = '';
  ob.typeT = setInterval(() => {
    n++; inp.value = text.slice(0, n); onInput();
    if (n >= text.length) { clearInterval(ob.typeT); ob.typeT = 0; }
  }, 130);
}
function obShow(i) {
  const tk = ++ob.tk;
  clearInterval(ob.typeT); ob.typeT = 0;
  ob.i = i;
  const s = ob.steps[i];
  obApply(s.state);
  obRenderTip(s);
  obPosition();
  setTimeout(() => {
    if (tk !== ob.tk || !ob.on) return;
    obRenderTip(s);
    const el = obEl(s.target);
    if (obVisible(el)) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { slDiag(e, 'obShow'); } }
    obPosition();
    if (s.type) {
      setTimeout(() => {
        if (tk !== ob.tk || !ob.on) return;
        if (s.type === 'main') obType(document.getElementById('songLibSearchInput'), OB_SONG, onSongLibrarySearch);
        else obType(document.getElementById('weekPickSearch'), OB_SONG, renderWeekPick);
      }, 350);
    }
  }, 180);
  setTimeout(() => { if (tk === ob.tk && ob.on) obPosition(); }, 650);
}
function startOnboarding(manual) {
  if (ob.on) return;
  if (songLibSkelOn) { setTimeout(() => startOnboarding(manual), 400); return; }
  ['adminLoginOverlay', 'songLibAddOverlay', 'songLibStorageOverlay', 'songLibMergeOverlay', 'songLibBatchOverlay', 'scoreShareOverlay', 'weekShareOverlay', 'olOverlay', 'songLibExportOverlay', 'sgBoxOverlay', 'sgThemeOverlay', 'fxOverlay', 'fxInboxOverlay'].forEach(id => document.getElementById(id)?.classList.remove('open'));
  if (typeof songLibSelMode !== 'undefined' && songLibSelMode) songLibBatchExit();
  ob.steps = OB_STEPS.filter(s => !s.skip || !s.skip());
  ob.on = true;
  obCreate();
  ob.keyH = e => {
    if (!ob.on) return;
    if (e.key === 'Escape') { e.stopPropagation(); obEnd(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); obNext(); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); if (ob.i > 0) obShow(ob.i - 1); }
  };
  document.addEventListener('keydown', ob.keyH, true);
  window.addEventListener('resize', obPosition);
  ob.posT = setInterval(obPosition, 250);
  obShow(0);
}
function obEnd() {
  if (!ob.on) return;
  ob.on = false; ob.tk++;
  clearInterval(ob.typeT); clearInterval(ob.posT);
  document.removeEventListener('keydown', ob.keyH, true);
  window.removeEventListener('resize', obPosition);
  [ob.block, ob.spot, ob.tip].forEach(el => el && el.remove());
  try { localStorage.setItem(OB_KEY, '1'); } catch (e) { slDiag(e, 'obEnd'); }
  obApply({ tab: 'all', search: '' });
  const m = document.querySelector('.song-lib-main'); if (m) m.scrollTop = 0;
  showToast('随时点右上角 ⋯ →「使用引导」可以重新查看', 3000);
}
function obAutoStart() {
  try { if (localStorage.getItem(OB_KEY)) return; } catch (e) { slDiag(e, 'obAutoStart'); }
  const qs = new URLSearchParams(location.search);
  if (qs.get('song') || qs.get('week')) return;   // 打开的是分享链接，不打扰
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if ((!songLibSkelOn && songLibWeekDataState !== 'pending') || tries > 40) { clearInterval(t); startOnboarding(); }
  }, 300);
}

// ── 回到顶部悬浮按钮 + 下拉刷新（首页主滚动区）──
async function slRefreshData() {
  if (!initSupabaseClient()) { showToast(navigator.onLine === false ? '📴 当前离线，无法刷新' : '⚠️ 云端未连接，无法刷新'); return false; }
  try {
    await loadRemoteSongState();
    songLibWeekDataState = 'ok';
    renderSongLibFilterBar(); renderSongLibraryGrid(); updateSongLibImportHint();
    try { songLibRenderWeekCard(); } catch (e) { slDiag(e, 'slRefreshData'); }
    if (songLibTab === 'books' && !songLibBookCur) { try { await songLibBooksShowList(true); } catch (e) { slDiag(e, 'slRefreshData.books'); } }
    try { await syncAuthState(); } catch (e) { slDiag(e, 'slRefreshData.auth'); }
    try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); } catch (e) { slDiag(e, 'slRefreshData.sw'); }   // 顺便检查页面有没有新版本
    showToast('✅ 已刷新');
    return true;
  } catch (e) {
    slDiag(e, 'slRefreshData');
    showToast(navigator.onLine === false ? '📴 当前离线，无法刷新' : '⚠️ 刷新失败，请稍后再试');
    return false;
  }
}
function slScrollUXInit() {
  const main = document.querySelector('.song-lib-main'), page = document.getElementById('songLibraryOverlay');
  if (!main || !page || main._slUx) return;
  main._slUx = true;

  // 回到顶部：往下滚一段距离后出现，点一下平滑回到最上面
  const top = document.createElement('button');
  top.type = 'button'; top.className = 'sl-totop'; top.setAttribute('aria-label', '回到顶部'); top.title = '回到顶部';
  top.innerHTML = '<i class="ti ti-arrow-up"></i>';
  page.appendChild(top);
  const placeTop = () => {
    let b = 20;
    if (window.matchMedia('(max-width:640px)').matches && !page.classList.contains('sel-mode') && !page.classList.contains('ds-mode')) b += 62;   // 躲开底部导航栏
    const bar = document.getElementById('floatingAudioBar');
    if (typeof floatingAudioVisible !== 'undefined' && floatingAudioVisible && bar) b += (bar.offsetHeight || 64) + 12;   // 躲开底部迷你播放条
    if (page.classList.contains('sel-mode')) b += 64;                                                                   // 躲开批量选择操作条
    top.style.bottom = `calc(${b}px + env(safe-area-inset-bottom))`;
  };
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const show = main.scrollTop > Math.max(400, main.clientHeight * 0.7);
      if (show) placeTop();
      top.classList.toggle('show', show);
    });
  };
  main.addEventListener('scroll', onScroll, { passive: true });
  setInterval(() => { if (top.classList.contains('show')) placeTop(); }, 800);
  top.addEventListener('click', () => {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    main.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  // 下拉刷新：在最顶部继续往下拉，松手后重新读取云端数据（不整页重载）
  const host = main.parentElement;
  const ptr = document.createElement('div');
  ptr.className = 'sl-ptr'; ptr.setAttribute('aria-hidden', 'true');
  ptr.innerHTML = '<i class="ti ti-arrow-down"></i><span>下拉刷新</span>';
  host.appendChild(ptr);
  const icon = ptr.querySelector('i'), label = ptr.querySelector('span');
  const TH = 60, MAX = 104;
  let y0 = 0, x0 = 0, pull = 0, tracking = false, locked = false, busy = false;
  const blocked = () => busy || page.classList.contains('ds-mode') || page.classList.contains('sel-mode') || slNav.stack.some(x => !x.dead && x.id.indexOf('ov:') === 0 || x.id === 'lightbox' || x.id === 'weekpick') || slNavSuspended();
  const paint = (px, anim) => {
    ptr.classList.toggle('anim', !!anim);
    ptr.style.transform = `translate(-50%, ${px - 48}px)`;
    ptr.style.opacity = String(Math.min(1, px / 36));
    const ready = px >= TH;
    ptr.classList.toggle('ready', ready);
    if (!busy) { label.textContent = ready ? '松开刷新' : '下拉刷新'; icon.className = 'ti ti-arrow-down'; }
  };
  main.addEventListener('touchstart', e => {
    if (blocked() || e.touches.length !== 1 || main.scrollTop > 0) { tracking = false; return; }
    tracking = true; locked = false; pull = 0;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
  }, { passive: true });
  main.addEventListener('touchmove', e => {
    if (!tracking) return;
    const t = e.touches[0], dy = t.clientY - y0, dx = t.clientX - x0;
    if (!locked) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || main.scrollTop > 0) { tracking = false; return; }   // 往上滑 / 横着滑 / 不在顶部：不是下拉
      locked = true;
    }
    if (main.scrollTop > 0) { tracking = false; paint(0, true); return; }
    pull = Math.min(MAX, dy * 0.55);
    if (e.cancelable) e.preventDefault();
    paint(pull, false);
  }, { passive: false });
  const release = async () => {
    if (!tracking) return;
    tracking = false;
    if (!locked) return;
    locked = false;
    if (pull >= TH && !busy) {
      busy = true;
      ptr.classList.add('busy'); icon.className = 'ti ti-loader-2'; label.textContent = '刷新中…';
      paint(48, true);
      const t0 = Date.now();
      await slRefreshData();
      const wait = 500 - (Date.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait));   // 至少转半秒，避免一闪而过
      busy = false;
      ptr.classList.remove('busy');
    }
    pull = 0; paint(0, true);
  };
  main.addEventListener('touchend', release, { passive: true });
  main.addEventListener('touchcancel', release, { passive: true });
}

// ── 启动 ──
async function bootstrapSongLibPage() {
  slNavInit();
  slScrollUXInit();
  loadSongLibrary();
  loadSongLibFavorites();
  loadSongLibPlaylist();
  loadSongLibCategories();
  loadSongLibSongbooks();
  loadSongLibTags();
  loadSongLibSupabaseConfig();
  const hadLocalState = songLibRestoreRemoteStateCache();   // 上次联网时存下的使用记录，没信号也能显示本周诗歌
  songLibSkelWait = songLibrary.length === 0;   // 本机没有缓存：骨架一直显示到云端数据回来
  songLibWeekDataState = 'pending';             // 云端数据回来前，本周卡片先显示骨架，免得误报「暂未选歌」
  openSongLibrary();                      // 先显示骨架，再用本机缓存 / 云端数据画出页面
  if (initSupabaseClient()) {
    try { supabaseClient.auth.onAuthStateChange((_e, session) => { const now = !!session; if (now !== isAdmin) { isAdmin = now; updateAdminUI(); if (now) slSongTagsMigrate(); } }); } catch (e) { slDiag(e, 'bootstrapSongLibPage'); }
    try {
      await loadRemoteSongState();
      songLibWeekDataState = 'ok';
      renderSongLibFilterBar(); renderSongLibraryGrid(); updateSongLibImportHint();
      songLibReleaseSkeleton();
      await syncAuthState();
    } catch (e) {
      console.error('读取云端诗歌库失败，先用本机缓存', e);
      songLibWeekDataState = hadLocalState ? 'ok' : 'fail';
      songLibReleaseSkeleton();
      renderSongLibraryGrid();
      showToast(navigator.onLine === false ? '📴 当前离线，显示的是上次联网时的内容' : '⚠️ 连不上云端，正在显示本机缓存', 3500);
    }
  } else {
    songLibWeekDataState = hadLocalState ? 'ok' : 'fail';
    songLibReleaseSkeleton();
    renderSongLibraryGrid();
    updateAdminUI();
  }
  checkSongShareLinkFromUrl();
  obAutoStart();
}
bootstrapSongLibPage();

