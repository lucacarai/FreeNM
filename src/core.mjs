export const OUTPUT_LIMIT = 300;
export const GAP = 44;
export const copy = value => JSON.parse(JSON.stringify(value));
export const PALETTE = ['#d85555', '#397bd5', '#ebc33f', '#37a58c', '#ac68c6', '#e58b40', '#6670bc', '#a17c58'];
export const CHAIN_HUE_DECAY = .15;

export function closure(model) {
  const ids = model.nodes.map(n => n.id), index = new Map(ids.map((id, i) => [id, i]));
  const r = ids.map((_, i) => ids.map((__, j) => i === j));
  for (const [a, b] of model.edges) r[index.get(a)][index.get(b)] = true;
  for (let k = 0; k < ids.length; k++) for (let i = 0; i < ids.length; i++) if (r[i][k]) {
    for (let j = 0; j < ids.length; j++) r[i][j] ||= r[k][j];
  }
  return { ids, r, index, le: (a, b) => r[index.get(a)]?.[index.get(b)] ?? false };
}

export function covers(model, order = closure(model)) {
  const { ids, r } = order;
  return ids.flatMap((a, i) => ids.flatMap((b, j) => i !== j && r[i][j] && !ids.some((_, k) => k !== i && k !== j && r[i][k] && r[k][j]) ? [[a, b]] : []));
}

// j is irreducible iff some q is above all strict predecessors of j, but not j.
// This includes every minimal point unless the poset has a least element.
export function irreducibles(model, order = closure(model)) {
  return order.ids.filter(j => {
    const below = order.ids.filter(x => x !== j && order.le(x, j));
    return order.ids.some(q => !order.le(j, q) && below.every(x => order.le(x, q)));
  });
}

function freshPigment(index) {
  if (index < PALETTE.length) return PALETTE[index];
  const h = ((index - PALETTE.length) * 137.508 + 18) % 360, s = .56, l = .51;
  const a = s * Math.min(l, 1 - l);
  return '#' + [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  }).join('');
}

export function withPigments(model) {
  const next = copy(model), generators = new Set(irreducibles(next));
  const used = new Set(next.nodes.map(n => n.pigment).filter(Boolean));
  let index = 0;
  for (const n of next.nodes) if (generators.has(n.id) && !n.pigment) {
    let pigment;
    do { pigment = freshPigment(index++); } while (used.has(pigment));
    n.pigment = pigment; used.add(pigment);
  }
  return next;
}

