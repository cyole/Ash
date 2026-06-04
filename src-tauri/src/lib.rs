mod commands;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
use tauri_plugin_log::log::LevelFilter;

static SHUTDOWN_REQUESTED: AtomicBool = AtomicBool::new(false);

fn stop_runtime_and_exit(app: tauri::AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        commands::runtime::stop_runtime_for_shutdown(app.clone());
        app.exit(0);
    });
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .level(LevelFilter::Info)
        .level_for("tao", LevelFilter::Warn)
        .level_for("tauri_runtime_wry", LevelFilter::Warn)
        .level_for("wry", LevelFilter::Warn)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(log_plugin())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            commands::runtime::start_runtime_on_startup(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if SHUTDOWN_REQUESTED.swap(true, Ordering::SeqCst) {
                    return;
                }

                api.prevent_close();
                let app = window.app_handle().clone();
                stop_runtime_and_exit(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime::runtime_status,
            commands::runtime::runtime_prepare,
            commands::runtime::runtime_dashboard_start,
            commands::runtime::runtime_dashboard_stop,
            commands::runtime::runtime_dashboard_status,
            commands::runtime::runtime_dashboard_restart,
            commands::runtime::runtime_reveal_logs,
            commands::runtime::runtime_connection,
            commands::runtime::runtime_dashboard_api,
            commands::runtime::runtime_doctor,
            commands::runtime::runtime_setup_portal,
            commands::settings::app_settings_load,
            commands::settings::app_settings_save
        ])
        .build(tauri::generate_context!())
        .expect("Hermes 桌面应用运行失败");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if SHUTDOWN_REQUESTED.swap(true, Ordering::SeqCst) {
                return;
            }

            api.prevent_exit();
            stop_runtime_and_exit(app_handle.clone());
        }
    });
}
