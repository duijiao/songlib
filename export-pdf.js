/* 诗歌库：导出 PDF
 * 把「当前列表 / 本周歌单 / 已选歌曲 / 全部」做成一本带目录的 PDF 歌本：
 *   第 1 页起是目录（点歌名可跳到歌谱页），之后每个调一页歌谱，页脚可点回目录。
 * 文字（歌名、目录）用浏览器的 canvas 画成图片放进 PDF，这样中文不需要内嵌字体，手机上也能正常显示；
 * 歌谱图原样放进去（太大的才会压缩），不会二次损失画质。
 * 依赖 app.js 里的全局：getFilteredSongLibrary、songLibrary、songData、songLibSel、songLibCurWeekKey、
 *   findSongLibEntryByTitle、songLibCollator、songImageFile、showToast。jsPDF 在第一次点「生成」时才从 CDN 加载。
 * 对外只有一个入口：window.SLPDF。
 */
(function () {
  'use strict';

  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","WenQuanYi Micro Hei",sans-serif';
  const W = 595.28, H = 841.89, M = 36;          // A4（pt）和页边距
  const GREEN = '#1D9E75';
  const $ = (id) => document.getElementById(id);

  let st = { scope: 'list', images: true, allKeys: false };
  let busy = false, cancelled = false, result = null;

  const hasSrc = (k) => k && typeof k.src === 'string' && k.src;
  const pad2 = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const fileDate = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; };
  const toast = (m, t) => { try { showToast(m, t); } catch (e) { console.warn(m); } };

  // ─────────── 范围 ───────────
  function toEntry(s) {
    return {
      title: s.title,
      sub: [s.songbook, s.category].filter(Boolean).join(' · '),
      keys: (s.keys || []).filter(hasSrc).map(k => ({ label: k.label || '', src: k.src })),
    };
  }
  function scopeList() {
    const out = [];
    const cur = (typeof getFilteredSongLibrary === 'function') ? getFilteredSongLibrary() : [];
    out.push({ id: 'list', label: '当前列表', get: () => cur.map(toEntry) });
    const wk = songLibCurWeekKey();
    const week = (songData[wk] || []).filter(x => x && x.title);
    if (week.length) {
      out.push({
        id: 'week', label: '本周歌单', get: () => week.map(x => {
          const e = findSongLibEntryByTitle(x.title);
          const base = e ? toEntry(e) : { title: x.title, sub: '', keys: [] };
          if (x.src) base.keys = [{ label: '', src: x.src }];   // 本周选定的那份谱
          return base;
        }),
      });
    }
    if (typeof songLibSel !== 'undefined' && songLibSel.size) {
      out.push({ id: 'sel', label: '已选歌曲', get: () => songLibrary.filter(s => songLibSel.has(s.id)).map(toEntry) });
    }
    out.push({
      id: 'all', label: '全部歌曲',
      get: () => songLibrary.slice().sort((a, b) => songLibCollator.compare(a.title, b.title)).map(toEntry),
    });
    scopeList.counts = {};
    out.forEach(o => { o.n = o.get().length; });
    return out;
  }

  // ─────────── 弹窗 ───────────
  function render() {
    const scopes = scopeList();
    if (!scopes.some(s => s.id === st.scope)) st.scope = 'list';
    const cur = scopes.find(s => s.id === st.scope);
    const chip = (on, t, onclick, small) => `<button class="song-lib-filter-chip${on ? ' active' : ''}" onclick="${onclick}"${busy ? ' disabled' : ''}>${t}${small != null ? `<small>${small}</small>` : ''}</button>`;
    $('expScopeBar').innerHTML = scopes.map(s => chip(s.id === st.scope, s.label, `SLPDF.setScope('${s.id}')`, s.n)).join('');
    $('expContentBar').innerHTML =
      chip(st.images, '<i class="ti ti-photo"></i>含歌谱图片', 'SLPDF.toggle(\'images\')') +
      chip(st.images && st.allKeys, '<i class="ti ti-music"></i>每首的所有调', 'SLPDF.toggle(\'allKeys\')');
    const imgs = st.images ? cur.get().reduce((n, e) => n + (st.allKeys ? e.keys.length : Math.min(1, e.keys.length)), 0) : 0;
    const noImg = cur.get().filter(e => !e.keys.length).length;
    $('expTip').innerHTML = !cur.n ? '这个范围里还没有歌曲。'
      : (st.images
        ? `将生成：目录 + ${imgs} 页歌谱${noImg ? `（${noImg} 首没有谱图，只出现在目录里）` : ''}。约 ${Math.max(1, Math.round(imgs * 0.3))} MB，页数多时需要等一会儿。`
        : '只生成目录（歌名、诗歌本、调数），文件很小。');
    const go = $('expGoBtn');
    go.disabled = busy || !cur.n;
    go.textContent = busy ? '生成中…' : result ? '保存 / 分享 PDF' : '生成 PDF';
    go.onclick = result ? () => SLPDF.save() : () => SLPDF.run();
    $('expAgain').hidden = !result || busy;
    $('expDone').hidden = !result;
    if (result) $('expDoneTxt').textContent = `已生成 ${result.pages} 页 · ${(result.blob.size / 1048576).toFixed(1)} MB`;
  }
  function setProg(p, txt) {
    $('expProg').hidden = p == null;
    if (p != null) { $('expProgBar').style.width = Math.round(p * 100) + '%'; $('expProgTxt').textContent = txt || ''; }
  }

  // ─────────── 画文字（canvas）───────────
  function ellipsize(g, text, maxW) {
    text = String(text || '');
    if (g.measureText(text).width <= maxW) return text;
    while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  function canvasPage(wPt, hPt, scale, draw) {
    const c = document.createElement('canvas');
    c.width = Math.round(wPt * scale); c.height = Math.round(hPt * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#fff'; g.fillRect(0, 0, wPt, hPt);
    g.textBaseline = 'alphabetic';
    draw(g);
    return c.toDataURL('image/jpeg', 0.92);
  }

  // ─────────── 取图 ───────────
  async function loadImage(src, name) {
    const f = await songImageFile(src, name);                    // 已处理跨域，webp 等会转成 jpg
    let dataUrl = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('read')); r.readAsDataURL(f); });
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('img')); i.src = dataUrl; });
    let w = im.naturalWidth, h = im.naturalHeight, fmt = f.type === 'image/png' ? 'PNG' : 'JPEG';
    const long = Math.max(w, h);
    if ((fmt === 'PNG' && f.size > 1.2 * 1048576) || long > 2600) {   // 太大才压缩：长边最多 2400px，转 JPG
      const k = Math.min(1, 2400 / long);
      const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      dataUrl = c.toDataURL('image/jpeg', 0.88); fmt = 'JPEG'; w = c.width; h = c.height;
    }
    return { dataUrl, fmt, w, h };
  }
  function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return new Promise((ok, no) => {
      const el = document.createElement('script');
      el.src = JSPDF_URL; el.onload = () => (window.jspdf && window.jspdf.jsPDF) ? ok() : no(new Error('jsPDF'));
      el.onerror = () => no(new Error('load jsPDF'));
      document.head.appendChild(el);
    });
  }

  // ─────────── 生成 ───────────
  async function run() {
    if (busy) return;
    const sc = scopeList().find(s => s.id === st.scope);
    const songs = sc ? sc.get() : [];
    if (!songs.length) { toast('这个范围里没有歌曲'); return; }
    busy = true; cancelled = false; result = null; render();
    try {
      setProg(0, '正在加载 PDF 组件…');
      await ensureJsPDF();
      if (cancelled) return;

      // 1) 排版：目录占几页，每首歌从第几页开始
      const items = songs.map(e => ({ title: e.title, sub: e.sub, keys: st.images ? (st.allKeys ? e.keys : e.keys.slice(0, 1)) : [] }));
      const ROW = 22, FIRST_TOP = M + 78, NEXT_TOP = M + 40, BOTTOM = H - M - 18;
      const firstRows = Math.floor((BOTTOM - FIRST_TOP) / ROW), nextRows = Math.floor((BOTTOM - NEXT_TOP) / ROW);
      const tocPages = items.length <= firstRows ? 1 : 1 + Math.ceil((items.length - firstRows) / nextRows);
      let pg = tocPages + 1;
      items.forEach(it => { it.page = it.keys.length ? pg : 0; pg += it.keys.length; });
      const totalPages = pg - 1;
      const imgCount = items.reduce((n, it) => n + it.keys.length, 0);

      const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
      doc.setProperties({ title: `诗歌库 · ${sc.label}`, subject: '诗歌歌谱', creator: '诗歌库' });
      const S = 2;   // 文字页分辨率：2 像素 / pt ≈ 144 dpi

      // 2) 目录页
      let idx = 0;
      for (let p = 0; p < tocPages; p++) {
        const first = p === 0, cap = first ? firstRows : nextRows, top = first ? FIRST_TOP : NEXT_TOP;
        const rows = items.slice(idx, idx + cap);
        const img = canvasPage(W, H, S, g => {
          if (first) {
            g.fillStyle = GREEN; g.font = `700 30px ${FONT}`; g.fillText('诗歌库', M, M + 30);
            g.fillStyle = '#5c5c54'; g.font = `400 12px ${FONT}`;
            g.fillText(`${sc.label} · 共 ${items.length} 首 · 生成于 ${today()}`, M, M + 52);
            g.fillStyle = '#8f8f86'; g.fillText(st.images ? '点击歌名可跳到歌谱页；每页底部「返回目录」可跳回这里' : '目录', M, M + 68);
          } else {
            g.fillStyle = GREEN; g.font = `700 16px ${FONT}`; g.fillText('目录（续）', M, M + 18);
          }
          rows.forEach((it, i) => {
            const y = top + i * ROW;
            g.strokeStyle = '#eceef2'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(M, y + ROW - 4); g.lineTo(W - M, y + ROW - 4); g.stroke();
            g.fillStyle = '#b6b6ac'; g.font = `400 10px ${FONT}`; g.textAlign = 'right'; g.fillText(String(idx + i + 1), M + 20, y + 12); g.textAlign = 'left';
            g.fillStyle = '#1a1a1a'; g.font = `500 13px ${FONT}`; g.fillText(ellipsize(g, it.title, 235), M + 28, y + 12);
            const sub = [it.sub, it.keys.length > 1 ? `${it.keys.length}个调` : ''].filter(Boolean).join(' · ');
            g.fillStyle = '#8f8f86'; g.font = `400 10px ${FONT}`; g.fillText(ellipsize(g, sub, 150), M + 275, y + 12);
            g.textAlign = 'right'; g.fillStyle = it.page ? GREEN : '#c8c8c0'; g.font = `500 11px ${FONT}`;
            g.fillText(it.page ? String(it.page) : '—', W - M, y + 12); g.textAlign = 'left';
          });
          g.fillStyle = '#b6b6ac'; g.font = `400 9px ${FONT}`; g.textAlign = 'center'; g.fillText(`目录 ${p + 1} / ${tocPages}`, W / 2, H - M + 4); g.textAlign = 'left';
        });
        if (p > 0) doc.addPage();
        doc.addImage(img, 'JPEG', 0, 0, W, H, undefined, 'FAST');
        rows.forEach((it, i) => { if (it.page) doc.link(M, top + i * ROW - 2, W - 2 * M, ROW, { pageNumber: it.page }); });
        idx += rows.length;
      }

      // 3) 歌谱页（边取图边排版，最多提前取 3 张）
      const jobs = [];
      items.forEach(it => it.keys.forEach((k, ki) => jobs.push({ it, k, multi: it.keys.length > 1, ki })));
      const pend = [];
      const ensure = (i) => { if (i < jobs.length && !pend[i]) pend[i] = loadImage(jobs[i].k.src, jobs[i].it.title).catch(() => null); };
      let failed = 0;
      for (let i = 0; i < jobs.length; i++) {
        if (cancelled) return;
        ensure(i); ensure(i + 1); ensure(i + 2);
        setProg(imgCount ? i / imgCount : 0, `正在处理歌谱 ${i + 1} / ${imgCount}：${jobs[i].it.title}`);
        const im = await pend[i]; pend[i] = null;
        if (cancelled) return;
        if (!im) failed++;
        const { it, k, multi } = jobs[i];
        const pageNo = doc.getNumberOfPages() + 1;
        doc.addPage();
        const HEAD = 46, FOOT = 16, gap = 8;
        const head = canvasPage(W - 2 * M, HEAD, 3, g => {
          g.fillStyle = '#1a1a1a'; g.font = `700 22px ${FONT}`;
          const label = multi ? (k.label || '默认') : '';
          let tw = W - 2 * M; if (label) { g.font = `600 12px ${FONT}`; tw -= g.measureText(label).width + 28; g.font = `700 22px ${FONT}`; }
          g.fillText(ellipsize(g, it.title, tw), 0, 26);
          if (label) { g.font = `600 12px ${FONT}`; const lw = g.measureText(label).width; g.fillStyle = '#e8f5f0'; g.fillRect(W - 2 * M - lw - 16, 8, lw + 16, 22); g.fillStyle = GREEN; g.textAlign = 'center'; g.fillText(label, W - 2 * M - (lw + 16) / 2, 23); g.textAlign = 'left'; }
          if (it.sub) { g.fillStyle = '#8f8f86'; g.font = `400 11px ${FONT}`; g.fillText(it.sub, 0, 42); }
        });
        doc.addImage(head, 'JPEG', M, M, W - 2 * M, HEAD, undefined, 'FAST');
        const areaX = M, areaY = M + HEAD + gap, areaW = W - 2 * M, areaH = H - M - FOOT - gap - areaY;
        if (im) {
          const sc2 = Math.min(areaW / im.w, areaH / im.h), w = im.w * sc2, h = im.h * sc2;
          doc.addImage(im.dataUrl, im.fmt, areaX + (areaW - w) / 2, areaY, w, h, undefined, 'FAST');
        } else {
          const msg = canvasPage(areaW, 60, 2, g => { g.fillStyle = '#b6b6ac'; g.font = `400 13px ${FONT}`; g.textAlign = 'center'; g.fillText('（这张谱图读取失败，可在网页里查看）', areaW / 2, 34); });
          doc.addImage(msg, 'JPEG', areaX, areaY + 40, areaW, 60, undefined, 'FAST');
        }
        const foot = canvasPage(W - 2 * M, FOOT, 3, g => {
          g.fillStyle = GREEN; g.font = `500 9px ${FONT}`; g.fillText('← 返回目录', 0, 11);
          g.fillStyle = '#b6b6ac'; g.textAlign = 'right'; g.fillText(`${pageNo} / ${totalPages}`, W - 2 * M, 11);
        });
        doc.addImage(foot, 'JPEG', M, H - M - FOOT, W - 2 * M, FOOT, undefined, 'FAST');
        doc.link(M, H - M - FOOT, 70, FOOT, { pageNumber: 1 });
        await new Promise(r => setTimeout(r, 0));   // 让进度条有机会刷新
      }

      setProg(1, '正在生成文件…');
      await new Promise(r => setTimeout(r, 30));
      const blob = doc.output('blob');
      result = { blob, pages: doc.getNumberOfPages(), name: `诗歌库_${sc.label}_${fileDate()}.pdf` };
      if (failed) toast(`有 ${failed} 张谱图读取失败，已在对应页面标出`, 4000);
    } catch (e) {
      console.error('导出 PDF 失败', e);
      toast('导出失败：' + ((e && e.message === 'load jsPDF') ? '没能加载 PDF 组件，请检查网络后重试' : '请稍后再试'), 4000);
    } finally {
      busy = false; setProg(null); render();
    }
  }

  async function save() {
    if (!result) return;
    const file = new File([result.blob], result.name, { type: 'application/pdf' });
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: result.name }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const u = URL.createObjectURL(result.blob);
    const a = document.createElement('a'); a.href = u; a.download = result.name; document.body.appendChild(a); a.click(); a.remove();
    if (/MicroMessenger/i.test(navigator.userAgent)) toast('微信里可能无法下载，请用 Safari / Chrome 打开本页再导出', 5000);
    else toast('✅ 已开始下载');
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }

  window.SLPDF = {
    open() { result = null; $('songLibExportOverlay').classList.add('open'); render(); },
    close(e) {
      if (e && e.target !== e.currentTarget) return;
      if (busy) { cancelled = true; toast('已取消导出'); }
      $('songLibExportOverlay').classList.remove('open');
    },
    setScope(id) { if (busy) return; st.scope = id; result = null; render(); },
    toggle(k) { if (busy) return; st[k] = !st[k]; if (k === 'images' && !st.images) st.allKeys = false; if (k === 'allKeys' && st.allKeys) st.images = true; result = null; render(); },
    again() { result = null; render(); },
    run, save,
  };
})();
