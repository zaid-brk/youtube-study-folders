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
