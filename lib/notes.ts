import { formatTime, resumeUrl, type Folder, type Checkpoint } from './study';

export interface NoteTimestamp {
  start: number;
  end: number;
  seconds: number;
}

export function noteTimestamps(note: string): NoteTimestamp[] {
  const timestamps: NoteTimestamp[] = [];
  // Code spans and fences are skipped so examples such as array slices stay intact.
  const pattern = /(`+)[\s\S]*?\1|\[(\d+):([0-5]\d)\]/g;
  for (const match of note.matchAll(pattern)) {
    if (match[2] === undefined) continue;
    const seconds = Number(match[2]) * 60 + Number(match[3]);
    if (!Number.isSafeInteger(seconds)) continue;
    timestamps.push({ start: match.index, end: match.index + match[0].length, seconds });
  }
  return timestamps;
}

export function exportFolderMarkdown(folder: Folder, checkpoints: Checkpoint[]): string {
  const sections = ['# ' + escapeHeading(folder.name)];
  for (const checkpoint of checkpoints.filter((saved) => saved.folderId === folder.id)) {
    let note = '';
    let cursor = 0;
    for (const timestamp of noteTimestamps(checkpoint.note)) {
      note += checkpoint.note.slice(cursor, timestamp.start);
      note += '[' + formatTime(timestamp.seconds) + '](' + resumeUrl({ ...checkpoint, seconds: timestamp.seconds }) + ')';
      cursor = timestamp.end;
    }
    note += checkpoint.note.slice(cursor);
    sections.push('## ' + escapeHeading(checkpoint.title), '[Watch video](' + resumeUrl(checkpoint) + ')', note);
  }
  return sections.join('\n\n') + '\n';
}

function escapeHeading(text: string) {
  return text.replace(/[\r\n]/g, ' ').replace(/[\\`*_[\]<>#]/g, '\\$&');
}
