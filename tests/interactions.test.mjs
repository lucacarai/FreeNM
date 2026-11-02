import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './dom-harness.mjs';
import { empty, example, nmConstruction } from '../src/core.mjs';
const pid = (x, y) => JSON.stringify([x, y]);

test('chain inspection draws consecutive black links even across skipped Hasse levels', async () => {
  const { $, point, stored, resizePairs } = launch(example('chain3'));
  const bottom = pid('p0', 'p2'), middle = pid('p0', 'p1'), top = pid('p0', 'p0');
  const skipped = JSON.stringify([bottom, top]), full = JSON.stringify([bottom, middle, top]);
  const before = stored(), originalEdges = $('pairs-canvas').querySelectorAll('.edge');
  assert.ok(!originalEdges.some(q => q.dataset.a === bottom && q.dataset.b === top));
  const links = () => $('chain-links').querySelectorAll('.chain-link');
  const layers = Array.from($('pairs-canvas').children);
  assert.ok(layers.indexOf($('chain-links')) > layers.indexOf($('pairs-canvas').querySelector('.points')));
  const checkEndpoints = line => {
    const coordinates = id => point('pairs', id).getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
    const [x1, y1] = coordinates(line.dataset.a), [x2, y2] = coordinates(line.dataset.b);
    const dx = x2 - x1, dy = y2 - y1, distance = Math.hypot(dx, dy);
    const inset = Math.min(10.3, distance / 2);
    assert.ok(Math.abs(Number(line.getAttribute('x1')) - (x1 + dx / distance * inset)) < 1e-9);
    assert.ok(Math.abs(Number(line.getAttribute('y1')) - (y1 + dy / distance * inset)) < 1e-9);
    assert.ok(Math.abs(Number(line.getAttribute('x2')) - (x2 - dx / distance * inset)) < 1e-9);
    assert.ok(Math.abs(Number(line.getAttribute('y2')) - (y2 - dy / distance * inset)) < 1e-9);
  };
  await point('output', skipped).emit('pointerenter');
  assert.equal(links().length, 1); assert.equal(links()[0].dataset.a, bottom); assert.equal(links()[0].dataset.b, top);
  checkEndpoints(links()[0]);
  assert.equal($('pairs-canvas').querySelectorAll('.edge').length, originalEdges.length);
  assert.deepEqual(stored(), before);
  await point('output', skipped).emit('keydown', { key: 'Enter' });
  resizePairs(300, 500); assert.equal(links().length, 1); checkEndpoints(links()[0]);
  await point('input', 'p1').emit('pointerenter'); assert.equal(links().length, 0);
  await point('input', 'p1').emit('pointerleave'); assert.equal(links().length, 1);
  await point('output', full).emit('pointerenter');
  assert.equal($('output-canvas').querySelectorAll('.related').length, 1);
  assert.ok(point('output', full).classList.contains('related'));
  assert.ok(!point('output', skipped).classList.contains('pinned'));
  assert.equal($('output-canvas').querySelectorAll('.active').length, 0);
  assert.equal(links().length, 2);
  assert.deepEqual(links().map(q => [q.dataset.a, q.dataset.b]), [[bottom, middle], [middle, top]]);
  await point('output', JSON.stringify([top])).emit('pointerenter'); assert.equal(links().length, 0);
  await point('output', JSON.stringify([top])).emit('pointerleave'); assert.equal(links().length, 1);
  await $('clear-selection').emit('click'); assert.equal(links().length, 0);
});

test('computed panels hide independently, retain the drawing and parameters, and remember visibility on reload', async () => {
  const input = { ...example('chain3'), m: 1, n: 2 }, { $, stored, visibilitySettings } = launch(input);
  const before = stored();
  for (const [pairs, output] of [[false, true], [false, false], [true, false], [true, true]]) {
    for (const [panel, visible] of [['pairs', pairs], ['output', output]]) {
      $('show-' + panel).checked = visible; await $('show-' + panel).emit('change');
    }
    assert.equal($('pairs-panel').hidden, !pairs); assert.equal($('output-panel').hidden, !output);
    assert.equal($('workspace').classList.contains('without-pairs'), !pairs);
    assert.equal($('workspace').classList.contains('without-output'), !output);
    assert.equal($('parameter-m').value, '1'); assert.equal($('parameter-n').value, '2');
    assert.equal($('undo').disabled, true); assert.deepEqual(stored(), before);
    const reloaded = launch(stored(), { visibility: visibilitySettings() });
    assert.equal(reloaded.$('pairs-panel').hidden, !pairs); assert.equal(reloaded.$('output-panel').hidden, !output);
    assert.equal(reloaded.$('show-pairs').checked, pairs); assert.equal(reloaded.$('show-output').checked, output);
  }
});

