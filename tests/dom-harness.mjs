// Source-level interaction checks in an in-memory DOM. These do not replace
// a browser's layout, hit testing, pointer capture, or PNG rendering checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as core from '../src/core.mjs';

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this.events = new Map(); this._text = ''; this.checked = false; this.disabled = false; this.hidden = false; this.clientWidth = 700; this.clientHeight = 500; this.captured = new Set(); }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (key === 'checked') this.checked = true;
    if (key === 'id') this.id = String(value);
    if (key === 'value') this.value = String(value);
  }
  getAttribute(key) { return this.attrs[key]; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get classList() {
    return { toggle: (name, on) => { const names = new Set(this.className.split(/\s+/).filter(Boolean)); if (on) names.add(name); else names.delete(name); this.className = [...names].join(' '); }, contains: name => this.className.split(/\s+/).includes(name) };
  }
  append(...nodes) { for (const n of nodes) { n.parentElement = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children.forEach(n => n.parentElement = null); this.children = []; this._text = ''; this.append(...nodes); }
  contains(n) { return this === n || this.children.some(c => c.contains(n)); }
  matches(s) { return s.startsWith('#') ? this.id === s.slice(1) : s.startsWith('.') ? this.classList.contains(s.slice(1)) : s.startsWith('[') ? Object.hasOwn(this.attrs, s.slice(1, -1)) : this.tagName === s.toUpperCase(); }
  querySelectorAll(selector) { const selectors = selector.split(',').map(s => s.trim()), result = []; const walk = n => { for (const c of n.children) { if (selectors.some(s => c.matches(s))) result.push(c); walk(c); } }; walk(this); return result; }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  closest(s) { return this.matches(s) ? this : this.parentElement?.closest(s); }
  addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(fn); }
  emit(type, properties = {}) {
    const e = { target: this, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() { this.stopped = true; }, ...properties };
    const pending = []; let current = this;
    do { for (const fn of current.events.get(type) || []) pending.push(fn(e)); if (current['on' + type]) pending.push(current['on' + type](e)); current = current.parentElement; } while (current && !e.stopped && !['pointerenter', 'pointerleave'].includes(type));
    return Promise.all(pending);
  }
  getBBox() { return { x: 0, y: 0, width: 500, height: 400 }; }
  getScreenCTM() { return { a: 1, d: 1, inverse() { return this; } }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

export function launch(saved = null, options = {}) {
  const document = new Element('document'), stack = [document];
  const source = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const voids = new Set(['meta', 'link', 'input', 'br']);
  for (const match of source.matchAll(/<(\/)?([\w-]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, attributes, slash] = match;
    if (close) { if (stack.at(-1).tagName === tag.toUpperCase()) stack.pop(); continue; }
    const n = new Element(tag); for (const attr of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) n.setAttribute(attr[1], attr[2] ?? '');
    stack.at(-1).append(n); if (!voids.has(tag) && !slash) stack.push(n);
  }
  document.body = document.querySelector('body'); document.activeElement = document.body;
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag); document.createElementNS = (_, tag) => new Element(tag);
  document.createTextNode = value => { const n = new Element('text-node'); n.textContent = value; return n; };
  document.elementFromPoint = () => document.pointerTarget || document.body;
  const storage = new Map(saved ? [['free-nm-studio-v1', JSON.stringify(saved)]] : []), window = new Element('window');
  if (options.visibility !== undefined) storage.set('free-nm-visibility-v1', JSON.stringify(options.visibility));
  const observers = [];
  class ResizeObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } }
  const context = vm.createContext({ ...core, document, window, crypto: { randomUUID }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, requestAnimationFrame: fn => fn(), ResizeObserver, DOMPoint: class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } }, setTimeout, Blob, URL, console });
  const app = options.app ?? readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
  vm.runInContext(app, context, { filename: 'app.mjs' });
  const $ = id => document.getElementById(id);
  const point = (panel, id) => $(panel + '-canvas').querySelectorAll('.point').find(n => n.dataset.id === id);
  const stored = () => JSON.parse(storage.get('free-nm-studio-v1'));
  const visibilitySettings = () => JSON.parse(storage.get('free-nm-visibility-v1') || '{}');
  const resizeOutput = (width, height) => { $('output-canvas').clientWidth = width; $('output-canvas').clientHeight = height; observers.forEach(observer => observer.callback()); };
  const resizePairs = (width, height) => { $('pairs-canvas').clientWidth = width; $('pairs-canvas').clientHeight = height; observers.forEach(observer => observer.callback()); };
  return { $, document, window, point, stored, resizeOutput, resizePairs, visibilitySettings };
}
