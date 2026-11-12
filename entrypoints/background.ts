import { browser } from 'wxt/browser';
import {
  ACTIVE_SESSION_KEY,
  SESSION_END_KEY,
  formatTime,
  resumeUrl,
  sessionDeadline,
  type StudyMessage,
  type StudySession,
} from '../lib/study';

function tabKey(tabId: number) {
  return 'study-tab:' + tabId;
}

export default defineBackground(() => {
  let operations = Promise.resolve<StudySession>({});
  browser.runtime.onMessage.addListener((message: StudyMessage, sender, sendResponse) => {
    if (!['study:get', 'study:start', 'study:stop', 'study:resume'].includes(message?.type)) return;

    operations = operations.catch(() => ({})).then(() => handleMessage(message, sender.tab?.id));
    operations
      .then((session) => sendResponse(session))
      .catch((error: unknown) => {
        console.error('Study session failed', error);
        sendResponse({ error: error instanceof Error ? error.message : 'Could not change the study session.' });
      });
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.remove(tabKey(tabId)).catch(console.error);
  });
});

async function handleMessage(message: StudyMessage, tabId?: number): Promise<StudySession> {
  const stored = await browser.storage.local.get([ACTIVE_SESSION_KEY, SESSION_END_KEY]);
  const activeFolder = stored[ACTIVE_SESSION_KEY] as string | undefined;
  const endsAt = stored[SESSION_END_KEY] as number | undefined;

  if (message.type === 'study:stop') {
    const secondsLeft = Math.ceil(((endsAt ?? 0) - Date.now()) / 1000);
    if (activeFolder && secondsLeft > 0) {
      throw new Error('Session locked for another ' + formatTime(secondsLeft) + '.');
    }
    const sessions = await browser.storage.session.get(null);
    await browser.storage.session.remove(Object.keys(sessions).filter((key) => key.startsWith('study-tab:')));
    await browser.storage.local.remove([ACTIVE_SESSION_KEY, SESSION_END_KEY]);
    return {};
  }

  if (message.type === 'study:resume') {
    const deadline = sessionDeadline(activeFolder ? endsAt : undefined, message.minutes);
    const tab = await browser.tabs.create({ url: 'about:blank' });
    if (tab.id === undefined) throw new Error('Chrome did not create a tab ID.');

    try {
      await browser.storage.session.set({ [tabKey(tab.id)]: message.checkpoint.folderId });
      await browser.tabs.update(tab.id, { url: resumeUrl(message.checkpoint) });
      await browser.storage.local.set({
        [ACTIVE_SESSION_KEY]: message.checkpoint.folderId,
        [SESSION_END_KEY]: deadline,
      });
    } catch (error) {
      await browser.tabs.remove(tab.id).catch(console.error);
      throw error;
    }
    return { folderId: message.checkpoint.folderId, endsAt: deadline };
  }

  if (tabId === undefined) throw new Error('Study sessions need a tab.');
  const key = tabKey(tabId);
  if (message.type === 'study:start') {
    const deadline = sessionDeadline(activeFolder ? endsAt : undefined, message.minutes);
    await browser.storage.session.set({ [key]: message.folderId });
    await browser.storage.local.set({
      [ACTIVE_SESSION_KEY]: message.folderId,
      [SESSION_END_KEY]: deadline,
    });
    return { folderId: message.folderId, endsAt: deadline };
  }

  if (!activeFolder) return {};
  const tabFolder = (await browser.storage.session.get(key))[key] as string | undefined;
  return { folderId: tabFolder ?? activeFolder, endsAt };
}
