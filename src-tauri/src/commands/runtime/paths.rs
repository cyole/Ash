use std::{env, fs, path::Path, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug)]
pub(crate) struct RuntimePaths {
    pub(crate) root: PathBuf,
    pub(crate) hermes_home: PathBuf,
    pub(crate) install_dir: PathBuf,
}

impl RuntimePaths {
    pub(crate) fn config_path(&self) -> PathBuf {
        self.hermes_home.join("config.yaml")
    }

    pub(crate) fn web_dist_path(&self) -> PathBuf {
        self.root.join("web-dist")
    }

    pub(crate) fn desktop_log_path(&self) -> PathBuf {
        self.hermes_home.join("logs").join("desktop.log")
    }
}

pub(crate) fn runtime_paths(app: &AppHandle) -> RuntimePaths {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| fallback_app_data_dir());
    let root = app_data_dir.join("runtime");
    let hermes_home = app_data_dir.join("hermes-home");
    let install_dir = root.join("hermes-agent");

    RuntimePaths {
        root,
        hermes_home,
        install_dir,
    }
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

pub(crate) fn legacy_config_path(paths: &RuntimePaths) -> Option<PathBuf> {
    let legacy_home = resolve_legacy_hermes_home()?;
    if paths_equal(&legacy_home, &paths.hermes_home) {
        return None;
    }

    Some(legacy_home.join("config.yaml"))
}

fn resolve_legacy_hermes_home() -> Option<PathBuf> {
    if let Some(home) = env::var_os("HERMES_HOME") {
        let path = PathBuf::from(home);
        if !path.as_os_str().is_empty() {
            return Some(path);
        }
    }

    #[cfg(windows)]
    {
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            return Some(PathBuf::from(local_app_data).join("hermes"));
        }
    }

    home_dir().map(|home| home.join(".hermes"))
}

pub(crate) fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}

pub(crate) fn ensure_runtime_dirs(paths: &RuntimePaths) -> Result<(), String> {
    fs::create_dir_all(&paths.root).map_err(|error| error.to_string())?;
    fs::create_dir_all(&paths.hermes_home).map_err(|error| error.to_string())
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    let normalized_left = left.canonicalize().unwrap_or_else(|_| left.to_path_buf());
    let normalized_right = right.canonicalize().unwrap_or_else(|_| right.to_path_buf());
    normalized_left == normalized_right
}
