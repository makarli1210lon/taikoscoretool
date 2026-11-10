/* 太鼓スコア記録：段位道場モード（プレイヤー画面）
   index.html の本体スクリプトより前に読み込む（関数の中から本体の db・state・save などを使う） */
'use strict';
/** 段位タブの表示状態 */
const danSt = {
  ver: null,            // 表示中のバージョン
  open: new Set(),      // 一覧で開いている段位（お題のID）
  mode: {},             // 開いた欄の表示（'red' 赤合格 ／ 'gold' 金合格）
  stack: [],            // 一覧の先の画面 [{ t:'page'|'form'|'rec', id, danId }]
  incDan: true,         // 譜面別統計に段位内プレイを含める
  form: null,           // 入力中の挑戦（写真の一時保管など）
  delOpen: false
};
let danStLoaded = false;
function danPrefs() {
  if (danStLoaded) return; danStLoaded = true;
  try { const v = localStorage.getItem('taikoScore.incDan'); if (v != null) danSt.incDan = v === '1'; } catch (e) {}
}
function setIncDan(on) { danSt.incDan = !!on; try { localStorage.setItem('taikoScore.incDan', on ? '1' : '0'); } catch (e) {} touch(); render(); }

/* ===================== データ ===================== */
function normDan(d) {
  if (!d || !d.id || d.rank == null) return null;
  const rank = Math.max(0, Math.min(DAN_NAMES.length - 1, n0(d.rank)));
  return { id: String(d.id), version: String(d.version || ''), rank, name: DAN_NAMES[rank],
    chartIds: Array.isArray(d.chartIds) ? d.chartIds.slice(0, 3) : [], soulRed: nn(d.soulRed), soulGold: nn(d.soulGold),
    conds: Array.isArray(d.conds) ? d.conds.slice(0, 3) : [], videoUrl: isHttps(d.videoUrl) ? d.videoUrl : '', note: String(d.note || ''),
    updatedAt: d.updatedAt || '', deleted: !!d.deleted };
}
function normTrack(t) {
  if (!t || typeof t !== 'object') return null;
  return { good: n0(t.good), ok: n0(t.ok), bad: n0(t.bad), roll: n0(t.roll), score: nn(t.score),
    scoreSource: ['auto', 'manual', 'none'].includes(t.scoreSource) ? t.scoreSource : (nn(t.score) != null ? 'manual' : 'none'), combo: nn(t.combo) };
}
function normDanRec(r) {
  if (!r || typeof r !== 'object' || !r.id || !r.danId) return null;
  const tracks = [0, 1, 2].map(i => normTrack(Array.isArray(r.tracks) ? r.tracks[i] : null));
  if (!tracks[0]) return null;
  return { id: String(r.id), danId: String(r.danId), tracks, soul: nn(r.soul), combo: nn(r.combo),
    result: ['red', 'gold', 'fail'].includes(r.result) ? r.result : 'fail', frame: ['silver', 'gold', 'rainbow'].includes(r.frame) ? r.frame : null,
    playedAt: r.playedAt || r.createdAt || isoLocal(), createdAt: r.createdAt || isoLocal(), updatedAt: r.updatedAt || isoLocal(),
    deleted: !!r.deleted, deletedAt: r.deletedAt || null,
    photoIds: Array.isArray(r.photoIds) ? r.photoIds.slice(0, DAN_PHOTOS) : [],
    localPhotos: Array.isArray(r.localPhotos) ? r.localPhotos.filter(n => n >= 0 && n < DAN_PHOTOS) : [],
    delPhotos: Array.isArray(r.delPhotos) ? r.delPhotos.filter(n => n >= 0 && n < DAN_PHOTOS) : [],
    status: r.status === 'rejected' ? 'rejected' : 'ok', rejectReason: r.rejectReason || '', _seen: r._seen || null, _sv: r._sv || null };
}
const danById = id => cached('danIdx', () => new Map((db.dans || []).map(d => [d.id, d]))).get(id) || null;
const liveDans = () => cached('liveDans', () => (db.dans || []).filter(d => !d.deleted));
/** バージョン名の一覧（数字を含めて新しい順） */
const danVersions = () => cached('danVers', () => [...new Set(liveDans().map(d => d.version))].sort((a, b) => b.localeCompare(a, 'ja', { numeric: true })));
const danOf = (ver, rank) => liveDans().find(d => d.version === ver && d.rank === rank) || null;
const danCharts = dan => [0, 1, 2].map(i => getSong(dan.chartIds[i]));
const myDanRecs = danId => cached('myDanRecs', () => {
  const m = new Map();
  (db.danRecords || []).forEach(r => { if (r.deleted) return; if (!m.has(r.danId)) m.set(r.danId, []); m.get(r.danId).push(r); });
  m.forEach(l => l.sort((a, b) => ts(b.playedAt) - ts(a.playedAt)));
  return m;
}).get(danId) || [];
const pendingDanRecs = () => (db.danRecords || []).filter(r => r._sv !== r.updatedAt);
const pendingDanPhotos = () => (db.danRecords || []).filter(r => r.localPhotos.length || r.delPhotos.length);
function newDanRecId() { const st = stamp(new Date()); let id; do { id = `DN-${me() || 'local'}-${st}-${rand(4)}`; } while ((db.danRecords || []).some(r => r.id === id)); return id; }
/** 譜面別統計に混ぜる「段位内プレイ」（1曲＝1件の記録として扱う。編集は挑戦記録の画面から） */
function danVirtualRecs() {
  return cached('danVirtual', () => {
    const out = [];
    (db.danRecords || []).forEach(r => {
      if (r.deleted) return;
      const dan = danById(r.danId); if (!dan) return;
      r.tracks.forEach((t, i) => {
        if (!t || !dan.chartIds[i]) return;
        out.push({ id: `${r.id}#${i}`, songId: dan.chartIds[i], good: t.good, ok: t.ok, bad: t.bad, roll: t.roll, score: t.score, scoreSource: t.scoreSource,
          mismatch: false, playedAt: r.playedAt, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: false, photoId: null, status: 'ok',
          rejectReason: '', localPhoto: false, _sv: r._sv, _dan: { recId: r.id, rank: dan.rank, track: i } });
      });
    });
    return out;
  });
}
const danVirtualFor = chartId => danVirtualRecs().filter(v => v.songId === chartId);
/** 判定（お題が変わっても常にその場で計算し直す） */
function evalDanRec(r) { const dan = danById(r.danId); return dan ? danEval(dan, r, danCharts(dan)) : null; }

