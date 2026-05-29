use serde_yaml::{Mapping, Value};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

use super::config::read_yaml_file;
use super::paths::runtime_paths;
use super::types::{HermesExtensionsCatalog, HermesPluginCatalogItem, HermesSkillCatalogItem};

pub(crate) fn runtime_extensions_catalog_impl(
    app: AppHandle,
) -> Result<HermesExtensionsCatalog, String> {
    let paths = runtime_paths(&app);
    let skills_root = paths.hermes_home.join("skills");
    let bundled_skills_root = paths.install_dir.join("skills");
    let optional_skills_root = paths.install_dir.join("optional-skills");
    let bundled_plugins_root = paths.install_dir.join("plugins");
    let user_plugins_root = paths.hermes_home.join("plugins");

    let mut skills = Vec::new();
    if skills_root.exists() {
        collect_skills_from_root(&skills_root, "installed", "enabled", &mut skills)?;
    } else {
        collect_skills_from_root(&bundled_skills_root, "bundled", "enabled", &mut skills)?;
    }
    collect_skills_from_root(&optional_skills_root, "optional", "available", &mut skills)?;
    skills.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then(a.name.cmp(&b.name))
            .then(a.source.cmp(&b.source))
    });

    let config =
        read_yaml_file(&paths.config_path()).unwrap_or_else(|_| Value::Mapping(Mapping::new()));
    let enabled_plugins = config_string_set(&config, &["plugins", "enabled"]);
    let disabled_plugins = config_string_set(&config, &["plugins", "disabled"]);
    let mut plugins = Vec::new();
    collect_plugins_from_root(
        &bundled_plugins_root,
        "bundled",
        &enabled_plugins,
        &disabled_plugins,
        &mut plugins,
    )?;
    collect_plugins_from_root(
        &user_plugins_root,
        "user",
        &enabled_plugins,
        &disabled_plugins,
        &mut plugins,
    )?;
    plugins.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then(a.key.cmp(&b.key))
            .then(a.source.cmp(&b.source))
    });

    Ok(HermesExtensionsCatalog {
        skills,
        plugins,
        skills_root: skills_root.to_string_lossy().to_string(),
        optional_skills_root: optional_skills_root.to_string_lossy().to_string(),
        plugins_root: bundled_plugins_root.to_string_lossy().to_string(),
    })
}

fn collect_skills_from_root(
    root: &Path,
    source: &str,
    status: &str,
    output: &mut Vec<HermesSkillCatalogItem>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    let mut files = Vec::new();
    collect_files_named(root, "SKILL.md", &mut files)?;

    for path in files {
        let frontmatter = read_markdown_frontmatter(&path).unwrap_or_default();
        let parent_name = path
            .parent()
            .and_then(|parent| parent.file_name())
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let relative = path.strip_prefix(root).unwrap_or(&path);
        let fallback_category = relative
            .components()
            .next()
            .map(|component| component.as_os_str().to_string_lossy().to_string())
            .filter(|value| value != "SKILL.md" && value != &parent_name)
            .unwrap_or_default();
        let category = yaml_nested_string(&frontmatter, &["metadata", "hermes", "category"])
            .or_else(|| yaml_string(&frontmatter, "category"))
            .unwrap_or(fallback_category);

        output.push(HermesSkillCatalogItem {
            name: yaml_string(&frontmatter, "name").unwrap_or(parent_name),
            description: yaml_string(&frontmatter, "description").unwrap_or_default(),
            category,
            source: source.to_string(),
            status: status.to_string(),
            version: yaml_string(&frontmatter, "version"),
            author: yaml_string(&frontmatter, "author"),
            path: path.to_string_lossy().to_string(),
        });
    }

    Ok(())
}

