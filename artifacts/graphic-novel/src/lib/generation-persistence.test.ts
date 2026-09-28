import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbApi, getProjectSelectionKey, migrateLegacyData, selectDataScope } from './db';
import { reconcileSelection } from './project-context';

const image = new Blob(['image bytes'], { type: 'image/png' });

test('complete generation commits every panel before selection and survives a fresh read', async () => {
  selectDataScope('generation-owner');
  const project = await dbApi.createGeneratedProject('A completed novel', [
    { imageBlob: image, caption: 'Beginning', durationSeconds: 4 },
    { imageBlob: image, caption: 'The end', durationSeconds: 4 },
  ]);
  const oldSnapshot = await dbApi.getProjects();
  assert.equal(reconcileSelection(oldSnapshot.filter((p) => p.id !== project.id), project.id, oldSnapshot[0].id, project.id).kind, 'pending');
  assert.equal(reconcileSelection(oldSnapshot, project.id, null, project.id).kind, 'valid');
  assert.deepEqual((await dbApi.getPanels(project.id)).map((p) => p.caption), ['Beginning', 'The end']);
  assert.equal((await dbApi.getProjects()).find((p) => p.id === project.id)?.name, 'A completed novel');
});

test('failed write does not publish a partial project or panels', async () => {
  selectDataScope('write-failure-owner');
  await assert.rejects(dbApi.createGeneratedProject('Failed', [
    { imageBlob: image, caption: 'First', durationSeconds: 4 },
    { imageBlob: (() => {}) as unknown as Blob, caption: 'Second', durationSeconds: 4 },
  ]));
  assert.equal((await dbApi.getProjects()).length, 0);
});

test('legacy import preserves content and production accounts cannot see each other', async () => {
  selectDataScope('preview', true);
  const legacy = await dbApi.createGeneratedProject('Legacy', [{ imageBlob: image, caption: 'Keep me', durationSeconds: 4 }]);
  await migrateLegacyData('owner');
  selectDataScope('owner');
  assert.equal((await dbApi.getPanels(legacy.id))[0].caption, 'Keep me');
  assert.equal((await dbApi.getProjects()).length, 1);
  selectDataScope('other');
  assert.deepEqual(await dbApi.getProjects(), []);
  assert.deepEqual(await dbApi.getPanels(legacy.id), []);
  assert.notEqual(getProjectSelectionKey('owner'), getProjectSelectionKey('other'));
  selectDataScope('preview', true);
  assert.equal((await dbApi.getPanels(legacy.id))[0].caption, 'Keep me');
});

test('optional generation metadata survives a project write while old panels remain readable', async () => {
  selectDataScope('metadata-owner');
  const generation = {
    prompt: 'Watercolor. SCENE: a lighthouse.', scene: 'a lighthouse', styleId: 'watercolor',
    styleText: 'Watercolor', mode: 'standard' as const, seed: 42, characterGuide: '',
  };
  const project = await dbApi.createGeneratedProject('Test', [
    { imageBlob: image, caption: 'New', durationSeconds: 4, generation },
    { imageBlob: image, caption: 'Old', durationSeconds: 4 },
  ]);
  const panels = await dbApi.getPanels(project.id);
  assert.deepEqual(panels[0].generation, generation);
  assert.equal(panels[1].generation, undefined);
});

test('accepted replacement changes only one primary image and preserves latest panel edits', async () => {
  selectDataScope('single-panel-owner');
  const project = await dbApi.createGeneratedProject('Test', [
    { imageBlob: image, caption: 'First', durationSeconds: 4 },
    { imageBlob: image, caption: 'Second', durationSeconds: 3 },
  ]);
  const [first, second] = await dbApi.getPanels(project.id);
  const sound = new Blob(['sound'], { type: 'audio/mpeg' });
  const extra = new Blob(['extra'], { type: 'image/png' });
  await dbApi.savePanel({ ...first, caption: 'Edited while generating', order: 5,
    durationSeconds: 7, audioBlob: sound, audioName: 'voice', extraImages: [extra] });
  const replacement = new Blob(['replacement'], { type: 'image/png' });
  const generation = {
    prompt: 'A friendly cat', scene: 'cat', styleId: 'comic', styleText: 'Comic',
    mode: 'standard' as const, seed: 7, characterGuide: '',
  };
  await dbApi.replacePanelImage(first.id, project.id, replacement, generation);
  const saved = (await dbApi.getPanels(project.id)).find((p) => p.id === first.id)!;
  assert.deepEqual(saved.imageBlob, replacement);
  assert.deepEqual(saved.generation, generation);
  assert.equal(saved.caption, 'Edited while generating');
  assert.equal(saved.order, 5);
  assert.equal(saved.durationSeconds, 7);
  assert.deepEqual(saved.audioBlob, sound);
  assert.equal(saved.audioName, 'voice');
  assert.deepEqual(saved.extraImages, [extra]);
  assert.deepEqual((await dbApi.getPanels(project.id)).find((p) => p.id === second.id), second);
  await assert.rejects(dbApi.replacePanelImage(first.id, 'wrong-project', replacement, generation));
});