test('hiding a pinned panel clears its inspection, while other panels retain their pinned point', async () => {
  const { $, point } = launch(example('chain2'));
  const chainId = JSON.stringify([pid('p0', 'p1'), pid('p1', 'p1')]);
  await point('output', chainId).emit('keydown', { key: 'Enter' });
  $('show-pairs').checked = false; await $('show-pairs').emit('change');
  assert.ok(point('output', chainId).classList.contains('pinned'));
  $('show-output').checked = false; await $('show-output').emit('change');
  assert.equal($('clear-selection').disabled, true);
  await $('blank').emit('click'); await $('add-first').emit('click');
  $('show-output').checked = true; await $('show-output').emit('change');
  assert.equal($('output-count').textContent, '1 element');
  assert.equal($('output-canvas').querySelectorAll('.point').length, 1);
  assert.equal($('pairs-panel').hidden, true);
});

test('resizing the middle panel aligns yellow points when space permits and preserves pinned inspection', async () => {
  const input = empty();
  input.nodes = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, label: String(i), x: i * 80, y: 0, pigment: null }));
  input.edges = [['p0', 'p1'], ['p1', 'p2'], ['p3', 'p4']];
  const { $, point, resizePairs, stored } = launch(input), before = stored();
  const diagonal = pid('p5', 'p5');
  await point('pairs', diagonal).emit('keydown', { key: 'Enter' });
  const rows = () => new Set(input.nodes.map(q => point('pairs', pid(q.id, q.id)).getAttribute('transform').match(/translate\([^ ]+ ([^)]+)\)/)[1]));
  resizePairs(1400, 700); assert.equal(rows().size, 1);
  resizePairs(180, 700); assert.ok(rows().size > 1);
  resizePairs(1400, 700); assert.equal(rows().size, 1);
  assert.ok(point('pairs', diagonal).classList.contains('pinned'));
  assert.equal($('undo').disabled, true); assert.deepEqual(stored(), before);
});

test('three panels render correct counts, split colors with no divider and permanent diagonal circles', () => {
  const { $, point } = launch(example('chain2'));
  assert.equal($('input-count').textContent, '2 points');
  assert.equal($('pairs-count').textContent, '3 elements');
  assert.equal($('output-count').textContent, '5 elements');
  const split = point('pairs', pid('p0', 'p1'));
  assert.equal(split.querySelectorAll('.half-fill').length, 2);
  assert.equal(split.querySelector('.core').getAttribute('fill'), 'none');
  assert.equal(split.querySelectorAll('line').length, 0);
  const equal = point('pairs', pid('p1', 'p1'));
  assert.equal(equal.querySelectorAll('.half-fill').length, 0);
  assert.equal(equal.querySelector('.core').getAttribute('fill'), point('input', 'p1').querySelector('.core').getAttribute('fill'));
  assert.equal($('pairs-canvas').querySelectorAll('.diagonal-halo').length, 2);
  assert.equal($('output-canvas').querySelectorAll('.diagonal-outline').length, 2);
});

