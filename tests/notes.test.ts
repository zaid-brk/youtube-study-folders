import { describe, expect, it } from 'vitest';
import { exportFolderMarkdown } from '../lib/notes';

describe('folder note export', () => {
  it('exports titles, notes, video links, and timestamps while preserving code', () => {
    const note = 'Review [0:09]\n\n```python\nitems[1:20]\n```\nInline `items[2:30]`';
    const markdown = exportFolderMarkdown({ id: 'systems', name: 'CSCE 313' }, [{
      folderId: 'systems', videoId: 'abcdefghijk', title: 'Threads',
      seconds: 34, note, updatedAt: 0,
    }]);
    expect(markdown).toContain('# CSCE 313');
    expect(markdown).toContain('## Threads');
    expect(markdown).toContain('[0:09](https://www.youtube.com/watch?v=abcdefghijk&t=9)');
    expect(markdown).toContain('```python\nitems[1:20]\n```');
    expect(markdown).toContain('Inline `items[2:30]`');
  });
});
