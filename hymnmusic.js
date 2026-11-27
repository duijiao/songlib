/* ═══════════════════════════════════════════════════════════════
 * 诗歌本音乐：专属搜索 / 诗歌本里的歌可以直接播放，并加入「我的歌单」
 *
 * 取音乐的流程参考 cs.html（专属歌谱搜索页）：
 *   1) GET  {apiBase}/music/info                       请求头带 musicid，只用来补歌手等信息（失败不影响播放）
 *   2) GET  {apiBase}/download/ticket?id=&type=music   → { ticket, expires }
 *   3) 播放地址 = {apiBase}/download/music?id=&expires=&ticket=
 * 签名 / 设备注册 / 请求头，全部复用 app.js 里专属搜索那一套（songLibDsMakeHeaders 等）。
 * 音乐 ID 就是搜索结果里的 gId（兼容 musicId）。
 *
 * 歌词（同样参考 cs.html，按「图片 ID」取）：
 *   GET {apiBase}/download/text?id=   优先（原站显示歌词用的接口）
 *   GET {apiBase}/Lyrics?id=          失败 / 为空时回退
 * 存入诗歌库时，歌词写进歌曲的歌词字段，音乐下载后转存到诗歌库的存储里（接口给的地址有有效期，不能直接存）。
 *
 * 「我的歌单」里的诗歌本音乐只存在这台设备（localStorage），和歌单里手动加入的歌一样。
 * ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const LS_KEY = 'churchSongLibHymnPlaylist';
  const $ = id => document.getElementById(id);
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v));
  const toast = (m, d) => { try { showToast(m, d); } catch (e) { /* 没有提示条就算了 */ } };

  // ───────────── 我的歌单里的「诗歌本音乐」 ─────────────
  let list = [];   // [{ gId, name, bookName, bookId, no, imageId, singer, addedAt }]

  function normEntry(x) {
    return {
      gId: Number(x.gId) || 0,
      name: String(x.name || '').trim() || '未命名歌曲',
      bookName: String(x.bookName || '').trim(),
      bookId: x.bookId == null ? '' : x.bookId,
      no: String(x.no || '').trim(),
      imageId: Number(x.imageId) || 0,
      singer: String(x.singer || '').trim(),
      addedAt: Number(x.addedAt) || Date.now(),
    };
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      const seen = new Set();
      list = (Array.isArray(raw) ? raw : []).filter(x => x && Number(x.gId) > 0).map(normEntry)
        .filter(x => (seen.has(x.gId) ? false : (seen.add(x.gId), true)));
    } catch (e) { list = []; }
  }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
    catch (e) { try { slDiag(e, 'hymnPlaylistPersist'); } catch (_) { /* 忽略 */ } }
  }
  const has = gId => list.some(x => x.gId === gId);
  const byGid = gId => list.find(x => x.gId === Number(gId));

  // 歌单页搜索时，诗歌本音乐也按歌名 / 歌本过滤
  function visible() {
    const kw = String((typeof songLibSearchKeyword !== 'undefined' && songLibSearchKeyword) || '').trim().toLowerCase();
    if (!kw) return list.slice();
    return list.filter(x => (x.name + ' ' + x.bookName).toLowerCase().includes(kw));
  }

  // ───────────── 音乐接口：music/info、ticket、播放地址 ─────────────
  function apiBase() {
    const c = (typeof songLibDsCfg === 'function') ? songLibDsCfg() : {};
    return String(c.musicApiBase || c.apiBase || '').trim().replace(/\/+$/, '');
  }
  async function ensureDevice() {
    if (typeof songLibDeviceSignId !== 'undefined' && !songLibDeviceSignId) await songLibDsRegisterDevice();
  }
  async function getJson(url, headers) {
    let res, text;
    try { res = await fetch(url, { headers }); text = await res.text(); }
    catch (e) { throw new Error('无法连接音乐接口（跨域限制或网络不可达）'); }
    let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error(`HTTP ${res.status}：${(data && (data.msg || data.message)) || String(text).slice(0, 100)}`);
    return data;
  }

  async function requestUrl(gId) {
    const base = apiBase();
    if (!base) throw new Error('未配置诗歌本接口地址');
    if (!songLibDsHasCrypto()) throw new Error('CryptoJS 未加载（网络问题），音乐接口暂不可用');
    await ensureDevice();
    const tu = new URL(base + '/download/ticket');
    tu.searchParams.set('id', String(gId));
    tu.searchParams.set('type', 'music');
    const data = await getJson(tu.toString(), songLibDsMakeHeaders());
    if (data && data.msg) throw new Error(data.msg);
    const t = songLibDsExtractTicket(data);
    if (!t || !t.ticket || t.expires == null) throw new Error('响应中未找到音乐 ticket / expires');
    const u = new URL(base + '/download/music');
    u.searchParams.set('id', String(gId));
    u.searchParams.set('expires', String(t.expires));
    u.searchParams.set('ticket', String(t.ticket));
    const exp = Number(t.expires);
    return { url: u.toString(), expiresMs: exp > 1e12 ? exp : exp * 1000 };   // expires 通常是秒；兼容毫秒
  }

  const urlCache = new Map();
  const urlInflight = new Map();
  function getUrl(gId, force) {
    const c = urlCache.get(gId);
    if (!force && c && c.expiresMs > Date.now() + 60000) return Promise.resolve(c);
    if (!force && urlInflight.has(gId)) return urlInflight.get(gId);
    const p = requestUrl(gId).then(r => { urlCache.set(gId, r); return r; }).finally(() => urlInflight.delete(gId));
    urlInflight.set(gId, p);
    return p;
  }

  const infoCache = new Map();
  async function getInfo(gId) {
    if (infoCache.has(gId)) return infoCache.get(gId);
    try {
      const base = apiBase();
      if (!base || !songLibDsHasCrypto()) return null;
      await ensureDevice();
      const h = songLibDsMakeHeaders();
      h['musicid'] = String(gId);
      const data = await getJson(new URL(base + '/music/info').toString(), h);
      const r = (data && (data.result || data.data)) || null;
      if (r && typeof r === 'object') { infoCache.set(gId, r); return r; }
    } catch (e) { /* 元数据只是锦上添花，取不到不影响播放 */ }
    return null;
  }

  // ───────────── 搜索结果行 ↔ 音乐 ID ─────────────
  function rowGid(r) {
    if (!r) return 0;
    const n = Number(r.gId ?? r.musicId ?? r._gId);
    return n > 0 ? n : 0;
  }
  // 能不能播：接口给了 gId 就能；整本歌本（catalogue）里的行可能不带这个字段，点的时候再去查
  function rowMaybeMusic(r) {
    if (!r || r._src !== 'hymn' || r._gNone) return false;
    if (rowGid(r)) return true;
    return !('gId' in r) && !('musicId' in r) && Number(r.id) > 0;
  }
  async function resolveRowGid(r) {
    const have = rowGid(r);
    if (have) return have;
    if (!(Number(r.id) > 0)) { r._gNone = true; return 0; }
    try {
      const base = apiBase();
      const url = new URL(base + '/image/searchByName');
      url.searchParams.set('key', String(r.name || r.title || ''));
      url.searchParams.set('bookId', String(r.bookId != null ? r.bookId : 0));
      url.searchParams.set('musicType', '0');
      if (!songLibDeviceSignId) await songLibDsRegisterDevice();
      const out = await songLibDsHymnGet(url);
      const rows = songLibDsNormalizeRows(out.data);
      const hit = rows.find(x => String(x.id) === String(r.id)) || rows.find(x => String(x.name || '') === String(r.name || ''));
      const g = rowGid(hit);
      if (g) { r._gId = g; return g; }
    } catch (e) { /* 查不到就当没有音乐 */ }
    r._gNone = true;
    return 0;
  }
  function entryFromRow(r, gId) {
    return normEntry({
      gId, name: r.name || r.title, bookName: r.bookName || r.songbookName || r.mSongbook || r.songbook || '',
      bookId: r.bookId, no: (typeof songLibDsSongNo === 'function') ? songLibDsSongNo(r) : (r.no || ''),
      imageId: r.id, singer: r.singer || r.artist || '', addedAt: Date.now(),
    });
  }

  // ───────────── 歌词 ─────────────
  function pickLyrics(data) {
    if (!data) return { content: '', editor: '', auditor: '' };
    for (const r of [data.result, data.data, data.raw, data]) {
      if (!r) continue;
      if (typeof r === 'string') { if (r.trim()) return { content: r, editor: '', auditor: '' }; continue; }
      if (typeof r === 'object') {
        const content = (r.content ?? r.text ?? r.lyrics ?? '') || '';
        if (typeof content === 'string' && content.trim()) return { content, editor: r.editor ?? '', auditor: r.auditor ?? '' };
      }
    }
    return { content: '', editor: '', auditor: '' };
  }
  async function lyricsFrom(path, imageId) {
    const base = apiBase();
    if (!base) throw new Error('未配置诗歌本接口地址');
    if (!songLibDsHasCrypto()) throw new Error('CryptoJS 未加载（网络问题），歌词接口暂不可用');
    await ensureDevice();
    const u = new URL(base + path);
    u.searchParams.set('id', String(imageId));
    const data = await getJson(u.toString(), songLibDsMakeHeaders());
    if (data && data.msg) throw new Error(data.msg);
    return pickLyrics(data);
  }
  const lyricsCache = new Map();   // imageId -> Promise<string>（没有歌词是空字符串；网络出错不缓存，下次再试）
  function getLyrics(imageId) {
    imageId = Number(imageId);
    if (!(imageId > 0)) return Promise.resolve('');
    if (lyricsCache.has(imageId)) return lyricsCache.get(imageId);
    const p = (async () => {
      let r = null, err = null;
      try { r = await lyricsFrom('/download/text', imageId); } catch (e) { err = e; }
      if (!r || !r.content) { try { const r2 = await lyricsFrom('/Lyrics', imageId); if (r2 && r2.content) r = r2; } catch (e) { err = err || e; } }
      if (r && r.content) return String(r.content).replace(/\r\n?/g, '\n').trim();
      if (err) throw err;
      return '';
    })();
    lyricsCache.set(imageId, p);
    p.catch(() => lyricsCache.delete(imageId));
    return p;
  }
  // 歌词里带 [01:23.45] 这种时间轴，就同时放进「动态歌词」；纯文字歌词里去掉时间轴
  const LRC_TAG = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g;
  function splitLyrics(text) {
    const t = String(text || '');
    if (!LRC_TAG.test(t)) return { lyrics: t, lrc: '' };
    LRC_TAG.lastIndex = 0;
    const plain = t.split('\n').map(l => l.replace(LRC_TAG, '').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { lyrics: plain, lrc: t };
  }

  // ───────────── 存入诗歌库：音乐转存 ─────────────
  async function sniffExt(blob) {
    try {
      const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const t4 = String.fromCharCode(...b.slice(0, 4)), t8 = String.fromCharCode(...b.slice(4, 8));
      if (t4.startsWith('ID3') || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)) return 'mp3';
      if (t8 === 'ftyp') return 'm4a';
      if (t4 === 'OggS') return 'ogg';
      if (t4 === 'RIFF') return 'wav';
      if (t4 === 'fLaC') return 'flac';
    } catch (e) { /* 认不出就按 mp3 */ }
    return 'mp3';
  }
  // 下载音乐 → 传到诗歌库的存储（和手动上传 mp3 同一个地方），返回公开地址
  async function persistMusic(gId, name) {
    const u = await getUrl(gId, true);
    let res;
    try { res = await fetch(u.url); } catch (e) { throw new Error('下载音乐失败（跨域限制或网络不可达）'); }
    if (!res.ok) throw new Error('下载音乐失败 HTTP ' + res.status);
    const blob = await res.blob();
    if (!blob.size) throw new Error('下载到的音乐是空的');
    if (blob.size > 48 * 1024 * 1024) throw new Error('音乐文件太大（超过约 48MB），没有存入');
    const ext = await sniffExt(blob);
    const type = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' }[ext];
    const file = new File([blob], `${String(name || 'music').replace(/[\\/:*?"<>|\s]+/g, '_')}.${ext}`, { type });
    return uploadMusicMp3File(file);
  }
  // 把歌词和音乐一起存进诗歌库里的这首歌。任何一步失败都不影响歌谱加入，只在 notes 里说明原因
  async function saveExtras(r, entry) {
    const out = { lyrics: false, music: false, notes: [] };
    if (!r || r._src !== 'hymn' || !entry) return out;
    // 歌词（按图片 ID 取）
    try {
      const txt = Number(r.id) > 0 ? await getLyrics(r.id) : '';
      if (txt) {
        if (String(entry.lyrics || '').trim()) out.notes.push('库里这首已有歌词，没有覆盖');
        else {
          const sp = splitLyrics(txt);
          entry.lyrics = sp.lyrics || txt;
          if (sp.lrc && !String(entry.lyricsLrc || '').trim()) entry.lyricsLrc = sp.lrc;
          out.lyrics = true;
        }
      }
    } catch (e) { out.notes.push('歌词没取到：' + ((e && e.message) || e)); }
    // 音乐（按 gId 取）
    try {
      const g = await resolveRowGid(r);
      if (g) {
        const name = String(entry.title || r.name || '').trim();
        const label = '诗歌本音乐' + (r.bookName ? ' · ' + String(r.bookName).trim() : '') + (r.no ? ' ' + (typeof songLibDsSongNo === 'function' ? songLibDsSongNo(r) : r.no) : '');
        if (!Array.isArray(entry.music)) entry.music = [];
        if (entry.music.some(m => m.label === label)) out.notes.push('这首的诗歌本音乐之前已经存过了');
        else {
          const url = await persistMusic(g, name);
          entry.music.push({ id: genSongLibId(), label, url });
          out.music = true;
        }
      }
    } catch (e) { out.notes.push('音乐没存入：' + ((e && e.message) || e)); }
    return out;
  }

  // ───────────── 播放 ─────────────
  let cur = null;      // 正在播放的 { gId, name, … }
  let token = 0;       // 连续点击时，只认最后一次
  let errTries = 0;

  const curId = () => 'hymn:' + (cur ? cur.gId : 0);
  function isCurrent() {
    return !!(cur && typeof loadedAudioLinkId !== 'undefined' && loadedAudioLinkId === curId());
  }

  function hookEl(el) {
    if (el._hmHooked) return;
    el._hmHooked = true;
    el.addEventListener('playing', () => { errTries = 0; });
    el.addEventListener('error', onAudioError);
  }
  // 播放地址带有效期：拖进度条 / 暂停很久后失效，重新取一次地址，接着刚才的位置播
  async function onAudioError() {
    if (!isCurrent() || !globalAudioEl) return;
    if (errTries >= 2) { toast('这首歌的音乐暂时放不了（链接失效或没有权限）', 3500); return; }
    errTries++;
    const gId = cur.gId, t = globalAudioEl.currentTime || 0, el = globalAudioEl;
    try {
      const u = await getUrl(gId, true);
      if (!isCurrent() || cur.gId !== gId) return;
      el.addEventListener('loadedmetadata', () => { try { if (t > 0) el.currentTime = t; } catch (e) { /* 忽略 */ } }, { once: true });
      el.src = u.url;
      el.play().catch(() => {});
    } catch (e) { toast('音乐获取失败：' + ((e && e.message) || e), 3500); }
  }

  function busy(btn, on) { if (btn && btn.classList) btn.classList.toggle('busy', !!on); }

  async function play(entry, opts) {
    opts = opts || {};
    if (!opts.force && isCurrent() && cur.gId === entry.gId && globalAudioEl) { toggleFloatingAudioPlay(); return; }   // 同一首：播放 / 暂停
    const my = ++token;
    busy(opts.btn, true);
    let u;
    try { u = await getUrl(entry.gId); }
    catch (e) {
      busy(opts.btn, false);
      if (my === token) toast('音乐获取失败：' + ((e && e.message) || e), 3500);
      return;
    }
    busy(opts.btn, false);
    if (my !== token) return;
    cur = Object.assign({}, entry);
    errTries = 0;
    musicPlayerSongTitle = entry.name;
    musicPlayerActiveId = loadedAudioLinkId = curId();
    audioRepeatOne = false;
    audioPlaylistMode = !!opts.list;   // 从歌单里播：一首接一首
    const el = ensureGlobalAudioEl();
    hookEl(el);
    el.loop = false;
    el.src = u.url;
    el.play().catch(() => { toast('浏览器拦截了自动播放，请点播放键'); });
    showFloatingAudioBar();
    syncUi();
    getInfo(entry.gId).then(info => {   // 补歌手
      const s = info && String(info.singer || '').trim();
      if (!s || !isCurrent() || cur.gId !== entry.gId || cur.singer) return;
      cur.singer = s;
      const e = byGid(entry.gId); if (e && !e.singer) { e.singer = s; persist(); }
      showFloatingAudioBar();
      try { updateMediaSession(); } catch (_) { /* 忽略 */ }
    });
  }

  function adjacent(dir) {
    if (!cur) return false;
    const i = list.findIndex(x => x.gId === cur.gId);
    if (i < 0) return false;
    const n = list.length;
    play(list[((i + dir) % n + n) % n], { list: true, force: true });
    return true;
  }

  // ───────────── 搜索结果卡片上的按钮 ─────────────
  function cardBtnsHtml(r, i) {
    if (!rowMaybeMusic(r)) return '';
    return `<button type="button" class="song-lib-card-play-btn hm-play" data-i="${i}" onclick="event.stopPropagation();hymnPlayRow(${i},this)" title="播放音乐" aria-label="播放音乐"><i class="ti ti-player-play"></i></button>`
      + `<button type="button" class="song-lib-card-play-btn hm-pl" data-i="${i}" onclick="event.stopPropagation();hymnToggleRow(${i},this)" title="加入我的歌单" aria-label="加入我的歌单"><i class="ti ti-pin"></i></button>`;
  }

  async function playRow(i, btn) {
    const r = (typeof songLibDsRows !== 'undefined') ? songLibDsRows[i] : null;
    if (!r) return;
    busy(btn, true);
    const g = await resolveRowGid(r);
    busy(btn, false);
    if (!g) { toast('这首歌没有音乐'); syncUi(); return; }
    return play(entryFromRow(r, g), { btn, list: has(g) });
  }
  async function toggleRow(i, btn) {
    const r = (typeof songLibDsRows !== 'undefined') ? songLibDsRows[i] : null;
    if (!r) return;
    busy(btn, true);
    const g = await resolveRowGid(r);
    busy(btn, false);
    if (!g) { toast('这首歌没有音乐，没法加入歌单'); syncUi(); return; }
    toggleEntry(entryFromRow(r, g));
  }

  function toggleEntry(e) {
    const i = list.findIndex(x => x.gId === e.gId);
    if (i >= 0) { list.splice(i, 1); toast('已移出我的歌单'); }
    else { list.push(e); toast(`已把《${e.name}》加入我的歌单（诗歌本音乐）`); }
    persist();
    refresh();
  }
  function remove(gId) {
    const i = list.findIndex(x => x.gId === Number(gId));
    if (i < 0) return;
    list.splice(i, 1); persist(); toast('已移出我的歌单'); refresh();
  }
  function refresh() {
    syncUi();
    try { if (songLibTab === 'playlist') renderSongLibraryGrid(); } catch (e) { /* 页面还没准备好 */ }
    try { songLibSyncPlButtons(); } catch (e) { /* 忽略 */ }
    try { if (isCurrent()) showFloatingAudioBar(); } catch (e) { /* 忽略 */ }
  }

  // 看谱：用图片接口的凭证取图，和专属搜索里一样
  function openScore(e) {
    if (!e || !(e.imageId > 0)) { toast('这首歌没有歌谱图'); return; }
    openLightboxWithList([{
      title: e.no ? `${e.name}（${e.no}）` : e.name, src: '', noLib: true,
      loader: async (force) => [await songLibDsGetImageUrl(e.imageId, !!force)],
      lyricsLoader: () => getLyrics(e.imageId),
    }], 0);
  }

  // ───────────── 「我的歌单」页里的「诗歌本音乐」分组 ─────────────
  function groupHtml(startN) {
    const arr = visible();
    if (!arr.length) return '';
    let n = Number(startN) || 0;
    const rows = arr.map(e => {
      const sub = [e.bookName, e.no ? '编号 ' + e.no : '', e.singer].filter(Boolean).map(esc).join(' · ');
      return `<div class="pl-row hm-row" data-gid="${e.gId}" onclick="hymnRowClick(${e.gId})">
        <div class="pl-idx"><span>${++n}</span><b class="pl-eq"><i></i><i></i><i></i></b></div>
        <div class="pl-info">
          <div class="pl-title">${esc(e.name)}</div>
          <div class="pl-sub"><span class="song-lib-plbadge hm">诗歌本</span>${sub ? `<span class="pl-sub-t">${sub}</span>` : ''}</div>
        </div>
        <button type="button" class="pl-btn pl-play" onclick="event.stopPropagation();hymnPlayGid(${e.gId},this)" title="播放" aria-label="播放"><i class="ti ti-player-play"></i></button>
        <button type="button" class="pl-btn pl-more" onclick="event.stopPropagation();hymnOpenMenu(${e.gId})" title="更多" aria-label="更多"><i class="ti ti-dots-vertical"></i></button>
      </div>`;
    }).join('');
    return `<div class="pl-group"><span>诗歌本音乐</span><small>在线播放 · 只在这台设备</small>`
      + `<button type="button" class="hm-group-play" onclick="hymnPlayAll()"><i class="ti ti-player-play-filled"></i>播放这组</button></div>`
      + `<div class="pl-list">${rows}</div>`;
  }
  function playGid(gId, btn) { const e = byGid(gId); if (e) return play(e, { btn, list: true }); }
  function playAll() {
    const arr = visible();
    if (!arr.length) { toast('歌单里还没有诗歌本音乐'); return; }
    play(arr[0], { list: true, force: true });
  }
  function rowClick(gId) {
    const e = byGid(gId); if (!e) return;
    if (e.imageId > 0) openScore(e); else play(e, { list: true });
  }
  function openMenu(gId) {
    const e = byGid(gId); if (!e) return;
    $('plMenuTitle').textContent = e.name;
    const items = [
      e.imageId > 0 ? ['ti-photo', '看谱', `closePlMenu();hymnOpenScoreGid(${e.gId})`] : null,
      ['ti-player-play', '播放', `closePlMenu();hymnPlayGid(${e.gId})`],
      ['ti-playlist-x', '移出我的歌单', `closePlMenu();hymnRemove(${e.gId})`],
    ].filter(Boolean);
    $('plMenuBody').innerHTML = items.map(x => `<button type="button" class="pl-sheet-item${x[0] === 'ti-playlist-x' ? ' danger' : ''}" onclick="${x[2]}"><i class="ti ${x[0]}"></i>${x[1]}</button>`).join('');
    $('plMenuOverlay').classList.add('open');
  }

  // ───────────── 把所有位置的按钮状态一次刷新 ─────────────
  function syncUi() {
    const curG = isCurrent() ? cur.gId : 0;
    const playing = !!(curG && globalAudioEl && !globalAudioEl.paused);
    const rows = (typeof songLibDsRows !== 'undefined') ? songLibDsRows : [];
    const icon = (b, cls) => { const ic = b.querySelector('i'); if (ic) ic.className = 'ti ' + cls; };
    document.querySelectorAll('.hm-play').forEach(b => {
      const r = rows[Number(b.dataset.i)];
      b.style.display = (r && r._gNone) ? 'none' : '';
      const g = rowGid(r), on = !!g && g === curG;
      b.classList.toggle('current', on);
      b.classList.toggle('playing', on && playing);
      icon(b, on && playing ? 'ti-player-pause' : 'ti-player-play');
      b.title = on && playing ? '暂停' : '播放音乐';
    });
    document.querySelectorAll('.hm-pl').forEach(b => {
      const r = rows[Number(b.dataset.i)];
      b.style.display = (r && r._gNone) ? 'none' : '';
      const g = rowGid(r), inl = !!g && has(g);
      b.classList.toggle('added', inl);
      icon(b, inl ? 'ti-playlist-add-check' : 'ti-pin');
      b.title = inl ? '已在我的歌单，点击移出' : '加入我的歌单';
    });
    document.querySelectorAll('.pl-row.hm-row').forEach(row => {
      const on = Number(row.dataset.gid) === curG;
      row.classList.toggle('current', on);
      row.classList.toggle('playing', on && playing);
      const pi = row.querySelector('.pl-play i'); if (pi) pi.className = 'ti ' + (on && playing ? 'ti-player-pause' : 'ti-player-play');
    });
  }

  // ───────────── 接进现有播放器（悬浮播放条 / 上一首下一首 / 锁屏控制） ─────────────
  function wrap(name, fn) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () { const a = arguments, self = this; return fn(() => orig.apply(self, a), a); };
  }
  function install() {
    wrap('playNextSongInLibrary', (orig) => {   // 悬浮条「下一首」、锁屏下一首、列表播放自动接下一首，都走这里
      if (!isCurrent()) return orig();
      if (!adjacent(1)) toast('这首歌不在我的歌单里，没有下一首');
    });
    wrap('playPrevSongInLibrary', (orig) => {
      if (!isCurrent()) return orig();
      if (!adjacent(-1)) toast('这首歌不在我的歌单里，没有上一首');
    });
    wrap('showFloatingAudioBar', (orig) => {
      orig();
      if (!isCurrent()) return;
      const sub = $('floatingAudioSub');
      if (sub) sub.textContent = [cur.singer || cur.bookName, '诗歌本音乐'].filter(Boolean).join(' · ');
      const many = list.length > 1 && has(cur.gId);
      const pb = $('floatingAudioPrevBtn'), nb = $('floatingAudioNextBtn');
      if (pb) pb.style.display = many ? '' : 'none';
      if (nb) nb.style.display = many ? '' : 'none';
      fixFloatingPlBtn();
    });
    wrap('reopenFloatingAudio', (orig) => { if (isCurrent()) { openScore(cur); return; } orig(); });   // 点悬浮条：看歌谱
    wrap('floatingAudioTogglePlaylist', (orig) => { if (isCurrent()) { toggleEntry(Object.assign({}, cur, { addedAt: Date.now() })); return; } orig(); });
    wrap('updateFloatingAudioPlayState', (orig) => { orig(); syncUi(); });
    wrap('songLibSyncPlaylistRows', (orig) => { orig(); syncUi(); });
    wrap('songLibSyncPlButtons', (orig) => { orig(); if (isCurrent()) fixFloatingPlBtn(); });
    wrap('updateMediaSession', (orig) => {
      orig();
      if (!isCurrent() || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cur.name, artist: cur.singer || cur.bookName || '诗歌本', album: '诗歌库 · 诗歌本音乐',
          artwork: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
        });
      } catch (e) { /* 忽略 */ }
    });
  }
  // 悬浮条上的「歌单」按钮：播放诗歌本音乐时，用来加入 / 移出我的歌单
  function fixFloatingPlBtn() {
    const fb = $('floatingAudioPlBtn');
    if (!fb || !isCurrent()) return;
    const on = has(cur.gId);
    fb.style.display = '';
    fb.classList.toggle('active', on);
    fb.innerHTML = `<i class="ti ${on ? 'ti-playlist-add-check' : 'ti-playlist-add'}"></i>`;
    fb.title = on ? '已在我的歌单（点击移出）' : '加入我的歌单';
  }

  // ───────────── 对外（app.js 和页面上的 onclick 要用） ─────────────
  Object.assign(window, {
    hymnCardBtnsHtml: cardBtnsHtml,
    hymnPlaylistGroupHtml: groupHtml,
    hymnPlaylistCount: () => visible().length,
    hymnPlayRow: playRow,
    hymnToggleRow: toggleRow,
    hymnPlayGid: playGid,
    hymnPlayAll: playAll,
    hymnRowClick: rowClick,
    hymnOpenMenu: openMenu,
    hymnRemove: remove,
    hymnOpenScoreGid: gId => openScore(byGid(gId)),
    hymnSyncUi: syncUi,
    hymnSaveExtras: saveExtras,
    hymnGetLyrics: getLyrics,
  });

  load();
  install();
})();
