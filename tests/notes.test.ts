import { describe, expect, it } from 'vitest';
import { exportFolderMarkdown } from '../lib/notes';
import { latestNote } from '../lib/study';

describe('folder note export', () => {
  it('exports titles, notes, video links, and timestamps while preserving code', () => {
    const note = 'Review [0:09]\n\n```python\nitems[1:20]\n```\nInline `items[2:30]`\n\n~~~python\nitems[3:40]\n~~~\n\n    items[4:50]\n\titems[5:00]\nReview [0:10]';
    const markdown = exportFolderMarkdown({ id: 'systems', name: 'CSCE 313' }, [{
      folderId: 'systems', videoId: 'abcdefghijk', title: 'Threads',
      seconds: 34, note, updatedAt: 0,
    }]);
    expect(markdown).toContain('# CSCE 313');
    expect(markdown).toContain('## Threads');
    expect(markdown).toContain('[0:09](https://www.youtube.com/watch?v=abcdefghijk&t=9)');
    expect(markdown).toContain('```python\nitems[1:20]\n```');
    expect(markdown).toContain('Inline `items[2:30]`');
    expect(markdown).toContain('~~~python\nitems[3:40]\n~~~');
    expect(markdown).toContain('    items[4:50]\n\titems[5:00]');
    expect(markdown).toContain('[0:10](https://www.youtube.com/watch?v=abcdefghijk&t=10)');
  });

  it('keeps newer checkpoint text after an autosave failure and preserves newer drafts', () => {
    const checkpoint = { folderId: 'systems', videoId: 'abcdefghijk', title: 'Threads', seconds: 34, note: 'Explicit save', updatedAt: 200 };
    const staleDraft = { ...checkpoint, note: 'Old draft', updatedAt: 100 };
    expect(latestNote(checkpoint, staleDraft)?.note).toBe('Explicit save');
    expect(latestNote(checkpoint, { ...staleDraft, note: 'New draft', updatedAt: 300 })?.note).toBe('New draft');
    expect(latestNote(undefined, staleDraft)?.note).toBe('Old draft');
    expect(latestNote(checkpoint, { ...staleDraft, updatedAt: 200 })?.note).toBe('Explicit save');
  });
});
