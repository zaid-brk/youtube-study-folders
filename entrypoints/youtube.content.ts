import { browser } from 'wxt/browser';
import { createFolder, getCheckpoint, getNoteDraft, listStudyData, saveCheckpoint } from '../lib/storage';
import { noteTimestamps } from '../lib/notes';
import { studySession } from '../lib/session';
import { ACTIVE_SESSION_KEY, SESSION_END_KEY, formatTime, latestNote, parseVideo, type Video, type Folder } from '../lib/study';
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
    let endsAt: number | undefined;
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

      const watch = currentVideo ? document.querySelector('ytd-watch-flexy') : null;
      const primary = watch?.querySelector('#primary-inner');
      const sidebar = watch?.querySelector('#secondary-inner');
      const sidebarBounds = sidebar?.getBoundingClientRect();
      const primaryBounds = primary?.getBoundingClientRect();
      const useSidebar = !!folderId && !!sidebarBounds && sidebarBounds.width > 0 &&
        sidebarBounds.left >= 0 && sidebarBounds.right <= window.innerWidth;
      const primaryFits = primaryBounds && primaryBounds.width > 0 &&
        primaryBounds.left >= 0 && primaryBounds.right <= window.innerWidth;
      const parent = useSidebar ? sidebar : primaryFits ? primary : document.body;
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
          panel.append(sessionIndicator(), makeStatus('Search YouTube to choose your next tutorial.'), endButton(view));
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
      const lengthLabel = document.createElement('label');
      lengthLabel.textContent = 'Session length (minutes)';
      const length = document.createElement('input');
      length.id = 'study-session-length';
      length.type = 'number';
      length.min = '1';
      length.step = '1';
      length.placeholder = 'Enter minutes';
      length.required = true;
      lengthLabel.htmlFor = length.id;
      const commitment = makeStatus('You can end the session when the timer reaches zero.');
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

      form.append(label, select, name, lengthLabel, length, commitment, makeActions(start, cancel), status);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        start.disabled = true;
        cancel.disabled = true;
        try {
          const selected = select.value === 'new' ? (await createFolder(name.value)).id : select.value;
          const session = await studySession({ type: 'study:start', folderId: selected, minutes: Number(length.value) });
          folderId = session.folderId;
          endsAt = session.endsAt;
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
      const [data, checkpoint, draft] = await Promise.all([
        listStudyData(),
        getCheckpoint(activeFolderId, video.videoId),
        getNoteDraft(activeFolderId, video.videoId),
      ]);
      if (view !== generation) return;

      const heading = document.createElement('h2');
      heading.dataset.folderName = '';
      heading.textContent = data.folders.find((folder) => folder.id === activeFolderId)?.name ?? 'Study session';
      const label = document.createElement('label');
      label.textContent = 'Notes and next steps';
      const note = document.createElement('textarea');
      note.id = 'study-note';
      note.rows = 7;
      note.maxLength = 20_000;
      note.placeholder = 'What do you want to pick up next time?';
      note.value = latestNote(checkpoint, draft)?.note ?? '';
      label.htmlFor = note.id;
      const status = makeStatus(checkpoint ? 'Saved at ' + formatTime(checkpoint.seconds) : '');
      const draftStatus = document.createElement('p');
      draftStatus.setAttribute('aria-live', 'polite');
      draftStatus.textContent = draft ? 'All changes saved' : '';
      const retry = makeButton('Retry saving');
      retry.className = 'quiet';
      retry.hidden = true;
      let edit = 0;

      function autosave() {
        const revision = ++edit;
        const watch = document.querySelector('ytd-watch-flexy');
        const videoHeading = watch?.querySelector('h1 yt-formatted-string, h1');
        const title = videoHeading?.textContent?.trim() || checkpoint?.title || document.title.replace(/ - YouTube$/, '');
        draftStatus.textContent = 'Saving...';
        retry.hidden = true;
        void studySession({
          type: 'study:save-draft',
          draft: { ...video, folderId: activeFolderId, title, note: note.value, updatedAt: Date.now() },
        }).then(() => {
          if (revision === edit) draftStatus.textContent = 'All changes saved';
        }).catch(() => {
          if (revision === edit) {
            draftStatus.textContent = 'Could not save changes.';
            retry.hidden = false;
          }
        });
      }
      const timestampLinks = document.createElement('nav');
      timestampLinks.className = 'timestamp-links';
      timestampLinks.setAttribute('aria-label', 'Video timestamps');

      function showTimestamps() {
        timestampLinks.replaceChildren();
        const times = new Set(noteTimestamps(note.value).map((timestamp) => timestamp.seconds));
        for (const seconds of times) {
          const jump = makeButton(formatTime(seconds));
          jump.className = 'quiet';
          jump.setAttribute('aria-label', 'Jump to ' + formatTime(seconds));
          jump.addEventListener('click', () => {
            const player = activePlayer(video);
            if (player) player.currentTime = Math.min(seconds, player.duration || seconds);
            else status.textContent = 'Wait for this tutorial to load.';
          });
          timestampLinks.append(jump);
        }
      }
      const insert = makeButton('Insert timestamp');
      insert.className = 'quiet';
      insert.addEventListener('click', () => {
        const player = activePlayer(video);
        if (!player) {
          status.textContent = 'Wait for this tutorial to load.';
          return;
        }
        const stamp = '[' + formatTime(Math.floor(player.currentTime)) + ']';
        if (note.value.length - (note.selectionEnd - note.selectionStart) + stamp.length > note.maxLength) {
          status.textContent = 'The note is full. Remove some text before inserting a timestamp.';
          return;
        }
        note.setRangeText(stamp, note.selectionStart, note.selectionEnd, 'end');
        note.focus();
        autosave();
        showTimestamps();
      });
      note.addEventListener('input', () => {
        autosave();
        showTimestamps();
      });
      showTimestamps();
      retry.addEventListener('click', autosave);
      const save = makeButton('Save checkpoint');
      const end = endButton(view);
      save.addEventListener('click', async () => {
        const pageVideo = parseVideo(location.href);
        const watch = document.querySelector('ytd-watch-flexy');
        const player = activePlayer(video);
        if (!pageVideo || !player) {
          status.textContent = 'Wait for the tutorial to load before saving.';
          return;
        }

        const heading = watch?.querySelector('h1 yt-formatted-string, h1');
        const title = heading?.textContent?.trim() || document.title.replace(/ - YouTube$/, '') || 'YouTube video';
        const seconds = Math.floor(player.currentTime);
        save.disabled = true;
        end.dataset.busy = 'true';
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
          delete end.dataset.busy;
          updateTimer();
        }
      });
      panel.replaceChildren(sessionIndicator(), heading, label, note, timestampLinks, draftStatus, retry, makeActions(insert, save, end), status);
      updateTimer();
    }

    function endButton(view: number) {
      const end = makeButton('End session');
      end.className = 'quiet';
      end.dataset.endSession = '';
      end.disabled = !!endsAt && endsAt > Date.now();
      end.addEventListener('click', async () => {
        end.dataset.busy = 'true';
        end.disabled = true;
        try {
          await studySession({ type: 'study:stop' });
          folderId = undefined;
          endsAt = undefined;
          updatePage();
          render();
        } catch (error) {
          if (view === generation) panel.append(makeStatus(error instanceof Error ? error.message : 'Could not end the session.'));
          delete end.dataset.busy;
          updateTimer();
        }
      });
      return end;
    }

    async function refreshSession() {
      const session = await studySession({ type: 'study:get' });
      if (ctx.isInvalid) return;
      const changed = folderId !== session.folderId;
      folderId = session.folderId;
      endsAt = session.endsAt;
      sessionReady = true;
      updatePage();
      if (changed || !panel.childElementCount) render();
      updateTimer();
    }

    const onSessionChanged = (changes: Record<string, unknown>, area: string) => {
      const renamed = changes['folder:' + folderId] as { newValue?: Folder } | undefined;
      if (area === 'local' && renamed?.newValue) {
        const heading = root.querySelector<HTMLElement>('[data-folder-name]');
        if (heading) heading.textContent = renamed.newValue.name;
      }
      if (area === 'local' && (ACTIVE_SESSION_KEY in changes || SESSION_END_KEY in changes)) {
        void refreshSession().catch(console.error);
      }
    };
    browser.storage.onChanged.addListener(onSessionChanged);
    ctx.onInvalidated(() => browser.storage.onChanged.removeListener(onSessionChanged));
    const timer = window.setInterval(updateTimer, 1000);
    ctx.onInvalidated(() => window.clearInterval(timer));
    ctx.addEventListener(document, 'visibilitychange', updateTimer);
    void refreshSession().catch(console.error);

    function sessionIndicator() {
      const indicator = document.createElement('p');
      indicator.className = 'session-running';
      const label = document.createElement('span');
      label.dataset.sessionLabel = '';
      label.textContent = 'Session running';
      const remaining = document.createElement('span');
      remaining.dataset.sessionTimer = '';
      indicator.append(label, remaining);
      return indicator;
    }

    function updateTimer() {
      const secondsLeft = Math.max(0, Math.ceil(((endsAt ?? 0) - Date.now()) / 1000));
      const labelText = endsAt && secondsLeft === 0 ? 'Session complete' : 'Session running';
      for (const label of root.querySelectorAll<HTMLElement>('[data-session-label]')) {
        if (label.textContent !== labelText) label.textContent = labelText;
      }
      for (const timer of root.querySelectorAll<HTMLElement>('[data-session-timer]')) {
        const text = endsAt ? (secondsLeft > 0 ? ' · ' + formatTime(secondsLeft) + ' left' : '') : '';
        if (timer.textContent !== text) timer.textContent = text;
      }
      for (const end of root.querySelectorAll<HTMLButtonElement>('[data-end-session]')) {
        end.disabled = secondsLeft > 0 || end.dataset.busy === 'true';
      }
    }
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

function activePlayer(video: Video) {
  const watch = document.querySelector('ytd-watch-flexy');
  const player = watch?.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  const playerVideoId = watch?.getAttribute('video-id');
  if (parseVideo(location.href)?.videoId !== video.videoId ||
      (playerVideoId && playerVideoId !== video.videoId) || !player ||
      player.readyState === 0 || player.seeking || !Number.isFinite(player.currentTime) ||
      player.closest('.ad-showing')) return;
  return player;
}
