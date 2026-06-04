use std::{
    env, fs,
    fs::File,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

use super::constants::{RUNTIME_BUNDLE_DIR, RUNTIME_MANIFEST_FILE};
use super::paths::RuntimePaths;
use super::process::{find_hermes_in_install_dir, find_managed_hermes};
use super::types::RuntimeCommandResult;

pub(crate) fn ensure_bundled_runtime(
    app: &AppHandle,
    paths: &RuntimePaths,
) -> Result<RuntimeCommandResult, String> {
    if let Some(hermes) = find_managed_hermes(paths) {
        let removed_metadata = remove_macos_metadata_files(&paths.install_dir)?;
        let metadata_message = if removed_metadata > 0 {
            format!("\n已清理 {} 个 macOS 元数据文件。", removed_metadata)
        } else {
            String::new()
        };

        return Ok(RuntimeCommandResult::message(format!(
            "本地引擎运行时已存在于 {}。{}",
            hermes.to_string_lossy(),
            metadata_message
        )));
    }

    let archive_path = bundled_runtime_archive_path(app)?;
    if !archive_path.is_file() {
        return Ok(RuntimeCommandResult {
            success: false,
            code: Some(1),
            stdout: String::new(),
            stderr: format!(
                "未在 {} 找到内置本地引擎归档。\n请运行 ./scripts/build-hermes-runtime.sh，在 src-tauri/resources/{}/{} 下生成归档。\n如果生成后应用没有识别到，请重启 pnpm tauri:dev。",
                archive_path.to_string_lossy(),
                RUNTIME_BUNDLE_DIR,
                runtime_archive_name()
            ),
        });
    }

    unpack_bundled_runtime(paths, &archive_path)
}

pub(crate) fn bundled_runtime_archive_path(app: &AppHandle) -> Result<PathBuf, String> {
    let archive_name = runtime_archive_name();
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let packaged_path = resource_dir.join(RUNTIME_BUNDLE_DIR).join(&archive_name);

    if packaged_path.is_file() {
        return Ok(packaged_path);
    }

    #[cfg(debug_assertions)]
    {
        let source_path = source_runtime_archive_path(&archive_name);
        if source_path.is_file() {
            return Ok(source_path);
        }
    }

    Ok(packaged_path)
}

#[cfg(debug_assertions)]
fn source_runtime_archive_path(archive_name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(RUNTIME_BUNDLE_DIR)
        .join(archive_name)
}

pub(crate) fn runtime_archive_name() -> String {
    format!(
        "hermes-runtime-{}-{}.tar.gz",
        target_platform(),
        target_arch()
    )
}

fn target_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn target_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        "unknown"
    }
}

fn unpack_bundled_runtime(
    paths: &RuntimePaths,
    archive_path: &Path,
) -> Result<RuntimeCommandResult, String> {
    let staging_dir = paths.root.join("hermes-agent.unpacking");
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&staging_dir).map_err(|error| error.to_string())?;

    let archive = File::open(archive_path).map_err(|error| error.to_string())?;
    let decoder = flate2::read::GzDecoder::new(archive);
    let mut tar_archive = tar::Archive::new(decoder);
    tar_archive
        .unpack(&staging_dir)
        .map_err(|error| error.to_string())?;
    remove_macos_metadata_files(&staging_dir)?;

    let extracted_runtime = select_extracted_runtime_dir(&staging_dir)?;
    if paths.install_dir.exists() {
        fs::remove_dir_all(&paths.install_dir).map_err(|error| error.to_string())?;
    }

    if extracted_runtime == staging_dir {
        fs::rename(&staging_dir, &paths.install_dir).map_err(|error| error.to_string())?;
    } else {
        fs::rename(&extracted_runtime, &paths.install_dir).map_err(|error| error.to_string())?;
        fs::remove_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    }

    let hermes = find_hermes_in_install_dir(&paths.install_dir)
        .ok_or("内置本地引擎归档中没有 Agent 启动器。")?;
    ensure_executable(&hermes)?;
    write_runtime_manifest(paths, archive_path)?;

    Ok(RuntimeCommandResult::message(format!(
        "已从 {} 解包内置本地引擎。",
        archive_path.to_string_lossy()
    )))
}

fn select_extracted_runtime_dir(staging_dir: &Path) -> Result<PathBuf, String> {
    let nested = staging_dir.join("hermes-agent");
    if find_hermes_in_install_dir(&nested).is_some() {
        return Ok(nested);
    }

    if find_hermes_in_install_dir(staging_dir).is_some() {
        return Ok(staging_dir.to_path_buf());
    }

    Err("内置本地引擎归档结构不受支持。".to_string())
}

fn remove_macos_metadata_files(root: &Path) -> Result<usize, String> {
    if !root.exists() {
        return Ok(0);
    }

    fn visit(path: &Path) -> Result<usize, String> {
        let mut removed = 0;
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let file_type = entry.file_type().map_err(|error| error.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();

            if name == "__MACOSX" && file_type.is_dir() {
                fs::remove_dir_all(&entry_path).map_err(|error| error.to_string())?;
                removed += 1;
                continue;
            }

            if name == ".DS_Store" || name.starts_with("._") {
                if file_type.is_dir() {
                    fs::remove_dir_all(&entry_path).map_err(|error| error.to_string())?;
                } else {
                    fs::remove_file(&entry_path).map_err(|error| error.to_string())?;
                }
                removed += 1;
                continue;
            }

            if file_type.is_dir() {
                removed += visit(&entry_path)?;
            }
        }

        Ok(removed)
    }

    visit(root)
}

fn write_runtime_manifest(paths: &RuntimePaths, archive_path: &Path) -> Result<(), String> {
    let manifest_path = paths.root.join(RUNTIME_MANIFEST_FILE);
    let manifest = serde_json::json!({
        "source": archive_path.to_string_lossy(),
        "platform": target_platform(),
        "arch": target_arch(),
        "installedAt": SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_secs(),
    });
    fs::write(
        manifest_path,
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

#[cfg(unix)]
fn ensure_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}
