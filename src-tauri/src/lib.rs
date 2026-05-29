mod commands;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

static SHUTDOWN_REQUESTED: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
                tauri::async_runtime::spawn_blocking(move || {
                    commands::runtime::stop_runtime_for_shutdown(app.clone());
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime::runtime_status,
            commands::runtime::runtime_prepare,
            commands::runtime::runtime_gateway_start,
            commands::runtime::runtime_gateway_stop,
            commands::runtime::runtime_gateway_status,
            commands::runtime::runtime_gateway_restart,
            commands::runtime::runtime_api_auth,
            commands::runtime::runtime_doctor,
            commands::runtime::runtime_setup_portal,
            commands::runtime::runtime_extensions_catalog,
            commands::runtime::model_config_status,
            commands::runtime::model_config_save_openai,
            commands::runtime::model_config_fetch_openai_models,
            commands::runtime::hermes_chat_stream
        ])
        .run(tauri::generate_context!())
        .expect("Hermes 桌面应用运行失败");
}
