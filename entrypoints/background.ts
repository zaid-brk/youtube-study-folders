import { browser } from 'wxt/browser';
import { resumeUrl, type StudyMessage } from '../lib/study';

function tabKey(tabId: number) {
  return 'study-tab:' + tabId;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: StudyMessage, sender, sendResponse) => {
    if (!['study:get', 'study:start', 'study:stop', 'study:resume'].includes(message?.type)) return;

    handleMessage(message, sender.tab?.id)
      .then((folderId) => sendResponse({ folderId }))
      .catch((error: unknown) => {
        console.error('Study session failed', error);
        sendResponse({ error: 'Could not change the study session. Try again.' });
      });
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.remove(tabKey(tabId)).catch(console.error);
  });
});

async function handleMessage(message: StudyMessage, tabId?: number) {
  if (message.type === 'study:resume') {
    const tab = await browser.tabs.create({ url: 'about:blank' });
    if (tab.id === undefined) throw new Error('Chrome did not create a tab ID.');

    try {
      await browser.storage.session.set({ [tabKey(tab.id)]: message.checkpoint.folderId });
      await browser.tabs.update(tab.id, { url: resumeUrl(message.checkpoint) });
    } catch (error) {
      await browser.tabs.remove(tab.id).catch(console.error);
      throw error;
    }
    return;
  }

  if (tabId === undefined) throw new Error('Study sessions need a tab.');
  const key = tabKey(tabId);
  if (message.type === 'study:start') {
    await browser.storage.session.set({ [key]: message.folderId });
    return message.folderId;
  }
  if (message.type === 'study:stop') {
    await browser.storage.session.remove(key);
    return;
  }
  return (await browser.storage.session.get(key))[key] as string | undefined;
}
