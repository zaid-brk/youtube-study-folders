export const ACTIVE_SESSION_KEY = 'active-study-folder';
export const SESSION_END_KEY = 'study-session-ends-at';

export interface StudySession {
  folderId?: string;
  endsAt?: number;
}

export function sessionDeadline(currentEnd: number | undefined, minutes: number | undefined, now = Date.now()): number {
  if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 1 || !Number.isSafeInteger(now + minutes * 60_000)) {
    throw new Error('Choose a valid positive whole number of minutes.');
  }
  if (currentEnd && currentEnd > now) return currentEnd;
  return now + minutes * 60_000;
}

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
  | { type: 'study:start'; folderId: string; minutes: number }
  | { type: 'study:stop' }
  | { type: 'study:resume'; checkpoint: Checkpoint; minutes: number };
