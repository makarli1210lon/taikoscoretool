'use strict';
/* プレイヤー画面・管理者画面で共通の定数と関数 */

const APP = 'taiko-score', SCHEMA = 2;
const API_URL = (window.TAIKO_API_URL || '').trim();
/** 必要なサーバー（GAS）のバージョン。Code.gs の SERVER_VERSION と合わせる */
const REQUIRED_SERVER = '2.7';
/** Code.gs と同じ値：大会終了から結果確定までの時間／プレイヤーが削除記録を復元できる日数／日時ずれの警告基準 */
const CLOSE_HOURS = 18, RESTORE_DAYS = 14, GAP_HOURS = 72;
const HOUR_MS = 3600000, DAY_MS = 86400000;
const REJECT_REASONS = ['写真とスコアが一致しない', '写真が不鮮明', '別の譜面のリザルト', 'プレイ日時が期間外'];
const serverOutdated = v => !v || v.localeCompare(REQUIRED_SERVER, undefined, { numeric: true }) < 0;
const OUTDATED_MSG = `サーバー（Google Apps Script）が旧バージョンのまま動いています。Apps Scriptで Code.gs を貼り替えて保存したあと、「デプロイ → デプロイを管理 → ✏編集 → バージョン：新バージョン → デプロイ」を行ってください。このままでは、リンク・作曲者・追加日・曲単位大会の設定が保存されません。`;
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
/**
 * 曲名の表示ブロック
 *   曲名（大）
 *   作曲者（小）
 *   ジャンル（小）　追加日（小）
 */
function songHead(g, extra) {
  return `<div class="shead"><div class="st">${esc(g.title)}</div>
    ${g.composer ? `<div class="ss">${esc(g.composer)}</div>` : ''}
    <div class="ss">${genreTag(g.genre)}${g.addedDate ? `<span class="meta">${fmtYmd(g.addedDate)} 追加</span>` : ''}${extra || ''}</div></div>`;
}
/** コースの記号（今後、難易度モチーフの画像に差し替える場所。.cicon.cc-○○ に背景画像を指定すれば置き換わる） */
const cicon = c => `<i class="cicon cc-${c}" aria-hidden="true">${COURSE_DOT[c]}</i>`;

/* ----- 王冠（クリア判定） -----
   不可が10%未満：クリア（目安・薄い銀）／不可0：フルコンボ（金）／可も0：全良（虹）
   分母は最大コンボ数（未登録なら良＋可＋不可） */
const CROWN_RANK = { none: 0, clear: 1, fc: 2, ap: 3 };
const CROWN_LABEL = { none: '未クリア', clear: 'クリア（目安）', fc: 'フルコンボ', ap: '全良' };
function crownOf(r, chart) {
  const total = (chart && chart.maxCombo) || (r.good + r.ok + r.bad);
  if (!total || r.good + r.ok + r.bad === 0) return 'none';
  if (r.bad === 0 && r.ok === 0) return 'ap';
  if (r.bad === 0) return 'fc';
  return r.bad / total < 0.1 ? 'clear' : 'none';
}
/** 王冠の表示。中の文字（◇／◆）は画像を読み込めなかったときだけ表示される */
const CROWN_TEXT = { none: '◇', clear: '◆', fc: '◆', ap: '◆' };
const crownHtml = c => `<i class="crown cr-${c}" title="${CROWN_LABEL[c]}" aria-label="${CROWN_LABEL[c]}"><span class="crt">${CROWN_TEXT[c]}</span></i>`;

/* ----- 画像を読み込めないときの代わりの表示 -----
   難易度：コース色の四角＋「鬼」などの文字／王冠：◇・◆（銀・金・虹）の文字
   画像ごとに読み込みを確かめ、失敗したものだけ <html> に印（noimg-cc-oni／noimg-cr-fc など）を付けて切り替える */
