use serde::Deserialize;
use serde_yaml::{Mapping, Value};
use std::collections::BTreeSet;
use tauri::AppHandle;

use super::config::{
    ensure_mapping_child, ensure_mapping_value, ensure_runtime_config, read_yaml_file,
    restrict_secret_file_permissions, write_yaml_file,
};
use super::constants::PROVIDER_MODEL_FETCH_TIMEOUT;
use super::paths::{runtime_paths, RuntimePaths};
use super::types::{
    ModelConfigStatus, OpenAiModelConfigInput, OpenAiModelsInput, OpenAiModelsResult,
};

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    data: Option<Vec<OpenAiModelEntry>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelEntry {
    id: Option<String>,
}

pub(crate) fn model_config_status_impl(app: AppHandle) -> Result<ModelConfigStatus, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_config(&paths)?;
    let config = read_yaml_file(&paths.config_path())?;
    Ok(read_model_config_status(&paths, &config))
}

pub(crate) fn model_config_save_openai_impl(
    app: AppHandle,
    input: OpenAiModelConfigInput,
) -> Result<ModelConfigStatus, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_config(&paths)?;

    let name = normalize_model_config_name(&input.name);
    let base_url = normalize_openai_base_url(&input.base_url)?;
    let api_key = input.api_key.trim();
    let model = input.model.trim();

    if api_key.is_empty() {
        return Err("请输入 API Key。".to_string());
    }

    if model.is_empty() {
        return Err("请输入默认模型。".to_string());
    }

    let config_path = paths.config_path();
    let mut config =
        read_yaml_file(&config_path).unwrap_or_else(|_| Value::Mapping(Mapping::new()));
    let root = ensure_mapping_value(&mut config);

    let provider_key = format!("custom:{name}");
    upsert_openai_custom_provider(root, &name, &base_url, api_key, model, input.context_length);

    let model_config = ensure_mapping_child(root, "model");
    model_config.insert(
        Value::String("default".to_string()),
        Value::String(model.to_string()),
    );
    model_config.insert(
        Value::String("provider".to_string()),
        Value::String(provider_key),
    );
    model_config.remove(&Value::String("base_url".to_string()));
    model_config.remove(&Value::String("api_key".to_string()));
    write_yaml_file(&config_path, &config)?;
    restrict_secret_file_permissions(&config_path)?;

    Ok(read_model_config_status(&paths, &config))
}

pub(crate) fn fetch_openai_compatible_models(
    input: &OpenAiModelsInput,
) -> Result<OpenAiModelsResult, String> {
    let base_url = normalize_openai_base_url(&input.base_url)?;
    let api_key = input.api_key.trim();

    if api_key.is_empty() {
        return Err("请输入 API Key。".to_string());
    }

    let models_url = openai_models_url(&base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(PROVIDER_MODEL_FETCH_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(&models_url)
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(|error| format!("模型列表请求失败：{error}"))?;
    let status = response.status();

    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        let message = body.trim();
        return Err(if message.is_empty() {
            format!("模型服务返回 HTTP {status}。")
        } else {
            format!(
                "模型服务返回 HTTP {status}: {}",
                message.chars().take(240).collect::<String>()
            )
        });
    }

    let payload = response
        .json::<OpenAiModelsResponse>()
        .map_err(|error| format!("模型列表响应不是 OpenAI 兼容格式：{error}"))?;
    let mut models = BTreeSet::new();

    for entry in payload.data.unwrap_or_default() {
        if let Some(id) = entry
            .id
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty())
        {
            models.insert(id);
        }
    }

    if models.is_empty() {
        return Err("模型服务响应中没有 data[].id。".to_string());
    }

    Ok(OpenAiModelsResult {
        models: models.into_iter().collect(),
        models_url,
    })
}

fn read_model_config_status(paths: &RuntimePaths, config: &Value) -> ModelConfigStatus {
    let config_path = paths.config_path().to_string_lossy().to_string();
    let Some(root) = config.as_mapping() else {
        return ModelConfigStatus {
            configured: false,
            provider_key: None,
            name: None,
            base_url: None,
            model: None,
            has_api_key: false,
            config_path,
        };
    };

    let model_config = mapping_child(root, "model");
    let default_model = model_config.and_then(|model| {
        mapping_string(model, "default").or_else(|| mapping_string(model, "model"))
    });
    let provider_key = model_config.and_then(|model| mapping_string(model, "provider"));
    let provider_name = provider_key
        .as_deref()
        .and_then(|provider| provider.strip_prefix("custom:"))
        .map(ToOwned::to_owned);
    let provider_entry = provider_name
        .as_deref()
        .and_then(|name| find_custom_provider(root, name));
    let base_url = provider_entry.and_then(|provider| mapping_string(provider, "base_url"));
    let has_api_key = provider_entry
        .and_then(|provider| mapping_string(provider, "api_key"))
        .is_some_and(|key| !key.trim().is_empty());

    ModelConfigStatus {
        configured: default_model.is_some() && base_url.is_some(),
        provider_key,
        name: provider_name,
        base_url,
        model: default_model,
        has_api_key,
        config_path,
    }
}