// Weighted pigment concentrations in a simplified Kubelka–Munk reflectance model.
// Mix the complete set once, rather than recursively mixing pairwise results.
export function mixPigments(hexes, weights = hexes.map(() => 1)) {
  if (!hexes.length) return '#ffffff';
  if (weights.length !== hexes.length || weights.some(w => !Number.isFinite(w) || w < 0) || !weights.some(w => w > 0)) throw Error('Pigment weights must be nonnegative, with a positive total.');
  if (hexes.length === 1) return hexes[0];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return '#' + [1, 3, 5].map(offset => {
    const ks = hexes.reduce((sum, hex, i) => {
      const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      const r = Math.max(.0001, v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return sum + weights[i] * (1 - r) ** 2 / (2 * r);
    }, 0) / totalWeight;
    const r = 1 / (1 + ks + Math.sqrt(ks * ks + 2 * ks));
    const v = r <= .0031308 ? 12.92 * r : 1.055 * r ** (1 / 2.4) - .055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  }).join('');
}

export function coloring(model, order = closure(model)) {
  const generators = irreducibles(model, order), byId = new Map(model.nodes.map(n => [n.id, n]));
  const hues = new Map(order.ids.map(id => [id, generators.filter(j => order.le(j, id))]));
  const weights = new Map(order.ids.map(id => {
    const members = hues.get(id), depths = new Map();
    function depth(j) {
      if (!depths.has(j)) depths.set(j, Math.max(0, ...members.filter(k => k !== j && order.le(j, k)).map(k => 1 + depth(k))));
      return depths.get(j);
    }
    // Only comparable generators suppress each other. In a powerset all
    // generators are atoms, so every weight remains 1, preserving its colors.
    return [id, members.map(j => CHAIN_HUE_DECAY ** depth(j))];
  }));
  const fills = new Map(order.ids.map(id => [id, mixPigments(hues.get(id).map(j => byId.get(j).pigment), weights.get(id))]));
  return { generators, hues, weights, fills };
}

// Every chain has a unique minimum. Count by that minimum using ALL strict
// comparisons, not only covers; this includes chains that skip levels.
export function posetHeight(model, order = closure(model)) {
  const memo = new Map();
  function height(id) {
    if (!memo.has(id)) memo.set(id, 1 + Math.max(0, ...order.ids.filter(q => q !== id && order.le(id, q)).map(height)));
    return memo.get(id);
  }
  return Math.max(0, ...order.ids.map(height));
}

export function chainCount(model, limit = OUTPUT_LIMIT, order = closure(model)) {
  if (model.nodes.length > limit) return limit + 1;
  const maxLength = Math.min(model.maxChainLength ?? model.nodes.length, model.nodes.length);
  const memo = Array.from({ length: maxLength + 1 }, () => new Map());
  function count(id, remaining) {
    if (!memo[remaining].has(id)) {
      let total = 1;
      if (remaining > 1) for (const q of order.ids) if (q !== id && order.le(id, q)) {
        total = Math.min(limit + 1, total + count(q, remaining - 1));
        if (total > limit) break;
      }
      memo[remaining].set(id, total);
    }
    return memo[remaining].get(id);
  }
  let total = 0;
  for (const id of order.ids) { total += count(id, maxLength); if (total > limit) return limit + 1; }
  return total;
}

export function rootSystem(model, limit = OUTPUT_LIMIT, order = closure(model)) {
  const count = chainCount(model, limit, order);
  if (count > limit) return { count, exceeded: true, nodes: [], edges: [] };
  const nodes = [], edges = [], sorted = [...model.nodes].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const maxLength = model.maxChainLength ?? model.nodes.length;
  function extend(chain, parent = null) {
    const id = JSON.stringify(chain), node = { id, chain, minimum: chain[0], parent, x: 0, y: 0 };
    nodes.push(node);
    if (parent) edges.push([id, parent]);
    if (chain.length >= maxLength) return;
    for (const n of sorted) if (n.id !== chain[0] && order.le(n.id, chain[0])) extend([n.id, ...chain], id);
  }
  for (const n of sorted) extend([n.id]);
  return layoutRootSystem({ count, exceeded: false, nodes, edges });
}

export function layoutRootSystem(forest, { width = 700, height = 500, spacing = 56 } = {}) {
  if (!forest.nodes.length) return forest;
  const nodes = forest.nodes.map(n => ({ ...n, x: 0, y: (n.chain.length - 1) * 86 }));
  const children = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) if (n.parent) children.get(n.parent).push(n);
  const components = nodes.filter(n => !n.parent).map(root => {
    let cursor = 0; const members = [];
    function place(n) {
      members.push(n); const below = children.get(n.id);
      if (!below.length) { n.x = cursor; cursor += spacing; }
      else { below.forEach(place); n.x = (below[0].x + below.at(-1).x) / 2; }
    }
    place(root);
    return { members, highlighted: members.some(n => n.diagonal), width: cursor, height: Math.max(...members.map(n => n.y)) + 44 };
  });
  // Yellow components come first, then size. Stable ties retain input order.
  components.sort((a, b) => Number(b.highlighted) - Number(a.highlighted) || b.members.length - a.members.length);
  function pack(budget) {
    const rows = []; let row = { items: [], width: 0, height: 0 };
    for (const component of components) {
      const gap = row.items.length ? 35 : 0;
      if (row.items.length && row.width + gap + component.width > budget) {
        rows.push(row); row = { items: [], width: 0, height: 0 };
      }
      const x = row.width + (row.items.length ? 35 : 0);
      row.items.push({ component, x }); row.width = x + component.width; row.height = Math.max(row.height, component.height);
    }
    rows.push(row);
    const w = Math.max(...rows.map(r => r.width)), h = rows.reduce((sum, r) => sum + r.height, 0) + (rows.length - 1) * 65;
    return { rows, scale: Math.min(Math.max(1, width - 80) / w, Math.max(1, height - 100) / h) };
  }
  const single = pack(Infinity), budgets = new Set([Math.max(...components.map(c => c.width)), Math.max(1, width - 80) / .55]);
  let prefix = 0;
  for (const c of components) { prefix += (prefix ? 35 : 0) + c.width; budgets.add(prefix); }
  let best = single;
  for (const budget of budgets) {
    const candidate = pack(budget);
    if (candidate.scale > best.scale + .001 || (Math.abs(candidate.scale - best.scale) <= .001 && candidate.rows.length < best.rows.length)) best = candidate;
  }
  // Prefer a shared horizontal baseline if points remain reasonably readable,
  // even when wrapping would make them somewhat larger.
  const layout = single.scale >= Math.min(.55, best.scale * .7) ? single : best;
  let y = 0;
  for (const row of layout.rows) {
    for (const { component, x } of row.items) for (const n of component.members) { n.x += x; n.y += y; }
    y += row.height + 65;
  }
  return { ...forest, nodes };
}

