// Testy výpočtov objemu a návrhu progresie. Spustenie: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const sug = (planned, done, opts = {}) => C.suggest({ name: opts.name || 'BENCH PRESS', planned, done, step: opts.step, pct: opts.pct, prevMissed: opts.prevMissed });

test('parseSets: bežné zápisy', () => {
  assert.deepEqual(C.parseSets('2x10').sets.map((s) => s.min), [10, 10]);
  assert.deepEqual(C.parseSets('2 × 10').sets.length, 2);
  assert.deepEqual(C.parseSets('3x8-10').sets[0], { min: 8, max: 10 });
  assert.deepEqual(C.parseSets('10, 9, 8').sets.map((s) => s.min), [10, 9, 8]);
  assert.deepEqual(C.parseSets('10/9/8').sets.map((s) => s.min), [10, 9, 8]);
  assert.deepEqual(C.parseSets('2x10 + 1x8').sets.map((s) => s.min), [10, 10, 8]);
  assert.equal(C.parseSets('1x20 BOTH').extra, 'BOTH');
  assert.deepEqual(C.parseSets('Ok'), { ok: true });
  assert.equal(C.parseSets('AMRAP'), null);
  assert.equal(C.parseSets(''), null);
});

test('parseWeight a parseRpe', () => {
  assert.deepEqual(C.parseWeight('47,5'), { lo: 47.5, hi: 47.5, comma: true, exact: true });
  assert.deepEqual(C.parseWeight('40-45 kg'), { lo: 40, hi: 45, comma: false, exact: true });
  assert.deepEqual(C.parseWeight('CHOOSE'), { choose: true });
  assert.deepEqual(C.parseRpe('7-8'), [7, 8]);
  assert.deepEqual(C.parseRpe('7,5'), [7.5, 7.5]);
  assert.equal(C.parseRpe(''), null);
});

test('objem: príklady zo zadania', () => {
  assert.deepEqual(C.volume('X', {}, { sets: '2x10', weight: '50' }), [{ value: 1000, unit: 'kg' }]);
  assert.deepEqual(C.volume('X', {}, { sets: '3x10', weight: '45' }), [{ value: 1350, unit: 'kg' }]);
  assert.deepEqual(C.volume('X', {}, { sets: '10, 9, 8', weight: '40' }), [{ value: 1080, unit: 'kg' }]);
});

test('objem: Ok podľa plánu, vlastná váha, superset', () => {
  assert.deepEqual(C.volume('X', { sets: '3x8-10' }, { sets: 'Ok', weight: '50' }), [{ value: 1200, unit: 'kg' }]);
  assert.deepEqual(C.volume('X', { sets: '2x10', weight: '' }, { sets: '2x12', weight: '' }), [{ value: 24, unit: 'opak.' }]);
  assert.deepEqual(C.volume('X', { sets: '2x10', weight: '50' }, { sets: 'Ok', weight: '' }), [{ value: 1000, unit: 'kg' }]);
  const v = C.volume('CURL + DIPS', { sets: '2x10' }, { sets: '2x10 a 2x12', weight: '15' });
  assert.deepEqual(v, [{ value: 300, unit: 'kg' }, { value: 24, unit: 'opak.' }]);
  assert.equal(C.totalKg(v), 300);
});

test('R1: bez zápisu ponechá plán', () => {
  const r = sug({ sets: '2x10', weight: '50', rpe: '8' }, {});
  assert.equal(r.rule, 'R1');
  assert.equal(r.fields.weight, '50');
});

test('R2: váha podľa seba', () => {
  const r = sug({ sets: '2x10', weight: 'CHOOSE', rpe: '8' }, { sets: '2x10', weight: '40', rpe: '8' });
  assert.equal(r.rule, 'R2');
  assert.equal(r.fields.weight, 'CHOOSE');
  assert.match(r.reason, /40 kg/);
});