fn upsert_openai_custom_provider(
    root: &mut Mapping,
    name: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    context_length: Option<u64>,
) {
    let key = Value::String("custom_providers".to_string());
    let entry = root
        .entry(key)
        .or_insert_with(|| Value::Sequence(Vec::new()));

    if !matches!(entry, Value::Sequence(_)) {
        *entry = Value::Sequence(Vec::new());
    }

    let providers = entry
        .as_sequence_mut()
        .expect("custom_providers is a sequence");
    let provider_index = providers
        .iter()
        .position(|provider| custom_provider_name_matches(provider, name));
    let provider = if let Some(index) = provider_index {
        providers.get_mut(index).expect("provider index is valid")
    } else {
        providers.push(Value::Mapping(Mapping::new()));
        providers.last_mut().expect("provider just pushed")
    };

    if !matches!(provider, Value::Mapping(_)) {
        *provider = Value::Mapping(Mapping::new());
    }

    let provider = ensure_mapping_value(provider);
    provider.insert(
        Value::String("name".to_string()),
        Value::String(name.to_string()),
    );
    provider.insert(
        Value::String("base_url".to_string()),
        Value::String(base_url.to_string()),
    );
    provider.insert(
        Value::String("api_key".to_string()),
        Value::String(api_key.to_string()),
    );
    provider.insert(
        Value::String("model".to_string()),
        Value::String(model.to_string()),
    );
    provider.insert(
        Value::String("api_mode".to_string()),
        Value::String("chat_completions".to_string()),
    );

    if let Some(context_length) = context_length.filter(|value| *value > 0) {
        let context_length = i64::try_from(context_length).unwrap_or(i64::MAX);
        let models = ensure_mapping_child(provider, "models");
        let model_config = ensure_mapping_child(models, model);
        model_config.insert(
            Value::String("context_length".to_string()),
            Value::Number(context_length.into()),
        );
    }
}

fn custom_provider_name_matches(provider: &Value, name: &str) -> bool {
    provider
        .as_mapping()
        .and_then(|provider| mapping_string(provider, "name"))
        .is_some_and(|candidate| normalize_model_config_name(&candidate) == name)
}

fn find_custom_provider<'a>(root: &'a Mapping, name: &str) -> Option<&'a Mapping> {
    let providers = root
        .get(&Value::String("custom_providers".to_string()))?
        .as_sequence()?;

    providers.iter().find_map(|provider| {
        let provider = provider.as_mapping()?;
        let provider_name = mapping_string(provider, "name")?;
        (normalize_model_config_name(&provider_name) == name).then_some(provider)
    })
}

fn mapping_child<'a>(mapping: &'a Mapping, key: &str) -> Option<&'a Mapping> {
    mapping
        .get(&Value::String(key.to_string()))
        .and_then(Value::as_mapping)
}

fn mapping_string(mapping: &Mapping, key: &str) -> Option<String> {
    mapping
        .get(&Value::String(key.to_string()))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_model_config_name(input: &str) -> String {
    let normalized = input
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if normalized.is_empty() {
        "openai-compatible".to_string()
    } else {
        normalized
    }
}

fn normalize_openai_base_url(input: &str) -> Result<String, String> {
    let base_url = input.trim().trim_end_matches('/').to_string();

    if base_url.is_empty() {
        return Err("请输入服务地址。".to_string());
    }

    if !(base_url.starts_with("https://") || base_url.starts_with("http://")) {
        return Err("服务地址需要以 http:// 或 https:// 开头。".to_string());
    }

    Ok(base_url)
}

fn openai_models_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let last_segment = base.rsplit('/').next().unwrap_or_default();
    let is_versioned = last_segment.len() >= 2
        && last_segment.starts_with('v')
        && last_segment[1..].chars().all(|ch| ch.is_ascii_digit());

    if is_versioned {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    }
}