/* ===================== 同期（本体の syncAllOnce から呼ばれる） ===================== */
const danRecPayload = r => ({ id: r.id, danId: r.danId, tracks: r.tracks, soul: r.soul, combo: r.combo, result: r.result, frame: r.frame,
  playedAt: r.playedAt, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted });
function mergeServerDans(list, full) {
  const inc = (list || []).map(normDan).filter(Boolean);
  if (full) db.dans = inc;
  else { const idx = new Map((db.dans || []).map((d, i) => [d.id, i])); inc.forEach(d => { const i = idx.get(d.id); if (i == null) db.dans.push(d); else db.dans[i] = d; }); }
  touch();
}
function mergeMyDanRecs(list) {
  db.danRecords = db.danRecords || [];
  const idx = new Map(db.danRecords.map(r => [r.id, r]));
  (list || []).forEach(s0 => {
    const s = normDanRec(s0); if (!s) return;
    const l = idx.get(s.id);
    if (!l) { s._sv = s.updatedAt; s._seen = s.status; db.danRecords.push(s); idx.set(s.id, s); return; }
    l.photoIds = s.photoIds; l.status = s.status; l.rejectReason = s.rejectReason;
    if (l._sv === l.updatedAt && ts(s.updatedAt) > ts(l.updatedAt))
      Object.assign(l, s, { _sv: s.updatedAt, localPhotos: l.localPhotos, delPhotos: l.delPhotos, _seen: l._seen });
  });
  touch();
}
function markDanSent(snap, accepted) {
  const idx = new Map((db.danRecords || []).map(r => [r.id, r]));
  (accepted || []).forEach(id => { const r = idx.get(id); if (r && r.updatedAt === snap.get(id)) r._sv = r.updatedAt; });
  touch();
}
/** 写真の送信・削除（記録がサーバーに届いた後に行う） */
async function uploadDanPhotos(auth) {
  for (const r of (db.danRecords || []).filter(x => x._sv && (x.localPhotos.length || x.delPhotos.length))) {
    for (const slot of [...r.delPhotos]) {
      const res = await api('uploadDanPhoto', Object.assign({ recordId: r.id, slot, data: '' }, auth), 60000);
      r.photoIds = res.photoIds; r.delPhotos = r.delPhotos.filter(x => x !== slot); save();
    }
    for (const slot of [...r.localPhotos]) {
      const b64 = await photoStore.get(`${r.id}#${slot}`);
      if (b64) {
        const res = await api('uploadDanPhoto', Object.assign({ recordId: r.id, slot, data: b64 }, auth), 90000);
        r.photoIds = res.photoIds;
        await photoStore.del(`${r.id}#${slot}`);
      }
      r.localPhotos = r.localPhotos.filter(x => x !== slot); save();
    }
  }
}
/** 却下・却下取消のお知らせ（段位の挑戦） */
function danStatusChanges() {
  return (db.danRecords || []).filter(r => !r.deleted && (r._seen || 'ok') !== r.status);
}

/* ===================== 画面 ===================== */
function danGo(v) { danSt.stack.push(v); render(); window.scrollTo(0, 0); }
function danBack() { if (danEditing()) danSt.form = null; danSt.stack.pop(); render(); window.scrollTo(0, 0); }
/** 段位の挑戦を入力・編集している最中か */
const danEditing = () => { const top = danSt.stack[danSt.stack.length - 1]; return !!(top && top.t === 'form'); };
function openDanRec(recId) { state.view = 'dan'; danSt.stack = [{ t: 'rec', id: recId }]; render(); window.scrollTo(0, 0); }
function viewDan() {
  danPrefs();
  cached('oniBoth', () => refreshOniBoth(db.songs));
  const top = danSt.stack[danSt.stack.length - 1];
  if (top && top.t === 'page') return viewDanPage(top.id);
  if (top && top.t === 'form') return viewDanForm(top.danId, top.id);
  if (top && top.t === 'rec') return viewDanRec(top.id);
  viewDanList();
}
/** 最高結果（合否・枠の優先度順） */
const danBestOf = danId => danBest(myDanRecs(danId));

