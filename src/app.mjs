import { OUTPUT_LIMIT, copy, closure, covers, coloring, withPigments, nmConstruction, layoutPairPoset, layoutRootSystem, constrainPosition, addRelation, removeNode, arrange, empty, example, validate } from './core.mjs';

const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
const canvases = { input: $('input-canvas'), pairs: $('pairs-canvas'), output: $('output-canvas') };
const views = { pairs: { x: 0, y: 0, w: 500, h: 500 }, input: { x: 0, y: 0, w: 500, h: 500 }, output: { x: 0, y: 0, w: 700, h: 500 } };
const storageKey = 'free-nm-studio-v1';
const visibilityKey = 'free-nm-visibility-v1';
const panelVisibility = { pairs: true, output: true };
try {
  const saved = JSON.parse(localStorage.getItem(visibilityKey) || '{}');
  for (const key of ['pairs', 'output']) if (typeof saved?.[key] === 'boolean') panelVisibility[key] = saved[key];
} catch { /* Use the default view when browser settings are unavailable. */ }
let model = example(), order, colors, pairs, forest, undo = [], redo = [], tool = 'move';
let selected = null, hover = null, source = null, gesture = null, startupError = '', exporting = false;
let outputWidth = 0, outputHeight = 0;
let pairsWidth = 0, pairsHeight = 0;
try { const saved = localStorage.getItem(storageKey); if (saved) model = validate(JSON.parse(saved)); }
catch { startupError = 'The saved drawing could not be opened. Use Open to load a file.'; }

function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
function html(tag, className, text) {
  const n = document.createElement(tag); if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
const inputNode = id => model.nodes.find(n => n.id === id);
const outputNode = id => forest.nodes.find(n => n.id === id);
const label = id => inputNode(id)?.label || id;
const pairNode = id => pairs.nodes.find(n => n.id === id) || pairs.references?.find(n => n.id === id);
const pairText = id => { const n = pairNode(id); return n ? `(${label(n.left)}, ${label(n.right)})` : id; };
const chainText = chain => '[' + chain.map(pairText).join(' < ') + ']';
const info = () => hover || (selected?.type !== 'edge' ? selected : null);

function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(model)); $('saved').textContent = 'Saved on this device'; }
  catch { $('saved').textContent = 'Use Save file to keep this drawing'; }
}
function rebuild() {
  order = closure(model); colors = coloring(model, order); ({ pairs, forest } = nmConstruction(model));
  layoutPairs();
  layoutOutput();
}
function layoutPairs() {
  if (!panelVisibility.pairs) return;
  pairsWidth = canvases.pairs.clientWidth; pairsHeight = canvases.pairs.clientHeight;
  const spacing = $('pair-labels').checked ? Math.max(85, ...pairs.nodes.map(n => pairText(n.id).length * 7.5 + 35)) : 85;
  pairs = layoutPairPoset(pairs, { width: pairsWidth, height: pairsHeight, spacing });
}
function layoutOutput() {
  if (!panelVisibility.output) return;
  outputWidth = canvases.output.clientWidth; outputHeight = canvases.output.clientHeight;
  const spacing = $('chain-labels').checked ? Math.max(56, ...forest.nodes.map(n => chainText(n.chain).length * 7.5 + 24)) : 56;
  forest = layoutRootSystem(forest, { width: outputWidth, height: outputHeight, spacing });
}
function resizeOutput() {
  const pairsChanged = panelVisibility.pairs && canvases.pairs.clientWidth > 0 && canvases.pairs.clientHeight > 0 && (canvases.pairs.clientWidth !== pairsWidth || canvases.pairs.clientHeight !== pairsHeight);
  const outputChanged = panelVisibility.output && canvases.output.clientWidth > 0 && canvases.output.clientHeight > 0 && (canvases.output.clientWidth !== outputWidth || canvases.output.clientHeight !== outputHeight);
  if (!pairsChanged && !outputChanged) return;
  if ((pairsChanged && gesture?.panel === 'pairs') || (outputChanged && gesture?.panel === 'output')) cancelGesture();
  if (pairsChanged) { layoutPairs(); drawPanel('pairs'); fit('pairs'); }
  if (outputChanged) { layoutOutput(); drawPanel('output'); fit('output'); }
  refreshInteraction();
}
function commit(next, text = '', fitInput = false) {
  next = withPigments(next);
  if (JSON.stringify(next) === JSON.stringify(model)) return;
  undo.push(copy(model)); if (undo.length > 100) undo.shift(); redo = []; model = next;
  hover = null;
  if (selected?.panel === 'input' && selected.type !== 'edge' && !inputNode(selected.id)) selected = null;
  if (selected && selected.panel !== 'input') selected = null;
  source = null; persist(); rebuild(); render(); fit('pairs'); fit('output'); if (fitInput) fit('input');
  if (text) status(text);
}
function history(back) {
  const from = back ? undo : redo, to = back ? redo : undo; if (!from.length) return;
  cancelGesture(); to.push(copy(model)); model = from.pop(); selected = hover = source = null;
  persist(); rebuild(); render(); fit('input'); fit('pairs'); fit('output'); status(back ? 'Edit undone.' : 'Edit restored.');
}

