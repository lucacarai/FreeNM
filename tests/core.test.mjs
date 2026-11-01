import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy, closure, covers, empty, example, validate, pairPoset, layoutPairPoset, nmConstruction } from '../src/core.mjs';

const pid = (x, y) => JSON.stringify([x, y]);

test('pair layout aligns diagonal points across different depths and reflows components when needed', () => {
  const input = empty();
  input.nodes = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, x: i * 80, y: 0 }));
  input.edges = [['p0', 'p1'], ['p1', 'p2'], ['p3', 'p4']];
  const pairs = pairPoset(input), before = copy(pairs);
  const wide = layoutPairPoset(pairs, { width: 1400, height: 700 });
  assert.equal(new Set(wide.nodes.filter(q => q.diagonal).map(q => q.y)).size, 1);
  const narrow = layoutPairPoset(wide, { width: 180, height: 700 });
  assert.ok(new Set(narrow.nodes.filter(q => q.diagonal).map(q => q.y)).size > 1);
  for (const layout of [wide, narrow]) {
    const nodes = new Map(layout.nodes.map(q => [q.id, q]));
    for (const [a, b] of layout.edges) assert.ok(nodes.get(a).y > nodes.get(b).y);
    assert.deepEqual(layout.edges, pairs.edges);
  }
  const restored = layoutPairPoset(narrow, { width: 1400, height: 700 });
  assert.deepEqual(restored.nodes, wide.nodes); assert.deepEqual(pairs, before);
});

test('two-point chain gives the pair fork, five chains and two highlighted singleton chains', () => {
  const input = example('chain2'), before = copy(input), { pairs, forest } = nmConstruction(input);
  assert.deepEqual(input, before);
  assert.equal(pairs.count, 3); assert.equal(forest.count, 5);
  assert.deepEqual(pairs.edges.sort(), [[pid('p0', 'p1'), pid('p0', 'p0')], [pid('p0', 'p1'), pid('p1', 'p1')]].sort());
  assert.equal(forest.nodes.filter(n => n.diagonal).length, 2);
  for (const n of forest.nodes.filter(n => n.diagonal)) assert.equal(n.chain.length, 1);
});

test('pair covers and every chain agree with independent definitions on all forward-edge posets up to four points', () => {
  for (let size = 0; size <= 4; size++) {
    const possible = [];
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) possible.push([`p${i}`, `p${j}`]);
    for (let mask = 0; mask < 2 ** possible.length; mask++) {
      const input = empty();
      input.nodes = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, label: String(i), x: i * 50, y: 0 }));
      input.edges = possible.filter((_, i) => mask & 2 ** i);
      const original = closure(input), { pairs, forest } = nmConstruction(input, 1000), pairOrder = closure(pairs);
      const expectedPairs = input.nodes.flatMap(x => input.nodes.filter(y => original.le(x.id, y.id)).map(y => pid(x.id, y.id)));
      assert.deepEqual(new Set(pairs.nodes.map(n => n.id)), new Set(expectedPairs));
      for (const a of pairs.nodes) for (const b of pairs.nodes) {
        assert.equal(pairOrder.le(a.id, b.id), original.le(a.left, b.left) && original.le(b.right, a.right));
      }
      assert.deepEqual(new Set(pairs.edges.map(JSON.stringify)), new Set(covers(pairs).map(JSON.stringify)));
      // Enumerate subsets independently. A subset is a chain exactly when every two members are comparable.
      const expectedChains = [];
      for (let subset = 1; subset < 2 ** pairs.nodes.length; subset++) {
        const chain = pairs.nodes.filter((_, i) => subset & 2 ** i);
        if (!chain.every(a => chain.every(b => pairOrder.le(a.id, b.id) || pairOrder.le(b.id, a.id)))) continue;
        chain.sort((a, b) => a.id === b.id ? 0 : pairOrder.le(a.id, b.id) ? -1 : 1);
        expectedChains.push(JSON.stringify(chain.map(n => n.id)));
      }
      assert.deepEqual(new Set(forest.nodes.map(n => n.id)), new Set(expectedChains));
      assert.equal(forest.count, expectedChains.length);
      const chainOrder = closure(forest);
      for (const a of forest.nodes) {
        assert.equal(a.diagonal, a.chain.every(id => { const [x, y] = JSON.parse(id); return x === y; }));
        assert.equal(a.parent, a.chain.length > 1 ? JSON.stringify(a.chain.slice(1)) : null);
        for (const b of forest.nodes) {
          const suffix = a.chain.length >= b.chain.length && b.chain.every((id, i) => id === a.chain[a.chain.length - b.chain.length + i]);
          assert.equal(chainOrder.le(a.id, b.id), suffix);
        }
      }
      assert.equal(forest.nodes.filter(n => n.diagonal).length, size);
      for (const n of pairs.nodes) {
        assert.equal(n.diagonal, !pairs.nodes.some(q => q.id !== n.id && pairOrder.le(n.id, q.id)));
      }
    }
  }
});

