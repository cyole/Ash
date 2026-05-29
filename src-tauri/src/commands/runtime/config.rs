use serde_yaml::{Mapping, Value};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use super::constants::{
    API_SERVER_KEY_ENV, DESKTOP_API_CORS_ORIGIN, LOCAL_API_HOST, LOCAL_API_PORT,
    MIGRATABLE_CONFIG_KEYS,
};
use super::paths::{ensure_runtime_dirs, legacy_config_path, RuntimePaths};
use super::types::RuntimeCommandResult;

pub(crate) fn migrate_legacy_config_if_needed(paths: &RuntimePaths) -> Result<String, String> {
    let config_path = paths.config_path();
    if config_path.exists() {
        return Ok(format!(
            "正在使用应用托管配置：{}。",
            config_path.to_string_lossy()
        ));
    }

    let mut config = Value::Mapping(Mapping::new());
    let legacy_path = legacy_config_path(paths);
    let mut message = String::from("已创建应用托管配置。");

    if let Some(path) = legacy_path.as_ref().filter(|path| path.is_file()) {
        match read_yaml_file(path) {
            Ok(legacy_config) => {
                merge_user_config(&mut config, &legacy_config);
                message = format!("已从 {} 导入已有 Hermes 偏好。", path.to_string_lossy());
            }
            Err(error) => {
                message = format!(
                    "在 {} 找到已有 Hermes 配置，但导入失败：{}。",
                    path.to_string_lossy(),
                    error
                );
            }
        }
    }

    enforce_local_api_server(&mut config);
    write_yaml_file(&config_path, &config)?;

    Ok(message)
}

fn merge_user_config(target: &mut Value, legacy: &Value) {
    let Some(legacy_map) = legacy.as_mapping() else {
        return;
    };

    let target_map = ensure_mapping_value(target);

    for (key, value) in legacy_map {
        let Some(key_name) = key.as_str() else {
            continue;
        };

        if key_name == "platforms" {
            merge_platforms(target_map, value);
            continue;
        }

        if MIGRATABLE_CONFIG_KEYS.contains(&key_name) {
            target_map.insert(Value::String(key_name.to_string()), value.clone());
        }
    }
}

fn merge_platforms(target: &mut Mapping, legacy_platforms: &Value) {
    let Some(legacy_platforms) = legacy_platforms.as_mapping() else {
        return;
    };

    let target_platforms = ensure_mapping_child(target, "platforms");

    for (key, value) in legacy_platforms {
        if key.as_str() == Some("api_server") {
            continue;
        }

        target_platforms.insert(key.clone(), value.clone());
    }
}

pub(crate) fn ensure_api_server_config(paths: &RuntimePaths) -> Result<(), String> {
    ensure_runtime_dirs(paths)?;

    let config_path = paths.config_path();
    let mut config = if config_path.exists() {
        match read_yaml_file(&config_path) {
            Ok(config) => config,
            Err(_) => {
                let backup_path = backup_invalid_config(&config_path)?;
                let mut config = Value::Mapping(Mapping::new());
                add_desktop_notice(
                    &mut config,
                    format!("无效的旧配置已移动到 {}。", backup_path),
                );
                config
            }
        }
    } else {
        Value::Mapping(Mapping::new())
    };

    enforce_local_api_server(&mut config);
    write_yaml_file(&config_path, &config)
}

pub(crate) fn ensure_api_server_key(paths: &RuntimePaths) -> Result<RuntimeCommandResult, String> {
    ensure_runtime_dirs(paths)?;

    if read_api_server_key(paths).is_some() {
        restrict_secret_file_permissions(&paths.env_path())?;
        return Ok(RuntimeCommandResult::message("本地 API 认证已配置。"));
    }

    let key = generate_api_server_key()?;
    let env_path = paths.env_path();
    let content = fs::read_to_string(&env_path).unwrap_or_default();
    let updated = set_env_value(
        &content,
        API_SERVER_KEY_ENV,
        &key,
        "# 由 Hermes 桌面版管理，用于本地 API 服务。",
    );

    fs::write(&env_path, updated).map_err(|error| error.to_string())?;
    restrict_secret_file_permissions(&env_path)?;

    Ok(RuntimeCommandResult::message(format!(
        "已在 {} 生成本地 API 认证。",
        env_path.to_string_lossy()
    )))
}

pub(crate) fn read_api_server_key(paths: &RuntimePaths) -> Option<String> {
    let content = fs::read_to_string(paths.env_path()).ok()?;
    read_env_value(&content, API_SERVER_KEY_ENV).filter(|key| !key.trim().is_empty())
}

