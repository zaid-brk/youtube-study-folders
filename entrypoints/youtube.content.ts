import { browser } from 'wxt/browser';
import { createFolder, getCheckpoint, listStudyData, saveCheckpoint } from '../lib/storage';
import { studySession } from '../lib/session';
import { ACTIVE_SESSION_KEY, formatTime, parseVideo, type Video } from '../lib/study';
import panelCss from '../styles/study-panel.css?inline';
import '../styles/youtube.css';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  main(ctx) {
    const host = document.createElement('div');
    host.id = 'study-folders-host';
    const root = host.attachShadow({ mode: 'open' });
    const styles = document.createElement('style');
    styles.textContent = panelCss;
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Study session');
    root.append(styles, panel);

    // Register before the page so YouTube's capture handlers cannot consume a note keystroke.
    const keepNoteKeysLocal = (event: KeyboardEvent) => {
      const target = event.composedPath()[0];
      if (target instanceof HTMLTextAreaElement && root.activeElement === target) {
        event.stopImmediatePropagation();
      }
    };
    ctx.addEventListener(window, 'keydown', keepNoteKeysLocal, { capture: true });
    ctx.addEventListener(window, 'keypress', keepNoteKeysLocal, { capture: true });
    ctx.addEventListener(window, 'keyup', keepNoteKeysLocal, { capture: true });

    let folderId: string | undefined;
    let currentVideo: Video | undefined;
    let currentUrl = '';
    let generation = 0;
    let frame: number | undefined;
    let sessionReady = false;

    function updatePage() {
      const html = document.documentElement;
      if (!html) return;

      const url = location.href;
      if (url !== currentUrl) {
        currentUrl = url;
        const video = parseVideo(url);
        const changed = currentVideo?.videoId !== video?.videoId;
        currentVideo = video;
        if (changed && sessionReady) render();
      }

      html.toggleAttribute('data-study-folders-focus', !!folderId);
      if (!currentVideo && !folderId) {
        host.remove();
        return;
      }

      const watch = document.querySelector('ytd-watch-flexy');
      const primary = watch?.querySelector('#primary-inner');
      const sidebar = watch?.querySelector('#secondary-inner');
      const useSidebar = !!folderId && sidebar instanceof HTMLElement && sidebar.offsetWidth > 0;
      const parent = useSidebar ? sidebar : primary ?? document.body;
      if (!parent) return;

      host.dataset.placement = parent === document.body ? 'floating' : 'inline';
      if (host.parentElement !== parent) {
        const below = parent.querySelector(':scope > #below');
        parent.insertBefore(host, below ?? (useSidebar ? parent.firstChild : null));
      }
    }

    function scheduleUpdate() {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        updatePage();
      });
    }

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document, { childList: true, subtree: true });
    ctx.addEventListener(window, 'wxt:locationchange', scheduleUpdate);
    ctx.addEventListener(window, 'resize', scheduleUpdate);
    ctx.addEventListener(document, 'yt-navigate-finish', scheduleUpdate);
    ctx.onInvalidated(() => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      host.remove();
      document.documentElement?.removeAttribute('data-study-folders-focus');
    });

    function render() {
      const view = ++generation;
      panel.replaceChildren();
      if (!currentVideo) {
        if (folderId) {
          panel.append(runningIndicator(), makeStatus('Search YouTube to choose your next tutorial.'), endButton(view));
        }
        return;
      }
      if (!folderId) {
        const start = makeButton('Start Study Session');
        start.addEventListener('click', () => {
          start.disabled = true;
          void renderFolderPicker(view).catch(() => {
            if (view !== generation) return;
            start.disabled = false;
            panel.append(makeStatus('Could not load your study folders.'));
          });
        });
        panel.append(start);
        return;
      }

      void renderScratchpad(view, folderId, currentVideo).catch(() => {
        if (view === generation) {
          panel.replaceChildren(makeStatus('Could not load this checkpoint.'), endButton(view));
        }
      });
    }

    async function renderFolderPicker(view: number) {
      const { folders } = await listStudyData();
      if (view !== generation) return;
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Study folder';
      const select = document.createElement('select');
      select.id = 'study-folder-select';
      label.htmlFor = select.id;

      for (const folder of folders) {
        select.add(new Option(folder.name, folder.id));
      }
      select.add(new Option('Create a new folder', 'new'));
      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 60;
      name.placeholder = 'e.g. CSCE 313 Tutorials';
      name.setAttribute('aria-label', 'New folder name');
      const status = makeStatus();
      const start = makeButton('Start');
      start.type = 'submit';
      const cancel = makeButton('Cancel');
      cancel.className = 'quiet';
      cancel.addEventListener('click', render);

      function updateNameField() {
        name.hidden = select.value !== 'new';
        name.required = !name.hidden;
      }
      select.addEventListener('change', updateNameField);
      updateNameField();

      form.append(label, select, name, makeActions(start, cancel), status);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        start.disabled = true;
        cancel.disabled = true;
        try {
          const selected = select.value === 'new' ? (await createFolder(name.value)).id : select.value;
          await studySession({ type: 'study:start', folderId: selected });
          folderId = selected;
          updatePage();
          render();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : 'Could not start the session.';
          start.disabled = false;
          cancel.disabled = false;
        }
      });
      panel.replaceChildren(form);
      (name.hidden ? select : name).focus();
    }

    async function renderScratchpad(view: number, activeFolderId: string, video: Video) {
      const [data, checkpoint] = await Promise.all([
        listStudyData(),
        getCheckpoint(activeFolderId, video.videoId),
      ]);
      if (view !== generation) return;

      const heading = document.createElement('h2');
      heading.textContent = data.folders.find((folder) => folder.id === activeFolderId)?.name ?? 'Study session';
      const label = document.createElement('label');
      label.textContent = 'Notes and next steps';
      const note = document.createElement('textarea');
      note.id = 'study-note';
      note.rows = 7;
      note.maxLength = 20_000;
      note.placeholder = 'What do you want to pick up next time?';
      note.value = checkpoint?.note ?? '';
      label.htmlFor = note.id;
      const status = makeStatus(checkpoint ? 'Saved at ' + formatTime(checkpoint.seconds) : '');
      const save = makeButton('Save checkpoint');
      const end = endButton(view);
      save.addEventListener('click', async () => {
        const pageVideo = parseVideo(location.href);
        const watch = document.querySelector('ytd-watch-flexy');
        const player = watch?.querySelector<HTMLVideoElement>('video.html5-main-video, video');
        const playerVideoId = watch?.getAttribute('video-id');
        if (pageVideo?.videoId !== video.videoId || (playerVideoId && playerVideoId !== video.videoId) ||
            !player || player.readyState === 0 || player.seeking ||
            !Number.isFinite(player.currentTime) || player.closest('.ad-showing')) {
          status.textContent = 'Wait for the tutorial to load before saving.';
          return;
        }

        const heading = watch?.querySelector('h1 yt-formatted-string, h1');
        const title = heading?.textContent?.trim() || document.title.replace(/ - YouTube$/, '') || 'YouTube video';
        const seconds = Math.floor(player.currentTime);
        save.disabled = true;
        end.disabled = true;
        try {
          await saveCheckpoint({
            ...pageVideo,
            folderId: activeFolderId,
            title,
            seconds,
            note: note.value,
            updatedAt: Date.now(),
          });
          status.textContent = 'Saved at ' + formatTime(seconds);
        } catch {
          status.textContent = 'Could not save. Your note is still here.';
        } finally {
          save.disabled = false;
          end.disabled = false;
        }
      });
      panel.replaceChildren(runningIndicator(), heading, label, note, makeActions(save, end), status);
    }

    function endButton(view: number) {
      const end = makeButton('End session');
      end.className = 'quiet';
      end.addEventListener('click', async () => {
        end.disabled = true;
        try {
          await studySession({ type: 'study:stop' });
          folderId = undefined;
          updatePage();
          render();
        } catch {
          if (view === generation) panel.append(makeStatus('Could not end the session.'));
          end.disabled = false;
        }
      });
      return end;
    }

    async function refreshSession() {
      const savedFolderId = await studySession({ type: 'study:get' });
      if (ctx.isInvalid) return;
      const changed = folderId !== savedFolderId;
      folderId = savedFolderId;
      sessionReady = true;
      updatePage();
      if (changed || !panel.childElementCount) render();
    }

    const onSessionChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ACTIVE_SESSION_KEY in changes) {
        void refreshSession().catch(console.error);
      }
    };
    browser.storage.onChanged.addListener(onSessionChanged);
    ctx.onInvalidated(() => browser.storage.onChanged.removeListener(onSessionChanged));
    void refreshSession().catch(console.error);
  },
});

function makeButton(text: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  return button;
}

function makeStatus(text = '') {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = text;
  return status;
}

function makeActions(...buttons: HTMLButtonElement[]) {
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(...buttons);
  return actions;
}

function runningIndicator() {
  const indicator = document.createElement('p');
  indicator.className = 'session-running';
  indicator.textContent = 'Session running';
  return indicator;
}