function updateView(panel) {
  const v = views[panel]; canvases[panel].setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}
function points(panel) { return panel === 'input' ? model.nodes : panel === 'pairs' ? pairs.nodes : forest.nodes; }
function fit(panel) {
  if (panel !== 'input' && !panelVisibility[panel]) return;
  const nodes = points(panel), svg = canvases[panel], ratio = Math.max(.1, svg.clientWidth / Math.max(1, svg.clientHeight));
  if (!nodes.length) { views[panel] = { x: 0, y: 0, w: 500 * ratio, h: 500 }; updateView(panel); return; }
  let minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
  let minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y));
  const box = svg.querySelector('.points').getBBox();
  minX = Math.min(minX, box.x); maxX = Math.max(maxX, box.x + box.width);
  minY = Math.min(minY, box.y); maxY = Math.max(maxY, box.y + box.height);
  let w = Math.max(panel === 'input' ? 300 : 380, maxX - minX + 80), h = Math.max(320, maxY - minY + 100);
  if (w / h < ratio) w = h * ratio; else h = w / ratio;
  views[panel] = { x: (minX + maxX - w) / 2, y: (minY + maxY - h) / 2, w, h }; updateView(panel);
}
function position(event, panel) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(canvases[panel].getScreenCTM().inverse());
}
function zoom(panel, factor, at = null) {
  const v = views[panel], w = v.w * factor, h = v.h * factor;
  if (w < 65 || w > 100000) return;
  const p = at || { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  views[panel] = { x: p.x - (p.x - v.x) * factor, y: p.y - (p.y - v.y) * factor, w, h }; updateView(panel);
}

function drawPanel(panel) {
  const svg = canvases[panel], nodes = points(panel), byId = new Map(nodes.map(n => [n.id, n]));
  const edgeLayer = svg.querySelector('.edges'), backLayer = svg.querySelector('.point-backs'), pointLayer = svg.querySelector('.points');
  edgeLayer.replaceChildren(); backLayer.replaceChildren(); pointLayer.replaceChildren();
  const edges = panel === 'input' ? model.edges : panel === 'pairs' ? pairs.edges : forest.edges;
  for (const [a, b] of edges) {
    const n = byId.get(a), m = byId.get(b), attrs = { x1: n.x, y1: n.y, x2: m.x, y2: m.y };
    const line = svgEl('line', { ...attrs, class: 'edge', 'data-a': a, 'data-b': b }); edgeLayer.append(line);
    if (panel === 'input') {
      const hit = svgEl('line', { ...attrs, class: 'edge-hit', role: 'button', tabindex: 0, 'aria-label': `Cover ${label(a)} < ${label(b)}`, 'data-a': a, 'data-b': b });
      const choose = () => { if (tool !== 'move') return; selected = { panel, type: 'edge', a, b }; hover = source = null; refreshInteraction(); status('Delete removes the selected cover.'); };
      hit.addEventListener('click', e => { e.stopPropagation(); choose(); });
      hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      edgeLayer.append(hit);
    }
  }
  for (const n of nodes) {
    // Keep this backing outside the point group so fading never exposes edges.
    backLayer.append(svgEl('circle', { cx: n.x, cy: n.y, r: 10.3, class: 'point-back' }));
    const pair = panel === 'input' ? null : pairNode(panel === 'pairs' ? n.id : n.minimum);
    const text = panel === 'input' ? n.label : panel === 'pairs' ? pairText(n.id) : chainText(n.chain);
    const group = svgEl('g', { class: 'point', transform: `translate(${n.x} ${n.y})`, 'data-id': n.id, role: 'button', tabindex: 0, 'aria-label': `${panel === 'input' ? 'Point' : panel === 'pairs' ? 'Pair' : 'Chain'} ${text}${n.diagonal ? ', diagonal' : ''}` });
    group.append(svgEl('title', {}, text), svgEl('circle', { r: 27, class: 'hit' }));
    if (n.diagonal) group.append(svgEl('circle', { r: 19, class: 'diagonal-halo' }), svgEl('circle', { r: 19, class: 'diagonal-outline' }));
    group.append(svgEl('circle', { r: 23, class: 'ring' }), svgEl('circle', { r: 27, class: 'minimum-ring' }));
    const left = colors.fills.get(pair ? pair.left : n.id), right = pair ? colors.fills.get(pair.right) : left;
    if (left === right) group.append(svgEl('circle', { r: 9.5, fill: left, class: 'core' }));
    else {
      group.append(svgEl('circle', { r: 9.5, fill: left, class: 'half-fill' }), svgEl('path', { d: 'M 0 -9.5 A 9.5 9.5 0 0 1 0 9.5 Z', fill: right, class: 'half-fill' }), svgEl('circle', { r: 9.5, fill: 'none', class: 'core' }));
    }
    if ((panel === 'input' && $('input-labels').checked) || (panel === 'pairs' && $('pair-labels').checked) || (panel === 'output' && $('chain-labels').checked)) {
      group.append(svgEl('text', { x: 17, y: -23 }, text));
    }
    group.addEventListener('pointerenter', () => { if (!gesture && !(panel === 'input' && tool === 'order' && source)) setHover({ panel, id: n.id }); });
    group.addEventListener('pointerleave', () => { if (!gesture) setHover(null); });
    group.addEventListener('focus', () => { if (!gesture) setHover({ panel, id: n.id }); });
    group.addEventListener('blur', () => { if (!gesture) setHover(null); });
    group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(panel, n.id); } });
    group.addEventListener('pointerdown', e => startPointGesture(e, panel, n.id));
    pointLayer.append(group);
  }
}