(function checkIconImages() {
  const root = document.documentElement;
  const test = (src, cls) => { const im = new Image(); im.onerror = () => root.classList.add(cls); im.src = src; };
  COURSE_ORDER.forEach(c => test(`img/course-${c}.svg`, `noimg-cc-${c}`));
  ['none', 'clear', 'fc', 'ap'].forEach(k => test(`img/crown-${k}.svg`, `noimg-cr-${k}`));
})();

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
  const tk = searchKey(t);
  let gs = [...gm.values()].filter(g => !tk || searchKey(g.title + ' ' + g.genre + ' ' + g.composer).includes(tk));
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
const dots = g => `<span class="dots">${g.charts.map(c => cicon(c.course)).join('')}</span>`;
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
const eventCloseAt = e => ts(e.end) + CLOSE_HOURS * HOUR_MS;
/** 開催前 → 開催中 → 受付中（終了後18時間：期間内にプレイした記録の登録・写真追加のみ） → 確定 */
function eventState(e) {
  const now = Date.now();
  if (e.deleted) return '削除済み';
  if (now < ts(e.start)) return '開催前';
  if (now <= ts(e.end)) return '開催中';
  if (now <= eventCloseAt(e) && !e.finalizedAt) return '受付中';
  return '確定';
}
const eventOpen = e => ['開催中', '受付中'].includes(eventState(e));
/** 終了日までの日数（暦日の差。終了日当日は0） */
function daysLeft(e) {
  const n = new Date(), d = new Date(e.end);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
}
function eventBadges(e) {
  const s = eventState(e);
  let h = `<span class="badge ${s === '開催中' ? 'b-ok' : s === '受付中' ? 'b-warn' : 'b-mute'}">${s === '受付中' ? 'リザルト受付中' : s}</span>`;
  if (s === '開催中') { const d = daysLeft(e); if (d <= 14) h += `<span class="badge b-warn">あと${d}日</span>`; }
  if (s === '受付中') h += `<span class="badge b-warn">締切まで${Math.max(1, Math.ceil((eventCloseAt(e) - Date.now()) / HOUR_MS))}時間</span>`;
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
/** 管理者の書き込み操作（保存・却下・削除など）。通信中は画面を覆って、二重に押されるのを防ぐ */
const isBlockingAction = a => /^admin/.test(a) && !/^admin(GetAll|GetPhoto|Backups)$/.test(a);
const busy = {
  n: 0,
  on() {
    if (this.n++ > 0 || typeof document === 'undefined') return;
    let el = document.getElementById('busy');
    if (!el) { el = document.createElement('div'); el.id = 'busy'; el.innerHTML = '<div>保存中…</div>'; document.body.appendChild(el); }
    el.classList.add('show');
  },
  off() { if (--this.n > 0) return; this.n = 0; const el = document.getElementById('busy'); if (el) el.classList.remove('show'); }
};
async function api(action, payload, timeoutMs) {
  if (!isBlockingAction(action)) return apiCall(action, payload, timeoutMs);
  busy.on(); // ボタンを押した直後（通信の前）に覆うので、続けて押しても届かない
  try { return await apiCall(action, payload, timeoutMs); } finally { busy.off(); }
}
async function apiCall(action, payload, timeoutMs) {
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
/** 検索用に文字をそろえる：全角/半角・大文字/小文字・カタカナ/ひらがな・空白や「・」などの記号の違いを無視する */
function searchKey(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･\-‐－―ー〜~!！?？。、.,:：;；'"’”「」『』()（）［］\[\]【】☆★♪♡♥]/g, '');
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

/* ===================== 複数コースをまとめて入力するタブ（楽曲の追加） =====================
   楽曲一覧と同じコースボタンをタブとして並べ、コースごとに★・細分・最大コンボ・初項（管理者はリンクも）を入れる。
   ★を選んだコースだけを登録する。登録済みのコースは「登録済み」として表示だけする。
   st = { tab, data: { course: { level, tier, tag, maxCombo, shoko, wikiUrl, videoUrl } }, existing: { course: 譜面 }, links } */
function mcNew(existingCharts, firstCourse, opts) {
  const st = { tab: null, data: {}, existing: {}, links: !!(opts && opts.links) };
  mcSetExisting(st, existingCharts);
  st.tab = firstCourse && !st.existing[firstCourse] ? firstCourse : (COURSE_ORDER.find(c => c === 'oni' && !st.existing[c]) || COURSE_ORDER.find(c => !st.existing[c]) || 'oni');
  return st;
}
function mcSetExisting(st, charts) {
  st.existing = {};
  (charts || []).forEach(c => { if (!c.deleted) st.existing[c.course] = c; });
}
const mcFilled = d => !!(d && d.level);
function mcTabLabel(st, c) {
  const ex = st.existing[c], d = st.data[c];
  if (ex) return "登録済";
  if (mcFilled(d)) return `★${d.level}${+d.level === 10 && d.tier ? ' ' + d.tier : ''}`;
  return '未入力';
}
function mcTabsHtml(st) {
  return `<div class="courses mctabs" style="--n:5" role="tablist">${COURSE_ORDER.map(c => {
    const ex = st.existing[c], on = mcFilled(st.data[c]);
    return `<button type="button" role="tab" aria-selected="${st.tab === c}" class="cbtn mct cc-${c}${st.tab === c ? ' sel' : ''}${ex ? ' done' : on ? ' filled' : ''}" data-mct="${c}">
      <i class="cicon cc-${c}${ex || on ? '' : ' gray'}" aria-hidden="true">${COURSE_DOT[c]}</i><span>${COURSE_SHORT[c]}</span><small>${esc(mcTabLabel(st, c))}</small></button>`;
  }).join('')}</div>`;
}
function mcPanelHtml(st) {
  const c = st.tab, ex = st.existing[c], d = st.data[c] || {};
  if (ex) return `<div class="mcpanel"><div class="muted">${esc(COURSES[c])}は登録済みです（★${ex.level}・${ex.maxCombo ?? '---'}コンボ${ex.shoko ? '・初項' + ex.shoko : ''}）。<br>変更は、楽曲の詳細（またはその難易度のボタン）から行ってください。</div></div>`;
  const lv = d.level ? +d.level : 0, tag = d.tag || 'jiriki';
  return `<div class="mcpanel">
    <label>${esc(COURSES[c])}の難易度</label><select id="mcLevel"><option value="">― 登録しない</option>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => `<option value="${n}"${n === lv ? ' selected' : ''}>★${n}</option>`).join('')}</select>
    <div id="mcFields"${lv ? '' : ' class="hidden"'}>
      <div id="mcSub"${lv === 10 ? '' : ' class="hidden"'}>
        <label>★10 細分（全良難易度表）</label>
        <select id="mcTier"><option value="">未分類</option>${TIERS.map(t => `<option value="${t}"${t === d.tier ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <div id="mcTag" class="seg${lv === 10 && TAGGED.has(d.tier) ? '' : ' hidden'}">
          <label><input type="radio" name="mcTag" value="jiriki"${tag !== 'kojinsa' ? ' checked' : ''}> 地力</label>
          <label><input type="radio" name="mcTag" value="kojinsa"${tag === 'kojinsa' ? ' checked' : ''}> 個人差</label></div>
      </div>
      <div class="grid2">
        <div><label>最大コンボ数</label><input id="mcCombo" type="number" inputmode="numeric" min="0" value="${esc(d.maxCombo ?? '')}"></div>
        <div><label>初項（良1回の点）</label><input id="mcShoko" type="number" inputmode="numeric" min="0" value="${esc(d.shoko ?? '')}" placeholder="不明なら空欄"></div>
      </div>
      ${st.links ? urlField('mcWiki', '攻略wikiのURL（任意・https://〜）', d.wikiUrl) + urlField('mcVideo', 'プレイ動画のURL（任意・https://〜）', d.videoUrl) : ''}
    </div>
    ${lv ? `<div class="mcbtns"><button type="button" class="btn sub small" id="mcClear">${esc(COURSES[c])}の入力を消す</button></div>` : '<div class="muted" style="margin-top:6px">★を選ぶと、このコースも一緒に登録します。</div>'}
  </div>`;
}
/* ----- URL欄（管理者画面）：「貼り付け」と「開いて確認」のボタン付き ----- */
function urlField(id, label, value, placeholder) {
  return `<label for="${id}">${esc(label)}</label><div class="urlf">
    <input id="${id}" type="url" inputmode="url" value="${esc(value || '')}" autocomplete="off" placeholder="${esc(placeholder || 'https://')}">
    <button type="button" class="btn sub small" data-paste="${id}" title="コピーしたURLを貼り付け">📋 貼り付け</button>
    <button type="button" class="btn sub small" data-openurl="${id}" title="新しいタブで開いて確認" aria-label="開いて確認">↗</button></div>`;
}
/** 貼り付けた文からURLだけを取り出す（共有した文に曲名などが付いていても、最初の http(s):// 〜 を使う） */
function pickUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s"'<>（）「」、。]+/);
  return m ? m[0].replace(/[)\]}.,!?！？]+$/, '') : String(text || '').trim();
}
function bindUrlFields(root) {
  (root || document).querySelectorAll('[data-paste]').forEach(b => b.onclick = async () => {
    const el = document.getElementById(b.dataset.paste); if (!el) return;
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; }
    if (!text) { el.focus(); toast('この端末ではボタンから貼り付けできません。欄を長押し（右クリック）して貼り付けてください', 3500); return; }
    const url = pickUrl(text);
    if (!/^https:\/\//.test(url)) { toast(/^http:\/\//.test(url) ? 'http:// のURLは使えません（https:// のものを使ってください）' : 'コピーした内容にURLが見つかりませんでした', 3000); return; }
    el.value = url; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    toast('貼り付けました');
  });
  (root || document).querySelectorAll('[data-openurl]').forEach(b => b.onclick = () => {
    const el = document.getElementById(b.dataset.openurl), url = el ? pickUrl(el.value) : '';
    if (!isHttps(url)) { toast('https:// で始まるURLを入力してください', 2500); return; }
    window.open(url, '_blank', 'noopener');
  });
  // 手で貼り付けた場合も、URL以外の文字が混ざっていたら取り除く
  (root || document).querySelectorAll('.urlf input').forEach(el => el.addEventListener('paste', () => setTimeout(() => {
    const u = pickUrl(el.value); if (u !== el.value && /^https?:\/\//.test(u)) { el.value = u; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, 0)));
}
const mcHtml = st => `<div class="mcwrap">${mcTabsHtml(st)}${mcPanelHtml(st)}</div>`;
/** box（mcHtmlを入れた要素）にイベントを付ける。入力のたびに st に控えるので、タブを切り替えても消えない */
function mcBind(st, box, onChange) {
  const redraw = () => { box.innerHTML = mcHtml(st); mcBind(st, box, onChange); if (onChange) onChange(); };
  const tabsOnly = () => { box.querySelector('.mctabs').outerHTML = mcTabsHtml(st); box.querySelectorAll('[data-mct]').forEach(bindTab); if (onChange) onChange(); };
  const bindTab = b => b.onclick = () => { st.tab = b.dataset.mct; redraw(); };
  box.querySelectorAll('[data-mct]').forEach(bindTab);
  const c = st.tab; if (st.existing[c]) return;
  const d = () => (st.data[c] = st.data[c] || {});
  const q = s => box.querySelector(s);
  q('#mcLevel').onchange = e => { d().level = e.target.value; if (!d().level) delete st.data[c]; redraw(); };
  if (q('#mcClear')) q('#mcClear').onclick = () => { delete st.data[c]; redraw(); };
  if (q('#mcTier')) q('#mcTier').onchange = e => { d().tier = e.target.value; q('#mcTag').classList.toggle('hidden', !TAGGED.has(d().tier)); tabsOnly(); };
  box.querySelectorAll('input[name=mcTag]').forEach(r => r.onchange = () => { d().tag = r.value; });
  [['#mcCombo', 'maxCombo'], ['#mcShoko', 'shoko'], ['#mcWiki', 'wikiUrl'], ['#mcVideo', 'videoUrl']].forEach(([sel, k]) => { const el = q(sel); if (el) el.oninput = () => { d()[k] = el.value; }; });
  if (st.links) bindUrlFields(box);
}
/** 登録するコースの一覧と、確認が必要な点 */
function mcCollect(st) {
  const list = [], warn = [], errs = [];
  COURSE_ORDER.forEach(c => {
    const d = st.data[c];
    if (st.existing[c] || !mcFilled(d)) return;
    const level = +d.level, tier = level === 10 ? (d.tier || '') : '';
    const subLevel = tier ? { tier, tag: tier === 'SS' ? null : tier === 'F' ? 'jiriki' : (d.tag || 'jiriki') } : null;
    const maxCombo = nn(d.maxCombo), shoko = nn(d.shoko);
    const wikiUrl = String(d.wikiUrl || '').trim(), videoUrl = String(d.videoUrl || '').trim();
    if ((wikiUrl && !isHttps(wikiUrl)) || (videoUrl && !isHttps(videoUrl))) errs.push(`${COURSES[c]}：URLは https:// で始まるものを入力してください。`);
    if (shoko != null && shoko % 10 !== 0) warn.push(`${COURSES[c]}の初項（${shoko}）が10点単位ではありません。`);
    list.push({ course: c, level, subLevel, maxCombo, shoko, wikiUrl, videoUrl });
  });
  return { list, warn, errs };
}
const mcSummary = list => list.map(x => `${COURSES[x.course]} ★${x.level}`).join('・');