export function enforceLayout(model) {
  const next = copy(model), byId = new Map(next.nodes.map(n => [n.id, n])), done = new Set();
  const uppers = new Map(next.nodes.map(n => [n.id, []]));
  next.edges.forEach(([a, b]) => uppers.get(a).push(b));
  function place(id) {
    if (done.has(id)) return byId.get(id).y;
    const n = byId.get(id);
    for (const b of uppers.get(id)) n.y = Math.max(n.y, place(b) + GAP);
    done.add(id); return n.y;
  }
  next.nodes.forEach(n => place(n.id)); return next;
}

export function constrainPosition(model, id, x, y, snap = false) {
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  let min = -Infinity, max = Infinity;
  for (const [a, b] of model.edges) {
    if (a === id) min = Math.max(min, byId.get(b).y + GAP);
    if (b === id) max = Math.min(max, byId.get(a).y - GAP);
  }
  const step = snap ? 25 : 1;
  return { x: Math.round(x / step) * step, y: Math.max(min, Math.min(max, Math.round(y / step) * step)) };
}

export function addRelation(model, a, b) {
  const order = closure(model);
  if (!order.index.has(a) || !order.index.has(b)) throw Error('Unknown point.');
  if (a === b) throw Error('Choose two different points.');
  if (order.le(b, a)) throw Error('This relation would create a cycle.');
  if (order.le(a, b)) throw Error('This relation is already implied.');
  const next = copy(model); next.edges.push([a, b]); next.edges = covers(next);
  return withPigments(enforceLayout(next));
}

export function removeNode(model, id) {
  const order = closure(model), next = copy(model);
  next.nodes = next.nodes.filter(n => n.id !== id);
  next.edges = next.nodes.flatMap(a => next.nodes.flatMap(b => a.id !== b.id && order.le(a.id, b.id) ? [[a.id, b.id]] : []));
  next.edges = covers(next); return withPigments(next);
}

export function arrange(model) {
  const next = copy(model), order = closure(next), memo = new Map();
  function rank(id) {
    if (!memo.has(id)) memo.set(id, Math.max(0, ...order.ids.filter(q => q !== id && order.le(q, id)).map(q => rank(q) + 1)));
    return memo.get(id);
  }
  const height = Math.max(0, ...order.ids.map(rank));
  for (let level = 0; level <= height; level++) {
    const row = next.nodes.filter(n => rank(n.id) === level).sort((a, b) => a.x - b.x);
    row.forEach((n, i) => { n.x = 250 + (i - (row.length - 1) / 2) * 85; n.y = 60 + (height - level) * 110; });
  }
  return next;
}

