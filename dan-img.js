/* 太鼓スコア記録：段位の進捗画像（試作：1920×1080 の画面を組み立ててプレビューする） */
'use strict';

/** 進捗画像の文字（曲名・★・ノーツ数・バージョン・目標：）のフォント。user はアップロードしたフォント（その場限り） */
const DIMG_FONTS = {
  brush: { name: '筆（標準）', css: "DimgLatin,'Yuji Syuku',DanBrush,serif", fw: 400, gf: 'Yuji+Syuku' },
  mincho: { name: '明朝（Zen Antique Soft）', css: "'Zen Antique Soft',serif", fw: 400, gf: 'Zen+Antique+Soft' },
  gothic: { name: 'ゴシック（IBM Plex Sans JP）', css: "'IBM Plex Sans JP',system-ui,sans-serif", fw: 700, gf: 'IBM+Plex+Sans+JP:wght@700' },
  user: { name: '自分のフォント', css: "DimgUser,DimgLatin,'Yuji Syuku',serif", fw: 400 },
};
let dimgUserFont = null;
const dimgFontOpts = cur => Object.entries(DIMG_FONTS).filter(([k]) => k !== 'user' || dimgUserFont)
  .map(([k, f]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${k === 'user' ? '自分のフォント（' + esc(dimgUserFont) + '）' : f.name}</option>`).join('')
  + '<option value="pick">フォントファイルを読み込む…</option>';   // 読み込んだフォントの名前（ページを閉じるまで）
function dimgLoadGF(key) {
  const f = DIMG_FONTS[key];
  if (!f || !f.gf || document.querySelector(`link[data-dimgf="${key}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.dataset.dimgf = key;
  l.href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=block`;
  document.head.appendChild(l);
}
const DIMG_TYPES = [['red', 'silver'], ['red', 'gold'], ['red', 'rainbow'], ['gold', 'silver'], ['gold', 'gold'], ['gold', 'rainbow']];
/** 背景：達人＝金、玄人〜超人＝銀、十段以下＝青（外伝＝翠は段位の種類が増えたら使う） */
/** 目標の表記：赤合格／金合格 ＋ 枠（銀＝合格、金＝フルコンボ、虹＝全良） */
const dimgLabel = t => (t.res === 'gold' ? '金合格' : '赤合格') + ({ gold: '・フルコンボ', rainbow: '・全良' }[t.frame] || '');
const dimgBg = d => d.gaiden ? 'gaiden' : d.rank >= 18 ? 'gold' : d.rank >= 15 ? 'silver' : 'normal';

/** 目標の合格の種類：赤／金は選択中のもの。目標の不可がすべて0ならフルコンボ、可・不可がすべて0なら全良 */
function dimgAutoType(I) {
  const res = (danSt.mode[I.d.id] || 'red') === 'gold' ? 'gold' : 'red';
  const tg = t => { const k = I.items.findIndex(it => it.type === t); return k < 0 ? null : I.tgs[k]; };
  const zero = a => !!a && a.every(v => v === 0);
  const good = tg('good'), allGood = !!good && I.charts.every((s, i) => s && s.maxCombo && good[i] === s.maxCombo);
  const frame = (zero(tg('bad')) && zero(tg('ok'))) || allGood ? 'rainbow' : zero(tg('bad')) ? 'gold' : 'silver';
  return { res, frame };
}

function dimgStageHtml(I, type) {
  const { d, charts, picks, items, tgs } = I;
  const tOf = (t, i) => { const k = items.findIndex(it => it.type === t); return k < 0 ? null : tgs[k][i]; };
  const songs = charts.map((s, i) => {
    const plays = s ? thPlays(s.id) : [], r = picks[i];
    let bs = null; plays.forEach(p => { if (p.score != null && (!bs || p.score > bs.score)) bs = p; });
    const box = (t, lb) => {
      const v = r ? r[t] : null, tg = tOf(t, i), lt = t !== 'good';
      const m = v == null || tg == null ? null : lt ? tg - v : v - tg;
      return `<div class="dib j${t}"><span class="dil">${lb}</span><b>${v == null ? '—' : v}</b>
        ${tg == null ? '<i></i>' : `<i>目標 ${tg}${m == null ? '' : m >= 0 ? ` <em class="ok">＋${m}</em>` : ` <em class="ng">あと${-m}</em>`}</i>`}</div>`;
    };
    return `<div class="dis t${i + 1}">
      <div class="dih"><span class="dino">${i + 1}曲目</span>${s ? cicon(s.course) : ''}<span class="dint">${esc(s ? s.title : '—')}</span>
        <span class="dime"><span class="dist">★${s && s.level != null ? s.level : '—'}</span><span class="dinn">${s && s.maxCombo ? s.maxCombo + 'ノーツ' : ''}</span></span></div>
      <div class="dir">${box('good', '良')}${box('ok', '可')}${box('bad', '不可')}
        <div class="dib dibest"><span class="dil">ベスト<small>（プレイ ${plays.length.toLocaleString()}回）</small></span><b>${bs ? crownHtml(crownOf(bs, s)) + bs.score : '—'}</b><i></i></div></div>
    </div>`;
  }).join('');
  // 右：理論値のゲージをまとめて、その下に段位内ベストのゲージをまとめる
  const gs = (list, key) => list.map((c, k) => c ? `<div class="dgw"><div class="dg" data-g="${key}${k}"></div></div>` : '').join('');
  const conds = I.th.length ? `<div class="dic"><div class="dict th">理論値<small>各曲の最高値の組み合わせ</small></div>${gs(I.th, 'th')}</div>
      ${I.be.length ? `<div class="dic"><div class="dict be">段位内ベスト<small>挑戦1回での最高</small></div>${gs(I.be, 'be')}</div>` : ''}` : '';
  // 挑戦回数は左に固定、その右に到達の流れ
  const [f0, ...fr] = I.fRows;
  const fun = `<span class="dif dif0"><small>${f0[0]}</small><b>${f0[1].toLocaleString()}</b>回</span>`
    + fr.map(([nm, n], k) => `${k ? '<span class="difa">›</span>' : ''}<span class="dif"><small>${nm}</small><b>${n.toLocaleString()}</b>回</span>`).join('');
  const who = db.player.id ? `<div class="dipn">${esc(db.player.name || db.player.id)}</div><div class="dipi">@${esc(db.player.id)}</div>` : '';
  return `<img class="dibg" src="img/bg/dan_${dimgBg(d)}.webp" alt="">
    <div class="diplate wood ${danClass(d.rank)}"><span class="wt">${esc(d.name)}</span><span class="dipv">${esc(d.version)}</span>
      <div class="dipm">${who}</div>
      <div class="dipt">目標：</div>
      <div class="dipe">${danEmblemSvg(type.res, type.frame, 190)}</div></div>
    <div class="disub">良・可・不可＝曲別理論値（${esc(TH_SRC[danSt.thSrc])}）　ベスト＝曲別ベストスコア</div>
    <div class="disongs">${songs}</div>
    <div class="diconds">${conds || '<div class="dinone">魂ゲージ以外の条件がない段位です</div>'}</div>
    <div class="difun">${I.recs.length ? fun : '<span class="dif dif0"><small>挑戦</small><b>0</b>回</span><span class="dif">まだ挑戦の記録がありません</span>'}<span class="dicr"><b>${(n => `${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()}`)(new Date())} 時点</b>太鼓スコア記録</span></div>`;
}

function openDanImg(I) {
  let type = dimgAutoType(I);
  let font = 'brush';
  try { const v = localStorage.getItem('taikoScore.dimgFont'); if (DIMG_FONTS[v] && v !== 'user') font = v; } catch (e) { /* 使えなくても標準で表示 */ }
  if (font === 'brush' && dimgUserFont) font = 'user';
  const ov = document.createElement('div');
  ov.className = 'dimg-ov';
  ov.innerHTML = `<div class="dimg-bar"><label>目標 <select id="dimgT">${DIMG_TYPES.map(([r, f]) => `<option value="${r}|${f}"${r === type.res && f === type.frame ? ' selected' : ''}>${dimgLabel({ res: r, frame: f })}</option>`).join('')}</select></label>
    <label>文字 <select id="dimgF">${dimgFontOpts(font)}</select></label>
    <input type="file" id="dimgFile" accept=".ttf,.otf,.woff,.woff2,font/*" hidden>
    <span class="muted" style="font-size:12px">試作：保存・共有はこれから</span><button class="btn sub small" id="dimgX">閉じる</button></div>
    <div class="dimg-fit"><div class="dimg" id="dimgStage"></div></div>`;
  document.body.appendChild(ov);
  const draw = () => {
    const st = ov.querySelector('#dimgStage');
    st.innerHTML = dimgStageHtml(I, type);
    const F = DIMG_FONTS[font]; dimgLoadGF(font); if (font === 'brush') dimgLoadGF('brush');
    st.style.setProperty('--dimg-font', F.css); st.style.setProperty('--dimg-fw', F.fw);
    st.querySelectorAll('[data-g]').forEach(el => { const k = el.dataset.g, cfg = (k[0] === 't' ? I.th : I.be)[+k.slice(2)]; new DgGauge(el).set(cfg); });
    fit();
    // 長い曲名は文字を小さくして1行に収める
    const fitTitles = () => st.querySelectorAll('.dint').forEach(el => { let fs = 48; el.style.fontSize = ''; while (el.scrollWidth > el.clientWidth + 1 && fs > 26) { fs -= 2; el.style.fontSize = fs + 'px'; } });
    fitTitles();
    if (document.fonts) {
      const fams = F.css.split(',').map(x => x.trim()).filter(x => !/^(serif|sans-serif|system-ui)$/.test(x));
      Promise.all(fams.map(f => document.fonts.load(`${F.fw} 48px ${f}`, st.textContent).catch(() => {}))).then(fitTitles);
    }
  };
  const fit = () => {
    const box = ov.querySelector('.dimg-fit'), st = ov.querySelector('#dimgStage');
    const s = Math.min(box.clientWidth / 1920, box.clientHeight / 1080);
    st.style.transform = `scale(${s})`; st.parentElement.style.setProperty('--dw', 1920 * s + 'px'); st.parentElement.style.setProperty('--dh', 1080 * s + 'px');
  };
  ov.querySelector('#dimgT').onchange = e => { const [r, f] = e.target.value.split('|'); type = { res: r, frame: f }; draw(); };
  const fsel = ov.querySelector('#dimgF'), ffile = ov.querySelector('#dimgFile');
  fsel.onchange = () => {
    if (fsel.value === 'pick') { fsel.value = font; ffile.click(); return; }
    font = fsel.value;
    try { localStorage.setItem('taikoScore.dimgFont', font); } catch (e) { /* 保存できなくても続ける */ }
    draw();
  };
  // フォントファイルはこの端末の中だけで使い、どこにも送らない
  ffile.onchange = async () => {
    const f = ffile.files[0]; ffile.value = '';
    if (!f) return;
    try {
      const face = new FontFace('DimgUser', await f.arrayBuffer());
      await face.load();
      [...document.fonts].filter(x => x.family.replace(/["']/g, '') === 'DimgUser').forEach(x => document.fonts.delete(x));
      document.fonts.add(face);
      dimgUserFont = f.name.replace(/\.[^.]+$/, '');
      font = 'user';
      fsel.innerHTML = dimgFontOpts('user');
      draw();
    } catch (e) { toast('このファイルはフォントとして読み込めませんでした'); }
  };
  ov.querySelector('#dimgX').onclick = () => { ov.remove(); window.removeEventListener('resize', fit); };
  window.addEventListener('resize', fit);
  draw();
}