test('R6: splnené 2x10 @ 50 → +2,5 kg (+5 %)', () => {
  const r = sug({ sets: '2x10', weight: '50', rpe: '8' }, { sets: '2x10', weight: '50', rpe: '8' });
  assert.equal(r.rule, 'R6');
  assert.equal(r.fields.weight, '52.5');
  assert.equal(r.fields.sets, '2x10');
  assert.equal(r.parts[0].base.value, 1000);
  assert.equal(r.parts[0].proposed.value, 1050);
});

test('R5: ľahké → dvojnásobný cieľ (+10 %)', () => {
  const r = sug({ sets: '2x10', weight: '50', rpe: '8' }, { sets: '2x10', weight: '50', rpe: '6.5' });
  assert.equal(r.rule, 'R5');
  assert.equal(r.fields.weight, '55');
});

test('R4: RPE nad plánom ponechá', () => {
  const r = sug({ sets: '2x10', weight: '50', rpe: '8' }, { sets: '2x10', weight: '50', rpe: '9' });
  assert.equal(r.rule, 'R4');
  assert.equal(r.fields.weight, '50');
});

test('R3: nezvládnuté raz → ponechať, dvakrát → −krok', () => {
  const once = sug({ sets: '3x10', weight: '60', rpe: '8' }, { sets: '10, 9, 8', weight: '60', rpe: '9' });
  assert.equal(once.rule, 'R3');
  assert.equal(once.fields.weight, '60');
  const twice = sug({ sets: '3x10', weight: '60', rpe: '8' }, { sets: '10, 9, 8', weight: '60', rpe: '9' }, { prevMissed: true });
  assert.equal(twice.fields.weight, '57.5');
  const rpe10 = sug({ sets: '3x10', weight: '60', rpe: '8' }, { sets: '3x10', weight: '60', rpe: '10' });
  assert.equal(rpe10.rule, 'R3');
});

test('rozsah opakovaní: séria sa nemení, cieľ v dôvode', () => {
  // 3x8 @ 45 = 1080, cieľ 1134 → 47,5 × 3×8 = 1140
  const r = sug({ sets: '3x8-10', weight: '45', rpe: '8' }, { sets: '3x8', weight: '45', rpe: '8' });
  assert.equal(r.fields.sets, '3x8-10');
  assert.equal(r.fields.weight, '47.5');
  // 3x10 (vrch rozsahu) @ 45 = 1350, cieľ 1417,5 → 47,5 × 3×10 = 1425
  const top = sug({ sets: '3x8-10', weight: '45', rpe: '8' }, { sets: '3x10', weight: '45', rpe: '8' });
  assert.equal(top.fields.weight, '47.5');
  assert.equal(top.parts[0].proposed.value, 1425);
});

test('veľký krok pri ľahkej váhe → na kontrolu s alternatívami', () => {
  // 2x10 @ 20 = 400; +2,5 kg = +12,5 % > 10 %
  const r = sug({ sets: '2x10', weight: '20', rpe: '8' }, { sets: '2x10', weight: '20', rpe: '8' });
  assert.equal(r.review, true);
  assert.equal(r.fields.weight, '20');
  const labels = r.alternatives.map((a) => a.label);
  assert.ok(labels.includes('+1 opak.'));
  assert.ok(labels.includes('+1 séria'));
  assert.ok(r.alternatives.some((a) => a.fields.weight === '22.5'));
  const plusRep = r.alternatives.find((a) => a.label === '+1 opak.');
  assert.equal(plusRep.fields.sets, '2x11');
  assert.equal(plusRep.value, 440);
});

test('krok cviku a desatinná čiarka', () => {
  const r = sug({ sets: '3x12', weight: '22,5', rpe: '8' }, { sets: '3x12', weight: '22,5', rpe: '8' }, { step: 1.25 });
  assert.equal(r.fields.weight, '23,75');
  const db = sug({ sets: '3x10', weight: '40', rpe: '8' }, { sets: '3x10', weight: '40', rpe: '8' }, { step: 2 });
  assert.equal(db.fields.weight, '42');
});

test('cieľ 0 % = udržiavanie', () => {
  const r = sug({ sets: '2x10', weight: '50', rpe: '8' }, { sets: '2x10', weight: '50', rpe: '8' }, { pct: 0 });
  assert.equal(r.fields.weight, '50');
});