export const empty = () => ({ format: 'free-nm-studio', version: 1, title: 'Untitled poset', m: null, n: null, lastM: 1, lastN: 1, nodes: [], edges: [] });

function naturalOrAll(value, name) {
  if (value === null || (Number.isSafeInteger(value) && value >= 0)) return value;
  throw Error(`Parameter ${name} must be a nonnegative whole number or All.`);
}

export function example(kind = 'boolean2') {
  const m = empty();
  if (kind.startsWith('boolean')) {
    const size = Number(kind.slice(7)), total = 2 ** size;
    m.title = `Powerset of a ${size}-element set`;
    for (let mask = 0; mask < total; mask++) {
      const members = Array.from({ length: size }, (_, i) => i).filter(i => mask & 2 ** i);
      m.nodes.push({ id: `p${mask}`, label: members.length ? `{${members.map(i => String.fromCharCode(97 + i)).join(',')}}` : '∅', x: mask * 40, y: 0, pigment: null });
      for (let bit = 0; bit < size; bit++) if (!(mask & 2 ** bit)) m.edges.push([`p${mask}`, `p${mask | 2 ** bit}`]);
    }
  } else {
    const size = ({ chain2: 2, chain3: 3, chain5: 5, chain6: 6, chain8: 8 })[kind] ?? 4;
    m.title = kind === 'antichain' ? 'Four-point antichain' : `${size}-point chain`;
    m.nodes = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, label: String.fromCharCode(97 + i), x: i * 80, y: 0, pigment: null }));
    if (kind !== 'antichain') m.edges = m.nodes.slice(1).map((n, i) => [m.nodes[i].id, n.id]);
  }
  return withPigments(arrange(m));
}

