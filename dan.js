/* 太鼓スコア記録：段位道場（お題の判定・段位プレート・合格エンブレム・魂ゲージ）
   プレイヤー画面（index.html）と管理者画面（admin.html）の両方で使う。common.js の後に読み込む */
'use strict';
const DAN_NAMES = ['五級', '四級', '三級', '二級', '一級', '初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '十段', '玄人', '名人', '超人', '達人'];
/** プレートの色の区分（五級〜一級：黄、初段〜五段：青、六段〜十段：赤、玄人〜超人：銀、達人：金） */
const danClass = rank => rank < 5 ? 'kyu' : rank < 10 ? 'low' : rank < 15 ? 'high' : rank < 18 ? 'silver' : 'gold';
const DAN_COND = { good: '良の数', ok: '可の数', bad: '不可の数', roll: '連打数', score: 'スコア', combo: '最大コンボ数', hit: 'たたけた数' };
const DAN_COND_ORDER = ['good', 'ok', 'bad', 'roll', 'score', 'combo', 'hit'];
const DAN_OP = { ge: '以上', lt: '未満' };
const DAN_RES = { red: '合格', gold: '金合格', fail: '不合格' };
const DAN_FRAME = { silver: '銀枠', gold: '金枠', rainbow: '虹枠' };
const DAN_PHOTOS = 4;
const danLabel = (res, frame) => !res ? '未挑戦' : res === 'fail' ? '不合格' : (DAN_FRAME[frame] || '') + DAN_RES[res];
/** 記録としての優先度：不合格0 < 銀枠赤1 < 金枠赤2 < 虹枠赤3 < 銀枠金4 < 金枠金5 < 虹枠金6 */
const danPrio = (res, frame) => res === 'red' || res === 'gold' ? (res === 'gold' ? 3 : 0) + ({ silver: 1, gold: 2, rainbow: 3 }[frame] || 1) : 0;
/** 段位道場の数字は本家にならって区切り（,）を付けない */
const dn = v => v == null ? '—' : String(v);

/* ---------- 判定 ---------- */
/** 1曲の最大コンボ：入力があればそれ、無ければ不可0なら譜面のコンボ数 */
function danTrackCombo(t, chart) {
  if (!t) return null;
  if (t.combo != null) return t.combo;
  return t.bad === 0 && chart && chart.maxCombo ? chart.maxCombo : null;
}
function danTrackVal(t, type, chart) {
  if (!t) return null;
  if (type === 'hit') return t.good + t.ok + t.roll;
  if (type === 'combo') return danTrackCombo(t, chart);
  if (type === 'score') return t.score == null ? null : t.score;
  return t[type] ?? null;
}
/** 何曲目まで演奏したか（1曲目から続けて入力がある曲数） */
function danPlayed(rec) { let n = 0; while (n < 3 && rec.tracks && rec.tracks[n]) n++; return n; }
/**
 * 挑戦記録をお題に当てはめて判定する
 *  返り値 { played, soul, conds:[{ c, per, vals|total, pass:{red,gold}, margin:{red,gold}, failAt }], result, frame, failAt, missing }
 *  failAt：達成失敗が確定した曲（0始まり）。可・不可などの「未満」や曲別の条件は途中で確定する
 */
function danEval(dan, rec, charts) {
  const tracks = [0, 1, 2].map(i => (rec.tracks && rec.tracks[i]) || null);
  const played = danPlayed(rec), done = played === 3;
  const out = { played, soul: null, conds: [], result: 'fail', frame: null, failAt: null, missing: false };
  const need = (c, lv) => c[lv] != null ? c[lv] : c.red;
  if (dan.soulRed != null) {
    const v = rec.soul == null ? null : rec.soul, g = dan.soulGold != null ? dan.soulGold : dan.soulRed;
    out.soul = { v, need: { red: dan.soulRed, gold: g }, pass: { red: done && v != null && v >= dan.soulRed, gold: done && v != null && v >= g } };
    if (done && v == null) out.missing = true;
  }
  (dan.conds || []).forEach(c => {
    const per = c.scope === 'per', ge = c.op !== 'lt';
    const ok = (v, n) => v != null && n != null && (ge ? v >= n : v < n);
    const mg = (v, n) => v == null || n == null ? null : ge ? v - n : n - 1 - v; // 0以上なら達成（余裕）、負なら不足
    const e = { c, per, pass: {}, margin: {}, failAt: null };
    if (per) {
      e.vals = tracks.map((t, i) => i < played ? danTrackVal(t, c.type, charts[i]) : null);
      if (e.vals.some((v, i) => i < played && v == null)) out.missing = true;
      ['red', 'gold'].forEach(lv => {
        const n = need(c, lv) || [];
        e.pass[lv] = done && e.vals.every((v, i) => ok(v, n[i]));
        e.margin[lv] = e.vals.map((v, i) => mg(v, n[i]));
      });
      const n = c.red || [];
      for (let i = 0; i < played; i++) if (e.vals[i] != null && !ok(e.vals[i], n[i])) { e.failAt = i; break; }
    } else {
      let total = null;
      if (c.type === 'combo') {
        if (rec.combo != null) total = rec.combo;
        else if (done && tracks.every(t => t.bad === 0) && charts.every(ch => ch && ch.maxCombo)) total = charts.reduce((a, ch) => a + ch.maxCombo, 0);
      } else {
        const vs = tracks.slice(0, played).map((t, i) => danTrackVal(t, c.type, charts[i]));
        total = vs.length && vs.every(v => v != null) ? vs.reduce((a, v) => a + v, 0) : null;
      }
      if (total == null && played) out.missing = true;
      e.total = total;
      ['red', 'gold'].forEach(lv => { e.pass[lv] = done && ok(total, need(c, lv)); e.margin[lv] = mg(total, need(c, lv)); });
      // 「未満」の3曲合計は、途中で超えた時点で達成失敗
      if (!ge && c.type !== 'combo') {
        let cum = 0;
        for (let i = 0; i < played; i++) { const v = danTrackVal(tracks[i], c.type, charts[i]); if (v == null) break; cum += v; if (cum >= c.red) { e.failAt = i; break; } }
      }
    }
    out.conds.push(e);
  });
  const all = lv => (!out.soul || out.soul.pass[lv]) && out.conds.every(e => e.pass[lv]);
  if (done) out.result = all('gold') ? 'gold' : all('red') ? 'red' : 'fail';
  if (out.result !== 'fail') out.frame = tracks.every(t => t.bad === 0) ? (tracks.every(t => t.ok === 0) ? 'rainbow' : 'gold') : 'silver';
  const fa = out.conds.map(e => e.failAt).filter(x => x != null);
  out.failAt = fa.length ? Math.min(...fa) : null;
  return out;
}
/** 挑戦記録のうち最も良いもの（合否・枠の優先度 → 3曲合計スコア → 新しい順） */
function danBest(recs) {
  const sc = r => (r.tracks || []).reduce((a, t) => a + (t && t.score || 0), 0);
  return recs.slice().sort((a, b) => danPrio(b.result, b.frame) - danPrio(a.result, a.frame) || sc(b) - sc(a) || ts(b.playedAt) - ts(a.playedAt))[0] || null;
}
const danTotalScore = r => (r.tracks || []).reduce((a, t) => a + (t && t.score || 0), 0);

/* ---------- 段位プレート（木目の板。文字は Yuji Syuku から段位名の文字だけを収めたフォント） ---------- */
const danPlate = (rank, lg) => `<span class="wood ${danClass(rank)}${lg ? ' lg' : ''}" role="img" aria-label="${DAN_NAMES[rank]}"><span class="wt">${DAN_NAMES[rank]}</span></span>`;

/* ---------- 合格エンブレム（筆で描いた丸＝枠の種類、中の「合格」の色＝赤合格・金合格） ---------- */
// 「不」「合」「格」の字形：Yuji Syuku（SIL Open Font License）から取り出した輪郭。フォントの読み込み不要
const DAN_GLYPH = {"合": "M983 225Q973 230 952.5 225.5Q932 221 920 210Q897 212 873.5 220.0Q850 228 833.0 244.0Q816 260 812 286H802Q747 389 675.5 492.0Q604 595 538 695Q500 676 471.0 644.0Q442 612 418.0 576.0Q394 540 370.5 505.5Q347 471 318 446Q378 439 443.0 447.5Q508 456 572 479Q593 471 619.0 466.0Q645 461 664.5 451.0Q684 441 684 416Q661 406 633.5 405.0Q606 404 582.0 403.5Q558 403 545 394Q524 398 500.0 395.5Q476 393 451 389Q409 383 368.5 383.0Q328 383 301 413Q280 403 266.0 384.0Q252 365 238.5 346.0Q225 327 204 316Q206 308 202.0 302.0Q198 296 192 291Q186 286 181.0 280.0Q176 274 176 264Q146 243 128.0 224.0Q110 205 79 185Q68 189 59.5 189.5Q51 190 43 189Q32 189 23.0 191.0Q14 193 3 208Q39 231 65.0 258.0Q91 285 116.0 318.0Q141 351 172 390Q190 413 212.5 433.0Q235 453 252 476Q260 487 265.5 501.0Q271 515 280 528Q288 540 299.0 550.0Q310 560 318 572Q342 607 361.0 643.0Q380 679 398 713Q403 722 411.0 731.0Q419 740 419 747Q419 768 404.5 772.5Q390 777 378 780Q387 801 407.0 808.0Q427 815 450.0 812.0Q473 809 494.0 801.5Q515 794 527 787Q526 778 531.0 771.0Q536 764 543 757Q549 751 554.5 744.0Q560 737 562 728Q615 672 665.0 614.0Q715 556 767 498Q782 490 791.5 479.5Q801 469 812.0 461.0Q823 453 840 450Q857 424 876.0 409.5Q895 395 917.0 381.0Q939 367 962 344Q964 341 966.0 337.5Q968 334 971 330Q981 314 990.0 296.5Q999 279 999.0 261.0Q999 243 983 225ZM785 234Q785 220 775.0 217.0Q765 214 753 212Q752 199 740.0 193.5Q728 188 711 183Q701 135 691.0 87.5Q681 40 670 -7Q671 -12 674.0 -15.5Q677 -19 680 -22Q685 -25 688.5 -30.0Q692 -35 691 -44Q631 -46 552.5 -46.5Q474 -47 395 -55Q390 -59 388.5 -66.0Q387 -73 385 -81Q348 -85 330.5 -66.0Q313 -47 301 -27Q299 -22 296.5 -18.0Q294 -14 291 -10Q302 33 306.5 80.5Q311 128 298 171Q293 189 277.5 203.5Q262 218 246.0 232.0Q230 246 221 260Q222 264 229 265Q233 265 236.5 266.5Q240 268 242 275Q247 276 251 271Q253 270 255.5 268.5Q258 267 263 268Q319 283 367.0 289.0Q415 295 465.0 296.5Q515 298 576 298Q603 315 633.0 314.5Q663 314 691.5 302.0Q720 290 744.5 271.5Q769 253 785 234ZM600 246Q533 246 476.0 238.5Q419 231 357 223Q362 190 363.5 149.0Q365 108 368.0 70.5Q371 33 378 8Q430 5 477.0 8.0Q524 11 579 16Q593 64 600.0 126.0Q607 188 600 246Z", "格": "M998 193Q972 167 937.5 164.5Q903 162 868.5 175.0Q834 188 807 207Q799 185 796.5 154.0Q794 123 791.0 92.5Q788 62 778 41Q784 33 793.0 29.5Q802 26 810.0 21.5Q818 17 819 5Q798 -2 768.0 -6.5Q738 -11 703 -14Q690 -15 675.5 -15.0Q661 -15 647 -14Q611 -13 579.0 -16.0Q547 -19 532 -42Q501 -32 480.5 -11.0Q460 10 448 41Q457 59 457.5 85.0Q458 111 456 140Q456 154 455.5 169.0Q455 184 455 199Q446 201 440.5 196.5Q435 192 431 187Q427 183 423.0 179.0Q419 175 413 175Q406 149 382.5 147.0Q359 145 332 148Q322 149 312.5 149.5Q303 150 294 150Q292 128 294.0 106.5Q296 85 298 65Q302 26 301.0 -8.5Q300 -43 274 -71Q232 -60 204.0 -39.0Q176 -18 153.5 7.5Q131 33 103 56Q102 79 87.5 93.0Q73 107 61 117Q54 113 46.0 116.5Q38 120 29 124Q23 128 16.5 131.0Q10 134 3 135Q11 147 26.0 166.5Q41 186 58.5 207.5Q76 229 92.0 248.0Q108 267 118 279Q131 301 148.0 322.0Q165 343 184.5 370.0Q204 397 223 436Q201 429 183.5 427.0Q166 425 152 407Q133 409 121.0 419.5Q109 430 98.5 442.0Q88 454 71 458Q80 467 77.0 474.0Q74 481 68 488Q62 496 58.5 504.0Q55 512 61 523Q65 522 69.5 520.5Q74 519 79 518Q116 508 157.0 503.0Q198 498 236 523Q238 561 235.0 593.0Q232 625 228 651Q226 662 225.0 671.5Q224 681 223 690Q212 705 199.0 732.5Q186 760 190 791Q203 787 222.5 781.0Q242 775 259.0 764.0Q276 753 281 733Q297 735 302.5 726.0Q308 717 312 707Q314 701 316.5 695.5Q319 690 323 686Q313 662 312.0 628.0Q311 594 307 556Q318 545 332.5 538.5Q347 532 360.0 523.5Q373 515 378 498Q372 482 359.0 479.5Q346 477 332.0 475.5Q318 474 307 462Q319 439 335.5 420.5Q352 402 369.0 384.0Q386 366 397 342Q397 337 396.0 332.5Q395 328 393 324Q392 318 390.5 311.0Q389 304 390 295Q366 297 351.0 309.0Q336 321 324.0 336.5Q312 352 297 364Q293 350 292.5 333.0Q292 316 293 297Q293 290 293.5 282.0Q294 274 294 266Q294 238 293.5 207.5Q293 177 293 159Q320 163 342.5 182.5Q365 202 387.0 227.0Q409 252 432 270Q446 286 467.5 313.0Q489 340 512.5 371.5Q536 403 555.5 433.0Q575 463 584 485Q568 501 552.0 522.0Q536 543 516 559Q499 535 472.5 517.0Q446 499 419.5 487.0Q393 475 374 469Q411 516 441.5 569.0Q472 622 500 679Q497 685 491.5 690.0Q486 695 481 700Q471 708 463.5 717.5Q456 727 458 740Q585 731 691 748Q697 750 701.0 762.0Q705 774 710 777Q742 774 763.0 762.0Q784 750 802.0 733.0Q820 716 842 697Q842 692 838 687Q837 685 835.5 682.0Q834 679 836 672Q809 679 796.5 669.0Q784 659 774 647Q768 639 761.5 631.5Q755 624 745 621Q729 587 706.0 553.0Q683 519 668 483Q704 434 754.0 402.5Q804 371 859.0 344.5Q914 318 963 284Q971 261 983.0 241.5Q995 222 998 193ZM714 243Q691 246 656.0 243.5Q621 241 584.0 236.0Q547 231 517 225Q521 191 521.5 166.5Q522 142 522 119Q521 102 521.0 84.5Q521 67 523 45Q544 38 571.5 39.5Q599 41 629 44Q646 46 663.5 47.5Q681 49 697 49Q706 75 710.0 110.5Q714 146 715.0 182.0Q716 218 714 243ZM228 318Q193 265 152.0 217.5Q111 170 70 123Q108 104 140.0 78.5Q172 53 216 41Q226 73 229.5 121.0Q233 169 232.5 221.0Q232 273 228 318ZM684 690Q653 696 621.0 690.0Q589 684 581 676Q567 657 554.0 632.5Q541 608 529 585Q549 575 572.0 560.0Q595 545 610 535Q620 553 635.0 578.5Q650 604 664.0 633.0Q678 662 684 690ZM716 309Q703 347 679.0 371.5Q655 396 632 422Q613 391 587.0 353.5Q561 316 535 289Q563 294 596.5 296.0Q630 298 662.0 300.5Q694 303 716 309Z", "不": "M911 634Q891 622 871.5 618.0Q852 614 832 615Q820 615 808.0 617.0Q796 619 783 621Q757 625 729.0 627.5Q701 630 668 624Q666 620 665.5 614.0Q665 608 665 603Q665 592 664 589Q661 584 652.5 574.0Q644 564 637 558Q636 557 630 558Q625 558 623 557Q619 554 605.5 538.0Q592 522 576.5 502.0Q561 482 548.5 465.5Q536 449 534 444Q531 438 528.5 438.0Q526 438 524 439Q521 441 520 437Q519 434 520.5 428.5Q522 423 525 416Q527 410 529.0 403.0Q531 396 531 391Q531 361 530.5 333.0Q530 305 529 279Q527 238 526.5 197.5Q526 157 529 111Q529 106 529.5 101.5Q530 97 530 92Q534 42 533.5 0.5Q533 -41 517 -65Q501 -68 489.5 -64.0Q478 -60 469 -51Q453 -35 444.0 -11.5Q435 12 429 25Q428 28 431 32Q432 34 432 36Q432 45 438.5 47.5Q445 50 450 54Q457 104 457.0 159.0Q457 214 453.0 265.5Q449 317 444 354Q433 353 423.0 336.5Q413 320 400 312Q399 311 393 312Q388 313 386 312Q384 310 384.5 303.0Q385 296 383 294Q381 292 377 294Q373 297 369 294Q366 292 365.0 285.5Q364 279 362 276Q357 270 346.5 263.0Q336 256 327 247Q325 245 320 240Q311 231 299.5 220.0Q288 209 276.0 202.5Q264 196 255 201Q251 197 254 192Q257 187 255 183Q249 184 242.0 184.0Q235 184 234 179Q233 176 238 175Q244 174 245 172Q231 161 215.5 156.0Q200 151 189 133Q185 134 185.5 137.0Q186 140 186 140Q184 139 180 136Q150 117 123.5 107.5Q97 98 51 111Q56 125 69.5 129.5Q83 134 89 132Q177 200 264.5 279.0Q352 358 426 442Q422 464 399.0 490.0Q376 516 349.0 546.0Q322 576 307 608Q274 597 245.5 592.5Q217 588 197 564Q180 568 171.5 578.0Q163 588 155.5 597.5Q148 607 133 610Q135 619 130.5 625.5Q126 632 120 638Q112 645 106.5 654.5Q101 664 109 680Q131 676 143.5 673.0Q156 670 172 663Q256 677 348.0 681.0Q440 685 533.5 687.0Q627 689 712 696Q723 702 724.0 707.0Q725 712 729 721Q765 713 802.0 705.0Q839 697 868.5 681.5Q898 666 911 634ZM907 114Q900 111 897.0 105.0Q894 99 887 96Q857 104 838.0 124.0Q819 144 802.0 166.0Q785 188 761 202Q736 247 695.5 284.0Q655 321 611.0 356.0Q567 391 531 430L533 435Q591 425 642.5 401.0Q694 377 743.5 349.0Q793 321 844 298Q855 270 869.5 244.5Q884 219 895.5 188.5Q907 158 907 114ZM557 623Q520 621 478.0 620.0Q436 619 398.0 616.0Q360 613 335 604Q376 585 411.0 561.0Q446 537 482 514Q491 535 507.5 552.5Q524 570 539.0 587.0Q554 604 557 623Z"};
function danRng(seed) { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; }
/** 筆の丸：入り（少し太く押す）→ 太さの揺れ → 払い（細くなって途切れる） */
function danBrush(cx, cy, r, w, seed) {
  const rnd = danRng(seed), N = 120, a0 = -2.05, sweep = 5.85, out = [], inn = [];
  let drift = 0;
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = a0 + sweep * u;
    drift += (rnd() - 0.5) * 0.18; drift *= 0.92;
    let th = w * (0.82 + 0.28 * Math.sin(u * 5.2 + 0.6) * 0.5 + 0.18 * Math.sin(u * 2.1));
    if (u < 0.05) th *= 0.75 + u / 0.05 * 0.35;
    if (u > 0.78) th *= Math.max(0.06, 1 - (u - 0.78) / 0.22 * 0.94);
    const rr = r + drift + (u > 0.78 ? (u - 0.78) * 9 : 0);
    out.push([cx + (rr + th / 2) * Math.cos(a), cy + (rr + th / 2) * Math.sin(a)]);
    inn.push([cx + (rr - th / 2) * Math.cos(a), cy + (rr - th / 2) * Math.sin(a)]);
  }
  const f = p => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  return { out, inn, d: 'M' + out.concat(inn.slice().reverse()).map(f).join('L') + 'Z', f };
}
function danKasure(cx, cy, r, w, seed) {
  const rnd = danRng(seed + 7); let d = '';
  for (let k = 0; k < 6; k++) {
    const off = (rnd() - 0.5) * w * 0.55, a1 = 1.6 + rnd() * 1.6, a2 = a1 + 0.25 + rnd() * 0.7, rr = r + off;
    const P = a => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
    d += `<path d="M${P(a1)} A${rr} ${rr} 0 0 1 ${P(a2)}" stroke="#fffaf0" stroke-width="${(0.35 + rnd() * 0.55).toFixed(2)}" stroke-linecap="round" fill="none" opacity="${(0.45 + rnd() * 0.4).toFixed(2)}"/>`;
  }
  return d;
}
const DAN_RING = {
  silver: [['0', '#6c747b'], ['.35', '#c9cfd4'], ['.5', '#f4f6f7'], ['.68', '#9aa2a9'], ['1', '#5f676e']],
  gold: [['0', '#8a5f00'], ['.3', '#d9a521'], ['.5', '#ffe58a'], ['.7', '#c08a10'], ['1', '#7a5200']] };