function renderOutputTitle() {
  const title = $('output-title'), { m, n } = model;
  const text = value => document.createTextNode(value);
  const x = superscript => {
    // Use the math font's script metrics and glyphs for X's superscript.
    const mathNS = 'http://www.w3.org/1998/Math/MathML';
    const term = document.createElementNS(mathNS, 'math'), power = document.createElementNS(mathNS, 'msup');
    const variable = document.createElementNS(mathNS, 'mi'), exponent = document.createElementNS(mathNS, 'mo');
    variable.textContent = 'X'; exponent.textContent = superscript;
    power.append(variable, exponent); term.append(power); return term;
  };
  const cc = key => {
    const term = html('span', 'math-term', 'CC');
    if (model[key] !== null) term.append(html('sub', '', String(model[key])));
    term.append(text('('), x('\u2264'), text(')')); return term;
  };
  const marked = symbol => { const term = html('span', 'math-term', symbol); term.append(x('=')); return term; };
  title.replaceChildren(text('('));
  if (m === 0 && n === 0) {
    title.append(text('\u2205, \u2205)')); return;
  }
  if (m === null || (n !== null && n <= m)) title.append(cc('m'));
  else if (m === 0) {
    if (n !== null) title.append(cc('n'), text(' \u2229 '));
    title.append(marked('\u2662'));
  } else {
    title.append(cc('m'), text(' \u222a '));
    if (n !== null) title.append(text('('), cc('n'), text(' \u2229 '));
    title.append(marked('\u2662'));
    if (n !== null) title.append(text(')'));
  }
  title.append(text(', '), marked('\u25a1'), text(')'));
}

