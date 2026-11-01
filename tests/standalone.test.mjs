import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { launch } from './dom-harness.mjs';

test('direct-open HTML embeds all code and styles and executes the actual bundled runtime', async () => {
  const html = readFileSync(new URL('../FreeNM.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"/i);
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match); assert.doesNotMatch(match[1], /^import |^export /m);
  assert.doesNotThrow(() => new Script(match[1]));
  const { $, stored } = launch(null, { app: match[1] });
  assert.equal($('input-count').textContent, '4 points');
  assert.equal($('pairs-count').textContent, '9 elements');
  assert.equal($('output-canvas').querySelectorAll('.point').length > 9, true);
  $('all-m').checked = false; await $('all-m').emit('change');
  $('parameter-m').value = '0'; await $('parameter-m').emit('change');
  $('all-n').checked = false; await $('all-n').emit('change');
  assert.equal($('output-count').textContent, '4 elements');
  assert.equal($('output-title').textContent, '(CC1(X\u2264) \u2229 \u2662X=, \u25a1X=)');
  assert.equal(stored().m, 0); assert.equal(stored().n, 1);
  await $('blank').emit('click'); await $('add-first').emit('click');
  assert.equal($('output-count').textContent, '1 element');
  assert.equal(stored().nodes.length, 1);
});
