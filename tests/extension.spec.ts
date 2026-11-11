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
    await expect(page.getByRole('button', { name: 'Save checkpoint' })).toBeFocused();
    await page.keyboard.press('t');
    await expect(page.locator('ytd-watch-flexy')).toHaveAttribute('theater', '');

    await saveAt(page, 34, 'Check the condition variable predicate.');

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

async function openBrowser(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  });

  await context.route('https://www.youtube.com/**', (route) => route.fulfill({
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
  }));
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
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function saveAt(page: Page, seconds: number, note: string) {
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
  await page.getByRole('textbox', { name: 'Notes and next steps' }).fill(note);
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await expect(page.getByRole('status')).toContainText('Saved at');
}

async function resumeFrom(context: BrowserContext, popup: Page, folder: string) {
  const card = popup.locator('article').filter({ has: popup.getByRole('heading', { name: folder }) });
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    card.getByRole('button', { name: 'Resume', exact: true }).click(),
  ]);
  return tab;
}
