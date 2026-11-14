/* 太鼓スコア記録：段位道場の条件ゲージ（本家と同じ形の合格条件ゲージ）
   ・判定（dgEval）と仕様の数値（DG）は画面に触れない計算だけにしてある。Windows版でも同じ式・数値を使う
   ・見た目は横2560の設計座標で描き、置き場所の幅に合わせて丸ごと縮める
   ・文字はすべて img/gauge/ の画像（月さん作成）。フォントは使わない */

/* ---------- 仕様の数値 ---------- */
const DG = {
  img: 'img/gauge/',
  col: { gray: '#444', dkyellow: '#facc22', yellow: '#f9fe37', pink: '#ffa1b7', red: '#fa7d4e', dkred: '#fb5a21' },
  song: [{ fill: '#a6df7e', fade: '#c9ecb0' }, { fill: '#86c8ee', fade: '#bfe2f5' }, { fill: '#f59aa5', fade: '#f8c9cf' }],
  off: { fill: '#d6d6d6', fade: '#dddddd' },
  triMin: 700,                       // 曲別の条件：ゲージ欄の横幅（CSS px）がこれ以上なら3つ並び
  swapOut: 266, swapIn: 240,         // 曲の切り替え：黒へ沈む（約0.23秒＋余白）／戻る（ミリ秒）
  // 確定した調整値（設計座標）
  adj: { lbH: 50, lbY: 0, cnH: 65, cnSp: -8, cnY: -4, cwH: 65, cwGap: 11, cwY: -4, vH: 133, vSp: -5, vX: 31, vY: -13 },
  tri: { pitch: 833, bx: 119, by: 202, br: 48, gx: 246, gy: 165, gw: 583, gh: 84 },
  label: { good: 'good', ok: 'ok', bad: 'bad', roll: 'roll', score: 'score', combo: 'combo', hit: 'hit', soul: 'soul' },
  tomoe: 'M-0.0 -32.0 L-1.6 -32.0 L-3.3 -31.8 L-4.9 -31.6 L-6.5 -31.3 L-8.1 -30.9 L-9.7 -30.5 L-11.3 -29.9 L-12.8 -29.3 L-14.3 -28.6 L-15.8 -27.9 L-17.2 -27.0 L-18.5 -26.1 L-19.9 -25.1 L-21.1 -24.0 L-22.3 -22.9 L-23.5 -21.7 L-24.6 -20.5 L-25.6 -19.2 L-26.5 -17.9 L-27.4 -16.5 L-28.2 -15.0 L-29.0 -13.6 L-29.6 -12.1 L-30.2 -10.5 L-30.7 -9.0 L-31.1 -7.4 L-31.5 -5.7 L-31.7 -4.1 L-31.9 -2.5 L-32.0 -0.8 L-32.0 0.8 L-31.9 2.5 L-31.7 4.1 L-31.5 5.7 L-31.1 7.3 L-30.7 8.9 L-30.2 10.5 L-29.6 12.0 L-29.0 13.5 L-28.3 15.0 L-28.3 15.0 L-28.6 13.4 L-28.9 11.7 L-29.1 10.1 L-29.2 8.5 L-29.3 6.9 L-29.2 5.3 L-29.0 3.7 L-28.8 2.2 L-28.4 0.7 L-28.0 -0.7 L-27.6 -2.1 L-27.0 -3.5 L-26.4 -4.8 L-25.7 -6.1 L-24.9 -7.3 L-24.1 -8.4 L-23.3 -9.5 L-22.4 -10.5 L-21.4 -11.4 L-20.4 -12.3 L-19.4 -13.1 L-18.3 -13.8 L-17.3 -14.4 L-16.2 -15.0 L-15.0 -15.4 L-13.9 -15.8 L-12.8 -16.2 L-11.7 -16.4 L-10.5 -16.6 L-9.4 -16.7 L-8.3 -16.7 L-7.2 -16.6 L-6.2 -16.4 L-5.2 -16.2 L-4.2 -15.9 L-3.2 -15.5 L-2.3 -15.0 L-1.5 -14.5 L-0.7 -13.8 L-0.0 -12.8 L0.0 -12.8 L0.8 -12.8 L1.5 -12.9 L2.2 -13.1 L3.0 -13.3 L3.7 -13.5 L4.4 -13.8 L5.0 -14.2 L5.6 -14.6 L6.2 -15.1 L6.8 -15.6 L7.3 -16.2 L7.8 -16.8 L8.2 -17.4 L8.6 -18.0 L8.9 -18.7 L9.1 -19.4 L9.3 -20.2 L9.5 -20.9 L9.6 -21.6 L9.6 -22.4 L9.6 -23.2 L9.5 -23.9 L9.3 -24.6 L9.1 -25.4 L8.9 -26.1 L8.6 -26.8 L8.2 -27.4 L7.8 -28.0 L7.3 -28.6 L6.8 -29.2 L6.2 -29.7 L5.6 -30.2 L5.0 -30.6 L4.4 -31.0 L3.7 -31.3 L3.0 -31.5 L2.2 -31.7 L1.5 -31.9 L0.8 -32.0 L0.0 -32.0Z',
};
const dgU = n => `calc(var(--u)*${n})`;
const dgImg = name => DG.img + name + '.webp';
const DG_CH = { '+': 'plus', '-': 'minus', '.': 'dot', '%': 'pct' };
const dgCh = ch => DG_CH[ch] || ch;

