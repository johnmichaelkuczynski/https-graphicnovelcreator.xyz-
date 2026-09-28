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