/* ----- 段位一覧 ----- */
function viewDanList() {
  const vers = danVersions();
  if (!danSt.ver || !vers.includes(danSt.ver)) danSt.ver = vers[0] || null;
  const ver = danSt.ver;
  if (!ver) {
    $('#view').innerHTML = `<div class="card"><h2>段位道場</h2><div class="muted">まだ段位のお題が登録されていません。管理者がお題を登録すると、ここに表示されます。</div></div>`;
    return;
  }
  // 現在の段位：このバージョンで合格したいちばん上の段位
  let cur = null;
  for (let rank = DAN_NAMES.length - 1; rank >= 0 && !cur; rank--) {
    const d = danOf(ver, rank); if (!d) continue;
    const b = danBestOf(d.id); if (b && b.result !== 'fail') cur = { d, b };
  }
  const card = rank => {
    const d = danOf(ver, rank), cls = danClass(rank);
    if (!d) return `<div class="dcard ${cls} nodef"><div class="dtop">${danPlate(rank)}<span class="ver">${esc(ver)}</span><span class="sp"></span><span class="muted" style="font-size:11px">お題未登録</span></div></div>`;
    const b = danBestOf(d.id), open = danSt.open.has(d.id), mode = danSt.mode[d.id] || 'red';
    return `<div class="dcard ${cls}" data-dcard="${esc(d.id)}"><div class="dtop" data-dtoggle="${esc(d.id)}">${danPlate(rank)}<span class="ver">${esc(ver)}</span><span class="sp"></span>
      ${danEmblem(b && b.result, b && b.frame)}
      ${d.videoUrl ? `<a class="ibtn yt" href="${esc(d.videoUrl)}" target="_blank" rel="noopener" title="お手本動画" aria-label="お手本動画">▶</a>` : '<span class="ibtn yt off" aria-hidden="true">▶</span>'}
      <button type="button" class="ibtn" aria-label="${open ? '閉じる' : '開く'}" aria-expanded="${open}">${open ? '︿' : '﹀'}</button></div>
      ${open ? danBodyHtml(d, danCharts(d), mode, { chartLink: true, after: `<button class="btn dbtn" data-dpage="${esc(d.id)}">詳細（段位内ベスト・理論値チェック） ›</button>` }) : ''}</div>`;
  };
  $('#view').innerHTML = `
  <div class="card" style="padding:10px 14px">
    <div class="row between"><h2 style="margin:0">段位道場</h2>
      ${vers.length > 1 ? `<select id="danVer" style="width:auto;padding:6px 8px;font-size:13px">${vers.map(v => `<option${v === ver ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>` : `<span class="muted">${esc(ver)}</span>`}</div>
    <div class="row" style="margin-top:8px;gap:10px"><span class="muted">現在の段位</span>${cur ? danPlate(cur.d.rank) + danEmblem(cur.b.result, cur.b.frame) : '<span class="muted">まだありません</span>'}</div>
  </div>
  ${DAN_NAMES.map((_, rank) => card(rank)).join('')}`;
  if ($('#danVer')) $('#danVer').onchange = e => { danSt.ver = e.target.value; render(); };
  document.querySelectorAll('[data-dtoggle]').forEach(el => el.onclick = e => {
    if (e.target.closest('a')) return; // 動画リンクはそのまま開く
    const id = el.dataset.dtoggle;
    if (danSt.open.has(id)) danSt.open.delete(id); else danSt.open.add(id);
    render();
  });
  bindDanBody();
}
/** 開いた欄の中の操作（赤合格／金合格の切り替え・課題曲・詳細） */
function bindDanBody() {
  document.querySelectorAll('[data-dcard]').forEach(card => {
    const id = card.dataset.dcard;
    card.querySelectorAll('[data-dmode]').forEach(b => b.onclick = () => { danSt.mode[id] = b.dataset.dmode; render(); });
  });
  document.querySelectorAll('[data-chart]').forEach(el => el.onclick = () => openChartStats(el.dataset.chart));
  document.querySelectorAll('[data-dpage]').forEach(b => b.onclick = () => danGo({ t: 'page', id: b.dataset.dpage }));
}

/* ----- 段位ページ（段位内ベスト・理論値チェック・挑戦履歴） ----- */
/** 条件の値の「良い方」（以上なら大きい方、未満なら小さい方） */
const betterOf = (c, a, b) => a == null ? b : b == null ? a : (c.op === 'lt' ? Math.min(a, b) : Math.max(a, b));
/** 余裕・不足の文 */
function marginText(m, label) {
  if (m == null) return '';
  return m >= 0 ? `<span class="ok-t">${label}まで余裕 ${m}</span>` : `<span class="ng-t">${label}まであと ${-m}</span>`;
}
function viewDanPage(id) {
  const d = danById(id);
  if (!d || d.deleted) { danBack(); return; }
  const charts = danCharts(d), recs = myDanRecs(id), best = danBest(recs);
  const evs = recs.map(r => ({ r, e: danEval(d, r, charts) }));
  const maxPlayed = Math.max(0, ...evs.map(x => x.e.played));
  // 段位内ベスト：3曲合計スコア・曲ごとのスコア・条件ごとの最良値
  const bestTotal = recs.filter(r => danPlayed(r) === 3).sort((a, b) => danTotalScore(b) - danTotalScore(a))[0] || null;
  const perSong = [0, 1, 2].map(i => {
    let b = null; recs.forEach(r => { const t = r.tracks[i]; if (t && t.score != null && (!b || t.score > b.t.score)) b = { t, r }; });
    return b;
  });
  const condBest = (d.conds || []).map((c, ci) => {
    if (c.scope === 'per') {
      const vals = [0, 1, 2].map(i => evs.reduce((acc, x) => betterOf(c, acc, x.e.conds[ci].vals[i]), null));
      return { c, vals };
    }
    let bt = null, when = null;
    evs.forEach(x => { if (x.e.played === 3 && x.e.conds[ci].total != null) { const nv = betterOf(c, bt, x.e.conds[ci].total); if (nv !== bt) { bt = nv; when = x.r.playedAt; } } });
    return { c, total: bt, when };
  });
  // 理論値チェック：通常プレイと段位内プレイを合わせた、各曲の条件ごとの最高値
  const theory = (d.conds || []).map(c => {
    const vals = charts.map((s, i) => {
      if (!s) return null;
      let v = null;
      const plays = db.records.filter(r => !r.deleted && r.songId === s.id).concat(danVirtualFor(s.id));
      plays.forEach(r => { v = betterOf(c, v, danTrackVal(r, c.type, s)); });
      return v;
    });
    return { c, vals };
  });
  const condLine = (c, lv) => { const v = c[lv] != null ? c[lv] : c.red; return Array.isArray(v) ? v.map(dn).join(' / ') + DAN_OP[c.op] : dn(v) + DAN_OP[c.op]; };
  const scopeTag = c => `<span class="scope">${c.scope === 'per' ? '曲別' : '3曲合計'}</span>`;
  const perCells = (c, vals, cls) => `<div class="mini3">${vals.map((v, i) => {
    const n = (c.red || [])[i], ok = v != null && n != null && (c.op === 'lt' ? v < n : v >= n);
    return `<div class="${v == null ? '' : ok ? 'ok-t' : 'ng-t'}">${i + 1}曲目 <b>${dn(v)}</b>${v == null ? '' : ok ? ' ✓' : ' ✗'}</div>`;
  }).join('')}</div>`;
  const sumNeed = (c, vals) => vals.every(v => v != null) ? vals.reduce((a, v) => a + v, 0) : null;
  const mgOf = (c, v, n) => v == null || n == null ? null : c.op === 'lt' ? n - 1 - v : v - n;
  $('#view').innerHTML = `<button class="btn sub small back" id="back">‹ 段位一覧</button>
  <div class="card" style="margin-top:10px">
    <div class="danhead">${danPlate(d.rank, true)}<div style="min-width:0"><div class="ver">${esc(d.version)}</div>
      <div style="margin-top:4px">${danEmblem(best && best.result, best && best.frame, true)}</div>
      <div class="meta" style="margin-top:4px">挑戦 ${recs.length}回${recs.length ? `・最高 ${maxPlayed}曲目まで` : ''}</div></div>
      ${d.videoUrl ? `<a class="ibtn yt" style="margin-left:auto;background:var(--soft)" href="${esc(d.videoUrl)}" target="_blank" rel="noopener" aria-label="お手本動画">▶</a>` : ''}</div>
    ${d.note ? `<div class="muted" style="margin-top:8px">${esc(d.note)}</div>` : ''}
    <button class="btn" id="danRecord">この段位の挑戦を記録する</button>
  </div>
  <div class="dcard ${danClass(d.rank)}" data-dcard="${esc(d.id)}">${danBodyHtml(d, charts, danSt.mode[d.id] || 'red', { chartLink: true })}</div>
  <div class="card"><h2>段位内ベスト</h2>
    ${recs.length ? `
    <div class="kv2"><span>最高結果</span><b>${danEmblem(best.result, best.frame)} <span class="muted">${fmtDate(best.playedAt)}</span></b></div>
    <div class="kv2"><span>3曲合計スコア</span><b class="num">${bestTotal ? dn(danTotalScore(bestTotal)) + ` <span class="muted">（${fmtDay(bestTotal.playedAt)}）</span>` : '—'}</b></div>
    <h3>曲ごとの段位内ベスト</h3>
    ${charts.map((s, i) => { const b = perSong[i]; return `<div class="tpan t${i + 1}"><div class="tl">${s ? cicon(s.course) : ''}<span class="nm">${esc(s ? s.title : '—')}</span>
      <b class="num">${b ? crownHtml(crownOf(b.t, s)) + ' ' + dn(b.t.score) : '—'}</b></div>
      ${b ? `<div class="muted num" style="margin-top:2px"><span class="j-good">良${b.t.good}</span> <span class="j-ok">可${b.t.ok}</span> <span class="j-bad">不可${b.t.bad}</span> <span class="j-roll">連打${b.t.roll}</span></div>` : '<div class="muted">まだ演奏していません</div>'}</div>`; }).join('')}
    ${condBest.length ? `<h3>条件ごとの段位内ベスト</h3>` + condBest.map(x => x.c.scope === 'per'
      ? `<div class="cond"><span>${DAN_COND[x.c.type]}${scopeTag(x.c)}<div class="need">合格 ${condLine(x.c, 'red')} ／ <span class="gold-t">金 ${condLine(x.c, 'gold')}</span></div></span><span class="val"></span>${perCells(x.c, x.vals)}</div>`
      : `<div class="cond"><span>${DAN_COND[x.c.type]}${scopeTag(x.c)}<div class="need">合格 ${condLine(x.c, 'red')} ／ <span class="gold-t">金 ${condLine(x.c, 'gold')}</span></div></span>
          <span class="val">${dn(x.total)}</span><div class="mg">${x.total == null ? '<span class="muted">3曲演奏した挑戦がありません</span>' : marginText(mgOf(x.c, x.total, x.c.red), '合格') + '　' + marginText(mgOf(x.c, x.total, x.c.gold != null ? x.c.gold : x.c.red), '金合格')}${x.when ? ` <span class="muted">（${fmtDay(x.when)}）</span>` : ''}</div></div>`).join('') : ''}
    ` : '<div class="muted">まだ挑戦の記録がありません。</div>'}
  </div>
  <div class="card"><h2>理論値チェック <span class="muted" style="font-weight:400">通常プレイを含む各曲の最高値から</span></h2>
    ${theory.length ? theory.map(x => {
      if (x.c.scope === 'per') {
        const okN = x.vals.filter((v, i) => v != null && (x.c.red || [])[i] != null && (x.c.op === 'lt' ? v < x.c.red[i] : v >= x.c.red[i])).length;
        const lack = x.vals.map((v, i) => ({ i, m: mgOf(x.c, v, (x.c.red || [])[i]) })).filter(y => y.m != null && y.m < 0);
        return `<div class="cond"><span>${DAN_COND[x.c.type]}${scopeTag(x.c)}<div class="need">合格 ${condLine(x.c, 'red')}</div></span><span class="val ${okN === 3 ? 'ok-t' : 'ng-t'}">${okN}/3 ${okN === 3 ? '✓' : '✗'}</span>
          ${perCells(x.c, x.vals)}${lack.length ? `<div class="mg ng-t">${lack.map(y => `${y.i + 1}曲目があと ${-y.m}`).join('、')}</div>` : ''}</div>`;
      }
      const sum = sumNeed(x.c, x.vals), m = mgOf(x.c, sum, x.c.red);
      return `<div class="cond"><span>${DAN_COND[x.c.type]}${scopeTag(x.c)}<div class="need">合格 ${condLine(x.c, 'red')}</div></span><span class="val ${m == null ? '' : m >= 0 ? 'ok-t' : 'ng-t'}">${dn(sum)}${m == null ? '' : m >= 0 ? ' ✓' : ' ✗'}</span>
        <div class="mini3">${x.vals.map((v, i) => `<div>${i + 1}曲目 <b>${dn(v)}</b></div>`).join('')}</div>
        <div class="mg">${m == null ? '<span class="muted">記録のない曲があります</span>' : marginText(m, '合格') + '　' + marginText(mgOf(x.c, sum, x.c.gold != null ? x.c.gold : x.c.red), '金合格')}</div></div>`;
    }).join('') + '<div class="muted" style="margin-top:8px">※ 各曲の最高値の組み合わせです。3曲合計の条件と魂ゲージは目安です。</div>' : '<div class="muted">魂ゲージ以外の条件がない段位です。</div>'}
  </div>
  <div class="card"><h2>挑戦履歴（${recs.length}回）</h2>
    ${recs.length ? `<div class="list">${evs.map(({ r, e }) => danHistItem(r, e, d)).join('')}</div>` : '<div class="muted">まだ挑戦の記録がありません。</div>'}
  </div>
  ${danDeletedCard(id)}`;
  $('#back').onclick = danBack;
  $('#danRecord').onclick = () => { danSt.form = null; danGo({ t: 'form', danId: id, id: null }); };
  bindDanBody();
  document.querySelectorAll('[data-drec]').forEach(el => el.onclick = () => danGo({ t: 'rec', id: el.dataset.drec }));
}
/** 挑戦履歴の1行 */
function danHistItem(r, e, d) {
  const why = [];
  if (e.played < 3) why.push(`${e.played}曲目で終了`);
  else why.push('3曲目まで');
  if (r.soul != null) why.push(`魂 ${r.soul}%`);
  e.conds.forEach(x => { if (!x.pass.red && (x.failAt != null || e.played === 3)) why.push(`${DAN_COND[x.c.type]}${x.per ? '' : ' ' + dn(x.total)}${x.failAt != null && x.failAt < 2 && !x.per ? '（達成失敗）' : '（不足）'}`); });
  const badges = (r.status === 'rejected' ? '<span class="badge b-ng">却下</span>' : '') + (r._sv !== r.updatedAt ? '<span class="badge b-warn">未送信</span>' : '') +
    ((r.photoIds.filter(Boolean).length + r.localPhotos.length) ? `<span class="badge b-ok">📷 ${r.photoIds.filter(Boolean).length + r.localPhotos.length}枚</span>` : '');
  return `<div class="item tap" data-drec="${esc(r.id)}"><div class="row between" style="flex-wrap:nowrap"><b class="num">${fmtDate(r.playedAt)}</b>${danEmblem(e.result, e.frame)}</div>
    <div class="muted">${esc(why.join('・'))}</div>${badges ? `<div style="margin-top:2px">${badges}</div>` : ''}</div>`;
}
function danDeletedCard(danId) {
  const del = (db.danRecords || []).filter(r => r.deleted && r.danId === danId && restoreLeft(r) > 0).sort((a, b) => ts(b.deletedAt) - ts(a.deletedAt));
  if (!del.length) return '';
  return `<details class="card"${danSt.delOpen ? ' open' : ''} ontoggle="danSt.delOpen=this.open"><summary style="cursor:pointer;font-weight:700">🗑 削除した挑戦（${del.length}件・削除から${RESTORE_DAYS}日以内は復元できます）</summary>
    <div class="list" style="margin-top:10px">${del.map(r => `<div class="item"><div class="row between"><span class="num">${fmtDate(r.playedAt)}</span>${danEmblem(r.result, r.frame)}</div>
      <div class="muted">あと${Math.ceil(restoreLeft(r) / DAY_MS)}日で復元できなくなります</div>
      <button class="btn sub small" style="margin-top:6px" onclick="restoreDanRec('${esc(r.id)}')">復元する</button></div>`).join('')}</div></details>`;
}
function restoreDanRec(id) {
  const r = (db.danRecords || []).find(x => x.id === id); if (!r) return;
  r.deleted = false; r.deletedAt = null; r.updatedAt = isoLocal(); save(); toast('復元しました'); render(); scheduleSync();
}

/* ----- 挑戦の入力 ----- */
function viewDanForm(danId, editId) {
  const d = danById(danId);
  const rec = editId ? (db.danRecords || []).find(r => r.id === editId) : null;
  if (!d || (editId && !rec)) { danBack(); return; }
  const charts = danCharts(d);
  const perCombo = (d.conds || []).some(c => c.type === 'combo' && c.scope === 'per');
  const totCombo = (d.conds || []).some(c => c.type === 'combo' && c.scope !== 'per');
  if (!danSt.form || danSt.form.recId !== (rec && rec.id) || danSt.form.danId !== danId) {
    // 写真の欄：[{ kind:'server', id } | { kind:'local', b64 } | null] × 4
    const ph = [0, 1, 2, 3].map(i => rec && rec.localPhotos.includes(i) ? { kind: 'pending' } : rec && rec.photoIds[i] ? { kind: 'server', id: rec.photoIds[i] } : null);
    danSt.form = { recId: rec && rec.id, danId, photos: ph, changed: new Set(), vals: {} };
  }
  const v = (i, k) => rec && rec.tracks[i] ? (rec.tracks[i][k] ?? '') : '';
  const pa = toLocalInput(rec ? new Date(rec.playedAt) : new Date());
  const tin = i => {
    const s = charts[i], manual = !(s && s.shoko) || (rec && rec.tracks[i] && rec.tracks[i].scoreSource === 'manual');
    return `<div class="trackin t${i + 1}" id="tin${i}">
    <div class="th"><span class="no">${i + 1}曲目</span>${s ? cicon(s.course) : ''}<span class="nm">${esc(s ? s.title : '（楽曲が見つかりません）')}</span></div>
    <div class="judge4">
      <div><label class="j-good">良</label><input id="t${i}g" type="number" inputmode="numeric" min="0" value="${v(i, 'good')}"></div>
      <div><label class="j-ok">可</label><input id="t${i}o" type="number" inputmode="numeric" min="0" value="${v(i, 'ok')}"></div>
      <div><label class="j-bad">不可</label><input id="t${i}b" type="number" inputmode="numeric" min="0" value="${v(i, 'bad')}"></div>
      <div><label class="j-roll">連打</label><input id="t${i}r" type="number" inputmode="numeric" min="0" value="${v(i, 'roll')}"></div></div>
    ${perCombo ? `<div class="tsc"><span class="muted">最大コンボ数（不可0なら空欄で自動）</span><input id="t${i}c" type="number" inputmode="numeric" min="0" value="${v(i, 'combo')}"></div>` : ''}
    <div class="tsc"><span class="muted" id="t${i}info"></span>${manual
      ? `<input id="t${i}s" type="number" inputmode="numeric" min="0" placeholder="スコア" value="${v(i, 'score')}">` : `<b id="t${i}auto">—</b>`}</div></div>`;
  };
  $('#view').innerHTML = `<button class="btn sub small back" id="back">‹ ${rec ? '戻る' : '段位ページ'}</button>
  <div class="card" style="margin-top:10px">
    <h2>${rec ? '挑戦の記録を編集' : '段位道場の挑戦を記録'}</h2>
    <div class="row" style="gap:8px">${danPlate(d.rank, false)}<span class="ver">${esc(d.version)}</span></div>
    <div class="muted" style="margin-top:6px">途中で終わった（打ち切りになった）曲は空欄のままにしてください。</div>
    ${[0, 1, 2].map(tin).join('')}
    ${totCombo ? `<label>最大コンボ数（3曲通し）</label><input id="dcombo" type="number" inputmode="numeric" min="0" value="${rec && rec.combo != null ? rec.combo : ''}" placeholder="全曲不可0なら空欄で自動">` : ''}
    ${d.soulRed != null ? `<label>魂ゲージ（3曲終了時・％）</label>
    <div class="soulin"><input id="dsoul" type="number" inputmode="numeric" min="0" max="100" placeholder="0〜100" value="${rec && rec.soul != null ? rec.soul : ''}"><span class="pct">%</span><button type="button" class="btn sub small" id="soulMax">100%（MAX）</button></div>` : ''}
    <label>リザルト写真（${DAN_PHOTOS}枚まで・任意）</label>
    <div class="photos4" id="dphotos"></div>
    <label>挑戦日時</label><input id="dplayed" type="datetime-local" value="${pa}">
    <div class="livebox" id="dlive"></div>
    <button class="btn" id="dsave">${rec ? '変更を保存' : '記録する'}</button>
    ${rec ? '<button class="btn sub" id="dcancel">キャンセル</button>' : ''}
  </div>`;
  $('#back').onclick = danBack;
  if ($('#dcancel')) $('#dcancel').onclick = danBack;
  // 入力中の値を控えておき、画面が描き直されても戻す
  const vals = danSt.form.vals;
  Object.entries(vals).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
  const keep = el => { vals[el.id] = el.value; };
  if ($('#soulMax')) $('#soulMax').onclick = () => { $('#dsoul').value = 100; keep($('#dsoul')); danFormUpdate(d, charts); };
  document.querySelectorAll('#view input[type=number]').forEach(el => { el.oninput = () => { keep(el); danFormUpdate(d, charts); }; el.onfocus = () => el.select(); });
  $('#dplayed').onchange = e => keep(e.target);
  $('#dsave').onclick = () => saveDanRec(d, charts, rec);
  renderDanPhotos();
  danFormUpdate(d, charts);
}
/** 入力中の値から挑戦記録の形を作る（空欄の曲は null） */
function danFormRec(d, charts) {
  const num = id => { const el = $('#' + id); return el ? nn(el.value) : null; };
  const tracks = [0, 1, 2].map(i => {
    const g = num(`t${i}g`), o = num(`t${i}o`), b = num(`t${i}b`), r = num(`t${i}r`);
    if (g == null && o == null && b == null && r == null) return null;
    const s = charts[i], manualEl = $(`#t${i}s`);
    const t = { good: g || 0, ok: o || 0, bad: b || 0, roll: r || 0, combo: num(`t${i}c`) };
    if (manualEl) { t.score = nn(manualEl.value); t.scoreSource = t.score == null ? 'none' : 'manual'; }
    else { t.score = calcScore(s.shoko, t.good, t.ok, t.roll); t.scoreSource = 'auto'; }
    return t;
  });
  // 途中の曲が空欄なら、それ以降は演奏していない扱い
  const first = tracks.findIndex(t => !t);
  if (first >= 0) for (let i = first; i < 3; i++) tracks[i] = null;
  return { tracks, soul: $('#dsoul') ? Math.min(100, nn($('#dsoul').value) ?? NaN) : null, combo: $('#dcombo') ? nn($('#dcombo').value) : null };
}
function danFormUpdate(d, charts) {
  const fr = danFormRec(d, charts);
  if (Number.isNaN(fr.soul)) fr.soul = null;
  fr.tracks.forEach((t, i) => {
    const s = charts[i], el = $(`#tin${i}`); if (!el) return;
    el.classList.toggle('skip', !t);
    const sum = t ? t.good + t.ok + t.bad : null;
    const info = $(`#t${i}info`), auto = $(`#t${i}auto`);
    if (info) info.innerHTML = !t ? '演奏していない曲は空欄のまま' : s && s.maxCombo ? `合計 ${sum} / ${s.maxCombo}${sum !== s.maxCombo ? ' <span class="ng-t">（ノーツ数と違います）</span>' : ''}` : `合計 ${sum}`;
    if (auto) auto.textContent = t ? dn(t.score) : '—';
  });
  const e = danEval(d, fr, charts);
  const rows = [];
  if (e.soul) rows.push(`<div class="cond"><span>魂ゲージ ${e.soul.need.red}%以上</span><span class="val ${e.soul.v == null ? '' : e.soul.pass.red ? 'ok-t' : 'ng-t'}">${e.soul.v == null ? '—' : e.soul.v + '%'}</span></div>`);
  e.conds.forEach(x => {
    const cls = x.pass.gold ? 'gold-t' : x.pass.red ? 'ok-t' : (x.failAt != null ? 'ng-t' : '');
    const val = x.per ? x.vals.map(dn).join(' / ') : dn(x.total);
    rows.push(`<div class="cond"><span>${esc(danCondText(x.c, 'red'))}</span><span class="val ${cls}">${val}</span>
      ${x.failAt != null ? `<div class="mg ng-t">${x.failAt + 1}曲目で達成失敗${x.failAt < 2 ? ` → ${x.failAt + 2}曲目以降は打ち切り` : ''}</div>` : ''}</div>`);
  });
  $('#dlive').innerHTML = `<div class="lt"><span>判定</span>${danEmblem(e.played ? e.result : null, e.frame)}</div>${rows.join('')}
    ${e.played && e.played < 3 && e.failAt == null ? '<div class="muted" style="font-size:12px">3曲目まで入力すると合否が決まります</div>' : ''}
    ${e.missing ? '<div class="muted" style="font-size:12px">判定に必要な値（魂ゲージ・最大コンボ・スコアなど）が空欄です</div>' : ''}`;
}
function renderDanPhotos() {
  const f = danSt.form, box = $('#dphotos'); if (!box) return;
  box.innerHTML = f.photos.map((p, i) => p
    ? `<div class="ph">${p.kind === 'local' ? `<img src="data:image/jpeg;base64,${p.b64}" alt="写真${i + 1}">` : p.kind === 'pending' ? `写真${i + 1}<br>（送信待ち）` : `写真${i + 1}<br>（送信済み）`}
       <button type="button" class="x" data-phx="${i}" aria-label="写真${i + 1}を外す">×</button></div>`
    : `<label class="ph add" aria-label="写真${i + 1}を追加">＋<input type="file" accept="image/*" data-phin="${i}"></label>`).join('');
  box.querySelectorAll('[data-phx]').forEach(b => b.onclick = () => { f.photos[+b.dataset.phx] = null; f.changed.add(+b.dataset.phx); renderDanPhotos(); });
  box.querySelectorAll('[data-phin]').forEach(inp => inp.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const p = await compressImage(file); f.photos[+inp.dataset.phin] = { kind: 'local', b64: p.b64 }; f.changed.add(+inp.dataset.phin); renderDanPhotos(); }
    catch (err) { toast(err.message); }
  });
}
async function saveDanRec(d, charts, rec) {
  const fr = danFormRec(d, charts);
  if (Number.isNaN(fr.soul)) fr.soul = null;
  if (!fr.tracks[0]) { alert('1曲目の判定数を入力してください。'); return; }
  const missScore = fr.tracks.findIndex(t => t && t.score == null);
  if (missScore >= 0 && !confirm(`${missScore + 1}曲目のスコアが空欄です。このまま保存しますか？（スコアの条件は判定できません）`)) return;
  if (d.soulRed != null && danPlayed(fr) === 3 && fr.soul == null && !confirm('魂ゲージが空欄です。このまま保存しますか？（合格の判定ができません）')) return;
  const btn = $('#dsave'); btn.disabled = true;
  const e = danEval(d, fr, charts), now = isoLocal(), pa = $('#dplayed').value;
  const target = rec || { id: newDanRecId(), danId: d.id, createdAt: now, deleted: false, deletedAt: null, photoIds: [], localPhotos: [], delPhotos: [],
    status: 'ok', rejectReason: '', _seen: null, _sv: null };
  Object.assign(target, { tracks: fr.tracks, soul: fr.soul, combo: fr.combo, result: e.result, frame: e.frame,
    playedAt: pa ? isoLocal(new Date(pa)) : now, updatedAt: now });
  db.danRecords = db.danRecords || [];
  if (!rec) db.danRecords.push(target);
  // 写真：変えた枠だけ、送信待ち（追加）か削除待ちにする
  for (const i of danSt.form.changed) {
    const p = danSt.form.photos[i];
    target.localPhotos = target.localPhotos.filter(x => x !== i);
    if (p && p.kind === 'local') { await photoStore.set(`${target.id}#${i}`, p.b64); target.localPhotos.push(i); }
    else { await photoStore.del(`${target.id}#${i}`); if (target.photoIds[i]) target.delPhotos = [...new Set([...target.delPhotos, i])]; }
  }
  danSt.form = null;
  save(); askPersist(); scheduleSync();
  toast(rec ? '変更を保存しました' : `記録しました（${danLabel(e.result, e.frame)}）`);
  danSt.stack.pop();
  if (!rec) danSt.stack.push({ t: 'rec', id: target.id });
  render(); window.scrollTo(0, 0);
}