function render() {
  renderOutputTitle();
  for (const key of ['m', 'n']) {
    const all = model[key] === null, field = $('parameter-' + key);
    $('all-' + key).checked = all;
    field.setAttribute('type', all ? 'text' : 'number'); field.disabled = all;
    field.value = all ? 'All' : String(model[key]); field.setAttribute('aria-invalid', 'false');
  }
  $('input-count').textContent = `${model.nodes.length} point${model.nodes.length === 1 ? '' : 's'}`;
  $('pairs-count').textContent = `${pairs.count} element${pairs.count === 1 ? '' : 's'}`;
  $('pairs-count').style.color = pairs.exceeded ? '#a05640' : '';
  $('pairs-notice').hidden = !pairs.exceeded && !!model.nodes.length;
  $('pairs-notice').classList.toggle('limit-error', pairs.exceeded);
  $('pairs-message').textContent = pairs.exceeded ? 'This input produces more than 300 pairs. Remove input points or order relations to display the complete pair poset.' : 'Add points to construct comparable pairs.';
  $('output-count').textContent = forest.exceeded ? 'More than 300 elements' : `${forest.count} element${forest.count === 1 ? '' : 's'}`;
  $('output-count').style.color = forest.exceeded ? '#a05640' : '';
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  $('delete-poset').disabled = !model.nodes.length;
  $('input-empty').hidden = !!model.nodes.length;
  $('output-notice').hidden = !forest.exceeded && forest.count > 0;
  $('output-notice').classList.toggle('limit-error', forest.exceeded);
  $('output-message').textContent = forest.exceeded ? 'These parameters produce more than 300 points. Lower m or n, or simplify the input, to display the complete chain poset.' : model.nodes.length ? 'No nonempty chains satisfy these parameters.' : 'Add points to construct the root system.';
  document.querySelectorAll('[data-export]').forEach(b => b.disabled = exporting || !points(b.dataset.export).length);
  drawPanel('input'); drawPanel('pairs'); drawPanel('output'); drawLegend(); refreshInteraction();
}
function setHover(value) {
  if (hover?.panel === value?.panel && hover?.id === value?.id) return;
  hover = value; refreshInteraction();
}
function refreshInteraction() {
  const active = info(), inputs = new Set(), pairMembers = new Set(), outputPath = new Set();
  let minimum = null;
  if (active?.panel === 'input' && inputNode(active.id)) {
    inputs.add(active.id);
    for (const n of [...pairs.nodes, ...(pairs.references || [])]) if (n.left === active.id || n.right === active.id) pairMembers.add(n.id);
  }
  if (active?.panel === 'pairs' && pairNode(active.id)) pairMembers.add(active.id);
  if (active?.panel === 'output') {
    const chain = outputNode(active.id)?.chain;
    if (chain) { chain.forEach(id => pairMembers.add(id)); minimum = chain[0]; for (let i = 0; i < chain.length; i++) outputPath.add(JSON.stringify(chain.slice(i))); }
  }
  if (active?.panel === 'output') {
    const pair = pairNode(minimum);
    if (pair) { inputs.add(pair.left); inputs.add(pair.right); }
  } else if (active?.panel === 'pairs') for (const id of pairMembers) {
    const n = pairNode(id); inputs.add(n.left); inputs.add(n.right);
  }
  const relatedTo = (panel, id) => {
    if (panel === 'input') return inputs.has(id);
    if (panel === 'pairs') return pairMembers.has(id);
    if (active?.panel === 'output') return outputPath.has(id);
    const node = outputNode(id);
    if (active?.panel === 'pairs') return node?.minimum === active.id;
    return pairMembers.has(node?.minimum);
  };
  for (const [panel, svg] of Object.entries(canvases)) {
    for (const g of svg.querySelectorAll('.point')) {
      const id = g.dataset.id;
      g.classList.toggle('related', !!active && !!relatedTo(panel, id));
      g.classList.toggle('dim', !!active && !relatedTo(panel, id));
      g.classList.toggle('minimum', panel === 'pairs' && !!active && id === minimum);
      g.classList.toggle('pinned', selected?.panel === panel && selected.id === id);
      g.classList.toggle('source', panel === 'input' && source === id);
      // Clip the existing circle instead of joining independently drawn arcs.
      const coordinateInspection = active?.panel === 'input' && panel !== 'input';
      const pair = coordinateInspection ? pairNode(panel === 'pairs' ? id : outputNode(id)?.minimum) : null;
      g.classList.toggle('coordinate-inspection', coordinateInspection);
      g.classList.toggle('coordinate-left', !!pair && pair.left === active.id);
      g.classList.toggle('coordinate-right', !!pair && pair.right === active.id);
    }
    for (const line of svg.querySelectorAll('.edge')) {
      const a = line.dataset.a, b = line.dataset.b, related = relatedTo(panel, a) && relatedTo(panel, b);
      const inputFromOutput = active?.panel === 'output' && panel === 'input';
      const highlightEdges = !!active && !(active.panel === 'input' && panel !== 'input') && !inputFromOutput;
      line.classList.toggle('dim', active?.panel === 'input' || inputFromOutput || (highlightEdges && !related));
      line.classList.toggle('active', highlightEdges && !!related);
      line.classList.toggle('selected', panel === 'input' && !inputFromOutput && selected?.type === 'edge' && selected.a === a && selected.b === b);
    }
  }
  $('clear-selection').disabled = !selected && !source;
  $('delete').disabled = !selected || selected.panel !== 'input';
  drawInspector(active);
}

