import { browser } from 'wxt/browser';
import type { StudyMessage } from './study';

export async function studySession(message: StudyMessage) {
  const response = await browser.runtime.sendMessage(message) as { folderId?: string; error?: string };
  if (!response || response.error) throw new Error(response?.error ?? 'Could not reach the extension.');
  return response.folderId;
}
