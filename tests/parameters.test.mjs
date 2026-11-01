import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empty, example, nmConstruction, validate } from '../src/core.mjs';
import { launch } from './dom-harness.mjs';

const pid = (x, y) => JSON.stringify([x, y]);

test('the mathematical title follows every agreed parameter simplification', () => {
  const unrestricted = '(CC(X\u2264), \u25a1X=)';
  const bounded = '(CC2(X\u2264), \u25a1X=)';
  const cases = [
    [null, null, unrestricted, []], [null, 0, unrestricted, []], [null, 2, unrestricted, []],
    [2, 0, bounded, ['2']], [2, 1, bounded, ['2']], [2, 2, bounded, ['2']],
    [1, 2, '(CC1(X\u2264) \u222a (CC2(X\u2264) \u2229 \u2662X=), \u25a1X=)', ['1', '2']],
    [2, null, '(CC2(X\u2264) \u222a \u2662X=, \u25a1X=)', ['2']],
    [0, 1, '(CC1(X\u2264) \u2229 \u2662X=, \u25a1X=)', ['1']],
    [0, 2, '(CC2(X\u2264) \u2229 \u2662X=, \u25a1X=)', ['2']],
    [0, null, '(\u2662X=, \u25a1X=)', []], [0, 0, '(\u2205, \u2205)', []]
  ];
  for (const [m, n, expected, subscripts] of cases) {
    const { $ } = launch({ ...example('chain2'), m, n });
    assert.equal($('output-title').textContent, expected);
    assert.deepEqual($('output-title').querySelectorAll('sub').map(q => q.textContent), subscripts);
    assert.equal($('output-title').closest('.output-heading').querySelectorAll('.parameter-control').length, 2);
  }
});

test('m and n give exactly the union of both conditions for every poset on at most four points', () => {
  for (let size = 0; size <= 4; size++) {
    const possible = [];
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) possible.push([`p${i}`, `p${j}`]);
    for (let mask = 0; mask < 2 ** possible.length; mask++) {
      const input = empty();
      input.nodes = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, label: String(i), x: i * 50, y: 0 }));
      input.edges = possible.filter((_, i) => mask & 2 ** i);
      const full = nmConstruction(input, 1000);
      for (const m of [0, 1, 2, null]) for (const n of [0, 1, 2, null]) {
        const expected = full.forest.nodes.filter(q => q.chain.length <= (m ?? Infinity) || (q.chain.length <= (n ?? Infinity) && q.chain.some(id => { const [x, y] = JSON.parse(id); return x === y; })));
        const ids = new Set(expected.map(q => q.id)), result = nmConstruction({ ...input, m, n }, 1000);
        assert.equal(result.forest.count, expected.length);
        assert.deepEqual(new Set(result.forest.nodes.map(q => q.id)), ids);
        assert.deepEqual(result.forest.edges, full.forest.edges.filter(([a, b]) => ids.has(a) && ids.has(b)));
        assert.deepEqual(result.pairs, full.pairs);
        for (const q of result.forest.nodes) if (q.parent) assert.ok(ids.has(q.parent));
      }
    }
  }
});

test('bounds apply before output limits, including when the middle diagram is oversized', () => {
  const recovered = nmConstruction({ ...example('chain6'), m: 1, n: 2 });
  assert.equal(recovered.forest.exceeded, false); assert.equal(recovered.forest.count, 71);
  assert.equal(nmConstruction(example('chain6')).forest.exceeded, true);
  const input = empty();
  input.nodes = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, label: String(i), x: 0, y: 0 }));
  input.edges = input.nodes.slice(1).map((q, i) => [input.nodes[i].id, q.id]);
  const diagonalOnly = nmConstruction({ ...input, m: 0, n: 1 });
  assert.equal(diagonalOnly.pairs.exceeded, true); assert.equal(diagonalOnly.pairs.count, 325);
  assert.equal(diagonalOnly.forest.exceeded, false); assert.equal(diagonalOnly.forest.count, 25);
  assert.equal(diagonalOnly.pairs.references.length, 25);
  assert.ok(diagonalOnly.forest.nodes.every(q => q.diagonal && q.chain.length === 1));
  const none = nmConstruction({ ...input, m: 0, n: 0 });
  assert.equal(none.forest.count, 0); assert.equal(none.forest.exceeded, false);
  assert.equal(nmConstruction({ ...input, m: 1, n: 0 }).forest.exceeded, true);
});

