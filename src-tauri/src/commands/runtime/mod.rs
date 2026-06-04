mod bundle;
mod config;
mod constants;
mod extensions;
mod models;
mod paths;
mod process;
mod service;
mod types;

use tauri::AppHandle;
use types::{
    HermesExtensionsCatalog, ModelConfigStatus, OpenAiModelConfigInput, OpenAiModelsInput,
    OpenAiModelsResult, RuntimeCommandResult, RuntimeConnection, RuntimeDashboardApiInput,
    RuntimeStatus,
};

#[tauri::command]
pub async fn runtime_status(app: AppHandle) -> Result<RuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_status_impl(app))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn runtime_prepare(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_prepare_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_dashboard_start(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_dashboard_start_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_dashboard_stop(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_dashboard_stop_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_dashboard_status(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_dashboard_status_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_connection(app: AppHandle) -> Result<RuntimeConnection, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_connection_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_dashboard_api(
    app: AppHandle,
    input: RuntimeDashboardApiInput,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_dashboard_api_impl(app, input))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_doctor(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_doctor_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_setup_portal(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_setup_portal_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_dashboard_restart(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_dashboard_restart_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_reveal_logs(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || service::runtime_reveal_logs_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn model_config_status(app: AppHandle) -> Result<ModelConfigStatus, String> {
    tauri::async_runtime::spawn_blocking(move || models::model_config_status_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn model_config_save_openai(
    app: AppHandle,
    input: OpenAiModelConfigInput,
) -> Result<ModelConfigStatus, String> {
    tauri::async_runtime::spawn_blocking(move || models::model_config_save_openai_impl(app, input))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn model_config_fetch_openai_models(
    input: OpenAiModelsInput,
) -> Result<OpenAiModelsResult, String> {
    tauri::async_runtime::spawn_blocking(move || models::fetch_openai_compatible_models(&input))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn runtime_extensions_catalog(app: AppHandle) -> Result<HermesExtensionsCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || extensions::runtime_extensions_catalog_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

pub fn start_runtime_on_startup(app: AppHandle) {
    service::start_runtime_on_startup(app);
}

pub fn stop_runtime_for_shutdown(app: AppHandle) {
    service::stop_runtime_for_shutdown(app);
}