function drawInspector(active) {
  const box = $('inspector-content');
  // Do not interrupt typing when pointer/focus events refresh the highlights.
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && active?.panel === 'input' && document.activeElement.dataset.id === active.id) return;
  box.replaceChildren();
  if (!active) {
    if (selected?.type === 'edge') box.append(html('div', 'inspect-title', `${label(selected.a)} < ${label(selected.b)}`), html('p', '', 'Selected cover relation.'));
    else box.append(html('p', '', 'Hover or select a point.'));
    return;
  }
  const n = active.panel === 'input' ? inputNode(active.id) : active.panel === 'pairs' ? pairNode(active.id) : outputNode(active.id); if (!n) return;
  const minimum = active.panel === 'input' ? n.id : n.minimum;
  box.append(html('div', 'inspect-title', active.panel === 'input' ? label(n.id) : active.panel === 'pairs' ? pairText(n.id) : chainText(n.chain)));
  if (active.panel === 'input') {
    if (selected?.panel === 'input' && selected.id === n.id && !hover) {
      const row = html('div', 'label-edit'), lab = html('label', '', 'Label'), input = html('input');
      lab.htmlFor = 'point-label'; input.id = 'point-label'; input.dataset.id = n.id; input.value = n.label; input.maxLength = 80;
      input.addEventListener('change', () => { const next = copy(model); next.nodes.find(q => q.id === n.id).label = input.value.trim() || n.label; commit(next, 'Point renamed.'); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); }); row.append(lab, input); box.append(row);
    }
  } else if (active.panel === 'pairs') {
    box.append(html('div', 'inspect-line', `Left coordinate: ${label(n.left)} · Right coordinate: ${label(n.right)}`));
    box.append(html('div', 'inspect-line', n.diagonal ? 'In X⁼ · diagonal pair · maximal point' : 'Off the diagonal'));
  } else {
    box.append(html('div', 'inspect-line', `Least pair: ${pairText(minimum)} · Chain size: ${n.chain.length}`));
    if (n.parent) box.append(html('div', 'inspect-line', `Upper cover: ${chainText(outputNode(n.parent).chain)}`));
    else box.append(html('div', 'inspect-line', 'Singleton chain · maximal point'));
    if (n.diagonal) box.append(html('div', 'inspect-line', 'Entirely contained in X⁼'));
  }

}
function drawLegend() {
  const list = $('hue-list'); list.replaceChildren(); $('hue-count').textContent = `${colors.generators.length} hues`;
  for (const id of colors.generators) {
    const item = html('div', 'hue-item'), color = html('input'), button = html('button', '', label(id));
    color.type = 'color'; color.value = inputNode(id).pigment; color.setAttribute('aria-label', `Base hue introduced at ${label(id)}`); color.title = `Change hue at ${label(id)}`;
    color.addEventListener('change', () => {
      if (model.nodes.some(n => n.id !== id && n.pigment === color.value)) { color.value = inputNode(id).pigment; status('Choose a hue different from the other base hues.', true); return; }
      const next = copy(model); next.nodes.find(n => n.id === id).pigment = color.value; commit(next, 'Base hue changed.');
    });
    button.setAttribute('aria-label', `Select hue point ${label(id)}`); button.onclick = () => { hover = null; selected = { panel: 'input', id }; refreshInteraction(); };
    item.append(color, button); list.append(item);
  }
  if (!colors.generators.length) list.append(html('p', '', model.nodes.length ? 'No base hues. The least point is white.' : 'Add points to assign base hues.'));
}

