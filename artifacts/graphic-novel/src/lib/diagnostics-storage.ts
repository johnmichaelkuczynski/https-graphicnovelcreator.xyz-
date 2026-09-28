import { dbApi, getDB, getPanelImages, type Panel } from './db';
import { extractTextFromFile } from './text-extract';
import { reconcileSelection } from './project-context';

function insist(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function checkStorage(signal: AbortSignal): Promise<string> {
  const marker = `diagnostic-${crypto.randomUUID()}`;
  const image = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
  const audio = new Blob(['audio-fixture'], { type: 'audio/wav' });
  const owned: { project?: string; panel?: string; track?: string; image?: string; document?: string; instruction?: string } = {};
  const original = (await dbApi.getProjects()).map(p => p.id);
  try {
    signal.throwIfAborted();
    const project = await dbApi.createProject(marker);
    owned.project = project.id;
    await dbApi.renameProject(project.id, marker + '-edited');
    insist((await dbApi.getProjects()).some(p => p.id === project.id && p.name === marker + '-edited'), 'Project rename/reload failed');
    const panel: Panel = { id: crypto.randomUUID(), projectId: project.id, imageBlob: image, extraImages: [image], caption: marker, durationSeconds: 1, order: 0, audioBlob: audio, audioName: 'fixture.wav' };
    owned.panel = panel.id;
    await dbApi.savePanel(panel);
    const db = await getDB(); // force a fresh read from the underlying store
    insist((await db.get('panels', panel.id))?.imageBlob.size === image.size, 'Panel blob did not persist');
    insist(getPanelImages((await dbApi.getPanels(project.id))[0]).length === 2, 'Multi-image panel did not reload');
    panel.caption = marker + '-edited';
    await dbApi.savePanel(panel);
    insist((await dbApi.getPanels(project.id))[0]?.caption === panel.caption, 'Panel edit did not persist');
    const track = { id: crypto.randomUUID(), projectId: project.id, name: marker, order: 0, audioBlob: audio };
    owned.track = track.id;
    await dbApi.saveAudioTrack(track);
    insist((await dbApi.getAudioTracks(project.id))[0]?.audioBlob.size === audio.size, 'Audio blob did not reload');
    // Pure selection reconciliation: never change the current user's selection or its localStorage key.
    insist(reconcileSelection([project], null, project.id, null).id === project.id, 'Selection reconciliation failed');
    for (const kind of ['image', 'document', 'instruction'] as const) {
      const id = crypto.randomUUID();
      owned[kind] = id;
      if (kind === 'image') {
        await dbApi.saveLibraryImage({ id, name: marker, imageBlob: image, createdAt: Date.now() });
        insist((await dbApi.getLibraryImages()).some(i => i.id === id && i.imageBlob.size === image.size), 'Image library reload failed');
        await dbApi.saveLibraryImage({ id, name: marker + '-edited', imageBlob: image, createdAt: Date.now() });
        insist((await dbApi.getLibraryImages()).some(i => i.id === id && i.name.endsWith('-edited')), 'Image library edit failed');
      } else if (kind === 'document') {
        await dbApi.saveLibraryDocument({ id, name: marker, text: marker, fileBlob: new Blob([marker]), createdAt: Date.now() });
        insist((await dbApi.getLibraryDocuments()).some(i => i.id === id && i.fileBlob?.size === marker.length), 'Document library reload failed');
        await dbApi.saveLibraryDocument({ id, name: marker + '-edited', text: marker, createdAt: Date.now() });
        insist((await dbApi.getLibraryDocuments()).some(i => i.id === id && i.name.endsWith('-edited')), 'Document library edit failed');
      } else {
        await dbApi.saveLibraryInstruction({ id, title: marker, text: marker, createdAt: Date.now() });
        insist((await dbApi.getLibraryInstructions()).some(i => i.id === id && i.text === marker), 'Instruction library reload failed');
        await dbApi.saveLibraryInstruction({ id, title: marker + '-edited', text: marker, createdAt: Date.now() });
        insist((await dbApi.getLibraryInstructions()).some(i => i.id === id && i.title.endsWith('-edited')), 'Instruction library edit failed');
      }
    }
    signal.throwIfAborted();
    await dbApi.deletePanel(panel.id); owned.panel = undefined;
    await dbApi.deleteAudioTrack(track.id); owned.track = undefined;
    await dbApi.deleteLibraryImage(owned.image!); owned.image = undefined;
    await dbApi.deleteLibraryDocument(owned.document!); owned.document = undefined;
    await dbApi.deleteLibraryInstruction(owned.instruction!); owned.instruction = undefined;
    insist(!(await dbApi.getPanels(project.id)).length && !(await dbApi.getAudioTracks(project.id)).length, 'Panel/audio deletion failed');
    await dbApi.deleteProject(project.id); owned.project = undefined;
    insist(!(await dbApi.getProjects()).some(p => p.id === project.id), 'Project deletion failed');
    const after = await dbApi.getProjects();
    insist(original.every(id => after.some(p => p.id === id)), 'An existing project was modified');
    return 'Isolated project, panel (including extra image/audio blobs), audio track and three libraries created, edited, reloaded, deleted; selection reconciled without changing active selection.';
  } finally {
    // Only IDs created by this run; never clear stores or touch existing records.
    if (owned.image) await dbApi.deleteLibraryImage(owned.image);
    if (owned.document) await dbApi.deleteLibraryDocument(owned.document);
    if (owned.instruction) await dbApi.deleteLibraryInstruction(owned.instruction);
    if (owned.project) await dbApi.deleteProject(owned.project);
  }
}

export async function checkExtraction(): Promise<string> {
  const text = 'Diagnostic source text';
  const txt = await extractTextFromFile(new File([text], 'fixture.txt', { type: 'text/plain' }));
  insist(txt === text, 'TXT extraction mismatch');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF();
  pdf.text(text, 20, 20);
  const pdfText = await extractTextFromFile(new File([pdf.output('blob')], 'fixture.pdf', { type: 'application/pdf' }));
  insist(pdfText.includes(text), 'PDF extraction mismatch');
  // No fabricated DOCX: generate a valid DOCX zip only when an in-app fixture exists.
  return 'TXT and generated PDF extracted through the upload parser; DOCX extraction not verified (requires a valid fixture).';
}