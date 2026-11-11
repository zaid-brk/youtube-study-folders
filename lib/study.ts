export const ACTIVE_SESSION_KEY = 'active-study-folder';

export interface Folder {
  id: string;
  name: string;
}

export interface Video {
  videoId: string;
  playlistId?: string;
}

export interface Checkpoint extends Video {
  folderId: string;
  title: string;
  seconds: number;
  note: string;
  updatedAt: number;
}

export function parseVideo(address: string): Video | undefined {
  const url = new URL(address);
  if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/watch') return;

  const videoId = url.searchParams.get('v');
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return;

  const playlistId = url.searchParams.get('list');
  return playlistId ? { videoId, playlistId } : { videoId };
}

export function resumeUrl(checkpoint: Checkpoint): string {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', checkpoint.videoId);
  if (checkpoint.playlistId) url.searchParams.set('list', checkpoint.playlistId);
  url.searchParams.set('t', String(checkpoint.seconds));
  return url.href;
}

export function checkpointKey(folderId: string, videoId: string): string {
  return 'checkpoint:' + folderId + ':' + videoId;
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes + ':' + String(seconds % 60).padStart(2, '0');
}

export type StudyMessage =
  | { type: 'study:get' }
  | { type: 'study:start'; folderId: string }
  | { type: 'study:stop' }
  | { type: 'study:resume'; checkpoint: Checkpoint };
