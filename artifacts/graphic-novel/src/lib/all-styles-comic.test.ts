import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comicStyles, eligibleComicStyles, newComicReport, runComicStyles } from './all-styles-comic';
import { STYLE_PRESETS } from './style-presets';
import { dbApi, selectDataScope } from './db';
import type { GeneratedPanel, ConvertParams } from './ai-client';

const image = new Blob(['valid fixture bytes'], { type: 'image/png' });
Object.assign(globalThis, { createImageBitmap: async () => ({ width: 10, height: 10, close() {} }) });
const makePanels = (): GeneratedPanel[] => Array.from({ length: 4 }, (_, i) => ({
  imageBlob: image, caption: `Caption ${i + 1}`, scene: `Scene ${i + 1}`,
}));

test('enumerates story presets, excluding only undefined custom; each style receives four panels', async () => {
  selectDataScope('comic-inventory');
  const styles = comicStyles();
  assert.deepEqual(styles.map(s => s.id), STYLE_PRESETS.filter(s => s.id !== 'custom').map(s => s.id));
  assert.ok(styles.some(s => s.id === 'stick'));
  assert.ok(styles.some(s => s.id === 'film-noir'));
  assert.equal(comicStyles([{ ...STYLE_PRESETS.at(-1)!, prompt: 'Defined bespoke ink style' }]).length, 1);
  const called: string[] = [];
  const report = await runComicStyles(newComicReport(styles), styles, 'Entire source fixture', new AbortController().signal, () => {}, {
    convert: async params => {
      assert.equal(params.sourceText, 'Entire source fixture');
      assert.equal(params.mode, 'standard');
      assert.equal(params.panelCount, 4);
      called.push(params.style.id);
      return makePanels();
    },
    save: (...args) => dbApi.createGeneratedProject(...args),
    read: (...args) => dbApi.getPanels(...args),
  });
  assert.deepEqual(called, styles.map(s => s.id));
  assert.ok(report.results.every(r => r.status === 'passed'));
  for (const result of report.results) assert.equal((await dbApi.getPanels(result.projectId!)).length, 4);
});

test('failure isolation and failed-only retry do not duplicate successful saved projects', async () => {
  selectDataScope('comic-retry');
  const styles = comicStyles().slice(0, 3);
  let fail = true;
  const calls: string[] = [];
  const dependencies = {
    convert: async (params: ConvertParams) => {
      calls.push(params.style.id);
      if (params.style.id === styles[1].id && fail) throw new Error('Provider refused');
      return makePanels();
    },
    save: (...args: Parameters<typeof dbApi.createGeneratedProject>) => dbApi.createGeneratedProject(...args),
    read: (...args: Parameters<typeof dbApi.getPanels>) => dbApi.getPanels(...args),
  };
  const first = await runComicStyles(newComicReport(styles), styles, 'source', new AbortController().signal, () => {}, dependencies);
  assert.deepEqual(first.results.map(r => r.status), ['passed', 'failed', 'passed']);
  assert.match(first.results[1].error!, /Provider refused/);
  fail = false;
  const retry = await runComicStyles(first, eligibleComicStyles(first, styles, true), 'source', new AbortController().signal, () => {}, dependencies);
  assert.deepEqual(retry.results.map(r => r.status), ['passed', 'passed', 'passed']);
  assert.deepEqual(calls, [styles[0].id, styles[1].id, styles[2].id, styles[1].id]);
  assert.equal((await dbApi.getProjects()).length, 3);
});

test('cancellation prevents later styles and keeps completed result', async () => {
  selectDataScope('comic-cancel');
  const styles = comicStyles().slice(0, 3);
  const controller = new AbortController();
  const calls: string[] = [];
  const result = await runComicStyles(newComicReport(styles), styles, 'source', controller.signal, (report, style) => {
    if (style.id === styles[1].id && report.results[1].status === 'running') controller.abort();
  }, {
    convert: async params => { calls.push(params.style.id); return makePanels(); },
    save: (...args) => dbApi.createGeneratedProject(...args),
    read: (...args) => dbApi.getPanels(...args),
  });
  assert.deepEqual(calls, [styles[0].id, styles[1].id]);
  assert.deepEqual(result.results.map(r => r.status), ['passed', 'cancelled', 'pending']);
});

test('incomplete provider response never saves a project', async () => {
  selectDataScope('comic-short');
  const styles = comicStyles().slice(0, 1);
  const result = await runComicStyles(newComicReport(styles), styles, 'source', new AbortController().signal, () => {}, {
    convert: async () => makePanels().slice(0, 3),
    save: (...args) => dbApi.createGeneratedProject(...args),
    read: (...args) => dbApi.getPanels(...args),
  });
  assert.equal(result.results[0].status, 'failed');
  assert.match(result.results[0].error!, /exactly four/);
  assert.equal((await dbApi.getProjects()).length, 0);
});