test('hover and pin inspection links chains, pairs, and original coordinates', async () => {
  const { $, point } = launch(example('chain2'));
  const lower = pid('p0', 'p1'), diagonal = pid('p1', 'p1');
  const chainId = JSON.stringify([lower, diagonal]), chain = point('output', chainId);
  await chain.emit('pointerenter');
  assert.ok(point('pairs', lower).classList.contains('minimum'));
  assert.ok(point('pairs', diagonal).classList.contains('related'));
  assert.ok(point('pairs', pid('p0', 'p0')).classList.contains('dim'));
  assert.ok(point('input', 'p0').classList.contains('related'));
  assert.ok(point('input', 'p1').classList.contains('related'));
  assert.match($('inspector-content').textContent, /Chain size: 2/);
  await chain.emit('keydown', { key: 'Enter' });
  await point('pairs', diagonal).emit('pointerenter');
  assert.match($('inspector-content').textContent, /diagonal pair/);
  assert.ok(!point('pairs', diagonal).classList.contains('minimum'));
  assert.ok(point('output', chainId).classList.contains('dim'));
  assert.ok(point('output', JSON.stringify([diagonal])).classList.contains('related'));
  assert.equal($('output-canvas').querySelectorAll('.related').length, 1);
  await point('pairs', lower).emit('pointerenter');
  for (const edge of $('input-canvas').querySelectorAll('.edge')) {
    assert.ok(edge.classList.contains('dim'));
    assert.ok(!edge.classList.contains('active')); assert.ok(!edge.classList.contains('selected'));
  }
  assert.equal($('output-canvas').querySelectorAll('.related').length, 3);
  assert.ok(point('output', chainId).classList.contains('related'));
  assert.ok(point('output', JSON.stringify([diagonal])).classList.contains('dim'));
  await point('pairs', lower).emit('pointerleave');
  assert.match($('inspector-content').textContent, /Chain size: 2/);
  assert.ok(point('output', chainId).classList.contains('pinned'));
  await $('clear-selection').emit('click');
  assert.equal($('pairs-canvas').querySelectorAll('.diagonal-halo').length, 2);
  const deeper = launch(example('chain3'));
  const fullChain = [pid('p0', 'p2'), pid('p1', 'p2'), pid('p1', 'p1')];
  await deeper.point('output', JSON.stringify(fullChain)).emit('pointerenter');
  assert.ok(deeper.point('input', 'p0').classList.contains('related'));
  assert.ok(deeper.point('input', 'p2').classList.contains('related'));
  assert.ok(deeper.point('input', 'p1').classList.contains('dim'));
  assert.equal(deeper.$('input-canvas').querySelectorAll('.related').length, 2);
  for (const edge of deeper.$('input-canvas').querySelectorAll('.edge')) {
    assert.ok(edge.classList.contains('dim')); assert.ok(!edge.classList.contains('active')); assert.ok(!edge.classList.contains('selected'));
  }
  for (const id of fullChain) assert.ok(deeper.point('pairs', id).classList.contains('related'));
});

test('input hover marks matching coordinate halves using the minimum pair of each chain', async () => {
  const { $, point } = launch(example('chain3'));
  await point('input', 'p1').emit('pointerenter');
  const left = point('pairs', pid('p1', 'p2')), right = point('pairs', pid('p0', 'p1')), both = point('pairs', pid('p1', 'p1'));
  assert.ok(left.classList.contains('coordinate-left')); assert.ok(!left.classList.contains('coordinate-right'));
  assert.ok(right.classList.contains('coordinate-right')); assert.ok(!right.classList.contains('coordinate-left'));
  assert.ok(both.classList.contains('coordinate-left')); assert.ok(both.classList.contains('coordinate-right'));
  const leftChain = point('output', JSON.stringify([pid('p1', 'p2'), pid('p2', 'p2')]));
  const rightChain = point('output', JSON.stringify([pid('p0', 'p1'), pid('p1', 'p1')]));
  assert.ok(leftChain.classList.contains('coordinate-left')); assert.ok(!leftChain.classList.contains('coordinate-right'));
  assert.ok(rightChain.classList.contains('coordinate-right')); assert.ok(!rightChain.classList.contains('coordinate-left'));
  const otherColor = point('output', JSON.stringify([pid('p0', 'p2'), pid('p1', 'p1')]));
  assert.ok(otherColor.classList.contains('dim'));
  assert.ok(!otherColor.classList.contains('coordinate-left')); assert.ok(!otherColor.classList.contains('coordinate-right'));
  assert.equal($('pairs-canvas').querySelectorAll('.diagonal-halo').length, 3);
  await point('input', 'p1').emit('pointerleave');
  for (const panel of ['pairs', 'output']) {
    assert.equal($(panel + '-canvas').querySelectorAll('.coordinate-inspection').length, 0);
    assert.equal($(panel + '-canvas').querySelectorAll('.coordinate-left').length, 0);
    assert.equal($(panel + '-canvas').querySelectorAll('.coordinate-right').length, 0);
  }
});