function activate(panel, id) {
  hover = null;
  if (panel === 'input' && tool === 'order') {
    if (!source) { source = id; selected = { panel, id }; refreshInteraction(); status(`Lower point: ${label(id)}. Choose an upper point.`); return; }
    try { const next = addRelation(model, source, id); selected = { panel, id }; commit(next, 'Relation added.', true); }
    catch (error) { status(error.message, true); refreshInteraction(); }
  } else { selected = { panel, id }; refreshInteraction(); }
}
function setTool(next) {
  cancelGesture(); tool = next; source = null; hover = null; document.body.dataset.tool = next;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === next));
  $('order-preview').replaceChildren(); refreshInteraction();
  status({ move: 'Drag points to move. Hover to inspect; click to pin.', point: 'Click empty space to add a point.', order: 'Connect the lower point to the upper point by clicking or dragging.' }[next]);
}
function addPoint(x, y) {
  if (model.nodes.length >= OUTPUT_LIMIT) { status('The input limit is 300 points.', true); return; }
  const next = copy(model), step = $('snap').checked ? 25 : 1;
  let i = 0, name; do { name = i < 26 ? String.fromCharCode(97 + i) : `p${i + 1}`; i++; } while (next.nodes.some(n => n.label === name));
  const id = crypto.randomUUID();
  next.nodes.push({ id, label: name, x: Math.round(x / step) * step, y: Math.round(y / step) * step, pigment: null });
  selected = { panel: 'input', id }; commit(next, `Point ${name} added.`);
}
function deleteSelection() {
  if (selected?.panel !== 'input') return;
  let next;
  if (selected.type === 'edge') { next = copy(model); next.edges = next.edges.filter(([a, b]) => a !== selected.a || b !== selected.b); next.edges = covers(next); }
  else next = removeNode(model, selected.id);
  selected = hover = null; commit(next, 'Selection deleted.');
}
function clearSelection() { cancelGesture(); selected = hover = source = null; $('order-preview').replaceChildren(); refreshInteraction(); }

function applyPanelVisibility(refit = true) {
  cancelGesture();
  for (const panel of ['pairs', 'output']) {
    $(panel + '-panel').hidden = !panelVisibility[panel];
    $('show-' + panel).checked = panelVisibility[panel];
    $('workspace').classList.toggle('without-' + panel, !panelVisibility[panel]);
  }
  if (hover && hover.panel !== 'input' && !panelVisibility[hover.panel]) hover = null;
  if (selected && selected.panel !== 'input' && !panelVisibility[selected.panel]) selected = null;
  if (refit) requestAnimationFrame(() => {
    layoutPairs(); layoutOutput();
    for (const panel of ['pairs', 'output']) if (panelVisibility[panel]) drawPanel(panel);
    refreshInteraction(); fit('input'); fit('pairs'); fit('output');
  });
}