test('parameters validate, round trip, and default old files to All', () => {
  const input = example('chain3');
  const saved = { ...input, m: 0, n: 2, lastM: 0, lastN: 2 };
  assert.deepEqual(validate(JSON.parse(JSON.stringify(saved))), saved);
  const legacy = { ...input }; delete legacy.m; delete legacy.n; delete legacy.lastM; delete legacy.lastN;
  assert.equal(validate(legacy).m, null); assert.equal(validate(legacy).n, null);
  assert.equal(validate({ ...saved, format: 'godel-studio' }).m, null);
  for (const bad of [-1, .5, '2', 'All', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validate({ ...input, m: bad }), /Parameter m/);
    assert.throws(() => validate({ ...input, n: bad }), /Parameter n/);
  }
  assert.equal(nmConstruction({ ...input, m: Number.MAX_SAFE_INTEGER, n: 0 }).forest.count, nmConstruction(input).forest.count);
});

test('parameter controls independently remember values, save, undo, reload, and retain values across examples', async () => {
  const { $, stored } = launch(example('chain2'));
  assert.equal($('parameter-m').value, 'All'); assert.equal($('parameter-n').value, 'All');
  $('all-m').checked = false; await $('all-m').emit('change');
  $('parameter-m').value = '0'; await $('parameter-m').emit('change');
  assert.equal($('output-count').textContent, '4 elements');
  $('all-n').checked = false; await $('all-n').emit('change');
  assert.equal($('output-count').textContent, '2 elements');
  $('parameter-n').value = '0'; await $('parameter-n').emit('change');
  assert.equal($('output-count').textContent, '0 elements'); assert.equal($('output-notice').hidden, false);
  assert.equal($('output-title').textContent, '(\u2205, \u2205)');
  assert.match($('output-message').textContent, /No nonempty chains/);
  await $('undo').emit('click'); assert.equal($('parameter-n').value, '1'); assert.equal($('output-count').textContent, '2 elements');
  assert.equal($('output-title').textContent, '(CC1(X\u2264) \u2229 \u2662X=, \u25a1X=)');
  await $('redo').emit('click'); assert.equal($('output-count').textContent, '0 elements');
  $('all-n').checked = true; await $('all-n').emit('change');
  assert.equal($('output-count').textContent, '4 elements');
  const reloaded = launch(stored());
  assert.equal(reloaded.$('parameter-m').value, '0'); assert.equal(reloaded.$('parameter-n').value, 'All');
  reloaded.$('all-n').checked = false; await reloaded.$('all-n').emit('change');
  assert.equal(reloaded.$('parameter-n').value, '0');
  $('examples').value = 'chain3'; await $('examples').emit('change');
  assert.equal(stored().m, 0); assert.equal(stored().n, null);
  await $('blank').emit('click'); assert.equal(stored().m, 0); assert.equal(stored().n, null);
});

test('invalid control values preserve the saved construction and valid numbers recover it', async () => {
  const { $, stored } = launch(example('chain2'));
  $('all-m').checked = false; await $('all-m').emit('change');
  const before = stored();
  for (const value of ['', '-1', '1.5', 'bad', '9007199254740992']) {
    $('parameter-m').value = value; await $('parameter-m').emit('change');
    assert.equal($('parameter-m').getAttribute('aria-invalid'), 'true'); assert.deepEqual(stored(), before);
  }
  $('parameter-m').value = '0'; await $('parameter-m').emit('change');
  assert.equal($('parameter-m').getAttribute('aria-invalid'), 'false');
  assert.equal($('output-count').textContent, '4 elements');
});

test('filtered chains remain inspectable when the middle diagram exceeds its display limit', async () => {
  const input = empty();
  input.nodes = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, label: String(i), x: 0, y: 0 }));
  input.edges = input.nodes.slice(1).map((q, i) => [input.nodes[i].id, q.id]);
  Object.assign(input, { m: 0, n: 1 });
  const { $, point } = launch(input);
  assert.equal($('pairs-notice').hidden, false); assert.equal($('output-count').textContent, '25 elements');
  const output = point('output', JSON.stringify([pid('p3', 'p3')]));
  await output.emit('pointerenter'); assert.match($('inspector-content').textContent, /Least pair: \(3, 3\)/);
  await output.emit('pointerleave'); await point('input', 'p3').emit('pointerenter');
  assert.ok(output.classList.contains('coordinate-left')); assert.ok(output.classList.contains('coordinate-right'));
});