test('rozsah váhy sa posúva celý', () => {
  const r = sug({ sets: '2x10', weight: '40-45', rpe: '8' }, { sets: '2x10', weight: '45', rpe: '8' });
  assert.equal(r.fields.weight, '42.5-47.5');
});

test('klient dal viac ako plán → ide sa od jeho váhy', () => {
  const r = sug({ sets: '2x10', weight: '50', rpe: '8' }, { sets: '2x10', weight: '55', rpe: '8' }, { step: 5 });
  // základ 1100, cieľ 1155 → 60 kg (1200, +9 %)
  assert.equal(r.fields.weight, '60');
});

test('nečitateľné hodnoty → na kontrolu', () => {
  const r = sug({ sets: 'AMRAP', weight: '50', rpe: '8' }, { sets: '12', weight: '50', rpe: '8' });
  assert.equal(r.rule, 'R0');
  assert.equal(r.review, true);
  const noSets = sug({ sets: '2x10', weight: '50', rpe: '8' }, { sets: '', weight: '50', rpe: '8' });
  assert.equal(noSets.review, true);
});

test('vlastná váha → pridávajú sa opakovania', () => {
  const r = sug({ sets: '3x10', weight: '', rpe: '8' }, { sets: '3x10', weight: '', rpe: '8' }, { name: 'DIPS' });
  // 30 opak., cieľ 31,5 → 3x11 = 33
  assert.equal(r.fields.sets, '3x11');
  assert.equal(r.parts[0].proposed.unit, 'opak.');
});

test('superset: každá časť zvlášť, spojené „ a “', () => {
  const r = sug(
    { sets: '2x10', weight: '50 a 20', rpe: '8' },
    { sets: '2x10 a 2x10', weight: '50 a 20', rpe: '8 a 9' },
    { name: 'BENCH PRESS + FLY' },
  );
  assert.equal(r.fields.weight, '52.5 a 20');
  assert.equal(r.fields.sets, '2x10');
  assert.equal(r.rule, 'R4');
  assert.equal(r.parts.length, 2);
});

test('missed: posledné odcvičenie nezvládnuté', () => {
  assert.equal(C.missed('X', { sets: '3x10' }, { sets: '10, 9, 8', weight: '60' }), true);
  assert.equal(C.missed('X', { sets: '3x10' }, { sets: '3x10', weight: '60', rpe: '8' }), false);
  assert.equal(C.missed('X', { sets: '3x10' }, {}), false);
});

test('formátovanie', () => {
  assert.equal(C.formatVolume(1350), '1 350');
  assert.equal(C.formatVolume(562.5), '562,5');
  assert.equal(C.formatPct(0.05), '+5 %');
  assert.equal(C.formatPct(-0.125), '−12,5 %');
});

test('trend: hore, stagnácia, pokles, únava', () => {
  const e = (sets, weight, rpe) => ({ planned: { sets: '3x8' }, done: { sets, weight, rpe } });
  assert.equal(C.trend('X', [e('3x8', '70', '8'), e('3x8', '72.5', '8'), e('3x8', '75', '8')]).kind, 'up');
  assert.equal(C.trend('X', [e('3x8', '75', '8'), e('3x8', '75', '8'), e('3x8', '75', '8')]).kind, 'same');
  assert.equal(C.trend('X', [e('3x8', '75', '8'), e('8, 7, 6', '75', '9')]).kind, 'down');
  assert.equal(C.trend('X', [e('3x8', '80', '8'), e('3x8', '70', '8')]).kind, 'down');
  const f = C.trend('X', [e('3x8', '95', '8'), e('3x8', '95', '8.5'), e('3x8', '95', '9')]);
  assert.equal(f.kind, 'same');
  assert.equal(f.fatigue, true);
  assert.equal(C.trend('X', [e('3x8', '95', '8')]).kind, 'none');
  assert.equal(C.trend('X', []).kind, 'none');
});