function startPointGesture(e, panel, id) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const p = position(e, panel), n = (panel === 'input' ? inputNode(id) : panel === 'pairs' ? pairNode(id) : outputNode(id));
  gesture = { panel, id, kind: panel === 'input' && tool === 'order' ? 'order' : panel === 'input' && tool === 'move' ? 'move' : 'choose', pointer: e.pointerId, px: e.clientX, py: e.clientY, dx: p.x - n.x, dy: p.y - n.y, start: panel === 'input' && tool === 'move' ? copy(model) : null, moved: false };
  canvases[panel].setPointerCapture(e.pointerId);
}
function pointUnder(e, panel) {
  const g = document.elementFromPoint(e.clientX, e.clientY)?.closest('.point');
  return g && canvases[panel].contains(g) ? g.dataset.id : null;
}
function preview(end, target) {
  const layer = $('order-preview'); layer.replaceChildren(); if (!source) return;
  const n = inputNode(source), q = target ? inputNode(target) : end;
  if (n && q) layer.append(svgEl('line', { x1: n.x, y1: n.y, x2: q.x, y2: q.y, class: 'preview-line' }));
}
function cancelGesture() {
  if (!gesture) return;
  const g = gesture; gesture = null;
  if (g.kind === 'move' && g.moved) { model = g.start; drawPanel('input'); }
  if (canvases[g.panel].hasPointerCapture(g.pointer)) canvases[g.panel].releasePointerCapture(g.pointer);
  $('order-preview').replaceChildren();
}
for (const [panel, svg] of Object.entries(canvases)) {
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.point') || e.target.closest('.edge-hit')) return;
    if (panel === 'input' && tool === 'point') { const p = position(e, panel); addPoint(p.x, p.y); return; }
    gesture = { panel, kind: 'pan', pointer: e.pointerId, px: e.clientX, py: e.clientY, view: { ...views[panel] }, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!gesture) { if (panel === 'input' && tool === 'order' && source) preview(position(e, panel), pointUnder(e, panel)); return; }
    const g = gesture; if (g.panel !== panel || g.pointer !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.px, e.clientY - g.py) < 4) return;
    g.moved = true; hover = null;
    if (g.kind === 'move') {
      const p = position(e, panel), n = inputNode(g.id), next = constrainPosition(model, g.id, p.x - g.dx, p.y - g.dy, $('snap').checked);
      Object.assign(n, next); selected = { panel, id: g.id }; drawPanel('input'); refreshInteraction();
    } else if (g.kind === 'order') { source = g.id; refreshInteraction(); preview(position(e, panel), pointUnder(e, panel)); }
    else if (g.kind === 'pan') {
      const matrix = svg.getScreenCTM();
      views[panel] = { ...g.view, x: g.view.x - (e.clientX - g.px) / matrix.a, y: g.view.y - (e.clientY - g.py) / matrix.d }; updateView(panel);
    }
  });
  svg.addEventListener('pointerup', e => {
    const g = gesture; if (!g || g.pointer !== e.pointerId || g.panel !== panel) return;
    const target = pointUnder(e, panel); gesture = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    $('order-preview').replaceChildren();
    if (g.kind === 'move' && g.moved) {
      if (JSON.stringify(model) !== JSON.stringify(g.start)) { undo.push(g.start); if (undo.length > 100) undo.shift(); redo = []; persist(); rebuild(); render(); fit('pairs'); fit('output'); }
      else refreshInteraction();
    } else if (g.kind === 'order' && g.moved) {
      if (target && target !== g.id) { source = g.id; activate(panel, target); }
      else { source = null; refreshInteraction(); status('Connection cancelled.'); }
    } else if (g.id && !g.moved) activate(panel, g.id);
    else if (g.kind === 'pan' && !g.moved) clearSelection();
  });
  svg.addEventListener('pointercancel', () => { cancelGesture(); source = null; refreshInteraction(); });
  svg.addEventListener('lostpointercapture', () => { if (gesture?.panel === panel) { cancelGesture(); source = null; refreshInteraction(); } });
  svg.addEventListener('pointerleave', () => { if (!gesture) setHover(null); });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoom(panel, e.deltaY > 0 ? 1.12 : 1 / 1.12, position(e, panel)); }, { passive: false });
}