test('deletion, undo, redo, persistence and empty construction update every stage', async () => {
  const { $, point, stored } = launch(example('chain2'));
  await point('input', 'p0').emit('keydown', { key: 'Enter' });
  await $('delete').emit('click');
  assert.equal($('input-count').textContent, '1 point'); assert.equal($('pairs-count').textContent, '1 element'); assert.equal($('output-count').textContent, '1 element');
  assert.equal(stored().format, 'free-nm-studio');
  await $('undo').emit('click'); assert.equal($('output-count').textContent, '5 elements');
  await $('redo').emit('click'); assert.equal($('output-count').textContent, '1 element');
  const reloaded = launch(stored()); assert.equal(reloaded.$('output-count').textContent, '1 element');
  await $('blank').emit('click');
  assert.equal($('pairs-count').textContent, '0 elements'); assert.equal($('output-count').textContent, '0 elements');
  assert.equal($('input-empty').hidden, false); assert.equal($('pairs-notice').hidden, false);
});

test('over-limit forest leaves the pair stage available and an example switch restores it', async () => {
  const { $ } = launch(example('chain6'));
  assert.equal($('pairs-count').textContent, '21 elements');
  assert.equal($('pairs-canvas').querySelectorAll('.point').length, 21);
  assert.equal($('output-count').textContent, 'More than 300 elements');
  assert.equal($('output-canvas').querySelectorAll('.point').length, 0);
  $('examples').value = 'chain2'; await $('examples').emit('change');
  assert.equal($('output-count').textContent, '5 elements');
  assert.equal($('output-notice').hidden, true);
});

test('adding points and order relations recomputes both stages and rejects cycles', async () => {
  const { $, document, point, stored } = launch(example('antichain'));
  const orderTool = document.querySelectorAll('[data-tool]').find(n => n.dataset.tool === 'order');
  await orderTool.emit('click');
  await point('input', 'p0').emit('keydown', { key: 'Enter' });
  await point('input', 'p1').emit('keydown', { key: 'Enter' });
  assert.equal($('pairs-count').textContent, '5 elements'); assert.equal($('output-count').textContent, '7 elements');
  const before = stored();
  await point('input', 'p1').emit('keydown', { key: 'Enter' });
  await point('input', 'p0').emit('keydown', { key: 'Enter' });
  assert.match($('status').textContent, /cycle/); assert.deepEqual(stored(), before);
  await $('blank').emit('click'); await $('add-first').emit('click');
  assert.equal($('pairs-count').textContent, '1 element'); assert.equal($('output-count').textContent, '1 element');
  await $('input-canvas').emit('pointerdown', { clientX: 350, clientY: 100 });
  assert.equal($('input-count').textContent, '2 points'); assert.equal($('pairs-count').textContent, '2 elements');
  assert.equal($('output-count').textContent, '2 elements');
});

test('label toggles, color edits and resize preserve the construction and pinned inspection', async () => {
  const input = example('chain2'), { $, point, resizeOutput, stored } = launch(input);
  const diagonal = pid('p1', 'p1'), chainId = JSON.stringify([diagonal]);
  await point('output', chainId).emit('keydown', { key: 'Enter' });
  $('pair-labels').checked = true; await $('pair-labels').emit('change');
  $('chain-labels').checked = true; await $('chain-labels').emit('change');
  assert.equal(point('pairs', diagonal).querySelector('text').textContent, '(b, b)');
  assert.ok(point('output', chainId).classList.contains('pinned'));
  resizeOutput(300, 500); assert.ok(point('output', chainId).classList.contains('pinned'));
  assert.equal($('undo').disabled, true);
  const hue = $('hue-list').querySelector('input'); hue.value = '#123456'; await hue.emit('change');
  assert.equal(point('pairs', diagonal).querySelector('.core').getAttribute('fill'), '#123456');
  assert.equal(point('output', chainId).querySelector('.core').getAttribute('fill'), '#123456');
  assert.equal(nmConstruction(stored()).forest.count, 5);
});
