/* 太鼓スコア記録：段位道場データ（管理者画面）
   admin.html の本体スクリプトより前に読み込む（関数の中から本体の D・st・render などを使う） */
'use strict';
const dst = { sub: 'dans', ver: '', form: null, recDan: '', recPlayer: '', recFlag: 'all' };
const adGetSong = id => id && D ? (D.songs.find(s => s.id === id) || null) : null;
const adDans = () => (D.dans || []).filter(d => !d.deleted);
const adVersions = () => [...new Set(adDans().map(d => d.version))].sort((a, b) => b.localeCompare(a, 'ja', { numeric: true }));
const adDanById = id => (D.dans || []).find(d => d.id === id) || null;
const adCharts = d => [0, 1, 2].map(i => adGetSong((d.chartIds || [])[i]));
const chartLabel = s => `${s.title}［${cname(s)}］`;
const newDanId = () => { let id; do { id = 'd_' + rand(10); } while ((D.dans || []).some(d => d.id === id)); return id; };

function viewDanData() {
  if (!D.dans) { $('#tabBody').innerHTML = `<div class="card muted">サーバーが段位道場に対応していません。Code.gs を v2.6 以降に更新してください。</div>`; return; }
  $('#tabBody').innerHTML = `<div class="row" style="margin-bottom:10px">
      <button class="btn small${dst.sub === 'dans' ? '' : ' sub'}" data-dsub="dans">お題（${adDans().length}）</button>
      <button class="btn small${dst.sub === 'recs' ? '' : ' sub'}" data-dsub="recs">挑戦記録（${(D.danRecords || []).filter(r => !r.deleted).length}）</button></div>
    <div id="danBody"></div>`;
  document.querySelectorAll('[data-dsub]').forEach(b => b.onclick = () => { dst.sub = b.dataset.dsub; dst.form = null; render(); });
  if (dst.sub === 'recs') return viewDanRecs();
  if (dst.form) return viewDanFormAdmin();
  viewDanDefs();
}

