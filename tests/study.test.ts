import { describe, expect, it } from 'vitest';
import { checkpointKey, formatTime, parseVideo, resumeUrl, sessionDeadline } from '../lib/study';

describe('study checkpoints', () => {
  it('reads a watch URL and keeps its playlist context', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=abcdefghijk&list=PLexample&t=30')).toEqual({
      videoId: 'abcdefghijk',
      playlistId: 'PLexample',
    });
  });

  it('ignores non-watch pages and missing video IDs', () => {
    expect(parseVideo('https://www.youtube.com/')).toBeUndefined();
    expect(parseVideo('https://www.youtube.com/watch?v=short')).toBeUndefined();
    expect(parseVideo('https://example.com/watch?v=abcdefghijk')).toBeUndefined();
  });

  it('keeps the same video separate in different folders', () => {
    expect(checkpointKey('systems', 'abcdefghijk')).not.toBe(checkpointKey('interviews', 'abcdefghijk'));
  });

  it('builds a resume URL with an exact time and the original playlist', () => {
    const url = new URL(resumeUrl({
      folderId: 'systems',
      videoId: 'abcdefghijk',
      playlistId: 'PLexample',
      title: 'Threads',
      seconds: 754,
      note: 'Review condition variables',
      updatedAt: 0,
    }));
    expect(url.searchParams.get('v')).toBe('abcdefghijk');
    expect(url.searchParams.get('t')).toBe('754');
    expect(url.searchParams.get('list')).toBe('PLexample');
    expect(formatTime(754)).toBe('12:34');
  });
});

describe('session timers', () => {
  it('keeps the active finish time when another lesson requests a shorter timer', () => {
    expect(sessionDeadline(200_000, 1, 100_000)).toBe(200_000);
  });

  it('starts the requested timer and replaces an expired timer', () => {
    expect(sessionDeadline(undefined, 12, 0)).toBe(12 * 60_000);
    expect(sessionDeadline(100_000, 1, 200_000)).toBe(260_000);
  });

  it('rejects session lengths that cannot be represented as positive whole minutes', () => {
    for (const minutes of [undefined, 0, -1, 0.5, Number.MAX_SAFE_INTEGER, NaN, Infinity]) {
      expect(() => sessionDeadline(undefined, minutes, 0)).toThrow('positive whole number');
    }
  });
});
