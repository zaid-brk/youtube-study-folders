import { browser } from 'wxt/browser';
import { checkpointKey, type Checkpoint, type Folder, type NoteDraft } from './study';

function folderName(rawName: string) {
  const name = rawName.trim();
  if (!name || name.length > 60) throw new Error('Use a folder name between 1 and 60 characters.');
  return name;
}

export async function createFolder(rawName: string): Promise<Folder> {
  const folder = { id: crypto.randomUUID(), name: folderName(rawName) };
  await browser.storage.local.set({ ['folder:' + folder.id]: folder });
  return folder;
}

export async function listStudyData() {
  const values = await browser.storage.local.get(null);
  const folders: Folder[] = [];
  const checkpoints = new Map<string, Checkpoint>();
  const drafts: NoteDraft[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('folder:')) folders.push(value as Folder);
    if (key.startsWith('checkpoint:')) {
      const checkpoint = value as Checkpoint;
      checkpoints.set(checkpointKey(checkpoint.folderId, checkpoint.videoId), checkpoint);
    }
    if (key.startsWith('draft:')) drafts.push(value as NoteDraft);
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  for (const draft of drafts) {
    const key = checkpointKey(draft.folderId, draft.videoId);
    const checkpoint = checkpoints.get(key);
    checkpoints.set(key, {
      ...checkpoint,
      ...draft,
      seconds: checkpoint?.seconds ?? 0,
      updatedAt: Math.max(checkpoint?.updatedAt ?? 0, draft.updatedAt),
    });
  }
  const savedVideos = [...checkpoints.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return { folders, checkpoints: savedVideos };
}

export async function getCheckpoint(folderId: string, videoId: string) {
  const key = checkpointKey(folderId, videoId);
  return (await browser.storage.local.get(key))[key] as Checkpoint | undefined;
}

export async function saveCheckpoint(checkpoint: Checkpoint) {
  await browser.storage.local.set({
    [checkpointKey(checkpoint.folderId, checkpoint.videoId)]: checkpoint,
  });
}

export async function getNoteDraft(folderId: string, videoId: string) {
  const key = 'draft:' + folderId + ':' + videoId;
  return (await browser.storage.local.get(key))[key] as NoteDraft | undefined;
}

export async function saveNoteDraft(draft: NoteDraft) {
  await browser.storage.local.set({
    ['draft:' + draft.folderId + ':' + draft.videoId]: draft,
  });
}

export async function renameFolder(folderId: string, rawName: string) {
  const name = folderName(rawName);
  const key = 'folder:' + folderId;
  const folder = (await browser.storage.local.get(key))[key] as Folder | undefined;
  if (!folder) throw new Error('Could not find this folder.');
  await browser.storage.local.set({ [key]: { ...folder, name } });
}
