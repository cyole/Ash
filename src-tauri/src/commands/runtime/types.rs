use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub(crate) installed: bool,
    pub(crate) running: bool,
    pub(crate) gateway_running: bool,
    pub(crate) api_key_configured: bool,
    pub(crate) path: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) mode: String,
    pub(crate) api_url: String,
    pub(crate) install_source: String,
    pub(crate) bundled_runtime_archive: String,
    pub(crate) bundled_runtime_found: bool,
    pub(crate) managed_root: String,
    pub(crate) hermes_home: String,
    pub(crate) config_path: String,
    pub(crate) legacy_config_path: Option<String>,
    pub(crate) legacy_config_found: bool,
    pub(crate) gateway_status: Option<String>,
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
pub struct RuntimeApiAuth {
    pub(crate) api_url: String,
    pub(crate) api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiModelConfigInput {
    pub(crate) name: String,
    pub(crate) base_url: String,
    pub(crate) api_key: String,
    pub(crate) model: String,
    pub(crate) context_length: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiModelsInput {
    pub(crate) base_url: String,
    pub(crate) api_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesChatStreamInput {
    pub(crate) stream_id: String,
    pub(crate) session_id: String,
    pub(crate) message: String,
    pub(crate) model: Option<String>,
    pub(crate) files: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigStatus {
    pub(crate) configured: bool,
    pub(crate) provider_key: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) base_url: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) has_api_key: bool,
    pub(crate) config_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiModelsResult {
    pub(crate) models: Vec<String>,
    pub(crate) models_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesExtensionsCatalog {
    pub(crate) skills: Vec<HermesSkillCatalogItem>,
    pub(crate) plugins: Vec<HermesPluginCatalogItem>,
    pub(crate) skills_root: String,
    pub(crate) optional_skills_root: String,
    pub(crate) plugins_root: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesSkillCatalogItem {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) category: String,
    pub(crate) source: String,
    pub(crate) status: String,
    pub(crate) version: Option<String>,
    pub(crate) author: Option<String>,
    pub(crate) path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesPluginCatalogItem {
    pub(crate) key: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) kind: String,
    pub(crate) version: Option<String>,
    pub(crate) author: Option<String>,
    pub(crate) source: String,
    pub(crate) status: String,
    pub(crate) requires_env: Vec<String>,
    pub(crate) path: String,
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
