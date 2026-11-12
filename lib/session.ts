import { browser } from 'wxt/browser';
import type { StudyMessage, StudySession } from './study';

export async function studySession(message: StudyMessage) {
  const response = await browser.runtime.sendMessage(message) as StudySession & { error?: string };
  if (!response || response.error) throw new Error(response?.error ?? 'Could not reach the extension.');
  return response;
}
