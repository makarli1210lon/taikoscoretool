'use strict';
/* プレイヤー画面・管理者画面で共通の定数と関数 */

const APP = 'taiko-score', SCHEMA = 2;
const API_URL = (window.TAIKO_API_URL || '').trim();
const COURSES = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい', oni: 'おに', ura: 'おに(裏)' };
const COURSE_SHORT = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい', oni: 'おに', ura: 'おに裏' };
const COURSE_DOT = { easy: '簡', normal: '普', hard: '難', oni: '鬼', ura: '裏' };
const COURSE_COLOR = { easy: '#DE2300', normal: '#6D9904', hard: '#1E739B', oni: '#d6338a', ura: '#7d3fc8' };
const COURSE_ORDER = ['easy', 'normal', 'hard', 'oni', 'ura'];
const TIERS = ['SS', 'S+', 'S', 'A+', 'A', 'B', 'C', 'D', 'E', 'F'];
const TAGGED = new Set(['S+', 'S', 'A+', 'A', 'B', 'C', 'D', 'E']);
const GENRES = ['ポップス', 'キッズ', 'アニメ', 'ボーカロイド™曲', 'ゲームミュージック', 'バラエティ', 'クラシック', 'ナムコオリジナル'];
const GENRE_COLORS = {
  'ポップス': '#49d5eb', 'キッズ': '#fcd000', 'アニメ': '#fe90d2', 'ボーカロイド曲': '#cbcfde',
  'ゲームミュージック': '#cc8aeb', 'バラエティ': '#0acc2a', 'クラシック': '#ded523', 'ナムコオリジナル': '#ff7028'
};
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32文字（紛らわしいI,O,0,1を除外）
const EDIT_DENIED = '登録したプレイヤーか管理者のみ変更可能です';

/* ----- 文字・日付 ----- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
function isoLocal(d) {
  d = d || new Date();
  const off = -d.getTimezoneOffset(), sg = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${sg}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}
const stamp = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`;
const ymd = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const toLocalInput = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
function fmtDate(iso) { const d = iso instanceof Date ? iso : new Date(iso); return isNaN(d) ? '-' : `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; }
function fmtDay(iso) { const d = new Date(iso); return isNaN(d) ? '-' : `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; }
const fmtYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.replace(/-/g, '/') : '';
function ts(iso) { const t = Date.parse(iso || ''); return isNaN(t) ? 0 : t; }
const fmtN = n => n == null ? '-' : Number(n).toLocaleString('ja-JP');
function rand(n) {
  const out = [];
  try { const a = new Uint8Array(n); crypto.getRandomValues(a); for (const x of a) out.push(ALPH[x & 31]); }
  catch (e) { for (let i = 0; i < n; i++) out.push(ALPH[Math.floor(Math.random() * 32)]); }
  return out.join('');
}
const nn = v => { if (v === '' || v == null) return null; const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
const n0 = v => nn(v) ?? 0;
const isHttps = u => /^https:\/\/[^\s"'<>]{3,490}$/i.test(String(u || '').trim());
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/* ----- スコア計算（AC16ニジイロ以降） -----
   スコア = 初項×良 + floor(初項÷2÷10)×10×可 + 100×連打 */
function calcScore(shoko, good, ok, roll) { return shoko * good + Math.floor(shoko / 20) * 10 * ok + 100 * roll; }

