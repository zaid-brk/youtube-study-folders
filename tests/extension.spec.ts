import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const extension = resolve('.output/chrome-mv3');
const video = 'https://www.youtube.com/watch?v=abcdefghijk&list=PLexample';
const otherVideo = 'https://www.youtube.com/watch?v=bcdefghijkl&list=PLexample';

test('resumes two folders independently after a browser restart', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'study-folders-'));
  let context: BrowserContext | undefined;
  try {
    context = await openBrowser(profile);
    const page = await context.newPage();
    await page.goto(video);
    await startFolder(page, 'CSCE 313 Tutorials');
    await expect(page.locator('#related')).toBeHidden();
    await expect(page.locator('#comments')).toBeHidden();
    await expect(page.locator('#extra-recommendations')).toBeHidden();
    await expect(page.locator('#playlist')).toBeVisible();
    const scratchpad = page.getByRole('textbox', { name: 'Notes and next steps' });
    await scratchpad.pressSequentially('tkf test');
    await scratchpad.press('ArrowLeft');
    await scratchpad.press('Backspace');
    await expect(scratchpad).toHaveValue('tkf tet');
    await expect(page.locator('ytd-watch-flexy')).not.toHaveAttribute('data-shortcut-count', /.+/);
    await scratchpad.press('Tab');
    await expect(page.getByRole('button', { name: 'Insert timestamp' })).toBeFocused();
    await page.keyboard.press('t');
    await expect(page.locator('ytd-watch-flexy')).toHaveAttribute('theater', '');

    await saveAt(page, 34, 'Check the condition variable predicate.');

    await finishTimer(context);
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.locator('#related')).toBeVisible();
    await expect(page.locator('#comments')).toBeVisible();
    await expect(page.locator('#extra-recommendations')).toBeVisible();

    await startFolder(page, 'Interview Prep');
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('');
    await saveAt(page, 9, 'Explain the queue invariant.');
    await page.evaluate((nextUrl) => {
      history.pushState({}, '', nextUrl);
      document.dispatchEvent(new Event('yt-navigate-finish'));
    }, otherVideo);
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Interview Prep' })).toBeVisible();

    await context.close();
    context = await openBrowser(profile);
    const reopenedHome = await context.newPage();
    await reopenedHome.goto('https://www.youtube.com/');
    await expect(reopenedHome.getByText('Session running', { exact: true })).toBeVisible();
    await expect(reopenedHome.locator('ytd-browse')).toBeHidden();
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage();
    await popup.goto(new URL('/popup.html', worker.url()).href);

    const systems = await resumeFrom(context, popup, 'CSCE 313 Tutorials');
    await expect(systems).toHaveURL(video + '&t=34');
    await expect(systems.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue(
      'Check the condition variable predicate.',
    );
    await expect(systems.getByRole('status')).toHaveText('Saved at 0:34');

    const interviews = await resumeFrom(context, popup, 'Interview Prep');
    await expect(interviews).toHaveURL(video + '&t=9');
    await expect(interviews.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue(
      'Explain the queue invariant.',
    );
    await expect(interviews.getByRole('status')).toHaveText('Saved at 0:09');
    await expect(systems.getByRole('heading', { name: 'CSCE 313 Tutorials' })).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('focus follows existing and new tabs while manual search stays available', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'study-focus-'));
  let context: BrowserContext | undefined;
  try {
    context = await openBrowser(profile);
    const existingHome = await context.newPage();
    await existingHome.goto('https://www.youtube.com/');
    await expect(existingHome.locator('ytd-browse')).toBeVisible();

    const tutorial = await context.newPage();
    await tutorial.goto(video);
    await startFolder(tutorial, 'CSCE 313');
    await expect(tutorial.getByText('Session running', { exact: true })).toBeVisible();
    await expect(existingHome.locator('ytd-browse')).toBeHidden();
    await expect(existingHome.getByText('Session running', { exact: true })).toBeVisible();

    await existingHome.evaluate(() => {
      const retainedWatchPage = document.createElement('ytd-watch-flexy');
      retainedWatchPage.hidden = true;
      retainedWatchPage.innerHTML = '<div id="primary-inner"></div><div id="secondary-inner"></div>';
      document.body.append(retainedWatchPage);
    });
    await expect(existingHome.getByRole('button', { name: 'End session' })).toBeVisible();
    const newHome = await context.newPage();
    await newHome.goto('https://www.youtube.com/');
    await expect(newHome.locator('ytd-browse')).toBeHidden();
    await expect(newHome.getByText('Session running', { exact: true })).toBeVisible();
    await newHome.getByRole('textbox', { name: 'Search YouTube', exact: true }).fill('condition variables');
    await newHome.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(newHome.getByRole('link', { name: 'Condition variable tutorial' })).toBeVisible();
    await expect(newHome.locator('ytd-shelf-renderer')).toBeHidden();
    await newHome.getByRole('link', { name: 'Condition variable tutorial' }).click();
    await expect(newHome.getByRole('heading', { name: 'CSCE 313', exact: true })).toBeVisible();
    await expect(newHome.locator('#related')).toBeHidden();

    await finishTimer(context);
    await existingHome.getByRole('button', { name: 'End session' }).click();
    await expect(existingHome.locator('ytd-browse')).toBeVisible();
    await expect(tutorial.getByText('Session running', { exact: true })).toHaveCount(0);
    await expect(tutorial.locator('#related')).toBeVisible();
    await expect(newHome.locator('#related')).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('timer rejects early exits, survives restart, and unlocks without erasing notes', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'study-timer-'));
  let context: BrowserContext | undefined;
  try {
    context = await openBrowser(profile);
    const page = await context.newPage();
    await page.goto(video);
    await startFolder(page, 'Timed practice');
    await expect(page.getByRole('button', { name: 'End session' })).toBeDisabled();
    await expect(page.locator('[data-session-timer]')).toContainText('left');
    await saveAt(page, 9, 'Review this after the timer.');
    await expect(page.getByRole('button', { name: 'End session' })).toBeDisabled();

    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage();
    await popup.goto(new URL('/popup.html', worker.url()).href);
    const deadline = await popup.evaluate("chrome.storage.local.get('study-session-ends-at').then(value => value['study-session-ends-at'])");
    const rejected = await popup.evaluate("chrome.runtime.sendMessage({type: 'study:stop'})");
    expect(rejected).toMatchObject({ error: expect.stringContaining('Session locked') });

    await popup.locator('#session-length').fill('1');
    const resumed = await resumeFrom(context, popup, 'Timed practice');
    await expect(resumed.getByRole('button', { name: 'End session' })).toBeDisabled();
    expect(await popup.evaluate("chrome.storage.local.get('study-session-ends-at').then(value => value['study-session-ends-at'])")).toBe(deadline);

    await context.close();
    context = await openBrowser(profile);
    const home = await context.newPage();
    await home.goto('https://www.youtube.com/');
    await expect(home.getByRole('button', { name: 'End session' })).toBeVisible();
    await expect(home.getByRole('button', { name: 'End session' })).toBeDisabled();
    await expect(home.locator('ytd-guide-renderer')).toBeHidden();
    await expect(home.locator('ytd-mini-guide-renderer')).toBeHidden();
    await expect(home.locator('ytd-masthead #start')).toBeHidden();
    await expect(home.locator('ytd-masthead #end')).toBeHidden();
    await expect(home.getByRole('textbox', { name: 'Search YouTube', exact: true })).toBeVisible();
    const reopenedWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const reopenedPopup = await context.newPage();
    await reopenedPopup.goto(new URL('/popup.html', reopenedWorker.url()).href);
    expect(await reopenedPopup.evaluate("chrome.storage.local.get('study-session-ends-at').then(value => value['study-session-ends-at'])")).toBe(deadline);

    const tutorial = await context.newPage();
    await tutorial.goto(video);
    const note = tutorial.getByRole('textbox', { name: 'Notes and next steps' });
    await note.fill('Draft still here while the countdown ticks.');
    await reopenedPopup.evaluate("chrome.storage.local.set({'study-session-ends-at': Date.now() + 300})");
    await expect(tutorial.getByRole('button', { name: 'End session' })).toBeEnabled();
    await expect(note).toHaveValue('Draft still here while the countdown ticks.');
    await home.getByRole('button', { name: 'End session' }).click();
    await expect(home.locator('ytd-guide-renderer')).toBeVisible();
    await expect(home.locator('ytd-masthead #start')).toBeVisible();
    await expect(home.locator('ytd-browse')).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('autosaves drafts by folder and video without moving the resume checkpoint', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'study-drafts-'));
  let context: BrowserContext | undefined;
  try {
    context = await openBrowser(profile);
    const page = await context.newPage();
    await page.goto(video);
    await startFolder(page, 'Systems');
    await saveAt(page, 9, 'Original checkpoint note.');
    await page.getByRole('textbox', { name: 'Notes and next steps' }).fill('New draft without clicking Save checkpoint.');
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('New draft without clicking Save checkpoint.');
    await expect(page.getByRole('status')).toHaveText('Saved at 0:09');

    await page.goto(otherVideo);
    await page.getByRole('textbox', { name: 'Notes and next steps' }).fill('Draft for another lesson.');
    await page.goto(video);
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('New draft without clicking Save checkpoint.');
    await page.goto(otherVideo);
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('Draft for another lesson.');

    await finishTimer(context);
    await page.getByRole('button', { name: 'End session' }).click();
    await page.goto(video);
    await startFolder(page, 'Interview practice');
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('');
    await page.getByRole('textbox', { name: 'Notes and next steps' }).fill('Separate draft for the same video.');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveValue('Separate draft for the same video.');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('inserts timestamps at the cursor and restores clickable video markers', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'study-timestamps-'));
  let context: BrowserContext | undefined;
  try {
    context = await openBrowser(profile);
    const page = await context.newPage();
    await page.goto(video);
    await startFolder(page, 'Timestamp practice');
    const note = page.getByRole('textbox', { name: 'Notes and next steps' });
    await note.fill('First  last');
    await note.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(6, 6));
    await seekTo(page, 9);
    await page.getByRole('button', { name: 'Insert timestamp' }).click();
    await expect(note).toHaveValue('First [0:09] last');
    await note.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(input.value.length, input.value.length));
    await seekTo(page, 20);
    await page.getByRole('button', { name: 'Insert timestamp' }).click();
    await expect(note).toHaveValue('First [0:09] last[0:20]');
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Jump to 0:09', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jump to 0:20', exact: true })).toBeVisible();
    await seekTo(page, 30);
    await page.getByRole('button', { name: 'Jump to 0:09', exact: true }).click();
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Math.floor(video.currentTime))).toBe(9);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