/* ---------- 判定（入力5つ → ゲージ1本の状態） ---------- */
/**
 * op：'ge'（以上）| 'lt'（未満）、red・gold：合格の値（gold が空なら red と同じ）、value：実際の値、finished：演奏終了後か
 * 返り値 { disp 表記値, level 0〜100, color, blink ''|'s'|'f'|'r', num 'w'|'g'|'d'|'c', fail, meetRed, meetGold }
 */
function dgEval(op, red, gold, value, finished) {
  red = Math.max(0, +red || 0); value = Math.max(0, +value || 0);
  const g = (gold === '' || gold == null || isNaN(+gold)) ? red : +gold;
  const disp = op === 'lt' ? Math.max(0, red - value) : value;
  let level;
  if (disp <= 0) level = 0;
  else if (red <= 0 || disp >= red) level = 100;
  else level = Math.min(99, Math.floor(disp * 100 / red) + 1);
  const meetRed = op === 'lt' ? value < red : value >= red;
  const meetGold = op === 'lt' ? value < g : value >= g;
  let color, blink = '', num = 'w', fail = false;
  if (op === 'ge') {
    if (finished) {
      if (meetGold && meetRed) { color = 'rainbow'; num = 'c'; }
      else if (meetRed) color = 'pink';
      else { color = 'gray'; fail = true; num = 'd'; }
    } else if (disp === 0) { color = 'gray'; num = 'g'; }
    else if (level < 100) { color = disp * 2 < red ? 'dkyellow' : 'yellow'; if (disp * 100 >= red * 95) blink = 's'; }
    else if (meetGold) { color = 'rainbow'; num = 'c'; }
    else {
      color = 'pink';
      const span = g - red, got = value - red;
      if (span > 0) { if (got * 3 >= span * 2) blink = 'f'; else if (got * 3 >= span) blink = 's'; }
    }
  } else {
    if (disp === 0) { color = 'gray'; fail = true; num = 'd'; }
    else if (finished) { if (meetGold) { color = 'rainbow'; num = 'c'; } else color = 'pink'; }
    else if (disp < 5 && level < 100) { color = 'dkred'; blink = 'r'; }
    else if (disp * 10 >= red * 3) color = meetGold ? 'pink' : 'yellow';   // 30%ちょうどを含む
    else if (disp * 10 > red * 2) color = 'red';                            // 20%より大きく30%未満
    else { color = 'dkred'; blink = 'r'; }
  }
  return { disp, level, color, blink, num, fail, meetRed, meetGold };
}
/** 余裕の割合（小さいほど危ない。落ちていればマイナス） */
function dgMargin(op, red, v) { red = +red || 0; if (red <= 0) return 1; return op === 'lt' ? (red - v) / red : (v - red) / red; }
/** 1＋小2で大きく出す曲：演奏中の曲 → 最初に落ちた曲 → いちばん余裕がなかった曲 */
function dgBigSong(c) {
  const play = c.states.indexOf('play');
  if (play >= 0) return play;
  const done = [0, 1, 2].filter(i => c.states[i] === 'done');
  if (!done.length) return 0;
  const m = i => dgMargin(c.op, c.reds[i], c.values[i]);
  const fail = done.find(i => c.op === 'lt' ? m(i) <= 0 : m(i) < 0);
  if (fail != null) return fail;
  return done.reduce((a, i) => m(i) < m(a) ? i : a, done[0]);
}

