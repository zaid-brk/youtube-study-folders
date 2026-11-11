# YouTube Study Folders

A Chrome extension for studying with YouTube tutorials. Start a study session, pick a folder, then save your notes and playback position together. Resume from the extension popup when you are ready to continue.

## Try it locally

1. Install Node.js 24 and run `npm ci`.
2. Run `npm run build`.
3. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
4. Choose the project's `.output/chrome-mv3` directory.
5. Open a YouTube tutorial and click **Start Study Session** below the player. Create a folder, write a note, then click **Save checkpoint**.
6. Open the extension popup and click **Resume** on that folder. To open an older video, expand the folder's saved videos.

For development, `npm run dev` opens a browser with the extension loaded. Chrome keeps saved folders and checkpoints in that browser profile. The extension uses explicit saves, so click **Save checkpoint** before you leave a video.

## How it works

- **Content script.** Adds the study controls to the YouTube watch page. It listens for in-page navigation and reads the timestamp from the active video when you save. During a study session, the sidebar shows the scratchpad and current playlist. Comments and recommendations are hidden. While the scratchpad has focus, typing takes precedence over YouTube shortcuts.
- **Popup.** Lists folders and saved videos. Each folder's Resume button opens its most recently saved checkpoint.
- **Background worker.** Tracks the active study folder for each open tab. To resume, it creates a tab, associates that tab with the folder, then opens the original watch URL with the saved timestamp and playlist.
- **Local storage.** Folders have stable IDs. Checkpoints use the folder ID and video ID together, so the same video can have different notes in different folders. Each checkpoint has its own storage key, allowing separate tabs to save different checkpoints independently.

The extension runs on desktop YouTube. Folders and notes are stored locally in the Chrome profile.

## Agenda

- Let learners choose where their notes are saved, including apps such as Notion. Keep the existing scratchpad beside the video and save its notes to the destination the learner chooses.

## Checks

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:browser
```

The browser test loads the built extension in Chromium and serves a controlled YouTube-style page. It covers folder creation, focus toggling, in-page navigation, and resuming both folders after a browser restart. To verify compatibility with live YouTube, try a standalone video and a playlist in your test profile. Save two different checkpoints for the same video in separate folders, quit Chrome, and resume each one. Verify the notes, playback positions, and playlist controls.