async function finishTimer(context: BrowserContext) {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate("chrome.storage.local.set({'study-session-ends-at': Date.now() - 1})");
}

async function openBrowser(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  });

  await context.route('https://www.youtube.com/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/watch') {
      const content = url.pathname === '/results'
        ? '<ytd-search><a href="' + otherVideo + '">Condition variable tutorial</a><ytd-shelf-renderer>Suggested videos</ytd-shelf-renderer></ytd-search>'
        : '<ytd-browse>Homepage videos and suggestions</ytd-browse>';
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><ytd-masthead><div id="start">Menu and logo</div><form action="/results"><input name="search_query" aria-label="Search YouTube"><button type="submit">Search</button></form><div id="end">Account and notifications</div></ytd-masthead><ytd-guide-renderer>Subscriptions</ytd-guide-renderer><ytd-mini-guide-renderer>Shortcuts</ytd-mini-guide-renderer>' + content + '</body></html>',
      });
    }
    return route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html>
      <html style="color-scheme: dark">
      <title>Thread Pools - YouTube</title>
      <style>
        #secondary-inner { width: 350px; }
        #primary-inner { position: relative; }
        #ambient { position: absolute; inset: 0; background: #101010; }
      </style>
      <script>
        for (const type of ['keydown', 'keypress', 'keyup']) {
          window.addEventListener(type, (event) => {
            const watch = document.querySelector('ytd-watch-flexy');
            watch.dataset.shortcutCount = String(Number(watch.dataset.shortcutCount || 0) + 1);
            if (type === 'keydown' && event.key === 't') watch.toggleAttribute('theater');
          }, true);
        }
      </script>
      <ytd-watch-flexy>
        <main id="primary-inner">
          <video class="html5-main-video"></video>
          <div id="below"><h1>Thread Pools</h1><div id="comments">Comments</div></div>
          <div id="ambient" aria-hidden="true"></div>
        </main>
        <aside id="secondary-inner"><div id="playlist">Playlist</div><div id="related">Recommendations</div><div id="extra-recommendations">More videos</div></aside>
      </ytd-watch-flexy>`,
    });
  });
  return context;
}

// Native media properties are shared with the extension's isolated JavaScript world.
function silentWave() {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 40;
  const wave = Buffer.alloc(44 + sampleCount, 128);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate, 28);
  wave.writeUInt16LE(1, 32);
  wave.writeUInt16LE(8, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(sampleCount, 40);
  return wave;
}

async function startFolder(page: Page, name: string) {
  const start = page.getByRole('button', { name: 'Start Study Session' });
  await expect(start).toHaveCSS('background-color', 'rgb(24, 90, 188)');
  await start.click();
  await page.getByRole('combobox', { name: 'Study folder' }).selectOption('new');
  await page.getByRole('textbox', { name: 'New folder name' }).fill(name);
  const length = page.getByRole('spinbutton', { name: 'Session length (minutes)', exact: true });
  await expect(length).toHaveValue('');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notes and next steps' })).toHaveCount(0);
  await length.fill('2');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function seekTo(page: Page, seconds: number) {
  const player = page.locator('video');
  if (!(await player.getAttribute('src'))) {
    await player.evaluate((element, data) => {
      (element as HTMLVideoElement).src = 'data:audio/wav;base64,' + data;
    }, silentWave().toString('base64'));
  }
  await page.waitForFunction((time) => {
    const video = document.querySelector('video');
    return !!video && video.seekable.length > 0 && video.seekable.end(0) > time;
  }, seconds);
  await player.evaluate((element, time) => {
    (element as HTMLVideoElement).currentTime = time + 0.1;
  }, seconds);
  await page.waitForFunction((time) => {
    const video = document.querySelector('video');
    return !!video && !video.seeking && Math.floor(video.currentTime) === time;
  }, seconds);
}

async function saveAt(page: Page, seconds: number, note: string) {
  await seekTo(page, seconds);
  await page.getByRole('textbox', { name: 'Notes and next steps' }).fill(note);
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await expect(page.getByRole('status')).toContainText('Saved at');
}

async function resumeFrom(context: BrowserContext, popup: Page, folder: string) {
  const card = popup.locator('article').filter({ has: popup.getByRole('heading', { name: folder }) });
  const length = popup.locator('#session-length');
  if (await length.inputValue() === '') {
    await card.getByRole('button', { name: 'Resume', exact: true }).click();
    expect(await length.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await length.fill('1');
  }
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    card.getByRole('button', { name: 'Resume', exact: true }).click(),
  ]);
  return tab;
}
