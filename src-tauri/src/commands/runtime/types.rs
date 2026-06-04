use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub(crate) installed: bool,
    pub(crate) running: bool,
    pub(crate) dashboard_running: bool,
    pub(crate) background_gateway_running: bool,
    pub(crate) session_token_configured: bool,
    pub(crate) path: Option<String>,
    pub(crate) python_path: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) mode: String,
    pub(crate) api_url: String,
    pub(crate) ws_url: Option<String>,
    pub(crate) install_source: String,
    pub(crate) bundled_runtime_archive: String,
    pub(crate) bundled_runtime_found: bool,
    pub(crate) managed_root: String,
    pub(crate) hermes_home: String,
    pub(crate) config_path: String,
    pub(crate) legacy_config_path: Option<String>,
    pub(crate) legacy_config_found: bool,
    pub(crate) log_path: String,
    pub(crate) recent_log_lines: Vec<String>,
    pub(crate) dashboard_status: Option<String>,
    pub(crate) backend_pid: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCommandResult {
    pub(crate) success: bool,
    pub(crate) code: Option<i32>,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConnection {
    pub(crate) api_url: String,
    pub(crate) ws_url: Option<String>,
    pub(crate) session_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDashboardApiInput {
    pub(crate) path: String,
    pub(crate) method: Option<String>,
    pub(crate) body: Option<serde_json::Value>,
    pub(crate) timeout_ms: Option<u64>,
}

impl RuntimeCommandResult {
    pub(crate) fn message(message: impl Into<String>) -> Self {
        Self {
            success: true,
            code: Some(0),
            stdout: message.into(),
            stderr: String::new(),
        }
    }
}