/* ----- お題の一覧 ----- */
function viewDanDefs() {
  const vers = adVersions();
  if (!dst.ver || !vers.includes(dst.ver)) dst.ver = vers[0] || '';
  const ver = dst.ver;
  const row = rank => {
    const d = adDans().find(x => x.version === ver && x.rank === rank);
    if (!d) return `<tr><td>${danPlate(rank)}</td><td class="muted" colspan="2">未登録</td><td><button class="btn sub small" data-dnew="${rank}">登録</button></td></tr>`;
    const ch = adCharts(d);
    return `<tr><td>${danPlate(rank)}</td>
      <td>${ch.map((s, i) => `<div style="font-size:13px">${i + 1}. ${s ? cicon(s.course) + ' ' + esc(s.title) + ` <span class="muted">★${s.level}・${dn(s.maxCombo)}</span>` : '<span class="ng-t">楽曲が見つかりません</span>'}</div>`).join('')}</td>
      <td style="font-size:12px">${d.soulRed != null ? `<div>魂ゲージ ${d.soulRed}%以上${d.soulGold != null && d.soulGold !== d.soulRed ? `（金 ${d.soulGold}%）` : ''}</div>` : ''}
        ${(d.conds || []).map(c => `<div>${esc(danCondText(c, 'red'))}</div><div class="gold-t">金：${esc(danCondText(c, 'gold'))}</div>`).join('')}
        ${d.videoUrl ? '<div class="muted">▶ 動画あり</div>' : ''}</td>
      <td><button class="btn sub small" data-dedit="${esc(d.id)}">編集</button></td></tr>`;
  };
  $('#danBody').innerHTML = `<div class="card">
    <div class="row between"><h2 style="margin:0">お題</h2>
      <div class="row">${vers.length ? `<select id="dVer" style="width:auto">${vers.map(v => `<option${v === ver ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}
        <button class="btn small" id="dNewVer">＋ バージョンを追加</button></div></div>
    <div class="muted" style="margin-top:6px">バージョンごとに、19段位それぞれのお題（課題曲3曲・合格条件）を登録します。プレイヤーの「段位」タブには新しいバージョンが最初に表示されます。</div>
  </div>
  ${ver ? `<div class="card"><h2>${esc(ver)}</h2><div class="tblwrap"><table class="rank"><tr><th>段位</th><th>課題曲</th><th>条件（上：合格／下：金合格）</th><th></th></tr>
    ${DAN_NAMES.map((_, r) => row(r)).join('')}</table></div></div>` : '<div class="card muted">まだお題がありません。「バージョンを追加」から登録してください。</div>'}`;
  if ($('#dVer')) $('#dVer').onchange = e => { dst.ver = e.target.value; render(); };
  $('#dNewVer').onclick = () => {
    const v = (prompt('バージョン名（例：ニジイロ2026）') || '').trim(); if (!v) return;
    dst.ver = v; dst.form = blankDanForm(v, 0); render();
  };
  document.querySelectorAll('[data-dnew]').forEach(b => b.onclick = () => { dst.form = blankDanForm(ver, +b.dataset.dnew); render(); });
  document.querySelectorAll('[data-dedit]').forEach(b => b.onclick = () => { const d = adDanById(b.dataset.dedit); dst.form = JSON.parse(JSON.stringify(d)); dst.form.isNew = false; render(); });
}
function blankDanForm(version, rank) {
  return { id: newDanId(), isNew: true, version, rank, chartIds: ['', '', ''], soulRed: 100, soulGold: 100, conds: [], videoUrl: '', note: '' };
}

/* ----- お題の編集 ----- */
function viewDanFormAdmin() {
  const f = dst.form;
  const condRow = (c, i) => {
    const per = c.scope === 'per';
    const vals = lv => per ? [0, 1, 2].map(j => `<input type="number" inputmode="numeric" min="0" data-cv="${i}" data-lv="${lv}" data-j="${j}" value="${(c[lv] || [])[j] ?? ''}" placeholder="${j + 1}曲目">`).join('')
      : `<input type="number" inputmode="numeric" min="0" data-cv="${i}" data-lv="${lv}" value="${c[lv] ?? ''}">`;
    return `<div class="cfg">
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <select data-ct="${i}" style="width:auto">${DAN_COND_ORDER.map(k => `<option value="${k}"${c.type === k ? ' selected' : ''}>${DAN_COND[k]}</option>`).join('')}</select>
        <select data-cs="${i}" style="width:auto"><option value="total"${!per ? ' selected' : ''}>3曲合計</option><option value="per"${per ? ' selected' : ''}>曲別</option></select>
        <select data-co="${i}" style="width:auto"><option value="ge"${c.op !== 'lt' ? ' selected' : ''}>以上</option><option value="lt"${c.op === 'lt' ? ' selected' : ''}>未満</option></select>
        <span style="margin-left:auto"></span>
        <button type="button" class="btn sub small" data-cup="${i}"${i === 0 ? ' disabled' : ''} aria-label="上へ">↑</button>
        <button type="button" class="btn sub small" data-cdown="${i}"${i === f.conds.length - 1 ? ' disabled' : ''} aria-label="下へ">↓</button>
        <button type="button" class="btn sub small danger" data-cdel="${i}">この条件を外す</button></div>
      <label>合格${per ? '（1曲目／2曲目／3曲目）' : ''}</label><div class="grid${per ? '3' : '1'}">${vals('red')}</div>
      <label class="gold-t">金合格${per ? '（1曲目／2曲目／3曲目）' : ''}（空欄なら合格と同じ）</label><div class="grid${per ? '3' : '1'}">${vals('gold')}</div></div>`;
  };
  $('#danBody').innerHTML = `<button class="btn sub small" id="dfBack">‹ お題の一覧</button>
  <div class="card" style="margin-top:10px"><h2>${f.isNew ? 'お題を登録' : 'お題を編集'}</h2>
    <div class="grid2">
      <div><label>バージョン</label><input id="dfVer" value="${esc(f.version)}" list="dverList"><datalist id="dverList">${adVersions().map(v => `<option value="${esc(v)}">`).join('')}</datalist></div>
      <div><label>段位</label><select id="dfRank">${DAN_NAMES.map((n, r) => `<option value="${r}"${f.rank === r ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <label>課題曲</label>
    ${[0, 1, 2].map(i => { const s = adGetSong(f.chartIds[i]); return `<div class="pickrow">
      <b class="no">${i + 1}曲目</b>
      <button type="button" class="pickbtn" data-pick="${i}">${s ? `${cicon(s.course)}<span class="nm">${esc(s.title)}</span><span class="muted">${esc(cname(s))}・★${s.level}・${dn(s.maxCombo)}</span>`
        : '<span class="muted">🔍 曲を検索して選ぶ</span>'}</button>
      ${s ? `<button type="button" class="btn sub small" data-unpick="${i}" aria-label="${i + 1}曲目を外す">×</button>` : ''}</div>
      <div class="muted" id="dfc${i}" style="margin:2px 0 0 4.2em;font-size:12px"></div>`; }).join('')}
    <div class="grid2">
      <div><label>魂ゲージ（合格・%以上。条件なしは空欄）</label><input id="dfSoulR" type="number" min="0" max="100" value="${f.soulRed ?? ''}"></div>
      <div><label class="gold-t">魂ゲージ（金合格・%以上）</label><input id="dfSoulG" type="number" min="0" max="100" value="${f.soulGold ?? ''}"></div></div>
    <h3>そのほかの条件（最大3つ）</h3>
    <div id="dfConds">${f.conds.map(condRow).join('')}</div>
    ${f.conds.length < 3 ? '<button type="button" class="btn sub small" id="dfAddCond">＋ 条件を追加</button>' : ''}
    <label>お手本動画のURL（任意・https://〜）</label><input id="dfVideo" value="${esc(f.videoUrl || '')}" placeholder="https://www.youtube.com/watch?v=…">
    <label>メモ（任意・プレイヤーの段位ページに表示）</label><input id="dfNote" maxlength="300" value="${esc(f.note || '')}">
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      ${f.isNew ? '' : '<button class="btn sub small danger" id="dfDel">お題を削除</button>'}<button class="btn small" id="dfSave">保存</button></div>
  </div>
  <div class="card"><h2>プレイヤー画面での見え方</h2><div id="dfPrev"></div></div>`;
  const style = document.createElement('style');
  style.textContent = '.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.grid1{display:grid;grid-template-columns:1fr}' +
    '.pickrow{display:flex;align-items:center;gap:8px;margin-top:6px}.pickrow .no{width:3.6em;flex-shrink:0}' +
    '.pickbtn{flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left;font:inherit;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px 10px;cursor:pointer}' +
    '.pickbtn .nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pickbtn .muted{font-size:12px;white-space:nowrap;margin-left:auto}';
  $('#danBody').appendChild(style);
  const sync = () => {
    f.version = $('#dfVer').value.trim(); f.rank = +$('#dfRank').value;
    [0, 1, 2].forEach(i => {
      const s = adGetSong(f.chartIds[i]);
      $('#dfc' + i).innerHTML = s && !s.shoko ? '<span class="ng-t">初項が未登録です（プレイヤーはスコアを手入力することになります）</span>' : '';
    });
    f.soulRed = nn($('#dfSoulR').value); f.soulGold = nn($('#dfSoulG').value);
    f.videoUrl = $('#dfVideo').value.trim(); f.note = $('#dfNote').value;
    document.querySelectorAll('[data-cv]').forEach(el => {
      const c = f.conds[+el.dataset.cv], lv = el.dataset.lv, v = nn(el.value);
      if (c.scope === 'per') { c[lv] = Array.isArray(c[lv]) ? c[lv] : [null, null, null]; c[lv][+el.dataset.j] = v; } else c[lv] = v;
    });
    const prev = { ...f, conds: f.conds.map(c => ({ ...c, gold: c.scope === 'per' ? (Array.isArray(c.gold) && c.gold.some(x => x != null) ? c.gold : c.red) : (c.gold ?? c.red) })) };
    $('#dfPrev').innerHTML = `<div class="dcard ${danClass(f.rank)}"><div class="dtop">${danPlate(f.rank)}<span class="ver">${esc(f.version)}</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">${danBodyHtml(prev, adCharts(prev), 'red')}${danBodyHtml(prev, adCharts(prev), 'gold')}</div></div>`;
  };
  document.querySelectorAll('#danBody input, #danBody select').forEach(el => { el.addEventListener('input', sync); el.addEventListener('change', sync); });
  document.querySelectorAll('[data-ct]').forEach(el => el.onchange = () => { f.conds[+el.dataset.ct].type = el.value; sync(); });
  document.querySelectorAll('[data-co]').forEach(el => el.onchange = () => { f.conds[+el.dataset.co].op = el.value; sync(); });
  document.querySelectorAll('[data-cs]').forEach(el => el.onchange = () => {
    sync(); const c = f.conds[+el.dataset.cs]; c.scope = el.value;
    const one = v => Array.isArray(v) ? v[0] : v, three = v => Array.isArray(v) ? v : [v, v, v];
    c.red = c.scope === 'per' ? three(c.red) : one(c.red); c.gold = c.scope === 'per' ? three(c.gold) : one(c.gold);
    viewDanFormAdmin();
  });
  document.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => { sync(); f.conds.splice(+b.dataset.cdel, 1); viewDanFormAdmin(); });
  const move = (i, j) => { sync(); const c = f.conds; [c[i], c[j]] = [c[j], c[i]]; viewDanFormAdmin(); };
  document.querySelectorAll('[data-cup]').forEach(b => b.onclick = () => move(+b.dataset.cup, +b.dataset.cup - 1));
  document.querySelectorAll('[data-cdown]').forEach(b => b.onclick = () => move(+b.dataset.cdown, +b.dataset.cdown + 1));
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { sync(); pickChart(f.chartIds[+b.dataset.pick], id => { f.chartIds[+b.dataset.pick] = id; viewDanFormAdmin(); }); });
  document.querySelectorAll('[data-unpick]').forEach(b => b.onclick = () => { sync(); f.chartIds[+b.dataset.unpick] = ''; viewDanFormAdmin(); });
  if ($('#dfAddCond')) $('#dfAddCond').onclick = () => { sync(); f.conds.push({ type: 'ok', scope: 'total', op: 'lt', red: null, gold: null }); viewDanFormAdmin(); };
  $('#dfBack').onclick = () => { dst.form = null; render(); };
  $('#dfSave').onclick = () => saveDanDef(false);
  if ($('#dfDel')) $('#dfDel').onclick = () => { if (confirm('このお題を削除しますか？（挑戦記録は残りますが、プレイヤー画面には表示されなくなります）')) saveDanDef(true); };
  sync();
}
/* ----- 課題曲を検索して選ぶ ----- */
const pickSt = { q: '', course: '', lv: '' };
function pickChart(curId, onPick) {
  const m = showModal(`<h2>課題曲を選ぶ</h2>
    <input id="pkq" type="search" placeholder="曲名・作曲者・ジャンル（ひらがな・カタカナ・全角半角は区別しません）" value="${esc(pickSt.q)}" autocomplete="off">
    <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap" id="pkc">
      ${[['', 'すべて'], ...Object.entries(COURSES)].map(([k, l]) => `<button type="button" class="btn small${pickSt.course === k ? '' : ' sub'}" data-pkc="${k}">${k ? cicon(k) + ' ' : ''}${esc(l)}</button>`).join('')}
      <select id="pklv" style="width:auto;margin-left:auto"><option value="">★すべて</option>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => `<option value="${n}"${String(pickSt.lv) === String(n) ? ' selected' : ''}>★${n}</option>`).join('')}</select>
    </div>
    <div id="pkres" class="pklist"></div>`, true);
  const st = document.createElement('style');
  st.textContent = '.pklist{margin-top:10px;max-height:min(60vh,520px);overflow:auto;border:1px solid var(--line);border-radius:10px}' +
    '.pkitem{display:flex;align-items:center;gap:8px;width:100%;font:inherit;text-align:left;background:var(--card);color:var(--text);border:0;border-top:1px solid var(--line);padding:9px 10px;cursor:pointer}' +
    '.pkitem:first-child{border-top:0}.pkitem:hover,.pkitem:focus{background:var(--soft)}.pkitem.cur{background:var(--soft);font-weight:700}' +
    '.pkitem .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pkitem .meta{font-size:12px;color:var(--muted);white-space:nowrap}' +
    '.pkitem mark{background:#ffe27a;color:inherit;border-radius:2px}';
  m.appendChild(st);
  const all = D.songs.filter(s => !s.deleted);
  const gm = groupSongs(D.songs);
  const show = () => {
    const qk = searchKey(pickSt.q);
    let list = all.filter(s => (!pickSt.course || s.course === pickSt.course) && (!pickSt.lv || s.level === +pickSt.lv));
    if (qk) {
      // 一致した位置が前ほど上に（曲名の先頭一致 → 曲名の途中 → 作曲者・ジャンル）
      list = list.map(s => { const tk = searchKey(s.title), i = tk.indexOf(qk), g = gm.get(s.title) || {};
        const o = i >= 0 ? i : searchKey((g.composer || '') + ' ' + (s.genre || '')).includes(qk) ? 1000 : -1; return { s, o }; })
        .filter(x => x.o >= 0).sort((a, b) => a.o - b.o || songSort(a.s, b.s)).map(x => x.s);
    } else list.sort(songSort);
    const LIMIT = 80, mark = s => { if (!qk) return esc(s.title); // 曲名の一致部分を強調（そろえた文字で位置を探すので、見つからなければそのまま）
      const i = s.title.toLowerCase().indexOf(pickSt.q.trim().toLowerCase()); const q = pickSt.q.trim();
      return i >= 0 && q ? esc(s.title.slice(0, i)) + '<mark>' + esc(s.title.slice(i, i + q.length)) + '</mark>' + esc(s.title.slice(i + q.length)) : esc(s.title); };
    m.querySelector('#pkres').innerHTML = list.length
      ? list.slice(0, LIMIT).map(s => `<button type="button" class="pkitem${s.id === curId ? ' cur' : ''}" data-pkid="${esc(s.id)}">${cicon(s.course)}<span class="nm">${mark(s)}</span>
          <span class="meta">${esc(cname(s))}・★${s.level}・${s.maxCombo ? dn(s.maxCombo) + 'コンボ' : 'コンボ未登録'}${s.shoko ? '' : '・初項なし'}</span></button>`).join('') +
        (list.length > LIMIT ? `<div class="muted" style="padding:8px 10px">ほか ${list.length - LIMIT}譜面。曲名やコースで絞り込んでください。</div>` : '')
      : '<div class="muted" style="padding:12px">見つかりませんでした。先に「楽曲」タブで譜面を登録してください。</div>';
    m.querySelectorAll('[data-pkid]').forEach(b => b.onclick = () => { m.remove(); onPick(b.dataset.pkid); });
  };
  const q = m.querySelector('#pkq');
  q.oninput = () => { pickSt.q = q.value; show(); };
  q.onkeydown = e => { if (e.key === 'Enter') { const first = m.querySelector('[data-pkid]'); if (first) first.click(); } };
  m.querySelectorAll('[data-pkc]').forEach(b => b.onclick = () => {
    pickSt.course = b.dataset.pkc;
    m.querySelectorAll('[data-pkc]').forEach(x => x.classList.toggle('sub', x.dataset.pkc !== pickSt.course)); show(); });
  m.querySelector('#pklv').onchange = e => { pickSt.lv = e.target.value; show(); };
  show(); q.focus(); q.select();
}
async function saveDanDef(del) {
  const f = dst.form;
  if (!del) {
    if (!f.version) { alert('バージョン名を入力してください。'); return; }
    if (f.chartIds.some(x => !x)) { alert('課題曲を3曲とも候補から選んでください。'); return; }
    const bad = f.conds.find(c => c.scope === 'per' ? !Array.isArray(c.red) || c.red.some(v => v == null) : c.red == null);
    if (bad) { alert(`「${DAN_COND[bad.type]}」の合格の値を入力してください。`); return; }
  }
  // 金合格の値が空欄なら合格と同じ値にする
  const conds = f.conds.map(c => ({ type: c.type, scope: c.scope, op: c.op, red: c.red,
    gold: c.scope === 'per' ? (Array.isArray(c.gold) ? c.gold.map((v, j) => v ?? c.red[j]) : c.red) : (c.gold ?? c.red) }));
  try {
    const res = await api('adminSaveDan', { adminKey, dan: { id: f.id, version: f.version, rank: f.rank, chartIds: f.chartIds,
      soulRed: f.soulRed, soulGold: f.soulGold ?? f.soulRed, conds, videoUrl: f.videoUrl, note: f.note, deleted: !!del } });
    const i = D.dans.findIndex(d => d.id === res.dan.id);
    if (i >= 0) D.dans[i] = res.dan; else D.dans.push(res.dan);
    dst.ver = f.version; dst.form = null;
    toast(del ? 'お題を削除しました' : 'お題を保存しました'); render();
  } catch (e) { alert(e.message); }
}

