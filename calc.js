/* Fitko – výpočty objemu a návrh progresie (spoločné pre apku aj trénerov portál).
 * Čisté funkcie bez DOM: v prehliadači ako window.FitkoCalc, v Node cez require (testy).
 * Pravidlá: specs/002-next-week-suggestions/spec.md */
(function (root) {
  'use strict';

  const NUM = '\\d+(?:[.,]\\d+)?';
  const toNum = (s) => parseFloat(String(s).replace(',', '.'));
  const round2 = (n) => Math.round(n * 100) / 100;

  // ---------------------------------------------------------------------------
  // Parsovanie
  // ---------------------------------------------------------------------------
  const splitParts = (name) => String(name || '').split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean);

  // Hodnoty supersetu „2x8 a 2x9“ -> ['2x8', '2x9']. Jedna hodnota pri sériách/RPE platí
  // pre všetky časti (fill), pri váhe len pre prvú (ako graf v apke).
  function splitValues(str, n, fill) {
    const s = String(str || '').trim();
    if (n <= 1) return [s];
    const parts = s ? s.split(/\s+a\s+/i).map((p) => p.trim()) : [];
    if (parts.length <= 1) return Array.from({ length: n }, (_, i) => (i === 0 || fill ? parts[0] || '' : ''));
    return Array.from({ length: n }, (_, i) => parts[i] || '');
  }

  /*
   * Série -> { sets: [{ min, max }], extra } | { ok: true } | null
   * „2x10“, „2 × 10“, „3x8-10“, „10, 9, 8“, „10/9/8“, „2x10 + 1x8“, „1x20 BOTH“
   */
  function parseSets(str) {
    const s = String(str || '').trim();
    if (!s) return null;
    if (/^ok\.?$/i.test(s)) return { ok: true };
    const sets = [];
    let rest = s.replace(/(\d+)\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi, (_, n, a, b) => {
      const min = +a, max = b ? +b : +a;
      for (let i = 0; i < +n; i++) sets.push({ min: Math.min(min, max), max: Math.max(min, max) });
      return ' ';
    });
    rest = rest.replace(/(\d+)(?:\s*[-–]\s*(\d+))?/g, (_, a, b) => {
      const min = +a, max = b ? +b : +a;
      sets.push({ min: Math.min(min, max), max: Math.max(min, max) });
      return ' ';
    });
    if (!sets.length || sets.length > 20) return null;
    const extra = rest.replace(/[+,;]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s/]+$/, '').trim();
    return { sets, extra };
  }

  // „8“ -> [8, 8]; „7-8“ -> [7, 8]; „7,5“ -> [7.5, 7.5]
  function parseRpe(str) {
    const m = String(str || '').match(new RegExp(`(${NUM})(?:\\s*[-–]\\s*(${NUM}))?`));
    if (!m) return null;
    const a = toNum(m[1]), b = m[2] ? toNum(m[2]) : a;
    if (!(a > 0 && a <= 10 && b > 0 && b <= 10)) return null;
    return [Math.min(a, b), Math.max(a, b)];
  }

  // „47,5“ -> { lo: 47.5, hi: 47.5, comma: true }; „40-45 kg“ -> rozsah; „CHOOSE“ -> { choose }
  function parseWeight(str) {
    const s = String(str || '').trim();
    if (!s) return null;
    if (/choose|podľa seba/i.test(s)) return { choose: true };
    const m = s.match(new RegExp(`^(${NUM})(?:\\s*[-–]\\s*(${NUM}))?\\s*(?:kg)?$`, 'i'));
    if (m) {
      const lo = toNum(m[1]), hi = m[2] ? toNum(m[2]) : lo;
      return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), comma: s.includes(','), exact: true };
    }
    const clean = s.replace(/\d+\s*[x×]\s*(?=\d)/gi, '');
    const n = clean.match(new RegExp(NUM));
    return n ? { lo: toNum(n[0]), hi: toNum(n[0]), comma: s.includes(','), exact: false } : null;
  }

  const hasAny = (f) => Boolean(f && (String(f.sets || '').trim() || String(f.weight || '').trim() || String(f.rpe || '').trim()));
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  // ---------------------------------------------------------------------------
  // Formátovanie
  // ---------------------------------------------------------------------------
  function fmtNum(n, comma) {
    const s = String(round2(n));
    return comma ? s.replace('.', ',') : s;
  }
  // Objem pre ľudí: 1350 -> „1 350“, 562.5 -> „562,5“
  function formatVolume(v) {
    const r = Math.round(v * 10) / 10;
    const [i, d] = String(r).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? ',' + d : '');
  }
  function formatPct(p) {
    const r = Math.round(p * 1000) / 10;
    if (r === 0) return '±0 %';
    return `${r > 0 ? '+' : '−'}${String(Math.abs(r)).replace('.', ',')} %`;
  }
  const fmtKg = (n) => String(round2(n)).replace('.', ',');
  function formatSets(count, min, max, extra) {
    const reps = max > min ? `${min}-${max}` : `${min}`;
    const ex = extra ? (extra.startsWith('/') ? extra : ' ' + extra) : '';
    return `${count}x${reps}${ex}`;
  }

  // ---------------------------------------------------------------------------
  // Objem
  // ---------------------------------------------------------------------------
  // Opakovania odcvičených sérií; „Ok“ = podľa plánu (spodná hranica rozsahu).
  function doneReps(doneSets, planSets) {
    const d = parseSets(doneSets);
    if (!d) return null;
    if (d.ok) {
      const p = parseSets(planSets);
      return p && !p.ok ? p.sets.map((x) => x.min) : null;
    }
    return d.sets.map((x) => x.min);
  }

  // Objem jednej časti: { value, unit: 'kg' | 'opak.' } | null
  function partVolume(doneSets, doneWeight, planSets, planWeight) {
    const reps = doneReps(doneSets, planSets);
    if (!reps) return null;
    let w = parseWeight(doneWeight);
    if (!w || w.choose) {
      const pw = parseWeight(planWeight);
      w = !String(doneWeight || '').trim() && pw && !pw.choose ? pw : null;
    }
    if (w && w.lo > 0) return { value: round2(sum(reps) * w.lo), unit: 'kg' };
    return { value: sum(reps), unit: 'opak.' };
  }

  // Objem cviku po častiach (superset). planned/done = { sets, weight }.
  function volume(name, planned, done) {
    const n = Math.max(1, splitParts(name).length);
    const ds = splitValues(done && done.sets, n, true), dw = splitValues(done && done.weight, n, false);
    const ps = splitValues(planned && planned.sets, n, true), pw = splitValues(planned && planned.weight, n, false);
    return Array.from({ length: n }, (_, i) => partVolume(ds[i], dw[i], ps[i], pw[i]));
  }

  // Súčet objemov v kg (časti v opakovaniach sa nesčítavajú).
  function totalKg(vols) {
    return sum((vols || []).filter((v) => v && v.unit === 'kg').map((v) => v.value));
  }

  // ---------------------------------------------------------------------------
  // Návrh progresie
  // ---------------------------------------------------------------------------
  // Nezvládol klient plánované opakovania (alebo RPE 10)?
  function missedPart(planSets, doneSets, doneRpe) {
    const r = parseRpe(doneRpe);
    if (r && r[1] >= 10) return true;
    const p = parseSets(planSets), d = parseSets(doneSets);
    if (!p || p.ok || !d || d.ok) return false;
    if (d.sets.length < p.sets.length) return true;
    return p.sets.some((s, i) => d.sets[i] && d.sets[i].min < s.min);
  }
  function missed(name, planned, done) {
    if (!hasAny(done)) return false;
    const n = Math.max(1, splitParts(name).length);
    const ps = splitValues(planned.sets, n, true), ds = splitValues(done.sets, n, true), dr = splitValues(done.rpe, n, true);
    return ps.some((_, i) => missedPart(ps[i], ds[i], dr[i]));
  }

  /*
   * Návrh pre jednu časť cviku.
   * in: { plan: { sets, weight, rpe }, done: { sets, weight, rpe }, prevMissed, step, pct }
   * out: { sets, weight, rule, reason, review, base, proposed, alternatives }
   */
  function suggestPart(input) {
    const plan = input.plan, done = input.done;
    const step = input.step > 0 ? input.step : 2.5;
    const pct = input.pct >= 0 ? input.pct : 0.05;
    const planP = parseSets(plan.sets);
    const planW = parseWeight(plan.weight);
    const base = partVolume(done.sets, done.weight, plan.sets, plan.weight);
    const planVol = partVolume(plan.sets, plan.weight, plan.sets, plan.weight);
    const out = (o) => ({ sets: plan.sets, weight: plan.weight, review: false, base, proposed: planVol, alternatives: [], ...o });
    const keep = (rule, reason, review, alternatives) => out({ rule, reason, review: Boolean(review), alternatives: alternatives || [] });

    if (!hasAny(done)) return keep('R1', 'Bez zápisu – ponechané');
    if (planW && planW.choose) {
      const dw = parseWeight(done.weight);
      const bits = [dw && dw.lo ? `minule ${fmtKg(dw.lo)} kg` : '', base ? `objem ${formatVolume(base.value)} ${base.unit}` : ''].filter(Boolean);
      return keep('R2', `Váha podľa seba${bits.length ? ' – ' + bits.join(', ') : ''}`);
    }

    const doneP = parseSets(done.sets);
    if (!planP || planP.ok || !doneP || (doneP.ok && !planP)) return keep('R0', 'Nedá sa vyhodnotiť – skontroluj', true);
    const reps = doneP.ok ? planP.sets.map((s) => s.min) : doneP.sets.map((s) => s.min);

    // Odcvičená váha; chýba -> podľa plánu; ani tam nie je -> vlastná váha.
    let dwP = parseWeight(done.weight);
    if (dwP && dwP.choose) dwP = null;
    if (!dwP && String(done.weight || '').trim()) return keep('R0', 'Nedá sa vyhodnotiť – skontroluj', true);
    if (!dwP && planW && planW.lo > 0) dwP = planW;
    const bodyweight = !dwP || !(dwP.lo > 0);
    const dw = bodyweight ? 0 : dwP.lo;
    const comma = Boolean((planW && planW.comma) || (dwP && dwP.comma));

    const rpeDone = parseRpe(done.rpe);
    const rpePlan = parseRpe(plan.rpe);
    const rpeTxt = (r) => fmtKg(r[0]) + (r[1] > r[0] ? '–' + fmtKg(r[1]) : '');

    // R3: nezvládnuté opakovania alebo RPE 10
    if (missedPart(plan.sets, done.sets, done.rpe)) {
      const why = rpeDone && rpeDone[1] >= 10 ? 'RPE 10' : `nezvládnuté opakovania (${reps.join(', ')} z plánu ${planP.sets.map((s) => s.min).join(', ')})`;
      if (!input.prevMissed) return keep('R3', `${cap(why)} – ponechané; ak sa to zopakuje, navrhne sa ľahšia váha`);
      if (bodyweight || dw - step <= 0 || !planW || !(planW.lo > 0)) return keep('R3', `2× po sebe ${why} – zníž záťaž ručne`, true);
      const weight = planW.hi > planW.lo
        ? `${fmtNum(planW.lo - step, comma)}-${fmtNum(planW.hi - step, comma)}`
        : fmtNum(dw - step, comma);
      const proposed = { value: round2(sum(planP.sets.map((s) => s.min)) * (dw - step)), unit: 'kg' };
      return out({ weight, rule: 'R3', reason: `2× po sebe ${why} → −${fmtKg(step)} kg`, proposed });
    }

    // R4: ťažšie ako plán
    if (rpePlan && rpeDone && rpeDone[1] > rpePlan[1]) {
      return keep('R4', `RPE ${rpeTxt(rpeDone)} nad plánom ${rpeTxt(rpePlan)} → ponechané`);
    }

    // R5 / R6: cieľ objemu
    const easy = rpePlan && rpeDone && rpeDone[1] <= rpePlan[0] - 1;
    const tPct = easy ? pct * 2 : pct;
    const rule = easy ? 'R5' : 'R6';
    const head = easy
      ? `Ľahké (RPE ${rpeTxt(rpeDone)} pri pláne ${rpeTxt(rpePlan)})`
      : `Splnené${rpeDone ? ` pri RPE ${rpeTxt(rpeDone)}` : ''}`;

    const S = planP.sets.length;
    const uniform = planP.sets.every((s) => s.min === planP.sets[0].min && s.max === planP.sets[0].max);
    const isRange = uniform && planP.sets[0].max > planP.sets[0].min;
    const pMin = planP.sets[0].min, pMax = planP.sets[0].max;
    const doneMin = Math.min(...reps);
    // Základ: odcvičené opakovania, nad plán sa nepočítajú (aby sa váha zvyšovala aj vtedy).
    const capReps = reps.map((r, i) => Math.min(r, (planP.sets[i] || planP.sets[planP.sets.length - 1]).max));
    const baseVal = bodyweight ? sum(capReps) : sum(capReps) * dw;
    if (!(baseVal > 0)) return keep('R0', 'Nedá sa vyhodnotiť – skontroluj', true);
    const target = baseVal * (1 + tPct);
    const unit = bodyweight ? 'opak.' : 'kg';

    // Kandidáti: rovnaký počet sérií; váha +0/+1/+2 kroky; opakovania v rozsahu plánu.
    const cands = [];
    const add = (k, r, list) => {
      const w = bodyweight ? 0 : dw + k * step;
      const repsSum = list ? sum(list) : S * r;
      cands.push({ k, r, value: round2(bodyweight ? repsSum : repsSum * w), w });
    };
    if (bodyweight) {
      if (uniform) for (let r = Math.max(doneMin, pMin); r <= Math.max(doneMin, pMin) + 5; r++) add(0, r);
    } else {
      for (let k = 0; k <= 2; k++) {
        if (uniform) {
          for (let r = pMin; r <= pMax; r++) if (k > 0 || r >= Math.min(doneMin, pMax)) add(k, r);
        } else add(k, null, planP.sets.map((s) => s.min));
      }
    }
    const capPct = Math.max(2 * tPct, tPct + 0.05);
    const ok = cands.filter((c) => c.value >= target - 1e-9).sort((a, b) => a.value - b.value || a.k - b.k);
    const best = ok[0] && ok[0].value / baseVal - 1 <= capPct + 1e-9 ? ok[0] : null;

    const weightFor = (k) => {
      if (bodyweight) return plan.weight;
      if (k === 0) {
        const inPlan = planW && planW.lo > 0 && dw >= planW.lo && dw <= planW.hi;
        return inPlan ? plan.weight : fmtNum(dw, comma);
      }
      if (planW && planW.hi > planW.lo) return `${fmtNum(planW.lo + k * step, comma)}-${fmtNum(planW.hi + k * step, comma)}`;
      return fmtNum(dw + k * step, comma);
    };
    const setsFor = (c) => {
      if (bodyweight && uniform && !isRange) return formatSets(S, c.r, null, planP.extra);
      return plan.sets; // rozsah alebo nerovnomerné série ostávajú, ako ich napísal tréner
    };
    const describe = (c) => {
      const bits = [];
      if (c.k > 0) bits.push(`+${fmtKg(c.k * step)} kg`);
      if (bodyweight && c.r != null) bits.push(`${S}×${c.r}`);
      else if (isRange) bits.push(`cieľ ${S}×${c.r} opak.`);
      return bits.join(', ') || 'rovnako';
    };

    // Alternatívy: ďalší kandidát, +1 opakovanie, +1 séria
    const alts = [];
    const pushAlt = (label, sets, weight, value) => {
      if (alts.some((a) => a.sets === sets && a.weight === weight)) return;
      alts.push({ label, sets, weight, value: round2(value), pct: value / baseVal - 1, unit });
    };
    for (const c of ok) {
      if (best && c === best) continue;
      if (c.value / baseVal - 1 > 0.25) break;
      pushAlt(describe(c), setsFor(c), weightFor(c.k), c.value);
      break;
    }
    if (uniform && !isRange) {
      const r1 = Math.max(doneMin, pMin) + 1;
      pushAlt('+1 opak.', formatSets(S, r1, null, planP.extra), weightFor(0), bodyweight ? S * r1 : S * r1 * dw);
    }
    if (uniform) {
      const rr = isRange ? Math.min(Math.max(doneMin, pMin), pMax) : Math.max(doneMin, pMin);
      pushAlt('+1 séria', formatSets(S + 1, pMin, isRange ? pMax : pMin, planP.extra), weightFor(0), bodyweight ? (S + 1) * rr : (S + 1) * rr * dw);
    }

    const baseObj = { value: round2(baseVal), unit };
    if (!best) {
      const first = ok[0];
      const why = first
        ? `najmenšie zvýšenie je ${formatPct(first.value / baseVal - 1)} (cieľ ${formatPct(tPct)})`
        : `cieľ ${formatPct(tPct)} sa v rozsahu plánu nedá dosiahnuť`;
      return keep(rule, `${head}, ale ${why} – vyber alternatívu`, true, alts.filter((a) => !(a.sets === plan.sets && a.weight === plan.weight)));
    }
    const sets = setsFor(best);
    const weight = weightFor(best.k);
    const proposed = { value: best.value, unit };
    const reason = `${head} → cieľ ${formatPct(tPct)} objemu: ${describe(best)}`;
    return out({ sets, weight, rule, reason, base: baseObj, proposed, alternatives: alts.filter((a) => !(a.sets === sets && a.weight === weight)) });
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /*
   * Návrh pre celý cvik (aj superset).
   * ex: { name, planned: { sets, weight, rpe, note }, done: {...}, prevMissed, step, pct }
   * out: { fields: { sets, weight, rpe, note }, rule, reason, review, parts: [{ name, base, proposed }], alternatives }
   */
  function suggest(ex) {
    const parts = splitParts(ex.name);
    const n = Math.max(1, parts.length);
    const planned = ex.planned || {}, done = ex.done || {};
    if (n === 1) {
      const r = suggestPart({ plan: planned, done, prevMissed: ex.prevMissed, step: ex.step, pct: ex.pct });
      return {
        fields: { sets: r.sets, weight: r.weight, rpe: planned.rpe || '', note: planned.note || '' },
        rule: r.rule, reason: r.reason, review: r.review,
        parts: [{ name: ex.name, base: r.base, proposed: r.proposed }],
        alternatives: r.alternatives.map((a) => ({ ...a, fields: { sets: a.sets, weight: a.weight } })),
      };
    }
    const ps = splitValues(planned.sets, n, true), pw = splitValues(planned.weight, n, false), pr = splitValues(planned.rpe, n, true);
    const ds = splitValues(done.sets, n, true), dw = splitValues(done.weight, n, false), dr = splitValues(done.rpe, n, true);
    const res = parts.map((p, i) => suggestPart({
      plan: { sets: ps[i], weight: pw[i], rpe: pr[i] },
      done: { sets: ds[i], weight: dw[i], rpe: dr[i] },
      prevMissed: ex.prevMissed, step: ex.step, pct: ex.pct,
    }));
    const joinVals = (vals, orig, origVals) => {
      if (vals.every((v, i) => v === origVals[i])) return orig || '';
      const trimmed = vals.slice();
      while (trimmed.length > 1 && !trimmed[trimmed.length - 1]) trimmed.pop();
      return trimmed.join(' a ');
    };
    const order = ['R0', 'R3', 'R4', 'R1', 'R2', 'R6', 'R5'];
    const rule = res.map((r) => r.rule).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    return {
      fields: {
        sets: joinVals(res.map((r) => r.sets), planned.sets, ps),
        weight: joinVals(res.map((r) => r.weight), planned.weight, pw),
        rpe: planned.rpe || '',
        note: planned.note || '',
      },
      rule,
      reason: res.map((r, i) => `${cap(parts[i].toLowerCase())}: ${r.reason}`).join(' · '),
      review: res.some((r) => r.review),
      parts: res.map((r, i) => ({ name: parts[i], base: r.base, proposed: r.proposed })),
      alternatives: [],
    };
  }

  /*
   * Trend cviku za blok (trénerov panel, spec 003 US3).
   * list: odcvičené záznamy chronologicky [{ planned, done }]
   * out: { kind: 'up' | 'same' | 'down' | 'none', why, fatigue }
   */
  function trend(name, list) {
    const pts = (list || []).filter((x) => hasAny(x.done));
    const vals = pts.map((x) => sum(volume(name, x.planned, x.done).map((v) => (v ? v.value : 0))));
    const out = { kind: 'none', why: '', fatigue: false };
    if (pts.length >= 3) {
      const l3 = pts.slice(-3);
      const w = l3.map((x) => { const p = parseWeight(splitValues(x.done.weight, Math.max(1, splitParts(name).length), false)[0]); return p && p.lo ? p.lo : null; });
      const r = l3.map((x) => { const p = parseRpe(splitValues(x.done.rpe, Math.max(1, splitParts(name).length), true)[0]); return p ? p[1] : null; });
      out.fatigue = w[0] != null && w[0] === w[1] && w[1] === w[2] && r.every((x) => x != null) && r[0] < r[1] && r[1] < r[2];
    }
    if (pts.length < 2 || !(vals[0] > 0)) return out;
    const last = vals[vals.length - 1], prev = vals[vals.length - 2], first = vals[0];
    const lp = pts[pts.length - 1];
    if (missed(name, lp.planned, lp.done)) return { ...out, kind: 'down', why: 'nezvládnuté opakovania' };
    if (last < prev * 0.95) return { ...out, kind: 'down', why: `objem ${formatPct(last / prev - 1)} oproti minulému týždňu` };
    const l3 = vals.slice(-3);
    if (l3.length === 3 && Math.max(...l3) / Math.min(...l3) - 1 <= 0.02) return { ...out, kind: 'same', why: '3 týždne bez rastu objemu' };
    if (last > first * 1.02) return { ...out, kind: 'up', why: `objem ${formatPct(last / first - 1)} za blok` };
    return { ...out, kind: 'same', why: 'bez výrazného rastu' };
  }

  const api = {
    splitParts, splitValues, parseSets, parseRpe, parseWeight, hasAny,
    volume, totalKg, missed, suggest, suggestPart, trend,
    formatVolume, formatPct, formatSets, fmtKg,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FitkoCalc = api;
})(this);
