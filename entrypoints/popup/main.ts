import { createFolder, listStudyData } from '../../lib/storage';
import { exportFolderMarkdown } from '../../lib/notes';
import { studySession } from '../../lib/session';
import { formatTime, type Checkpoint } from '../../lib/study';
import './style.css';

const form = document.querySelector('form')!;
const input = document.querySelector<HTMLInputElement>('#folder-name')!;
const sessionLength = document.querySelector<HTMLInputElement>('#session-length')!;
const status = document.querySelector('#status')!;
const foldersElement = document.querySelector('#folders')!;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button')!;
  button.disabled = true;
  try {
    await createFolder(input.value);
    input.value = '';
    status.textContent = '';
    await renderFolders();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not create the folder.';
  } finally {
    button.disabled = false;
  }
});

async function renderFolders() {
  const { folders, checkpoints } = await listStudyData();
  foldersElement.replaceChildren();
  if (!folders.length) {
    foldersElement.textContent = 'Create a folder, then open a YouTube tutorial to start studying.';
    return;
  }

  for (const folder of folders) {
    const card = document.createElement('article');
    const heading = document.createElement('h2');
    heading.textContent = folder.name;
    const actions = document.createElement('div');
    actions.className = 'folder-actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = 'Export Markdown';
    download.addEventListener('click', async () => {
      download.disabled = true;
      try {
        const latest = await listStudyData();
        const currentFolder = latest.folders.find((saved) => saved.id === folder.id) ?? folder;
        const markdown = exportFolderMarkdown(currentFolder, latest.checkpoints);
        const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = currentFolder.name.replace(/[\\/:*?"<>|]/g, '_') + '.md';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = '';
      } catch {
        status.textContent = 'Could not export this folder.';
      } finally {
        download.disabled = false;
      }
    });
    actions.append(download);
    card.append(heading, actions);

    const savedVideos = checkpoints.filter((checkpoint) => checkpoint.folderId === folder.id);
    const [latest] = savedVideos;
    if (!latest) {
      const empty = document.createElement('p');
      empty.textContent = 'No checkpoints yet';
      card.append(empty);
    } else {
      card.append(resumeButton(latest, 'Resume'));

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = savedVideos.length === 1 ? '1 saved video' : savedVideos.length + ' saved videos';
      const list = document.createElement('ul');
      for (const checkpoint of savedVideos) {
        const item = document.createElement('li');
        item.append(resumeButton(checkpoint, checkpoint.title + ' · ' + formatTime(checkpoint.seconds)));
        list.append(item);
      }
      details.append(summary, list);
      card.append(details);
    }
    foldersElement.append(card);
  }
}

function resumeButton(checkpoint: Checkpoint, label: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    if (!sessionLength.reportValidity()) return;
    button.disabled = true;
    try {
      await studySession({ type: 'study:resume', checkpoint, minutes: Number(sessionLength.value) });
      button.disabled = false;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not resume this checkpoint.';
      button.disabled = false;
    }
  });
  return button;
}

void renderFolders().catch(() => {
  status.textContent = 'Could not load your folders.';
});