/* ---------- 描画：ゲージ1本 ---------- */
class DgBar {
  constructor(parent, geo) {
    this.geo = geo;
    const b = this.el = document.createElement('div'); b.className = 'dg-bar' + (geo.small ? ' dg-sm' : '');
    this.fill = document.createElement('div'); this.fill.className = 'dg-fill';
    this.flash = document.createElement('div'); this.flash.className = 'dg-flash';
    this.blink = document.createElement('div'); this.blink.className = 'dg-blink';
    this.fill.append(this.flash, this.blink);
    this.failEl = document.createElement('div'); this.failEl.className = 'dg-failt';
    this.failEl.innerHTML = `<img src="${dgImg('fail')}" alt="達成失敗">`;
    this.shade = document.createElement('div'); this.shade.className = 'dg-shade';
    b.append(this.fill, this.failEl, this.shade);
    this.num = document.createElement('div'); this.num.className = 'dg-num';
    parent.append(b, this.num);
    this.key = null; this.numKey = null; this.blinkKey = null;
    this.layout();
  }
  layout() {
    const g = this.geo, b = this.el.style;
    b.left = dgU(g.x); b.top = dgU(g.y); b.width = dgU(g.w); b.height = dgU(g.h);
    b.borderWidth = dgU(g.bw); b.borderRadius = dgU(g.r);
    this.fill.style.setProperty('--iw', dgU(g.w - g.bw * 2)); // 虹色はゲージ全体の幅で固定
    const n = this.num.style; n.left = dgU(g.x + g.nx); n.top = dgU(g.y + g.ny); n.height = dgU(g.nh);
  }
  setGeo(geo) { this.geo = geo; this.layout(); }
  reset() { this.key = null; this.numKey = null; this.lastDisp = undefined; }
  set(st) {
    this.el.classList.toggle('dg-off', !st);
    if (!st) { this.fill.style.width = '0'; this.num.innerHTML = ''; this.failEl.style.display = 'none'; this.reset(); this.blinkKey = null; this.blink.className = 'dg-blink'; this.fill.classList.remove('dg-dim', 'dg-rb'); return; }
    this.fill.style.width = st.level + '%';
    const key = st.color;
    if (key === 'rainbow') { this.fill.classList.add('dg-rb'); this.fill.style.backgroundColor = ''; }
    else { this.fill.classList.remove('dg-rb'); this.fill.style.backgroundColor = DG.col[key]; }
    if (this.key !== null && (this.key !== key || this.blinkKey !== st.blink)) { // 色・点滅が変わったら白からフェード
      this.flash.classList.remove('dg-go'); void this.flash.offsetWidth; this.flash.classList.add('dg-go');
    }
    this.key = key;
    if (this.blinkKey !== st.blink) { // 濃い赤は色そのものを薄くして点滅、ほかは白く光らせる
      this.blink.className = 'dg-blink' + (st.blink && st.blink !== 'r' ? ' dg-b' + st.blink : '');
      this.fill.classList.toggle('dg-dim', st.blink === 'r'); this.blinkKey = st.blink;
    }
    this.failEl.style.display = st.fail ? '' : 'none';
    const nk = st.num + ':' + st.disp;
    if (nk !== this.numKey) {
      if (this.numKey !== null && this.lastDisp !== undefined && this.lastDisp !== st.disp) { // 値が変わったときだけ伸び縮み
        this.num.classList.remove('dg-pop'); void this.num.offsetWidth; this.num.classList.add('dg-pop');
      }
      this.numKey = nk; this.lastDisp = st.disp;
      const slot = this.geo.nh * 0.74 + this.geo.sp; // 等幅：同じ幅の枠の中央に1文字ずつ置く
      this.num.innerHTML = String(st.disp).split('').map(ch => `<span style="width:${dgU(slot)}"><img src="${dgImg(`v${st.num}-${dgCh(ch)}`)}" alt="${ch}"></span>`).join('');
    }
  }
}