fn collect_plugins_from_root(
    root: &Path,
    source: &str,
    enabled_plugins: &BTreeSet<String>,
    disabled_plugins: &BTreeSet<String>,
    output: &mut Vec<HermesPluginCatalogItem>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    let mut files = Vec::new();
    collect_files_named(root, "plugin.yaml", &mut files)?;

    for path in files {
        let value = read_yaml_file(&path)?;
        let mapping = value.as_mapping().cloned().unwrap_or_default();
        let key = plugin_key(root, &path);
        let name = yaml_string(&mapping, "name").unwrap_or_else(|| key.clone());
        let status = plugin_status(&key, &name, enabled_plugins, disabled_plugins);

        output.push(HermesPluginCatalogItem {
            key,
            name,
            description: yaml_string(&mapping, "description").unwrap_or_default(),
            kind: yaml_string(&mapping, "kind").unwrap_or_else(|| "standalone".to_string()),
            version: yaml_string(&mapping, "version"),
            author: yaml_string(&mapping, "author"),
            source: source.to_string(),
            status,
            requires_env: yaml_string_list(&mapping, "requires_env"),
            path: path.to_string_lossy().to_string(),
        });
    }

    Ok(())
}

fn collect_files_named(
    root: &Path,
    file_name: &str,
    output: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_dir() {
            if name.starts_with('.') || name == "__pycache__" || name == "node_modules" {
                continue;
            }
            collect_files_named(&path, file_name, output)?;
        } else if file_type.is_file() && name == file_name {
            output.push(path);
        }
    }

    Ok(())
}

fn read_markdown_frontmatter(path: &Path) -> Result<Mapping, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut lines = content.lines();

    if lines.next().map(str::trim) != Some("---") {
        return Ok(Mapping::new());
    }

    let mut yaml = String::new();
    for line in lines {
        if line.trim() == "---" {
            let value = serde_yaml::from_str::<Value>(&yaml).map_err(|error| error.to_string())?;
            return Ok(value.as_mapping().cloned().unwrap_or_default());
        }
        yaml.push_str(line);
        yaml.push('\n');
    }

    Ok(Mapping::new())
}

fn yaml_string(mapping: &Mapping, key: &str) -> Option<String> {
    let key = Value::String(key.to_string());
    mapping.get(&key).and_then(value_as_string)
}

fn yaml_nested_string(mapping: &Mapping, path: &[&str]) -> Option<String> {
    let mut value = Value::Mapping(mapping.clone());
    for key in path {
        let lookup = Value::String((*key).to_string());
        let next = value
            .as_mapping()
            .and_then(|map| map.get(&lookup))
            .cloned()?;
        value = next;
    }

    value_as_string(&value)
}

fn yaml_string_list(mapping: &Mapping, key: &str) -> Vec<String> {
    let key = Value::String(key.to_string());
    let Some(value) = mapping.get(&key) else {
        return Vec::new();
    };

    match value {
        Value::Sequence(items) => items
            .iter()
            .filter_map(|item| {
                value_as_string(item).or_else(|| {
                    let lookup = Value::String("key".to_string());
                    item.as_mapping()
                        .and_then(|map| map.get(&lookup))
                        .and_then(value_as_string)
                })
            })
            .collect(),
        _ => value_as_string(value).into_iter().collect(),
    }
}

fn value_as_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.trim().to_string()).filter(|text| !text.is_empty()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn config_string_set(config: &Value, path: &[&str]) -> BTreeSet<String> {
    let mut current = config;
    for key in path {
        let lookup = Value::String((*key).to_string());
        let Some(next) = current.as_mapping().and_then(|map| map.get(&lookup)) else {
            return BTreeSet::new();
        };
        current = next;
    }

    match current {
        Value::Sequence(values) => values.iter().filter_map(value_as_string).collect(),
        _ => BTreeSet::new(),
    }
}

fn plugin_key(root: &Path, manifest_path: &Path) -> String {
    let plugin_dir = manifest_path.parent().unwrap_or(root);
    plugin_dir
        .strip_prefix(root)
        .unwrap_or(plugin_dir)
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn plugin_status(
    key: &str,
    name: &str,
    enabled_plugins: &BTreeSet<String>,
    disabled_plugins: &BTreeSet<String>,
) -> String {
    if disabled_plugins.contains(key) || disabled_plugins.contains(name) {
        return "disabled".to_string();
    }

    if enabled_plugins.contains(key) || enabled_plugins.contains(name) {
        return "enabled".to_string();
    }

    "available".to_string()
}
