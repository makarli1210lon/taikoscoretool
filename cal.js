/* 太鼓スコア記録：カレンダー・グラフ（グラフは準備中）
 *  scope = { kind:'chart', id } 譜面ごと（通常の演奏）／{ kind:'dan', id } 段位ごと（挑戦）／{ kind:'all' } すべて（通常・段位を切り替え）
 *  マスの色はその日の回数、アイコンはその日に更新した王冠・合格（2つ以上あれば上位を出して「+件数」）
 */
'use strict';

const calSt = { ym: null, tab: 'cal', mode: 'normal', sel: null, key: null };
/** 色の段階（回数の下限と色）。通常＝緑、段位＝青 */
const CAL_LV = {
  normal: [[1, '#e3ffef'], [4, '#c2f0d5'], [7, '#a1e6bd'], [11, '#67d695'], [16, '#38c975'], [21, '#0ead50'], [31, '#039e44']],
  dan: [[1, '#ebf9ff'], [2, '#bee5f7'], [4, '#95d7f5'], [7, '#5bb8e3'], [11, '#299fd6'], [16, '#0088c7']],
};
const calColor = (mode, n) => { let c = null, k = -1; CAL_LV[mode].forEach(([min, col], i) => { if (n >= min) { c = col; k = i; } }); return { c, k }; };
const calDay = d => { d = new Date(d); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

/** 通常の演奏で、譜面ごとに王冠が上がった日（初めてその王冠を取った日） */
function calCrownEvents(recs) {
  const by = new Map(), out = [];
  [...recs].sort((a, b) => ts(a.playedAt) - ts(b.playedAt) || ts(a.createdAt) - ts(b.createdAt)).forEach(r => {
    const s = getSong(r.songId), c = crownOf(r, s);
    if (c === 'none') return;
    const prev = by.get(r.songId) || 'none';
    if (CROWN_RANK[c] > CROWN_RANK[prev]) { by.set(r.songId, c); out.push({ day: calDay(r.playedAt), pri: CROWN_RANK[c], kind: 'crown', crown: c, r, s }); }
  });
  return out;
}
/** 段位の合格が上がった日（赤合格・金合格と枠の組み合わせで、それまでより上の結果を初めて出した日） */
function calDanEvents(drecs) {
  const by = new Map(), out = [];
  [...drecs].sort((a, b) => ts(a.playedAt) - ts(b.playedAt)).forEach(r => {
    const e = evalDanRec(r); if (!e || e.result === 'fail') return;
    const p = danPrio(e.result, e.frame), prev = by.get(r.danId) || 0;
    if (p > prev) { by.set(r.danId, p); out.push({ day: calDay(r.playedAt), pri: 10 + p, kind: 'dan', res: e.result, frame: e.frame, r, d: danById(r.danId) }); }
  });
  return out;
}

/** 表示する範囲の記録とできごと */
function calData(scope) {
  const normal = activeRecs().filter(r => r.songId && (scope.kind !== 'chart' || r.songId === scope.id));
  const dans = (db.danRecords || []).filter(r => !r.deleted && (scope.kind !== 'dan' || r.danId === scope.id));
  const mode = scope.kind === 'chart' ? 'normal' : scope.kind === 'dan' ? 'dan' : calSt.mode;
  const plays = mode === 'dan' ? (scope.kind === 'chart' ? [] : dans) : (scope.kind === 'dan' ? [] : normal);
  // できごと：譜面は王冠、段位は合格。「すべて」は両方を出して段位を優先
  const events = (scope.kind === 'dan' ? [] : calCrownEvents(normal)).concat(scope.kind === 'chart' ? [] : calDanEvents(dans));
  const byDay = new Map();
  plays.forEach(r => { const k = calDay(r.playedAt); if (!byDay.has(k)) byDay.set(k, { n: 0, plays: [], ev: [] }); const x = byDay.get(k); x.n++; x.plays.push(r); });
  events.forEach(ev => { if (!byDay.has(ev.day)) byDay.set(ev.day, { n: 0, plays: [], ev: [] }); byDay.get(ev.day).ev.push(ev); });
  byDay.forEach(x => x.ev.sort((a, b) => b.pri - a.pri));
  const last = plays.reduce((m, r) => Math.max(m, ts(r.playedAt)), 0);
  return { mode, byDay, last };
}

const calEvIcon = (ev, px) => ev.kind === 'dan' ? `<span class="calemb">${danEmblemSvg(ev.res, ev.frame, px)}</span>` : crownHtml(ev.crown);
const calEvText = ev => ev.kind === 'dan' ? `${esc(ev.d ? ev.d.name : '段位')}　${danLabel(ev.res, ev.frame)}` : `${esc(songName(ev.s))}　${CROWN_LABEL[ev.crown].replace('（目安）', '')}`;

/** 「すべて」の日の内容：譜面ごとにまとめる（回数・その日の最高スコアと王冠） */
function calChartRows(ps) {
  const m = new Map();
  ps.forEach(r => { let x = m.get(r.songId); if (!x) { x = { n: 0, best: null }; m.set(r.songId, x); } x.n++; if (r.score != null && (!x.best || r.score > x.best.score)) x.best = r; });
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([id, x]) => { const s = getSong(id);
    return `<div class="item tap" data-cchart="${esc(id)}"><div class="row between" style="flex-wrap:nowrap"><strong style="min-width:0">${s ? cicon(s.course) + ' ' : ''}${esc(songName(s))}</strong>
      <span class="num" style="white-space:nowrap;font-weight:800">${x.best ? crownHtml(crownOf(x.best, s)) + ' ' + fmtN(x.best.score) : ''}</span></div><div class="muted">${x.n}回プレイ</div></div>`; }).join('');
}