/* ----- 挑戦結果の詳細 ----- */
function viewDanRec(id) {
  const r = (db.danRecords || []).find(x => x.id === id);
  const d = r && danById(r.danId);
  if (!r || r.deleted || !d) { danBack(); return; }
  const charts = danCharts(d), e = danEval(d, r, charts);
  const nPhoto = r.photoIds.filter(Boolean).length + r.localPhotos.filter(i => !r.photoIds[i]).length;
  const badges = (r.status === 'rejected' ? '<span class="badge b-ng">却下</span>' : '') + (nPhoto ? `<span class="badge b-ok">📷 写真${nPhoto}枚</span>` : '<span class="badge b-mute">写真なし</span>') +
    (r._sv !== r.updatedAt ? '<span class="badge b-warn">未送信</span>' : '') + (e.played < 3 ? `<span class="badge b-mute">${e.played}曲目で終了</span>` : '');
  const goldGap = e.result === 'red' ? e.conds.filter(x => !x.pass.gold).map(x => DAN_COND[x.c.type]).concat(e.soul && !e.soul.pass.gold ? ['魂ゲージ'] : []) : [];
  const lvTxt = (c, lv) => { const v = c[lv] != null ? c[lv] : c.red; return Array.isArray(v) ? v.map(dn).join(' / ') + DAN_OP[c.op] : dn(v) + DAN_OP[c.op]; };
  const condRow = x => {
    const cls = x.pass.gold ? 'gold-t' : x.pass.red ? 'ok-t' : 'ng-t';
    if (x.per) return `<div class="cond"><span>${DAN_COND[x.c.type]}<span class="scope">曲別</span><div class="need">${lvTxt(x.c, 'red')} ／ <span class="gold-t">金 ${lvTxt(x.c, 'gold')}</span></div></span>
      <span class="val ${cls}">${x.pass.gold ? '金 ✓' : x.pass.red ? '✓' : '✗'}</span>
      <div class="mini3">${x.vals.map((v, i) => `<div class="${v == null ? '' : x.margin.gold[i] >= 0 ? 'gold-t' : x.margin.red[i] >= 0 ? 'ok-t' : 'ng-t'}">${i + 1}曲目 <b>${dn(v)}</b></div>`).join('')}</div></div>`;
    return `<div class="cond"><span>${DAN_COND[x.c.type]}<span class="scope">3曲合計</span><div class="need">${lvTxt(x.c, 'red')} ／ <span class="gold-t">金 ${lvTxt(x.c, 'gold')}</span></div></span>
      <span class="val ${cls}">${dn(x.total)}</span>
      <div class="mg">${x.pass.gold ? '<span class="gold-t">金合格 ✓</span>' : x.pass.red ? `<span class="ok-t">合格 ✓ 余裕 ${x.margin.red}</span> ／ ${marginText(x.margin.gold, '金合格')}` : x.failAt != null ? `<span class="ng-t">${x.failAt + 1}曲目で達成失敗</span>` : marginText(x.margin.red, '合格')}</div></div>`;
  };
  $('#view').innerHTML = `<button class="btn sub small back" id="back">‹ 戻る</button>
  <div class="card" style="margin-top:10px;text-align:center">
    <div>${danPlate(d.rank, true)}</div><div class="ver" style="margin-top:4px">${esc(d.version)}</div>
    <div style="margin-top:10px">${danEmblem(e.played ? e.result : 'fail', e.frame, true)}</div>
    <div class="muted num" style="margin-top:8px">${fmtDate(r.playedAt)}${r.soul != null ? `・魂ゲージ ${r.soul}%` : ''}</div>
    <div style="margin-top:6px">${badges}${goldGap.length ? `<span class="badge b-mute">金合格まで：${esc(goldGap.join('・'))}</span>` : ''}</div>
    ${r.status === 'rejected' ? `<div class="muted" style="color:var(--danger);margin-top:6px">却下理由：${esc(r.rejectReason || '（未記入）')}</div>` : ''}
    ${r.result !== e.result || r.frame !== e.frame ? '<div class="muted" style="margin-top:6px">※ お題が変更されたため、記録時とは判定が変わっています</div>' : ''}
  </div>
  ${nPhoto ? `<div class="card"><h2>リザルト写真</h2><div class="row">${[0, 1, 2, 3].filter(i => r.photoIds[i] || r.localPhotos.includes(i)).map(i =>
    `<button class="btn sub small" data-dphoto="${i}">📷 写真${i + 1}${r.localPhotos.includes(i) ? '（送信待ち）' : ''}</button>`).join('')}</div></div>` : ''}
  <div class="card"><h2>条件の達成状況</h2>
    ${e.soul ? `<div class="cond"><span>魂ゲージ<div class="need">${e.soul.need.red}%以上 ／ <span class="gold-t">金 ${e.soul.need.gold}%以上</span></div></span>
      <span class="val ${e.soul.pass.gold ? 'gold-t' : e.soul.pass.red ? 'ok-t' : 'ng-t'}">${e.soul.v == null ? '—' : e.soul.v + '%'}</span></div>` : ''}
    ${e.conds.map(condRow).join('')}
  </div>
  <div class="card"><h2>曲ごとの結果</h2>
    ${charts.map((s, i) => { const t = r.tracks[i]; return `<div class="tpan t${i + 1}"><div class="tno">${i + 1}曲目</div>
      <div class="tl">${s ? cicon(s.course) : ''}<span class="nm">${esc(s ? s.title : '—')}</span><b class="num">${t ? crownHtml(crownOf(t, s)) + ' ' + dn(t.score) : '—'}</b></div>
      ${t ? `<div class="muted num" style="margin-top:2px"><span class="j-good">良${t.good}</span> <span class="j-ok">可${t.ok}</span> <span class="j-bad">不可${t.bad}</span> <span class="j-roll">連打${t.roll}</span>${t.scoreSource === 'manual' ? ' <span class="badge b-ka">手入力</span>' : ''}</div>` : '<div class="muted">演奏していません（打ち切り）</div>'}
      ${s ? `<button class="btn sub small" style="margin-top:6px" data-chart="${esc(s.id)}">譜面別統計 ›</button>` : ''}</div>`; }).join('')}
  </div>
  <div class="row" style="justify-content:flex-end"><button class="btn sub small" id="dEdit">編集</button><button class="btn sub small danger" id="dDel">削除</button></div>`;
  $('#back').onclick = danBack;
  document.querySelectorAll('[data-chart]').forEach(el => el.onclick = () => openChartStats(el.dataset.chart));
  $('#dEdit').onclick = () => { danSt.form = null; danGo({ t: 'form', danId: r.danId, id: r.id }); };
  $('#dDel').onclick = () => {
    if (!confirm(`この挑戦の記録を削除しますか？\n削除から${RESTORE_DAYS}日以内なら、段位ページの下から復元できます。`)) return;
    r.deleted = true; r.deletedAt = isoLocal(); r.updatedAt = isoLocal(); save(); scheduleSync(); toast('削除しました'); danBack();
  };
  document.querySelectorAll('[data-dphoto]').forEach(b => b.onclick = () => showDanPhoto(r, +b.dataset.dphoto));
}
const danPhotoCache = new Map();
async function showDanPhoto(r, slot) {
  const m = showModal(`<h2>リザルト写真 ${slot + 1}</h2><div id="ph" class="muted">読み込んでいます…</div>`, true);
  try {
    const key = `${r.id}#${slot}`;
    let src = r.localPhotos.includes(slot) ? null : danPhotoCache.get(key + (r.photoIds[slot] || ''));
    if (!src && r.localPhotos.includes(slot)) { const b64 = await photoStore.get(key); if (b64) src = 'data:image/jpeg;base64,' + b64; }
    if (!src) {
      const res = await api('getMyDanPhoto', { playerId: db.player.id, token: db.player.token, recordId: r.id, slot }, 60000);
      src = `data:${res.mime};base64,${res.data}`;
      danPhotoCache.set(key + (r.photoIds[slot] || ''), src);
    }
    m.querySelector('#ph').innerHTML = `<img src="${src}" alt="リザルト写真" style="width:100%;border-radius:8px">`;
  } catch (e) { m.querySelector('#ph').textContent = '写真を読み込めませんでした：' + e.message; }
}
/** 譜面別統計の「段位内プレイを含む」切り替え */
function incDanToggle(chartId) {
  danPrefs();
  const n = danVirtualFor(chartId).length;
  if (!n) return '';
  return `<label class="chkline"><input type="checkbox" id="incDan"${danSt.incDan ? ' checked' : ''}> 段位内プレイを含む（${n}件）</label>`;
}
function bindIncDan() { const el = $('#incDan'); if (el) el.onchange = () => setIncDan(el.checked); }
/** 段位内プレイの印（例：🏯 超人 1曲目） */
const danBadge = v => `<span class="badge b-dan">🏯 ${DAN_NAMES[v._dan.rank]} ${v._dan.track + 1}曲目</span>`;