export function validate(input) {
  if (!input || !['free-nm-studio', 'godel-studio', 'poset-studio'].includes(input.format) || input.version !== 1 || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw Error('Choose a Free NM, Free Godel, or Poset Studio JSON file.');
  // Diagonal pairs already exceed the middle diagram's limit beyond this size.
  if (input.nodes.length > OUTPUT_LIMIT) throw Error('More than 300 input points exceed the pair diagram limit.');
  const ids = new Set();
  const next = empty(); next.title = typeof input.title === 'string' ? input.title.slice(0, 100) : next.title;
  const keepPigments = input.format !== 'poset-studio';
  if (input.format === 'free-nm-studio') {
    next.m = naturalOrAll(input.m ?? null, 'm');
    next.n = naturalOrAll(input.n ?? null, 'n');
    next.lastM = naturalOrAll(input.lastM ?? next.m ?? 1, 'm');
    next.lastN = naturalOrAll(input.lastN ?? next.n ?? 1, 'n');
    if (next.lastM === null || next.lastN === null) throw Error('Remembered parameter values must be nonnegative whole numbers.');
  }
  for (const n of input.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 150 || ids.has(n.id) || typeof n.label !== 'string' || n.label.length > 80 || !Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000 || (keepPigments && n.pigment != null && !/^#[0-9a-f]{6}$/i.test(n.pigment))) throw Error('The file contains an invalid or duplicate point.');
    ids.add(n.id); next.nodes.push({ id: n.id, label: n.label, x: n.x, y: n.y, pigment: keepPigments ? n.pigment ?? null : null });
  }
  for (const e of input.edges) {
    if (!Array.isArray(e) || e.length !== 2 || !ids.has(e[0]) || !ids.has(e[1]) || e[0] === e[1]) throw Error('The file contains an invalid relation.');
    next.edges.push([...e]);
  }
  const order = closure(next);
  if (order.r.some((row, i) => row.some((v, j) => i !== j && v && order.r[j][i]))) throw Error('The relations contain a cycle.');
  next.edges = covers(next, order);
  return withPigments(enforceLayout(next));
}

// Coordinate order: move the left endpoint up or the right endpoint down.
// A cover changes precisely one coordinate along a cover of X.
export function pairPoset(model, limit = OUTPUT_LIMIT, order = closure(model)) {
  let count = 0;
  for (const x of order.ids) for (const y of order.ids) if (order.le(x, y)) count++;
  if (count > limit) return { count, exceeded: true, nodes: [], edges: [] };
  const id = (x, y) => JSON.stringify([x, y]);
  const nodes = [];
  for (const x of model.nodes) for (const y of model.nodes) if (order.le(x.id, y.id)) {
    nodes.push({ id: id(x.id, y.id), left: x.id, right: y.id, diagonal: x.id === y.id, x: x.x + y.x, y: 0 });
  }
  const inputCovers = covers(model, order), edges = [];
  for (const [a, b] of inputCovers) for (const z of order.ids) {
    if (order.le(b, z)) edges.push([id(a, z), id(b, z)]);
    if (order.le(z, a)) edges.push([id(z, b), id(z, a)]);
  }
  return { ...arrange({ nodes, edges }), count, exceeded: false };
}

export function layoutPairPoset(pairs, { width = 700, height = 500, spacing = 85 } = {}) {
  if (!pairs.nodes.length) return pairs;
  const nodes = pairs.nodes.map(q => ({ ...q, layoutX: q.layoutX ?? q.x }));
  const byId = new Map(nodes.map(q => [q.id, q]));
  const uppers = new Map(nodes.map(q => [q.id, []])), neighbors = new Map(nodes.map(q => [q.id, []]));
  for (const [a, b] of pairs.edges) {
    uppers.get(a).push(b); neighbors.get(a).push(b); neighbors.get(b).push(a);
  }
  const depths = new Map();
  function depth(id) {
    if (!depths.has(id)) depths.set(id, Math.max(0, ...uppers.get(id).map(q => depth(q) + 1)));
    return depths.get(id);
  }
  const visited = new Set(), components = [];
  for (const start of [...nodes].sort((a, b) => a.layoutX - b.layoutX)) {
    if (visited.has(start.id)) continue;
    const members = [], pending = [start.id]; visited.add(start.id);
    while (pending.length) {
      const id = pending.pop(); members.push(byId.get(id));
      for (const q of neighbors.get(id)) if (!visited.has(q)) { visited.add(q); pending.push(q); }
    }
    const rows = new Map();
    for (const q of members) {
      const level = depth(q.id);
      if (!rows.has(level)) rows.set(level, []);
      rows.get(level).push(q);
    }
    const componentWidth = Math.max(...[...rows.values()].map(row => row.length * spacing));
    for (const [level, row] of rows) {
      row.sort((a, b) => a.layoutX - b.layoutX || a.id.localeCompare(b.id));
      row.forEach((q, i) => { q.x = (componentWidth - row.length * spacing) / 2 + (i + .5) * spacing; q.y = level * 110; });
    }
    components.push({ members, width: componentWidth, height: Math.max(...members.map(q => q.y)) + 44 });
  }
  components.sort((a, b) => b.members.length - a.members.length);
  function pack(budget) {
    const rows = []; let row = { items: [], width: 0, height: 0 };
    for (const component of components) {
      if (row.items.length && row.width + 35 + component.width > budget) {
        rows.push(row); row = { items: [], width: 0, height: 0 };
      }
      const x = row.width + (row.items.length ? 35 : 0);
      row.items.push({ component, x }); row.width = x + component.width; row.height = Math.max(row.height, component.height);
    }
    rows.push(row);
    const w = Math.max(...rows.map(r => r.width)), h = rows.reduce((sum, r) => sum + r.height, 0) + (rows.length - 1) * 65;
    return { rows, scale: Math.min(Math.max(1, width - 80) / w, Math.max(1, height - 100) / h) };
  }
  const single = pack(Infinity), budgets = new Set([Math.max(...components.map(c => c.width))]);
  let prefix = 0, best = single;
  for (const component of components) { prefix += (prefix ? 35 : 0) + component.width; budgets.add(prefix); }
  for (const budget of budgets) {
    const candidate = pack(budget);
    if (candidate.scale > best.scale + .001 || (Math.abs(candidate.scale - best.scale) <= .001 && candidate.rows.length < best.rows.length)) best = candidate;
  }
  // Prefer one common horizontal row of diagonal points whenever readable.
  const layout = single.scale >= Math.min(.55, best.scale * .7) ? single : best;
  let y = 0;
  for (const row of layout.rows) {
    for (const { component, x } of row.items) for (const q of component.members) { q.x += x; q.y += y; }
    y += row.height + 65;
  }
  return { ...pairs, nodes };
}

export function nmConstruction(model, limit = OUTPUT_LIMIT) {
  const m = naturalOrAll(model.m ?? null, 'm'), n = naturalOrAll(model.n ?? null, 'n');
  const order = closure(model), pairs = pairPoset(model, limit, order);
  const exceeded = () => ({ count: limit + 1, exceeded: true, nodes: [], edges: [] });
  // If m includes singletons, every pair appears as a singleton chain.
  if (pairs.exceeded && m !== 0) return { pairs, forest: exceeded() };
  let candidates = pairs.nodes;
  if (pairs.exceeded) {
    // When m=0 only diagonal-rooted trees remain. Build just diagonal roots
    // for n<=1; larger n can use endpoint comparisons without pair closure.
    candidates = [];
    for (const x of model.nodes) for (const y of model.nodes) {
      if (!order.le(x.id, y.id) || (n !== null && n <= 1 && x.id !== y.id)) continue;
      candidates.push({ id: JSON.stringify([x.id, y.id]), left: x.id, right: y.id, diagonal: x.id === y.id, x: x.x + y.x, y: 0 });
    }
  }
  const sorted = [...candidates].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const boundFor = root => Math.min(candidates.length, root.diagonal ? Math.max(m ?? Infinity, n ?? Infinity) : m ?? Infinity);
  const below = (a, b) => a.id !== b.id && order.le(a.left, b.left) && order.le(b.right, a.right);
  // A diagonal pair is maximal, so a chain meets the diagonal iff its last
  // pair is diagonal. A single size bound therefore applies to each tree.
  const memo = new Map();
  function countBelow(root, remaining) {
    if (!memo.has(remaining)) memo.set(remaining, new Map());
    const level = memo.get(remaining);
    if (!level.has(root.id)) {
      let count = 1;
      if (remaining > 1) for (const q of sorted) if (below(q, root)) {
        count = Math.min(limit + 1, count + countBelow(q, remaining - 1));
        if (count > limit) break;
      }
      level.set(root.id, count);
    }
    return level.get(root.id);
  }
  let count = 0;
  for (const root of sorted) {
    const bound = boundFor(root);
    if (bound) count += countBelow(root, bound);
    if (count > limit) return { pairs, forest: exceeded() };
  }
  const nodes = [], edges = [];
  function extend(chain, bottom, bound, diagonalRoot, parent = null) {
    const id = JSON.stringify(chain);
    nodes.push({ id, chain, minimum: bottom.id, parent, diagonal: diagonalRoot && chain.length === 1, x: 0, y: 0 });
    if (parent) edges.push([id, parent]);
    if (chain.length >= bound) return;
    for (const q of sorted) if (below(q, bottom)) extend([q.id, ...chain], q, bound, diagonalRoot, id);
  }
  for (const root of sorted) {
    const bound = boundFor(root);
    if (bound) extend([root.id], root, bound, root.diagonal);
  }
  const forest = layoutRootSystem({ count, exceeded: false, nodes, edges });
  if (pairs.exceeded) {
    const used = new Set(nodes.map(q => q.minimum));
    pairs.references = candidates.filter(q => used.has(q.id));
  }
  return { pairs, forest };
}