const danEmbCache = new Map();
function danEmblemSvg(res, frame, px) {
  const key = res + frame + px;
  if (danEmbCache.has(key)) return danEmbCache.get(key);
  const id = 'demb-' + key, seed = { silver: 11, gold: 23, rainbow: 37 }[frame] || 11;
  const stops = st => st.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  const fill = res === 'gold' ? `url(#${id}t)` : '#ff0000';
  const S = 0.054, ch = (c, x, y) => `<g transform="translate(${(x - 500 * S).toFixed(2)} ${(y + 380 * S).toFixed(2)}) scale(${S} ${-S})">
    <path d="${DAN_GLYPH[c]}" fill="none" stroke="#111" stroke-width="150" stroke-linejoin="round"/>
    <path d="${DAN_GLYPH[c]}" fill="${fill}" stroke="${fill}" stroke-width="34" stroke-linejoin="round"/></g>`;
  const b = danBrush(50, 50, 40, 13, seed);
  let ring;
  if (frame === 'rainbow') {
    // 虹枠：描き始め（赤）から払い（紫）へ、筆の流れに沿って色を進める
    const n = b.out.length - 1; let seg = '';
    for (let i = 0; i < n; i++) { const j = Math.min(n, i + 2); seg += `<path d="M${b.f(b.out[i])}L${b.f(b.out[j])}L${b.f(b.inn[j])}L${b.f(b.inn[i])}Z" fill="hsl(${Math.round(i / n * 285)} 92% 54%)"/>`; }
    ring = `<path d="${b.d}" fill="#fff" stroke="#111" stroke-width="5" stroke-linejoin="round"/>${seg}<path d="${b.d}" fill="url(#${id}s)" opacity=".35"/>`;
  } else ring = `<path d="${b.d}" fill="url(#${id}r)" stroke="#111" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>`;
  const svg = `<svg class="embsvg" viewBox="-5 -5 110 110" width="${px}" height="${px}" role="img" aria-label="${danLabel(res, frame)}">
    <defs><linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1">${stops(DAN_RING[frame] || DAN_RING.silver)}</linearGradient>
      <linearGradient id="${id}t" x1="0" y1="0" x2="0.35" y2="1">${stops([['0', '#fff6c4'], ['.42', '#f7c831'], ['.55', '#c88a00'], ['.8', '#f1b81f'], ['1', '#ffe78f']])}</linearGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <radialGradient id="${id}p" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#efe5d3"/></radialGradient></defs>
    <circle cx="50" cy="50" r="38" fill="url(#${id}p)"/><circle cx="50" cy="50" r="30" fill="none" stroke="#dccfb8" stroke-width="1"/>
    ${ring}${danKasure(50, 50, 40, 13, seed)}${ch('合', 35, 35)}${ch('格', 65, 66)}</svg>`;
  danEmbCache.set(key, svg);
  return svg;
}
/* ---------- 不合格のアイコン：皿と丸はなし。3文字を崩して並べ（「不」105%・「合」102%）、アクアブルーの文字＋黒と白の縁取り＋黒い影 ---------- */
function danFailSvg(px) {
  const key = 'fail' + px;
  if (danEmbCache.has(key)) return danEmbCache.get(key);
  const color = '#14a8ff', base = 0.042;
  const L = [['不', 22, 37, -9, 1.05], ['合', 50, 62, 7, 1.02], ['格', 80, 46, -4, 1.0]];
  const layer = (fill, w) => d => `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${w}" stroke-linejoin="round"/>`;
  const all = mk => L.map(([c, x, y, rot, k]) => { const S = base * k;
    return `<g transform="translate(${x} ${y}) rotate(${rot}) translate(${(-470 * S).toFixed(2)} ${(370 * S).toFixed(2)}) scale(${S.toFixed(4)} ${(-S).toFixed(4)})">${mk(DAN_GLYPH[c])}</g>`; }).join('');
  const svg = `<svg class="embsvg" viewBox="-4 -4 108 108" width="${px}" height="${px}" role="img" aria-label="不合格" style="overflow:visible">
    <g transform="translate(1.8 2.4)" opacity=".5">${all(layer('#000', 300))}</g>${all(layer('#fff', 300))}${all(layer('#111', 170))}${all(layer(color, 30))}</svg>`;
  danEmbCache.set(key, svg);
  return svg;
}
/** 結果の表示：合格・金合格・不合格はアイコン。未挑戦は何も出さない（場所だけ空けて並びをそろえる） */
function danEmblem(res, frame, lg) {
  const px = lg ? 80 : 40;
  if (!res) return `<span class="embw empty" style="width:${px}px;height:${px}px" aria-hidden="true"></span>`;
  if (res === 'fail') return `<span class="embw fail${lg ? ' lg' : ''}" title="不合格">${danFailSvg(px)}</span>`;
  return `<span class="embw${lg ? ' lg' : ''}" title="${danLabel(res, frame)}">${danEmblemSvg(res, frame, lg ? 80 : 40)}</span>`;
}
/* ---------- 魂ゲージ（赤＝必要な量、黄＝残り、四角＝条件の位置。100%は全体を赤にして「魂」を光らせる） ---------- */
function danGauge(v) {
  if (v == null) return '';
  return v >= 100
    ? `<div class="gauge"><div class="gtrack"><div class="gfill" style="width:100%"></div></div><span class="gsoul on">魂</span></div>`
    : `<div class="gauge"><div class="gtrack"><div class="gfill" style="width:${v}%"></div><span class="gmark" style="left:${v}%"></span></div><span class="gsoul">魂</span></div>`;
}
/** お題の開いた欄（課題曲・合格条件）。mode は 'red' か 'gold' */
function danBodyHtml(dan, charts, mode, opts) {
  opts = opts || {};
  const notes = charts.every(c => c && c.maxCombo) ? charts.reduce((a, c) => a + c.maxCombo, 0) : null;
  const soul = mode === 'gold' && dan.soulGold != null ? dan.soulGold : dan.soulRed;
  const val = (c, lv) => c[lv] != null ? c[lv] : c.red;
  return `<div class="dbody2${mode === 'gold' ? ' gmode' : ''}">${opts.noTracks ? '' : `
    <div class="dsec"><h3>課題曲</h3><span class="dsub">ノーツ数 <b>${dn(notes)}</b></span></div>
    <div class="dtracks">${charts.map((s, i) => `<div class="dtr t${i + 1}"${s && opts.chartLink ? ` data-chart="${esc(s.id)}"` : ''}><div class="dl"><div class="tno">${i + 1}曲目</div>
      <div class="tt">${s ? cicon(s.course) + `<span>${esc(s.title)}</span>` : '<span class="muted">（楽曲が見つかりません）</span>'}</div></div>
      <div class="dr"><div>${s ? '★' + s.level : ''}</div><div>${s ? dn(s.maxCombo) : ''}</div></div></div>`).join('')}</div>`}
    <div class="dsec"><h3>合格条件</h3><div class="seg2" role="group"><button type="button" data-dmode="red" class="${mode === 'red' ? 'on red' : ''}">赤合格</button><button type="button" data-dmode="gold" class="${mode === 'gold' ? 'on gold' : ''}">金合格</button></div></div>
    <div class="dconds">
      ${soul != null ? `<div class="dq soul"><div class="dk">魂ゲージ</div><div class="dv"><b>${soul}%</b><small>以上</small></div>${danGauge(soul)}</div>` : ''}
      ${(dan.conds || []).map(c => c.scope !== 'per'
        ? `<div class="dq"><div class="dk">${DAN_COND[c.type]}<span class="dsc">3曲合計</span></div>
          <div class="cbar"><b>${dn(val(c, mode))}</b><small>${DAN_OP[c.op]}</small></div></div>`
        : `<div class="dq per"><div class="dk">${DAN_COND[c.type]}</div>
          <div class="c3">${[0, 1, 2].map(i => `<div class="t${i + 1}"><span>${i + 1}曲目</span><b>${dn((val(c, mode) || [])[i])}</b><small>${DAN_OP[c.op]}</small></div>`).join('')}</div></div>`).join('')}
    </div>${opts.after || ''}</div>`;
}
/** 条件の文字表記（例：「可の数 15未満（3曲合計）」「連打数 49/35/34以上（曲別）」） */
function danCondText(c, lv) {
  const v = c[lv] != null ? c[lv] : c.red;
  return `${DAN_COND[c.type]} ${Array.isArray(v) ? v.map(dn).join('/') : dn(v)}${DAN_OP[c.op]}（${c.scope === 'per' ? '曲別' : '3曲合計'}）`;
}