test('limits suppress complete oversized stages and keep a smaller preceding stage', () => {
  const newlyAllowed = nmConstruction(example('chain5'));
  assert.equal(newlyAllowed.forest.count, 231); assert.equal(newlyAllowed.forest.exceeded, false);
  const result = nmConstruction(example('chain6'));
  assert.equal(result.pairs.exceeded, false); assert.equal(result.pairs.count, 21);
  assert.equal(result.forest.exceeded, true); assert.deepEqual(result.forest.nodes, []);
  const input = example('chain'); input.nodes = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, label: String(i), x: 0, y: 0 }));
  input.edges = input.nodes.slice(1).map((n, i) => [input.nodes[i].id, n.id]);
  const large = nmConstruction(input);
  assert.equal(large.pairs.count, 325); assert.equal(large.pairs.exceeded, true);
  assert.equal(large.forest.exceeded, true); assert.deepEqual(large.pairs.nodes, []);
  const discrete = empty(); discrete.nodes = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, x: i, y: 0 }));
  const antichain = nmConstruction(discrete);
  assert.equal(antichain.pairs.count, 300); assert.equal(antichain.forest.count, 300);
  assert.equal(antichain.forest.exceeded, false);
  assert.ok(antichain.forest.nodes.every(n => n.diagonal));
});

test('JSON round trips and imports preserve input colors and ignore Godel chain restrictions', () => {
  const input = example('boolean2');
  assert.deepEqual(validate(JSON.parse(JSON.stringify(input))), input);
  const imported = validate({ ...input, format: 'godel-studio', maxChainLength: 1, lastChainLength: 1 });
  assert.equal(imported.format, 'free-nm-studio'); assert.equal(imported.maxChainLength, undefined);
  assert.deepEqual(imported.nodes, input.nodes);
  assert.equal(nmConstruction(imported).forest.count, nmConstruction(input).forest.count);
  const poset = validate({ ...input, format: 'poset-studio' });
  assert.equal(poset.format, 'free-nm-studio');
  assert.throws(() => validate({ ...input, edges: [['p0', 'p1'], ['p1', 'p0']] }), /cycle/);
  assert.throws(() => validate({ ...input, nodes: [...input.nodes, input.nodes[0]] }), /duplicate/);
});

test('pair identities remain unambiguous for imported IDs containing punctuation', () => {
  const input = empty(); input.nodes = ['a,b', 'a', 'b,c', 'c', '["a"]'].map((id, i) => ({ id, label: id, x: i, y: 0 }));
  input.edges = input.nodes.slice(1).map((n, i) => [input.nodes[i].id, n.id]);
  const pairs = pairPoset(input);
  assert.equal(new Set(pairs.nodes.map(n => n.id)).size, 15);
  for (const n of pairs.nodes) assert.deepEqual(JSON.parse(n.id), [n.left, n.right]);
});
