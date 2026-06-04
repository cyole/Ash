use std::sync::atomic::Ordering;

use tauri::AppHandle;

use crate::{commands, SHUTDOWN_REQUESTED};

#[tauri::command]
pub fn app_restart(app: AppHandle) {
    if SHUTDOWN_REQUESTED.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn_blocking(move || {
        commands::runtime::stop_runtime_for_shutdown(app.clone());
        app.restart();
    });
}
