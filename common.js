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

/* ----- スコア計算（AC16ニジイロ以降） -----
   スコア = 初項×良 + floor(初項÷2÷10)×10×可 + 100×連打 */
function calcScore(shoko, good, ok, roll) { return shoko * good + Math.floor(shoko / 20) * 10 * ok + 100 * roll; }

/* ----- 楽曲表示 ----- */
const courseIdx = c => COURSE_ORDER.indexOf(c);
const songSort = (a, b) => a.title.localeCompare(b.title, 'ja') || courseIdx(a.course) - courseIdx(b.course);
function subLabel(s) { if (!s.subLevel) return ''; const { tier, tag } = s.subLevel; return tag === 'jiriki' ? '地力' + tier : tag === 'kojinsa' ? '個人差' + tier : tier; }
function subShort(s) { if (!s.subLevel) return ''; const { tier, tag } = s.subLevel; return tier + (tag === 'jiriki' ? '地' : tag === 'kojinsa' ? '個' : ''); }
const lvLabel = s => `★${s.level}` + (s.subLevel ? ' ' + subLabel(s) : '');
const songName = s => s ? `${s.title}［${COURSES[s.course]}］` : '楽曲未選択';
const genreColor = g => GENRE_COLORS[String(g || '').replace(/[™\s]/g, '')] || null;
const gcStyle = g => { const c = genreColor(g); return c ? ` style="--gc:${c}"` : ''; };
const genreTag = g => genreColor(g) ? `<span class="gtag"${gcStyle(g)}>${esc(g)}</span>` : `<span class="gtag none">${esc(g || 'ジャンル未設定')}</span>`;
const genreList = () => `<datalist id="genres">${GENRES.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;

/** 曲名でまとめた一覧（曲名順、各曲の譜面はコース順） */
function groupSongs(songs) {
  const m = new Map();
  for (const s of songs.filter(s => !s.deleted).sort(songSort)) {
    if (!m.has(s.title)) m.set(s.title, { title: s.title, genre: '', charts: [] });
    const g = m.get(s.title); g.charts.push(s); if (!g.genre && s.genre) g.genre = s.genre;
  }
  return m;
}
/**
 * 難易度ボタン列
 *  pick：裏が無い曲は4個、未登録は押せない
 *  edit：常に5個、未登録は「＋追加」
 *  toggle：選択状態を切り替える（selIds は Set）
 */
function courseButtons(g, sel, mode, opts) {
  opts = opts || {};
  const has = new Map(g.charts.map(c => [c.course, c]));
  const courses = (mode === 'edit' || has.has('ura')) ? COURSE_ORDER : COURSE_ORDER.slice(0, 4);
  const isOn = id => sel instanceof Set ? sel.has(id) : id === sel;
  return `<div class="courses" style="--n:${courses.length}">` + courses.map(c => {
    const s = has.get(c);
    if (!s) return mode === 'edit'
      ? `<button type="button" class="cbtn add cc-${c}" data-add="${c}"><span>${COURSE_SHORT[c]}</span><small>＋追加</small></button>`
      : `<button type="button" class="cbtn cc-${c}" disabled><span>${COURSE_SHORT[c]}</span><small>未登録</small><small>&nbsp;</small></button>`;
    const ev = opts.eventIds && opts.eventIds.has(s.id) ? '<i class="ev" title="開催中の大会の対象">🏆</i>' : '';
    return `<button type="button" class="cbtn cc-${c}${isOn(s.id) ? ' on' : ''}" data-id="${esc(s.id)}">${ev}
      <span>${COURSE_SHORT[c]}</span><small>★${s.level}${s.subLevel ? ' ' + esc(subShort(s)) : ''}</small><small>${s.maxCombo ?? '---'}コンボ</small></button>`;
  }).join('') + `</div>`;
}
const dots = g => `<span class="dots">${g.charts.map(c => `<i class="cc-${c.course}">${COURSE_DOT[c.course]}</i>`).join('')}</span>`;

/* ----- 大会 ----- */
const eventActive = (e, now) => { now = now || Date.now(); return !e.deleted && ts(e.start) <= now && now <= ts(e.end); };
const eventState = e => { const now = Date.now(); return e.deleted ? '削除済み' : now < ts(e.start) ? '開催前' : now > ts(e.end) ? '終了' : '開催中'; };

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
