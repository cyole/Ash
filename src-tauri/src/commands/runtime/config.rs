use serde_yaml::{Mapping, Value};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use super::constants::MIGRATABLE_CONFIG_KEYS;
use super::paths::{ensure_runtime_dirs, legacy_config_path, RuntimePaths};

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

pub(crate) fn ensure_runtime_config(paths: &RuntimePaths) -> Result<(), String> {
    ensure_runtime_dirs(paths)?;

    let config_path = paths.config_path();
    let config = if config_path.exists() {
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

    write_yaml_file(&config_path, &config)
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