fn generate_api_server_key() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(hex_encode(&bytes))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);

    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }

    output
}

fn read_env_value(content: &str, name: &str) -> Option<String> {
    content.lines().find_map(|line| {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return None;
        }

        let (key, value) = trimmed.split_once('=')?;
        if key.trim() != name {
            return None;
        }

        Some(unquote_env_value(value.trim()).to_string())
    })
}

fn unquote_env_value(value: &str) -> &str {
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        let first = bytes[0];
        let last = bytes[value.len() - 1];
        if (first == b'\'' && last == b'\'') || (first == b'"' && last == b'"') {
            return &value[1..value.len() - 1];
        }
    }

    value
}

fn set_env_value(content: &str, name: &str, value: &str, comment: &str) -> String {
    let mut found = false;
    let mut lines = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim_start();
        let key = trimmed
            .split_once('=')
            .map(|(key, _)| key.trim())
            .unwrap_or_default();

        if !trimmed.starts_with('#') && key == name {
            lines.push(format!("{name}={value}"));
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !found {
        if !lines.is_empty() && lines.last().is_some_and(|line| !line.trim().is_empty()) {
            lines.push(String::new());
        }
        lines.push(comment.to_string());
        lines.push(format!("{name}={value}"));
    }

    let mut output = lines.join("\n");
    output.push('\n');
    output
}

#[cfg(unix)]
pub(crate) fn restrict_secret_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    if !path.exists() {
        return Ok(());
    }

    let mut permissions = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
pub(crate) fn restrict_secret_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

pub(crate) fn enforce_local_api_server(config: &mut Value) {
    let root = ensure_mapping_value(config);
    let platforms = ensure_mapping_child(root, "platforms");
    let api_server = ensure_mapping_child(platforms, "api_server");

    api_server.insert(Value::String("enabled".to_string()), Value::Bool(true));

    let extra = ensure_mapping_child(api_server, "extra");
    extra.insert(
        Value::String("host".to_string()),
        Value::String(LOCAL_API_HOST.to_string()),
    );
    extra.insert(
        Value::String("port".to_string()),
        Value::Number(i64::from(LOCAL_API_PORT).into()),
    );
    extra.insert(
        Value::String("cors_origins".to_string()),
        Value::String(DESKTOP_API_CORS_ORIGIN.to_string()),
    );
}

pub(crate) fn set_api_server_model_name(root: &mut Mapping, model: &str) {
    let platforms = ensure_mapping_child(root, "platforms");
    let api_server = ensure_mapping_child(platforms, "api_server");
    let extra = ensure_mapping_child(api_server, "extra");
    extra.insert(
        Value::String("model_name".to_string()),
        Value::String(model.to_string()),
    );
}

fn add_desktop_notice(config: &mut Value, notice: String) {
    let root = ensure_mapping_value(config);
    let desktop = ensure_mapping_child(root, "desktop");
    desktop.insert(Value::String("notice".to_string()), Value::String(notice));
}

pub(crate) fn read_yaml_file(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_yaml::from_str(&content).map_err(|error| error.to_string())
}

pub(crate) fn write_yaml_file(path: &Path, config: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let body = serde_yaml::to_string(config).map_err(|error| error.to_string())?;
    let content = format!("# 由 Hermes 桌面版管理。运行时设置由应用控制。\n{}", body);
    fs::write(path, content).map_err(|error| error.to_string())
}

fn backup_invalid_config(config_path: &Path) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let backup_path = config_path.with_extension(format!("yaml.invalid.{timestamp}"));
    fs::rename(config_path, &backup_path).map_err(|error| error.to_string())?;
    Ok(backup_path.to_string_lossy().to_string())
}

pub(crate) fn ensure_mapping_value(value: &mut Value) -> &mut Mapping {
    if !matches!(value, Value::Mapping(_)) {
        *value = Value::Mapping(Mapping::new());
    }

    value.as_mapping_mut().expect("value is a mapping")
}

pub(crate) fn ensure_mapping_child<'a>(parent: &'a mut Mapping, key: &str) -> &'a mut Mapping {
    let entry = parent
        .entry(Value::String(key.to_string()))
        .or_insert_with(|| Value::Mapping(Mapping::new()));

    if !matches!(entry, Value::Mapping(_)) {
        *entry = Value::Mapping(Mapping::new());
    }

    entry.as_mapping_mut().expect("value is a mapping")
}