/* ---------- 描画：条件1つ分（見出し・アイコン・条件の値・ゲージ） ---------- */
const DG_MAIN = per => { const a = DG.adj; return { x: 648, y: 88, w: per ? 1218 : 1574, h: 147, bw: 9, r: 16, nx: a.vX, ny: a.vY, nh: a.vH, sp: a.vSp }; };
const DG_SMALL = i => { const a = DG.adj, k = 56 / 147; return { x: 2022, y: 94 + i * 82, w: 440, h: 56, bw: 5, r: 10, nx: 2, ny: a.vY * k - 1, nh: a.vH * k, sp: a.vSp * k, small: true }; };
const DG_TRIG = i => { const a = DG.adj, t = DG.tri, k = t.gh / 147; return { x: t.gx + i * t.pitch, y: t.gy, w: t.gw, h: t.gh, bw: 6, r: 12, nx: a.vX * k, ny: a.vY * k, nh: a.vH * k, sp: a.vSp * k, small: true }; };
const DG_TOMOE = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="48" fill="#f2a71f"/><circle r="41" fill="#ffcd2b"/>${[0, 1, 2].map(k => `<path d="${DG.tomoe}" fill="#fff6cf" transform="rotate(${k * 120})"/>`).join('')}</svg>`;
function dgBadge(i, off) {
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="47" fill="${off ? DG.off.fill : DG.song[i].fill}"/></svg>`
    + (off ? '' : `<img class="dg-bdgt" src="${dgImg('s-' + (i + 1))}" alt="${i + 1}曲目">`);
}
/** 条件の値「30 未満」を画像で組む（k＝大きさの倍率） */
function dgCondHtml(v, op, k = 1) {
  const a = DG.adj, word = op === 'lt' ? 'lt' : 'ge';
  if (v == null) return '';
  return String(v).split('').map((ch, i) => `<img src="${dgImg('c-' + dgCh(ch))}" alt="${ch}" style="height:${dgU(a.cnH * k)};top:${dgU(a.cnY * k)};margin-left:${i ? dgU(a.cnSp * k) : 0}">`).join('')
    + `<img src="${dgImg('c-' + word)}" alt="${op === 'lt' ? '未満' : '以上'}" style="height:${dgU(a.cwH * k)};top:${dgU(a.cwY * k)};margin-left:${dgU(a.cwGap * k)}">`;
}