/* ----- コース・難易度の表記 ----- */
const courseIdx = c => COURSE_ORDER.indexOf(c);
const songSort = (a, b) => a.title.localeCompare(b.title, 'ja') || courseIdx(a.course) - courseIdx(b.course);
/** おに・おに(裏)の両方がある曲の集合（表記の切り替えに使う。楽曲データが変わるたびに更新） */
let ONI_BOTH = new Set();
function refreshOniBoth(songs) {
  const oni = new Set(), ura = new Set();
  (songs || []).forEach(s => { if (s.deleted) return; if (s.course === 'oni') oni.add(s.title); else if (s.course === 'ura') ura.add(s.title); });
  ONI_BOTH = new Set([...oni].filter(t => ura.has(t)));
}
/** コース名：おに・裏が両方ある曲だけ「おに(表)」 */
const cname = s => s.course === 'oni' && ONI_BOTH.has(s.title) ? 'おに(表)' : COURSES[s.course];
/** 短いコース名（ボタン・画像用） */
const cshort = s => s.course === 'oni' && ONI_BOTH.has(s.title) ? 'おに表' : COURSE_SHORT[s.course];
/** ★10細分：正式表記「地力S+」「個人差C」「SS」 */
function subLabel(s) { if (!s.subLevel) return ''; const { tier, tag } = s.subLevel; return tag === 'jiriki' ? '地力' + tier : tag === 'kojinsa' ? '個人差' + tier : tier; }
/** ★10細分：短縮表記「地S+」「個C」「SS」 */
function subShort(s) { if (!s.subLevel) return ''; const { tier, tag } = s.subLevel; return (tag === 'jiriki' ? '地' : tag === 'kojinsa' ? '個' : '') + tier; }
const lvLabel = s => `★${s.level}` + (s.subLevel ? ' ' + subLabel(s) : '');
const lvShort = s => `★${s.level}` + (s.subLevel ? ' ' + subShort(s) : '');
const songName = s => s ? `${s.title}［${cname(s)}］` : '楽曲未選択';
const genreColor = g => GENRE_COLORS[String(g || '').replace(/[™\s]/g, '')] || null;
const gcStyle = g => { const c = genreColor(g); return c ? ` style="--gc:${c}"` : ''; };
const genreTag = g => genreColor(g) ? `<span class="gtag"${gcStyle(g)}>${esc(g)}</span>` : `<span class="gtag none">${esc(g || 'ジャンル未設定')}</span>`;
const genreList = () => `<datalist id="genres">${GENRES.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;
const songMeta = g => (g.composer ? `<span class="meta">${esc(g.composer)}</span>` : '') + (g.addedDate ? `<span class="meta">${fmtYmd(g.addedDate)} 追加</span>` : '');

/** 曲名でまとめた一覧（曲名順、各曲の譜面はコース順）。曲単位の情報（ジャンル・作曲者・追加日）は最初に見つかった値 */
function groupSongs(songs) {
  const m = new Map();
  for (const s of songs.filter(s => !s.deleted).sort(songSort)) {
    if (!m.has(s.title)) m.set(s.title, { title: s.title, genre: '', composer: '', addedDate: '', charts: [] });
    const g = m.get(s.title); g.charts.push(s);
    if (!g.genre && s.genre) g.genre = s.genre;
    if (!g.composer && s.composer) g.composer = s.composer;
    if (!g.addedDate && s.addedDate) g.addedDate = s.addedDate;
  }
  return m;
}
/* ----- 並べ替え・絞り込み ----- */
const SORTS = { title: '曲名順', added: '追加日が新しい順', addedOld: '追加日が古い順', composer: '作曲者順', genre: 'ジャンル順' };
function filterSortGroups(gm, q, genre, sort) {
  const t = String(q || '').trim().toLowerCase();
  const gkey = g => String(g || '').replace(/[™\s]/g, '');
  let gs = [...gm.values()].filter(g => !t || (g.title + ' ' + g.genre + ' ' + g.composer).toLowerCase().includes(t));
  if (genre === '__other') gs = gs.filter(g => !genreColor(g.genre));
  else if (genre) gs = gs.filter(g => gkey(g.genre) === gkey(genre));
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'ja');
  // 空欄は常に末尾
  const blankLast = (va, vb, cmp) => !va && !vb ? 0 : !va ? 1 : !vb ? -1 : cmp(va, vb);
  const gIdx = g => { const i = GENRES.findIndex(x => gkey(x) === gkey(g)); return i < 0 ? 99 : i; };
  if (sort === 'added') gs.sort((a, b) => blankLast(a.addedDate, b.addedDate, (x, y) => y.localeCompare(x)) || byTitle(a, b));
  else if (sort === 'addedOld') gs.sort((a, b) => blankLast(a.addedDate, b.addedDate, (x, y) => x.localeCompare(y)) || byTitle(a, b));
  else if (sort === 'composer') gs.sort((a, b) => blankLast(a.composer, b.composer, (x, y) => x.localeCompare(y, 'ja')) || byTitle(a, b));
  else if (sort === 'genre') gs.sort((a, b) => gIdx(a.genre) - gIdx(b.genre) || byTitle(a, b));
  else gs.sort(byTitle);
  return gs;
}
/** 検索欄＋ジャンル絞り込み＋並べ替え。o は { songQ, songGenre, songSort } を持つ状態オブジェクト */
function sortBar(o) {
  return `<input id="sq" type="search" placeholder="曲名・ジャンル・作曲者で検索" value="${esc(o.songQ)}" autocomplete="off">
  <div class="grid2" style="margin-top:8px">
    <select id="sGenreF"><option value="">すべてのジャンル</option>${GENRES.map(g => `<option value="${esc(g)}"${o.songGenre === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}<option value="__other"${o.songGenre === '__other' ? ' selected' : ''}>その他・未設定</option></select>
    <select id="sSort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${o.songSort === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
  </div>`;
}
function bindSortBar(o, cb) {
  $('#sq').oninput = e => { o.songQ = e.target.value; cb(); };
  $('#sGenreF').onchange = e => { o.songGenre = e.target.value; cb(); };
  $('#sSort').onchange = e => { o.songSort = e.target.value; cb(); };
}

/**
 * 難易度ボタン列
 *  pick：入力用。裏が無い曲は4個、未登録は押せない（sel は選択中ID か Set）
 *  list：一覧用の簡略表示。常に5枠、★のみ（★10は2行目に細分）、未登録は「＋」
 */
function courseButtons(g, sel, mode, opts) {
  opts = opts || {};
  const has = new Map(g.charts.map(c => [c.course, c]));
  const courses = (mode === 'list' || has.has('ura')) ? COURSE_ORDER : COURSE_ORDER.slice(0, 4);
  const isOn = id => sel instanceof Set ? sel.has(id) : id === sel;
  const evMark = s => opts.eventIds && opts.eventIds.has(s.id) ? '<i class="ev" title="開催中の大会の対象">🏆</i>' : '';
  return `<div class="courses${mode === 'list' ? ' compact' : ''}" style="--n:${courses.length}">` + courses.map(c => {
    const s = has.get(c);
    if (mode === 'list') {
      if (!s) return `<button type="button" class="cbtn add cc-${c}" data-add="${c}" title="${COURSES[c]}を追加"><b>＋</b></button>`;
      return `<button type="button" class="cbtn cc-${c}" data-id="${esc(s.id)}" title="${esc(cname(s))}">${evMark(s)}<b>★${s.level}</b>${s.level === 10 && s.subLevel ? `<small>${esc(subLabel(s))}</small>` : ''}</button>`;
    }
    if (!s) return `<button type="button" class="cbtn cc-${c}" disabled><span>${COURSE_SHORT[c]}</span><small>未登録</small><small>&nbsp;</small></button>`;
    return `<button type="button" class="cbtn cc-${c}${isOn(s.id) ? ' on' : ''}" data-id="${esc(s.id)}">${evMark(s)}
      <span>${esc(cshort(s))}</span><small>${esc(lvShort(s))}</small><small>${s.maxCombo ?? '---'}コンボ</small></button>`;
  }).join('') + `</div>`;
}
const dots = g => `<span class="dots">${g.charts.map(c => `<i class="cc-${c.course}">${COURSE_DOT[c.course]}</i>`).join('')}</span>`;
/**
 * 詳細ページの「攻略」「▶」「編集」ボタン
 *  攻略あり＋動画あり：両方表示／攻略あり＋動画なし：▶を薄く／攻略なし：攻略・▶とも非表示（場所は確保して位置をそろえる）
 *  編集：常に表示し、権限がなければ薄く
 */
function linkButtons(c, canEdit) {
  const wiki = isHttps(c.wikiUrl), vid = isHttps(c.videoUrl);
  return `<div class="lbtns">
    ${wiki ? `<a class="btn sub small" href="${esc(c.wikiUrl)}" target="_blank" rel="noopener">攻略</a>` : `<span class="btn sub small invis" aria-hidden="true">攻略</span>`}
    ${wiki && vid ? `<a class="btn sub small vbtn" href="${esc(c.videoUrl)}" target="_blank" rel="noopener" aria-label="プレイ動画">▶</a>`
      : `<span class="btn sub small vbtn ${wiki ? 'faded' : 'invis'}" aria-hidden="true">▶</span>`}
    <button type="button" class="btn sub small${canEdit ? '' : ' faded'}" data-edit="${esc(c.id)}">編集</button></div>`;
}

/* ----- 大会 ----- */
const eventActive = (e, now) => { now = now || Date.now(); return !e.deleted && ts(e.start) <= now && now <= ts(e.end); };
const eventState = e => { const now = Date.now(); return e.deleted ? '削除済み' : now < ts(e.start) ? '開催前' : now > ts(e.end) ? '終了' : '開催中'; };
/** 終了日までの日数（暦日の差。終了日当日は0） */
function daysLeft(e) {
  const n = new Date(), d = new Date(e.end);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
}
function eventBadges(e) {
  const s = eventState(e);
  let h = `<span class="badge ${s === '開催中' ? 'b-ok' : 'b-mute'}">${s}</span>`;
  if (s === '開催中') { const d = daysLeft(e); if (d <= 14) h += `<span class="badge b-warn">あと${d}日</span>`; }
  return h;
}
const isMulti = e => e.multiCourse !== false;
/** その曲で一番難しいコース（基準コースの初期値） */
const hardestCourse = g => [...COURSE_ORDER].reverse().find(c => g.charts.some(x => x.course === c)) || 'oni';
/** ハンデの初期値：基準コースとのコース数差×(-30,000)、連打1打＝100−10×差。ハンデなしは0点・100点 */
function defaultHc(base, c) { const d = courseIdx(base) - courseIdx(c); return d < 0 ? null : -30000 * d; }
function defaultRoll(base, c) { const d = courseIdx(base) - courseIdx(c); return d < 0 ? null : 100 - 10 * d; }
/** 曲単位大会の各曲を、今の楽曲データに当てはめる（基準コースまでの譜面が対象） */
function resolveEventSongs(e, songs) {
  const gm = groupSongs(songs), byId = new Map(songs.map(s => [s.id, s]));
  return (e.songCfg || []).map(cfg => {
    const anchor = (cfg.ids || []).map(id => byId.get(id)).find(Boolean);
    const g = anchor ? gm.get(anchor.title) : null;
    if (!g) return null;
    const bi = courseIdx(cfg.base);
    const charts = g.charts.filter(c => courseIdx(c.course) <= bi);
    const above = g.charts.filter(c => courseIdx(c.course) > bi);
    return { cfg, group: g, charts, ids: new Set(charts.map(c => c.id)), above };
  }).filter(Boolean);
}
function hcFor(cfg, c) { if (!cfg.hcOn) return 0; const v = cfg.hc && cfg.hc[c]; return v == null ? (defaultHc(cfg.base, c) || 0) : v; }
function rollFor(cfg, c) { if (!cfg.hcOn) return 100; const v = cfg.roll && cfg.roll[c]; return v == null ? (defaultRoll(cfg.base, c) ?? 100) : v; }
/** 補正後スコア＝素点−100×連打＋連打単価×連打＋コースハンデ（0点未満は0点） */
function adjScore(r, course, cfg) {
  if (r.score == null) return null;
  if (!cfg) return r.score;
  return Math.max(0, r.score - 100 * r.roll + rollFor(cfg, course) * r.roll + hcFor(cfg, course));
}
/** 大会の対象譜面ID */
function eventChartIds(e, songs) {
  if (isMulti(e)) return new Set(e.chartIds || []);
  const s = new Set(); resolveEventSongs(e, songs).forEach(x => x.ids.forEach(i => s.add(i))); return s;
}

/* ----- 通信 ----- */
/** GASウェブアプリへ送る。Content-Typeを付けない（text/plain扱い）ことで事前確認通信を避ける */
async function api(action, payload, timeoutMs) {
  if (!API_URL) { const e = new Error('サーバーURLが未設定です（config.js）'); e.code = 'noapi'; throw e; }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 30000) : null;
  let res;
  try { res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action }, payload || {})), signal: ctl && ctl.signal }); }
  catch (e) { const er = new Error('サーバーに接続できませんでした'); er.code = 'network'; throw er; }
  finally { if (timer) clearTimeout(timer); }
  if (!res.ok) { const e = new Error('サーバーエラー（HTTP ' + res.status + '）'); e.code = 'http'; throw e; }
  let j;
  try { j = await res.json(); } catch (e) { const er = new Error('サーバーの応答を読めませんでした'); er.code = 'parse'; throw er; }
  if (!j.ok) { const e = new Error(j.error || 'エラー'); e.code = j.code || 'error'; throw e; }
  return j;
}

/* ----- 共通UI ----- */
function toast(m, ms) { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 1800); }
async function copyText(text) {
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) {}
  if (!ok) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  if (ok) toast('コピーしました'); else showText('長押しで全選択してコピーしてください', text);
  return ok;
}
function showModal(html, wide) {
  const m = document.createElement('div'); m.className = 'modal' + (wide ? ' wide' : '');
  m.innerHTML = `<div class="card">${html}<button class="btn sub" data-close>閉じる</button></div>`;
  m.querySelector('[data-close]').onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  return m;
}
function showText(title, text) {
  const m = showModal(`<h2>${esc(title)}</h2><textarea readonly style="min-height:220px">${esc(text)}</textarea>`);
  const ta = m.querySelector('textarea'); ta.focus(); ta.select();
}
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