/* ----- 挑戦記録 ----- */
const DAN_REC_FLAGS = { all: 'すべて', pass: '合格のみ', photo: '写真あり', nophoto: '写真なし', rejected: '却下', deleted: '削除済み' };
function viewDanRecs() {
  const all = D.danRecords || [];
  const ev = r => { const d = adDanById(r.danId); return d ? danEval(d, r, adCharts(d)) : { result: r.result, frame: r.frame, played: 0, conds: [] }; };
  const nph = r => (r.photoIds || []).filter(Boolean).length;
  const pass = r => {
    if (dst.recDan && r.danId !== dst.recDan) return false;
    if (dst.recPlayer && r.playerId !== dst.recPlayer) return false;
    switch (dst.recFlag) {
      case 'pass': return !r.deleted && ev(r).result !== 'fail';
      case 'photo': return !r.deleted && nph(r) > 0;
      case 'nophoto': return !r.deleted && !nph(r);
      case 'rejected': return !r.deleted && r.status === 'rejected';
      case 'deleted': return r.deleted;
      default: return !r.deleted;
    }
  };
  const list = all.filter(pass).sort((a, b) => ts(b.receivedAt) - ts(a.receivedAt));
  const danOpts = adVersions().map(v => `<optgroup label="${esc(v)}">${adDans().filter(d => d.version === v).sort((a, b) => a.rank - b.rank)
    .map(d => `<option value="${esc(d.id)}"${dst.recDan === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`).join('');
  $('#danBody').innerHTML = `<div class="card"><h2>挑戦記録</h2>
    <div class="filters">
      <select id="drFlag">${Object.entries(DAN_REC_FLAGS).map(([k, v]) => `<option value="${k}"${dst.recFlag === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <select id="drDan"><option value="">すべての段位</option>${danOpts}</select>
      <select id="drPlayer"><option value="">すべてのプレイヤー</option>${D.players.map(p => `<option value="${esc(p.id)}"${dst.recPlayer === p.id ? ' selected' : ''}>${esc(p.name)} @${esc(p.id)}</option>`).join('')}</select>
    </div>
    <div class="muted" style="margin-top:8px">合否は、いま登録されているお題で計算し直して表示しています。削除済みの記録は、削除から${RESTORE_DAYS}日まではプレイヤーが自分で復元できます。</div></div>
  <div class="card"><h2>${esc(DAN_REC_FLAGS[dst.recFlag])}（${list.length}件）</h2>
    ${list.length ? `<div class="tblwrap"><table class="rank"><tr><th>受信</th><th>プレイヤー</th><th>段位</th><th>結果</th><th class="n">魂</th><th class="n">写真</th><th>挑戦日時</th><th>状態</th><th></th></tr>
    ${list.slice(0, 300).map(r => { const d = adDanById(r.danId), e = ev(r);
      const stHtml = r.deleted ? `<span class="badge b-mute">削除 ${fmtDay(r.deletedAt || r.updatedAt)}</span>` : r.status === 'rejected' ? `<span class="badge b-ng">却下</span><span class="raw">${esc(r.rejectReason)}</span>` : '';
      const act = `<button class="btn sub small" data-drdet="${esc(r.id)}">詳細</button>` + (r.deleted
        ? `<button class="btn sub small" data-drdel="restore" data-rid="${esc(r.id)}">復元</button><button class="btn sub small danger" data-drdel="purge" data-rid="${esc(r.id)}">完全削除</button>`
        : (r.status === 'rejected' ? `<button class="btn sub small" data-drst="ok" data-rid="${esc(r.id)}">却下を取消</button>` : `<button class="btn sub small danger" data-drst="rejected" data-rid="${esc(r.id)}">却下</button>`) +
          `<button class="btn sub small danger" data-drdel="delete" data-rid="${esc(r.id)}">削除</button>`);
      return `<tr class="${r.deleted ? 'rej' : ''}"><td class="muted">${fmtDay(r.receivedAt)}</td><td>${esc(pname(r.playerId))}</td>
        <td>${d ? danPlate(d.rank) + `<span class="raw">${esc(d.version)}</span>` : '<span class="muted">（お題なし）</span>'}</td>
        <td>${danEmblem(e.played ? e.result : 'fail', e.frame)}${e.played < 3 ? `<span class="raw">${e.played}曲目で終了</span>` : ''}</td>
        <td class="n">${r.soul == null ? '—' : r.soul + '%'}</td><td class="n">${nph(r) || '—'}</td><td class="muted">${fmtDate(r.playedAt)}</td>
        <td>${stHtml}</td><td><div class="row" style="flex-wrap:nowrap">${act}</div></td></tr>`; }).join('')}
    </table></div>` : '<div class="muted">該当する記録はありません。</div>'}</div>`;
  $('#drFlag').onchange = e => { dst.recFlag = e.target.value; render(); };
  $('#drDan').onchange = e => { dst.recDan = e.target.value; render(); };
  $('#drPlayer').onchange = e => { dst.recPlayer = e.target.value; render(); };
  document.querySelectorAll('[data-drdet]').forEach(b => b.onclick = () => showDanRecAdmin(b.dataset.drdet));
  document.querySelectorAll('[data-drst]').forEach(b => b.onclick = () => setDanStatus(b.dataset.rid, b.dataset.drst));
  document.querySelectorAll('[data-drdel]').forEach(b => b.onclick = () => delDanRec(b.dataset.rid, b.dataset.drdel));
}
function replaceDanRec(rec) { const i = D.danRecords.findIndex(x => x.id === rec.id); if (i >= 0) D.danRecords[i] = rec; }
async function setDanStatus(rid, status) {
  let reason = null;
  if (status === 'rejected') { reason = await askReject(); if (!reason) return; }
  try { const res = await api('adminSetDanStatus', { adminKey, recordId: rid, status, reason }); replaceDanRec(res.record);
    toast(status === 'rejected' ? '却下しました' : '却下を取り消しました'); render(); }
  catch (e) { toast(e.message, 3000); }
}
async function delDanRec(rid, mode) {
  const msg = { delete: 'この挑戦記録を削除しますか？（削除から' + RESTORE_DAYS + '日まではプレイヤーが復元できます）',
    purge: 'この挑戦記録を完全に削除します。写真も削除され、元に戻せません。よろしいですか？', restore: null }[mode];
  if (msg && !confirm(msg)) return;
  try {
    const res = await api('adminDeleteDanRecord', { adminKey, recordId: rid, mode });
    if (mode === 'purge') D.danRecords = D.danRecords.filter(x => x.id !== rid); else replaceDanRec(res.record);
    toast({ delete: '削除しました', purge: '完全に削除しました', restore: '復元しました' }[mode]); render();
  } catch (e) { toast(e.message, 3000); }
}
function showDanRecAdmin(rid) {
  const r = D.danRecords.find(x => x.id === rid), d = r && adDanById(r.danId);
  if (!r) return;
  const charts = d ? adCharts(d) : [null, null, null], e = d ? danEval(d, r, charts) : null;
  const m = showModal(`<h2>${esc(pname(r.playerId))}：${d ? esc(d.version + ' ' + d.name) : '（お題なし）'}</h2>
    <div class="row" style="gap:10px">${d ? danPlate(d.rank) : ''}${e ? danEmblem(e.played ? e.result : 'fail', e.frame) : ''}
      <span class="muted">${fmtDate(r.playedAt)}・魂 ${r.soul == null ? '—' : r.soul + '%'}${r.combo != null ? `・最大コンボ ${r.combo}` : ''}</span></div>
    ${r.result !== (e && e.result) ? `<div class="muted">記録時の判定：${esc(danLabel(r.result, r.frame))}</div>` : ''}
    <div class="tblwrap" style="margin-top:8px"><table class="rank"><tr><th>曲</th><th class="n">スコア</th><th class="n">良/可/不可/連打</th></tr>
      ${[0, 1, 2].map(i => { const t = r.tracks[i], s = charts[i]; return `<tr><td>${s ? cicon(s.course) + ' ' + esc(s.title) : '—'}</td>
        <td class="n">${t ? dn(t.score) + (t.scoreSource === 'manual' ? ' <span class="badge b-ka">手入力</span>' : '') : '—'}</td><td class="n">${t ? `${t.good}/${t.ok}/${t.bad}/${t.roll}` : '（打ち切り）'}</td></tr>`; }).join('')}</table></div>
    ${e ? `<div style="margin-top:8px">${e.conds.map(x => `<div class="kv2"><span>${esc(danCondText(x.c, 'red'))}</span><b class="${x.pass.gold ? 'gold-t' : x.pass.red ? 'ok-t' : 'ng-t'}">${x.per ? x.vals.map(dn).join(' / ') : dn(x.total)}</b></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:10px">${(r.photoIds || []).map((p, i) => p ? `<button class="btn sub small" data-adph="${esc(p)}">📷 写真${i + 1}</button>` : '').join('') || '<span class="muted">写真なし</span>'}</div>
    <div id="adph" style="margin-top:8px"></div>`, true);
  m.querySelectorAll('[data-adph]').forEach(b => b.onclick = async () => {
    const box = m.querySelector('#adph'); box.textContent = '写真を読み込んでいます…';
    try {
      let src = photoCache.get(b.dataset.adph);
      if (!src) { const res = await api('adminGetPhoto', { adminKey, photoId: b.dataset.adph }, 60000); src = `data:${res.mime};base64,${res.data}`; photoCache.set(b.dataset.adph, src); }
      box.innerHTML = `<img src="${src}" alt="" style="width:100%;border-radius:8px">`;
    } catch (err) { box.textContent = '写真を読み込めませんでした：' + err.message; }
  });
}
