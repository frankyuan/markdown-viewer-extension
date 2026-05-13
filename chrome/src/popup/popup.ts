// Markdown Viewer Extension - Chrome Popup Entry Point
// Initialize Chrome platform before loading shared popup

// Initialize Chrome platform FIRST
import '../webview/index';

// Import and initialize shared popup
import { initializePopup } from '../../../src/ui/popup/popup-core';
import {
  OBSIDIAN_ATTACHMENT_FOLDER_STORAGE_KEY,
  readObsidianAttachmentFolderSetting,
  writeObsidianAttachmentFolderSetting,
} from '../obsidian-attachments';

function safeSendTabMessage(tabId: number, message: unknown): void {
  try {
    chrome.tabs.sendMessage(tabId, message, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Ignore tabs that cannot receive extension messages.
  }
}

function safeQueryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        resolve(tabs || []);
      });
    } catch {
      resolve([]);
    }
  });
}

async function notifyObsidianAttachmentFolderChanged(value: string): Promise<void> {
  try {
    const tabs = await safeQueryTabs({});
    tabs.forEach((tab) => {
      if (tab.id) {
        safeSendTabMessage(tab.id, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'SETTING_CHANGED',
          payload: {
            key: OBSIDIAN_ATTACHMENT_FOLDER_STORAGE_KEY,
            value,
          },
          timestamp: Date.now(),
          source: 'popup-obsidian-attachments',
        });
      }
    });
  } catch {
    // Ignore broadcast failures; the next preview load will read storage.
  }
}

async function initializeObsidianAttachmentSetting(): Promise<void> {
  const input = document.getElementById('obsidian-attachment-folder') as HTMLInputElement | null;
  if (!input) {
    return;
  }

  input.value = await readObsidianAttachmentFolderSetting();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const save = async (): Promise<void> => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const savedValue = await writeObsidianAttachmentFolderSetting(input.value);
    input.value = savedValue;
    await notifyObsidianAttachmentFolderChanged(savedValue);
  };

  input.addEventListener('input', () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      void save();
    }, 400);
  });

  input.addEventListener('change', () => {
    void save();
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    await initializePopup();
    await initializeObsidianAttachmentSetting();
  })();

  // Open Project button
  const openProjectBtn = document.getElementById('open-project-btn');
  openProjectBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/workspace/workspace.html') });
    window.close();
  });
});
