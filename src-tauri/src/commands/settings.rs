use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env, fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const UI_SETTINGS_VERSION: u64 = 1;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsLoadResult {
    settings: Option<Value>,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsSaveInput {
    settings: Value,
}

#[tauri::command]
pub async fn app_settings_load(app: AppHandle) -> Result<AppSettingsLoadResult, String> {
    tauri::async_runtime::spawn_blocking(move || app_settings_load_impl(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn app_settings_save(
    app: AppHandle,
    input: AppSettingsSaveInput,
) -> Result<AppSettingsLoadResult, String> {
    tauri::async_runtime::spawn_blocking(move || app_settings_save_impl(&app, input))
        .await
        .map_err(|error| error.to_string())?
}

fn app_settings_load_impl(app: &AppHandle) -> Result<AppSettingsLoadResult, String> {
    let path = ui_settings_path(app);
    if !path.exists() {
        return Ok(load_result(None, path));
    }

    let body = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let value = match serde_json::from_str::<Value>(&body) {
        Ok(value) => value,
        Err(_) => {
            backup_invalid_settings(&path)?;
            return Ok(load_result(None, path));
        }
    };

    Ok(load_result(extract_settings(value), path))
}

fn app_settings_save_impl(
    app: &AppHandle,
    input: AppSettingsSaveInput,
) -> Result<AppSettingsLoadResult, String> {
    let path = ui_settings_path(app);
    let Some(parent) = path.parent() else {
        return Err("无法解析设置目录。".to_string());
    };

    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let payload = json!({
        "version": UI_SETTINGS_VERSION,
        "settings": input.settings,
    });
    let body = serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?;

    fs::write(&path, format!("{body}\n")).map_err(|error| error.to_string())?;

    Ok(load_result(extract_settings(payload), path))
}

fn extract_settings(value: Value) -> Option<Value> {
    let settings = value
        .get("settings")
        .cloned()
        .unwrap_or(value);

    (!settings.is_null()).then_some(settings)
}

fn load_result(settings: Option<Value>, path: PathBuf) -> AppSettingsLoadResult {
    AppSettingsLoadResult {
        settings,
        path: path.to_string_lossy().to_string(),
    }
}

fn ui_settings_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("settings").join("ui.json")
}

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| fallback_app_data_dir())
}

fn fallback_app_data_dir() -> PathBuf {
    if let Some(home) = env::var_os("HOME") {
        return PathBuf::from(home).join(".hermes-desktop");
    }

    if let Some(profile) = env::var_os("USERPROFILE") {
        return PathBuf::from(profile).join(".hermes-desktop");
    }

    env::temp_dir().join("hermes-desktop")
}

fn backup_invalid_settings(path: &PathBuf) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let backup_path = path.with_extension(format!("json.invalid.{timestamp}"));

    fs::rename(path, backup_path).map_err(|error| error.to_string())
}