class DgGauge {
  /**
   * c：通し { type, op, scope:'total', red, gold, value, finished }
   *    曲別 { type, op, scope:'per', reds[3], golds[3], values[3], states[3]：'done' 演奏済み | 'play' 演奏中 | 'none' 未演奏 }
   */
  constructor(el) {
    this.el = el;
    el.innerHTML = `<div class="dg-card"></div><div class="dg-tab"></div><div class="dg-fade dg-sw"></div><div class="dg-ic dg-sw"></div><div class="dg-cond dg-sw"></div>`;
    const q = s => el.querySelector(s);
    this.card = q('.dg-card'); this.tab = q('.dg-tab'); this.fade = q('.dg-fade'); this.ic = q('.dg-ic'); this.cond = q('.dg-cond');
    this.main = new DgBar(el, DG_MAIN(false));
    this.main.num.classList.add('dg-sw'); this.main.shade.classList.add('dg-main');
    this.smalls = [0, 1].map(k => {
      const bd = document.createElement('div'); bd.className = 'dg-bdg dg-sw';
      Object.assign(bd.style, { left: dgU(1947), top: dgU(94 + k * 82 + 1), width: dgU(54), height: dgU(54) });
      el.append(bd);
      const bar = new DgBar(el, DG_SMALL(k)); bar.el.classList.add('dg-sw'); bar.num.classList.add('dg-sw');
      return { bd, bar };
    });
    this.tri = [0, 1, 2].map(i => {
      const t = DG.tri, cx = t.bx + i * t.pitch;
      const fd = document.createElement('div'), bd = document.createElement('div'), cd = document.createElement('div');
      fd.className = 'dg-fade'; Object.assign(fd.style, { left: dgU(cx), top: dgU(t.by - 45), width: dgU(150), height: dgU(90) });
      bd.className = 'dg-bdg'; Object.assign(bd.style, { left: dgU(cx - t.br), top: dgU(t.by - t.br), width: dgU(t.br * 2), height: dgU(t.br * 2) });
      cd.className = 'dg-cond'; Object.assign(cd.style, { right: dgU(2560 - (t.gx + i * t.pitch + t.gw - 6)), top: dgU(t.gy + t.gh + 4) });
      el.append(fd, bd);
      const bar = new DgBar(el, DG_TRIG(i));
      el.append(cd);
      return { fd, bd, cd, bar };
    });
    // 1＋小2：小さいゲージの行を押すと、その曲を大きく表示する
    this.smalls.forEach((s, k) => {
      const h = s.hit = document.createElement('div'); h.className = 'dg-hit'; h.setAttribute('role', 'button'); h.tabIndex = 0;
      Object.assign(h.style, { left: dgU(1935), top: dgU(94 + k * 82 - 8), width: dgU(545), height: dgU(72) });
      const go = () => { if (s.song != null) this.swapTo(s.song); };
      h.onclick = go; h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      el.append(h);
    });
    this.focus = null; this.ctx = null; this.busy = false; this.icKey = null; this.mode = null; this.last = null;
    if (window.ResizeObserver) new ResizeObserver(() => { if (this.last && this.pickMode(this.last) !== this.mode) this.set(this.last); }).observe(el);
  }
  pickMode(c) { return c.scope !== 'per' ? 'tot' : this.el.clientWidth >= DG.triMin ? 'tri' : 'big'; }
  swapTo(i) {
    if (this.busy || i === this.big) return;
    this.busy = true;
    this.el.classList.add('dg-swout');               // 黒へ沈める
    setTimeout(() => {
      this.focus = i;
      [this.main, ...this.smalls.map(s => s.bar)].forEach(b => b.reset()); // 入れ替えでは白フラッシュ・伸び縮みを出さない
      this.icKey = null; this.set(this.last);
      this.el.classList.remove('dg-swout');          // 戻す
      setTimeout(() => { this.busy = false; }, DG.swapIn);
    }, DG.swapOut);
  }
  show(list, on) { list.forEach(e => { e.style.display = on ? '' : 'none'; }); }
  set(c) {
    this.last = c;
    const mode = this.mode = this.pickMode(c), per = c.scope === 'per';
    const ctx = per ? c.states.join() : 'tot';
    if (ctx !== this.ctx) { this.ctx = ctx; this.focus = null; }   // 演奏中の曲などが変わったら選び直し
    this.el.classList.toggle('dg-tri', mode === 'tri');
    this.el.style.setProperty('--rbT', per ? '1s' : '1.2s');      // 虹のスクロール：通し1.2秒・曲別1秒
    this.card.style.height = dgU(mode === 'tri' ? 251 : 220);
    const a = DG.adj, lb = DG.label[c.type];
    this.tab.innerHTML = lb ? `<img src="${dgImg('l-' + lb)}" alt="${esc(DAN_COND[c.type] || '')}" style="height:${dgU(a.lbH)};top:${dgU(a.lbY)}">` : '';
    const has = i => c.states[i] !== 'none' && c.reds[i] != null;   // 曲別：表示できる曲か
    const stOf = i => has(i) ? dgEval(c.op, c.reds[i], c.golds[i], c.values[i] ?? 0, c.states[i] === 'done') : null;
    const single = [this.fade, this.ic, this.cond, this.main.el, this.main.num];
    const smallEls = this.smalls.flatMap(s => [s.bd, s.bar.el, s.bar.num, s.hit]);
    const triEls = this.tri.flatMap(t => [t.fd, t.bd, t.cd, t.bar.el, t.bar.num]);
    if (mode === 'tri') {
      this.show(single, false); this.show(smallEls, false); this.show(triEls, true);
      this.tri.forEach((t, i) => {
        const on = has(i);
        t.bd.innerHTML = dgBadge(i, !on);
        const f = on ? DG.song[i].fade : DG.off.fade;
        t.fd.style.background = `linear-gradient(90deg, ${f} 0%, ${f}00 100%)`;
        t.cd.innerHTML = dgCondHtml(c.reds[i], c.op, 0.5);
        t.bar.set(stOf(i));
      });
      return;
    }
    this.show(triEls, false); this.show(single, true);
    const big = this.big = per ? (this.focus != null && has(this.focus) ? this.focus : dgBigSong(c)) : 0;
    this.cond.innerHTML = dgCondHtml(per ? c.reds[big] : c.red, c.op);
    const icKey = per ? 'b' + big + has(big) : 't';
    if (icKey !== this.icKey) {
      this.icKey = icKey;
      this.ic.innerHTML = per ? dgBadge(big, !has(big)) : DG_TOMOE;
      const f = per ? (has(big) ? DG.song[big].fade : DG.off.fade) : '#f3d27a';
      this.fade.style.background = `linear-gradient(90deg, ${f} 0%, ${f}00 100%)`;
    }
    if (!per) {
      this.show(smallEls, false);
      this.main.setGeo(DG_MAIN(false));
      this.main.set(c.value == null ? null : dgEval(c.op, c.red, c.gold, c.value, c.finished));
      return;
    }
    this.show(smallEls, true);
    this.main.setGeo(DG_MAIN(true));
    this.main.set(stOf(big));
    [0, 1, 2].filter(i => i !== big).forEach((i, k) => {
      const s = this.smalls[k], on = has(i);
      s.song = on ? i : null; s.hit.style.display = on ? '' : 'none';
      s.hit.setAttribute('aria-label', `${i + 1}曲目を大きく表示`);
      s.bd.innerHTML = dgBadge(i, !on);
      s.bar.set(stOf(i));
    });
  }
}

