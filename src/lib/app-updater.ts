import { invoke } from "@tauri-apps/api/core";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

import { isTauriRuntime, stopDashboard } from "@/lib/tauri";

export interface AppUpdateInfo {
  available: boolean;
  body: string | null;
  currentVersion: string | null;
  date: string | null;
  version: string | null;
}

export interface AppUpdateProgress {
  downloaded: number;
  percent: number | null;
  total: number | null;
}

let pendingUpdate: Update | null = null;

export async function getCurrentAppVersion(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  if (!isTauriRuntime()) {
    return {
      available: false,
      body: null,
      currentVersion: null,
      date: null,
      version: null,
    };
  }

  closePendingUpdate();

  const [{ check }, currentVersion] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    getCurrentAppVersion(),
  ]);
  const update = await check();
  pendingUpdate = update;

  return {
    available: Boolean(update),
    body: update?.body ?? null,
    currentVersion,
    date: update?.date ?? null,
    version: update?.version ?? null,
  };
}

export async function installPendingAppUpdate(onProgress: (progress: AppUpdateProgress) => void): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("更新只在桌面应用中可用。");
  }

  if (!pendingUpdate) {
    const updateInfo = await checkForAppUpdate();
    if (!updateInfo.available || !pendingUpdate) {
      throw new Error("当前没有可安装的更新。");
    }
  }

  const update = pendingUpdate;
  let downloaded = 0;
  let total: number | null = null;

  try {
    await stopDashboard();
  } catch (error) {
    console.error("Failed to stop the local service before installing an app update.", error);
  }

  await update.downloadAndInstall((event) => {
    const progress = updateProgressFromEvent(event, downloaded, total);
    downloaded = progress.downloaded;
    total = progress.total;
    onProgress(progress);
  });

  pendingUpdate = null;
  await invoke("app_restart");
}

function closePendingUpdate() {
  const update = pendingUpdate;
  pendingUpdate = null;

  if (!update) {
    return;
  }

  update.close().catch((error) => {
    console.error("Failed to close the previous app update resource.", error);
  });
}

function updateProgressFromEvent(
  event: DownloadEvent,
  downloaded: number,
  total: number | null,
): AppUpdateProgress {
  switch (event.event) {
    case "Started": {
      const nextTotal = event.data.contentLength ?? null;
      return {
        downloaded: 0,
        percent: nextTotal && nextTotal > 0 ? 0 : null,
        total: nextTotal,
      };
    }
    case "Progress": {
      const nextDownloaded = downloaded + event.data.chunkLength;
      return {
        downloaded: nextDownloaded,
        percent: total && total > 0 ? Math.min(100, Math.round((nextDownloaded / total) * 100)) : null,
        total,
      };
    }
    case "Finished":
      return {
        downloaded,
        percent: total && total > 0 ? 100 : null,
        total,
      };
  }
}
