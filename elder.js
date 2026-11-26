/* 诗歌库 · 长辈模式（大字极简）
 * - 右上角按钮一键开 / 关；设置会记在本机，下次打开还是长辈版
 * - 链接后面加 ?elder=1 就直接是长辈版（发给长辈用），?elder=0 强制回标准版
 * - 只做「显示层」的事：不改任何数据、不改标准版的功能
 */
(function () {
  'use strict';
  const K_ON = 'songlibElder', K_SC = 'songlibElderScale';
  const SCALES = [1, 1.15, 1.3], SC_NAMES = ['标准', '大', '特大'];
  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } };
  const toast = (m, ms) => { try { showToast(m, ms); } catch (e) { /* 忽略 */ } };

  let on = false, scale = 0, prevView = 'waterfall', phOrig = null;

  function urlFlag() {
    try { const v = new URLSearchParams(location.search).get('elder'); return v === '1' ? true : v === '0' ? false : null; } catch (e) { return null; }
  }

  // ───────── 按钮 ─────────
  function paintButtons() {
    const t = $('elderToggleBtn'), f = $('elderFontBtn');
    if (t) {
      t.innerHTML = on ? '<i class="ti ti-arrow-back-up"></i><span>标准版</span>' : '<i class="ti ti-text-size"></i>';
      t.title = on ? '切回标准版' : '长辈模式（大字、极简）';
      t.setAttribute('aria-label', t.title);
    }
    if (f) {
      f.innerHTML = '<i class="ti ti-typography"></i><span>字号</span>';
      f.title = '调整字的大小'; f.setAttribute('aria-label', '调整字的大小');
    }
  }
  function inject() {
    const right = document.querySelector('.song-lib-page-top-right');
    if (!right || $('elderToggleBtn')) return;
    const f = document.createElement('button');
    f.type = 'button'; f.id = 'elderFontBtn'; f.className = 'song-lib-page-search-btn elder-btn';
    f.addEventListener('click', cycleScale);
    const t = document.createElement('button');
    t.type = 'button'; t.id = 'elderToggleBtn'; t.className = 'song-lib-page-search-btn elder-btn';
    t.addEventListener('click', () => apply(!on, true));
    right.prepend(f, t);
    paintButtons();
    const bar = document.querySelector('#lightbox .lightbox-bar'), close = $('lightboxClose');
    if (bar && close && !$('elderLbPlay')) {
      const p = document.createElement('button');
      p.type = 'button'; p.id = 'elderLbPlay'; p.className = 'elder-lb-play';
      p.addEventListener('click', e => {
        e.stopPropagation();
        const s = lbSong();
        if (s && typeof quickPlaySongAudio === 'function') quickPlaySongAudio(s.title);
      });
      close.parentNode.insertBefore(p, close);
    }
  }

  // ───────── 播放 ─────────
  const tkey = t => String(t || '').trim().toLowerCase();
  function lbSong() { try { return lightboxSongs[lightboxIndex] || null; } catch (e) { return null; } }
  function hasAudio(title) { try { return !!title && getAudioLinksForTitle(title).length > 0; } catch (e) { return false; } }
  function playingTitle() {   // 正在放的歌名（没在放返回空）
    try { return (globalAudioEl && !globalAudioEl.paused && globalAudioEl.src) ? tkey(musicPlayerSongTitle) : ''; } catch (e) { return ''; }
  }
  function syncPlayUI() {
    if (!on) return;
    const pt = playingTitle();
    document.querySelectorAll('.song-lib-card-play-btn[data-title]').forEach(b => {
      const p = !!pt && tkey(b.dataset.title) === pt;
      b.classList.toggle('playing', p);
      const i = b.querySelector('i'); if (i) i.className = 'ti ' + (p ? 'ti-player-pause' : 'ti-player-play');
      b.title = p ? '暂停' : '播放'; b.setAttribute('aria-label', b.title);
    });
    const lb = $('elderLbPlay');
    if (lb) {
      const s = lbSong(), ok = !!(s && hasAudio(s.title)), p = ok && !!pt && tkey(s.title) === pt;
      lb.classList.toggle('show', ok); lb.classList.toggle('playing', p);
      lb.innerHTML = p ? '<i class="ti ti-player-pause"></i>暂停' : '<i class="ti ti-player-play"></i>听歌';
    }
  }

  // ───────── 字号 ─────────
  function applyScale() { root.style.setProperty('--es', SCALES[scale] || 1); }
  function cycleScale() {
    scale = (scale + 1) % SCALES.length;
    lsSet(K_SC, String(scale));
    applyScale();
    toast('字体大小：' + SC_NAMES[scale], 1500);
  }

  // ───────── 开 / 关 ─────────
  function rerender() {
    try { if (typeof renderSongLibTabs === 'function') renderSongLibTabs(); } catch (e) { /* 忽略 */ }
    try { if (typeof renderSongLibraryGrid === 'function') renderSongLibraryGrid(); } catch (e) { /* 忽略 */ }
    try { if (typeof songLibRenderWeekCard === 'function') songLibRenderWeekCard(); } catch (e) { /* 忽略 */ }
  }
  function apply(next, interactive) {
    on = !!next;
    root.classList.toggle('elder', on);
    lsSet(K_ON, on ? '1' : '0');
    applyScale();
    paintButtons();

    const inp = $('songLibSearchInput');
    if (inp) {
      if (on) { if (phOrig === null) phOrig = inp.placeholder; inp.placeholder = '输入歌名，例如：奇异恩典'; }
      else if (phOrig !== null) { inp.placeholder = phOrig; phOrig = null; }
    }
    if (!interactive) return;   // 打开页面时的初始化：不用重画，后面 app 自己渲染时会走下面的包装函数

    try {
      if (on) {
        prevView = songLibViewMode;
        if (typeof songLibSearchMode !== 'undefined' && songLibSearchMode !== 'lib' && typeof setSongLibSearchMode === 'function') setSongLibSearchMode('lib');
        if (typeof songLibTab !== 'undefined' && songLibTab === 'books' && typeof setSongLibTab === 'function') setSongLibTab('all');
        songLibViewMode = 'list';
      } else {
        songLibViewMode = prevView || 'waterfall';
        if (typeof updateSongLibViewSwitch === 'function') updateSongLibViewSwitch();
      }
    } catch (e) { /* 忽略 */ }
    rerender();
    syncPlayUI();
    const m = document.querySelector('.song-lib-main'); if (m) m.scrollTop = 0;
    toast(on ? '已切换为长辈模式' : '已切回标准版', 1800);
  }

  // ───────── 接进 app.js（只包一层，标准版时原样放行）─────────
  function wrap(name, before) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig._elder) return;
    const f = function () {
      const r = before.apply(this, arguments);
      if (r && r.skip) return r.value;
      return orig.apply(this, arguments);
    };
    f._elder = true; window[name] = f;
  }
  function wrapAfter(name, after) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig._elderA) return;
    const f = function () { const r = orig.apply(this, arguments); try { after(); } catch (e) { /* 忽略 */ } return r; };
    f._elderA = true; window[name] = f;
  }
  function forceList() { if (on) { try { songLibViewMode = 'list'; } catch (e) { /* 忽略 */ } } }

  function patch() {
    // 长辈模式一律用单列列表（不用瀑布流）
    wrap('renderSongLibraryGrid', () => { forceList(); });
    wrap('songLibRenderSkeleton', () => { forceList(); });

    // 点歌 → 直接看谱（跳过信息很多的详情页）
    wrap('openSongLibDetail', id => {
      if (!on) return;
      try {
        const list = getFilteredSongLibrary().filter(s => s.keys && s.keys[0] && s.keys[0].src)
          .map(s => ({ title: s.title, src: s.keys[0].src, songId: s.id }));
        const idx = list.findIndex(x => x.songId === id);
        if (idx >= 0) { openLightboxWithList(list, idx); return { skip: true }; }
      } catch (e) { /* 出错就走原来的详情页 */ }
    });
    // 「本周诗歌 / 最近使用」里点歌名 → 直接看谱
    wrap('songLibRecentOpenDetail', (key, i) => {
      if (!on) return;
      try {
        const e = (songData[key] || [])[i];
        if (e && e.src) { songLibRecentOpenImage(key, i); return { skip: true }; }
      } catch (e) { /* 忽略 */ }
    });
    // 播放：同一首歌再点一下 = 暂停 / 继续（不重头放）
    wrap('quickPlaySongAudio', title => {
      if (!on) return;
      try {
        if (globalAudioEl && globalAudioEl.src && loadedAudioLinkId && tkey(musicPlayerSongTitle) === tkey(title)) { toggleFloatingAudioPlay(); return { skip: true }; }
      } catch (e) { /* 忽略 */ }
    });
    wrapAfter('updateFloatingAudioPlayState', syncPlayUI);   // 播放 / 暂停 / 切歌时刷新按钮
    wrapAfter('stopFloatingAudio', syncPlayUI);
    wrapAfter('renderSongLibraryGrid', syncPlayUI);
    wrapAfter('lbvRenderTitle', syncPlayUI);                 // 看谱翻页时更新「听歌」按钮
    wrapAfter('closeLightbox', () => { const b = $('elderLbPlay'); if (b) b.classList.remove('show'); });
    // 长辈模式下不自动弹「使用引导」（手动点才出）
    wrap('startOnboarding', manual => { if (on && !manual) return { skip: true }; });
  }

  // 整行都能点（不只是缩略图和歌名）
  document.addEventListener('click', e => {
    if (!on) return;
    const it = e.target.closest && e.target.closest('.song-lib-weekitem');
    if (!it || e.target.closest('.song-lib-weeksong, .song-lib-weekthumb')) return;
    const t = it.querySelector('.song-lib-weeksong');
    if (t) t.click();
  });

  function init() {
    const sc = parseInt(lsGet(K_SC), 10);
    scale = sc >= 0 && sc < SCALES.length ? sc : 0;
    const flag = urlFlag();
    const want = flag !== null ? flag : lsGet(K_ON) === '1';
    inject(); patch();
    apply(want, false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.ELDER = { isOn: () => on, set: v => apply(!!v, true), toggle: () => apply(!on, true) };
})();
