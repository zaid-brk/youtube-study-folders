import { browser } from 'wxt/browser';
import { checkpointKey, type Checkpoint, type Folder } from './study';

export async function createFolder(rawName: string): Promise<Folder> {
  const name = rawName.trim();
  if (!name || name.length > 60) throw new Error('Use a folder name between 1 and 60 characters.');

  const folder = { id: crypto.randomUUID(), name };
  await browser.storage.local.set({ ['folder:' + folder.id]: folder });
  return folder;
}

export async function listStudyData() {
  const values = await browser.storage.local.get(null);
  const folders: Folder[] = [];
  const checkpoints: Checkpoint[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('folder:')) folders.push(value as Folder);
    if (key.startsWith('checkpoint:')) checkpoints.push(value as Checkpoint);
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  checkpoints.sort((a, b) => b.updatedAt - a.updatedAt);
  return { folders, checkpoints };
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