function fileName(suffix) { return (model.title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'poset') + suffix; }
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = html('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function download() { saveBlob(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }), fileName('.json')); status('File saved.'); }
async function downloadPng(panel) {
  if (exporting || !points(panel).length) return;
  exporting = true; document.querySelectorAll('[data-export]').forEach(b => b.disabled = true);
  let url;
  try {
    const svg = canvases[panel], box = svg.querySelector('.points').getBBox();
    const bounds = { x: box.x - 30, y: box.y - 30, width: Math.ceil(box.width + 60), height: Math.ceil(box.height + 60) };
    const clone = svg.cloneNode(true); clone.setAttribute('xmlns', NS); clone.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`); clone.setAttribute('width', bounds.width); clone.setAttribute('height', bounds.height);
    clone.querySelectorAll('defs, .canvas-bg, .point-backs, .hit, .ring, .minimum-ring, .edge-hit, #order-preview, title').forEach(n => n.remove());
    clone.querySelectorAll('.point').forEach(n => n.setAttribute('class', 'point')); clone.querySelectorAll('.edge').forEach(n => n.setAttribute('class', 'edge'));
    const style = svgEl('style', {}, '.diagonal-halo{fill:#f9df78;fill-opacity:.30}.diagonal-outline{fill:none;stroke:#c4ad43;stroke-width:1.4}.half-fill{stroke:none}.edge{stroke:#80917a;stroke-width:1.8}.core{stroke:#536a50;stroke-width:1.6}.point text{font:italic 14px Georgia,serif;fill:#4e6549;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}');
    clone.prepend(style, svgEl('rect', { ...bounds, fill: '#ffffff' }));
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Could not render the PNG.')); image.src = url; });
    const scale = Math.min(2, 4096 / bounds.width, 4096 / bounds.height), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(bounds.width * scale)); canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw Error('Could not create the PNG.');
    saveBlob(blob, fileName(panel === 'input' ? '-input.png' : panel === 'pairs' ? '-pairs.png' : '-chains.png')); status('PNG saved.');
  } catch (error) { status(error.message, true); }
  finally { if (url) URL.revokeObjectURL(url); exporting = false; document.querySelectorAll('[data-export]').forEach(b => b.disabled = !points(b.dataset.export).length); }
}

document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => fit(b.dataset.fit));
document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { const [panel, dir] = b.dataset.zoom.split(':'); zoom(panel, dir === 'in' ? .8 : 1.25); });
document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => downloadPng(b.dataset.export));
for (const panel of ['pairs', 'output']) $('show-' + panel).onchange = e => {
  panelVisibility[panel] = e.target.checked;
  try { localStorage.setItem(visibilityKey, JSON.stringify(panelVisibility)); } catch { /* The view still works without storage. */ }
  applyPanelVisibility();
};
$('clear-selection').onclick = clearSelection; $('delete').onclick = deleteSelection;
$('undo').onclick = () => history(true); $('redo').onclick = () => history(false);
$('arrange').onclick = () => commit(arrange(model), 'Points arranged.', true);
function keepParameters(next) { for (const key of ['m', 'n', 'lastM', 'lastN']) next[key] = model[key]; return next; }
function clearPoset() { clearSelection(); const next = keepParameters(empty()); commit(next, 'Click empty space to add a point.', true); setTool('point'); }
$('blank').onclick = clearPoset;
$('delete-poset').onclick = clearPoset;
$('add-first').onclick = () => { const v = views.input; addPoint(v.x + v.w / 2, v.y + v.h / 2); };
$('examples').onchange = e => { if (!e.target.value) return; selected = null; const next = keepParameters(example(e.target.value)); commit(next, 'Example loaded.', true); e.target.value = ''; setTool('move'); };

for (const key of ['m', 'n']) {
  const remembered = key === 'm' ? 'lastM' : 'lastN';
  $('all-' + key).onchange = e => {
    const next = copy(model);
    next[remembered] = model[key] ?? model[remembered] ?? 1;
    next[key] = e.target.checked ? null : next[remembered];
    commit(next, 'Chain size parameters updated.');
  };
  $('parameter-' + key).onchange = e => {
    if ($('all-' + key).checked) return;
    const raw = e.target.value.trim(), value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) {
      e.target.setAttribute('aria-invalid', 'true'); status('Enter a nonnegative whole number, or select All.', true); return;
    }
    const next = copy(model); next[key] = value; next[remembered] = value;
    commit(next, 'Chain size parameters updated.'); e.target.setAttribute('aria-invalid', 'false');
  };
}

$('input-labels').onchange = () => { drawPanel('input'); refreshInteraction(); };
$('pair-labels').onchange = () => { rebuild(); drawPanel('pairs'); drawPanel('output'); refreshInteraction(); fit('pairs'); fit('output'); };
$('chain-labels').onchange = () => { rebuild(); drawPanel('output'); refreshInteraction(); fit('output'); };
$('save').onclick = download; $('open').onclick = () => $('file').click();
$('file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (file.size > 2_000_000) throw Error('Choose a file smaller than 2 MB.'); const next = validate(JSON.parse(await file.text())); selected = null; commit(next, 'Poset opened.', true); setTool('move'); }
  catch (error) { status(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message, true); }
  e.target.value = '';
};
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); download(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); history(e.key.toLowerCase() === 'z' && !e.shiftKey); return; }
  if (e.key === 'Escape') { clearSelection(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
  const shortcuts = { v: 'move', n: 'point', e: 'order' }; if (shortcuts[e.key.toLowerCase()]) setTool(shortcuts[e.key.toLowerCase()]);
});
applyPanelVisibility(false); rebuild(); render(); setTool('move'); requestAnimationFrame(() => { fit('input'); fit('pairs'); fit('output'); });
if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver(resizeOutput); observer.observe(canvases.pairs); observer.observe(canvases.output);
}
else window.addEventListener('resize', resizeOutput);
if (startupError) status(startupError, true);