/* ---------- サイトとのつなぎ ---------- */
/**
 * お題と判定結果（danEval）から、条件ごとのゲージの設定を作る
 *  states：曲ごとの状態（'done' | 'play' | 'none'）。finished：通しの条件が演奏終了後か
 */
function dgConfigs(dan, e, states, finished) {
  return (dan.conds || []).map((c, ci) => {
    const x = e.conds[ci];
    if (c.scope === 'per') {
      const reds = [0, 1, 2].map(i => (c.red || [])[i] ?? null);
      const golds = [0, 1, 2].map(i => (c.gold || [])[i] ?? reds[i]);
      return { type: c.type, op: c.op, scope: 'per', reds, golds, values: x.vals.slice(), states: states.slice() };
    }
    return { type: c.type, op: c.op, scope: 'total', red: c.red, gold: c.gold != null ? c.gold : c.red, value: x.total, finished };
  });
}
/** 記録を見る画面の状態：演奏した曲は演奏終了後、それ以外は未演奏 */
const dgDoneStates = played => [0, 1, 2].map(i => i < played ? 'done' : 'none');
/** host の中に条件ゲージを並べる。同じ条件の並びなら作り直さずに値だけ更新する（点滅・フラッシュを途切れさせない） */
function dgRender(host, cfgs) {
  if (!host) return;
  const key = cfgs.map(c => c.type + c.op + c.scope).join('|');
  if (host._dgKey !== key) {
    host._dgKey = key;
    host.innerHTML = cfgs.map(() => '<div class="dgw"><div class="dg"></div></div>').join('');
    host._dg = [...host.querySelectorAll('.dg')].map(el => new DgGauge(el));
  }
  cfgs.forEach((c, i) => host._dg[i].set(c));
}