/**
 * カレンダー・グラフのページ
 *  back：戻るボタンの動作
 */
function viewCal(scope, back) {
  const key = JSON.stringify(scope);
  if (calSt.key !== key) { calSt.key = key; calSt.sel = null; calSt.ym = null; }
  const D = calData(scope);
  if (!calSt.ym) { const t = D.last ? new Date(D.last) : new Date(); calSt.ym = `${t.getFullYear()}-${p2(t.getMonth() + 1)}`; }
  const [Y, M] = calSt.ym.split('-').map(Number);
  // 見出し：何のカレンダーか
  let head = '';
  if (scope.kind === 'chart') { const s = getSong(scope.id); head = s ? chartHead(s) : ''; }
  else if (scope.kind === 'dan') { const d = danById(scope.id); head = d ? `<div class="card calhd"><span class="wood ${danClass(d.rank)} sm"><span class="wt">${esc(d.name)}</span></span><span class="muted">${esc(d.version)}</span></div>` : ''; }
  else head = `<div class="card calhd"><b>すべての記録</b></div>`;
  const tabs = `<div class="tabs"><button data-ct="cal" class="${calSt.tab === 'cal' ? 'on' : ''}">📅 カレンダー</button><button data-ct="graph" class="${calSt.tab === 'graph' ? 'on' : ''}">📈 グラフ</button></div>`;
  let body;
  if (calSt.tab === 'graph') body = `<div class="card muted">グラフは準備中です。</div>`;
  else {
    // 月曜始まりの6週以内
    const first = new Date(Y, M - 1, 1), days = new Date(Y, M, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const today = calDay(new Date());
    let cells = '', mN = 0, mDays = 0, mEv = 0;
    for (let i = 0; i < lead; i++) cells += '<div class="calc out"></div>';
    for (let d = 1; d <= days; d++) {
      const k = `${Y}-${p2(M)}-${p2(d)}`, x = D.byDay.get(k), n = x ? x.n : 0, { c, k: lv } = calColor(D.mode, n);
      if (n) { mN += n; mDays++; }
      if (x && x.ev.length) mEv += x.ev.length;
      const ev = x && x.ev[0];
      cells += `<button class="calc${n ? '' : ' zero'}${lv >= 3 ? ' dark' : ''}${k === today ? ' today' : ''}${calSt.sel === k ? ' sel' : ''}" data-day="${k}"${c ? ` style="--cc:${c}"` : ''} aria-label="${M}月${d}日 ${n}回">
        <span class="cald">${d}</span>${n ? `<span class="caln">${n}</span>` : ''}${ev ? `<span class="calev">${calEvIcon(ev, 20)}${x.ev.length > 1 ? `<small>+${x.ev.length - 1}</small>` : ''}</span>` : ''}</button>`;
    }
    const unit = D.mode === 'dan' ? '挑戦' : 'プレイ';
    const legend = `<div class="callg"><span>少</span>${CAL_LV[D.mode].map(([min, col], i, a) => `<i style="background:${col}" title="${min}${a[i + 1] ? '〜' + (a[i + 1][0] - 1) : '〜'}回"></i>`).join('')}<span>多</span></div>`;
    const modeSw = scope.kind === 'all' ? `<div class="seg calmode"><button data-cm="normal" class="${calSt.mode === 'normal' ? 'on' : ''}">通常の演奏</button><button data-cm="dan" class="${calSt.mode === 'dan' ? 'on' : ''}">段位道場</button></div>` : '';
    // 選んだ日の内容
    let detail = '';
    if (calSt.sel) {
      const x = D.byDay.get(calSt.sel), [, sm, sd] = calSt.sel.split('-').map(Number);
      const evs = x ? x.ev.map(ev => `<div class="calevrow">${calEvIcon(ev, 26)}<span>${calEvText(ev)}</span></div>`).join('') : '';
      let list = '';
      if (x && x.plays.length) {
        const ps = [...x.plays].sort((a, b) => ts(b.playedAt) - ts(a.playedAt));
        list = D.mode === 'dan' ? ps.map(r => { const e = evalDanRec(r), d = danById(r.danId); return e ? `<div class="item tap" data-drec="${esc(r.id)}"><div class="row between" style="flex-wrap:nowrap"><b>${scope.kind === 'all' && d ? esc(d.name) + '　' : ''}<span class="num">${fmtDate(r.playedAt).slice(-5)}</span></b>${danEmblem(e.result, e.frame)}</div></div>` : ''; }).join('')
          : scope.kind === 'chart' ? ps.slice(0, calSt.more ? ps.length : 10).map(r => recItem(r, true)).join('')
            + (ps.length > 10 && !calSt.more ? `<button class="btn sub small" id="calMore">残り${ps.length - 10}件を表示</button>` : '')
          : calChartRows(ps);
      }
      detail = `<div class="card caldet"><h3>${sm}月${sd}日　${x ? x.n : 0}${unit === '挑戦' ? '回挑戦' : '回プレイ'}</h3>${evs}${list ? `<div class="list">${list}</div>` : (evs ? '' : '<div class="muted">この日の記録はありません。</div>')}</div>`;
    }
    body = `${modeSw}<div class="card cal">
      <div class="calnav"><button class="btn sub small" data-cmv="-1" aria-label="前の月">‹</button><b>${Y}年${M}月</b><button class="btn sub small" data-cmv="1" aria-label="次の月">›</button></div>
      <div class="calg">${['月', '火', '水', '木', '金', '土', '日'].map((w, i) => `<div class="calw${i === 5 ? ' sat' : i === 6 ? ' sun' : ''}">${w}</div>`).join('')}${cells}</div>
      <div class="calft"><span class="muted">${M}月：${mDays}日・${mN}回${unit === '挑戦' ? '挑戦' : 'プレイ'}${mEv ? `・更新 ${mEv}件` : ''}</span>${legend}</div></div>${detail}`;
  }
  $('#view').innerHTML = `<button class="btn sub small back" id="back">‹ 戻る</button>${head}${tabs}${body}`;
  $('#back').onclick = back;
  document.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { calSt.tab = b.dataset.ct; render(); });
  document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { calSt.mode = b.dataset.cm; calSt.sel = null; render(); });
  document.querySelectorAll('[data-cmv]').forEach(b => b.onclick = () => { const t = new Date(Y, M - 1 + Number(b.dataset.cmv), 1); calSt.ym = `${t.getFullYear()}-${p2(t.getMonth() + 1)}`; calSt.sel = null; render(); });
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { calSt.sel = calSt.sel === b.dataset.day ? null : b.dataset.day; calSt.more = false; render(); });
  if ($('#calMore')) $('#calMore').onclick = () => { calSt.more = true; render(); };
  document.querySelectorAll('[data-cchart]').forEach(el => el.onclick = () => recPush({ t: 'chart', id: el.dataset.cchart }));
  document.querySelectorAll('[data-drec]').forEach(el => el.onclick = () => openDanRec(el.dataset.drec));
  if (typeof bindPlayLinks === 'function') bindPlayLinks();
}
