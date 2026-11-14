import { formatTime, resumeUrl, type Folder, type Checkpoint } from './study';

export interface NoteTimestamp {
  start: number;
  end: number;
  seconds: number;
}

export function noteTimestamps(note: string): NoteTimestamp[] {
  const timestamps: NoteTimestamp[] = [];
  const pattern = /^ {0,3}(~{3,})[^\n]*(?:\n|$)[\s\S]*?(?:^ {0,3}\1~*[ \t]*(?:\n|$)|(?![\s\S]))|^(?: {4}|\t)[^\n]*|(`+)[\s\S]*?\2|\[(\d+):([0-5]\d)\]/gm;
  for (const match of note.matchAll(pattern)) {
    if (match[3] === undefined) continue;
    const seconds = Number(match[3]) * 60 + Number(match[4]);
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
