use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::AppHandle;

use super::bundle::{bundled_runtime_archive_path, ensure_bundled_runtime, runtime_archive_name};
use super::config::{
    ensure_api_server_config, ensure_api_server_key, migrate_legacy_config_if_needed,
    read_api_server_key,
};
use super::paths::{ensure_runtime_dirs, legacy_config_path, runtime_paths};
use super::process::{
    combine_results, find_managed_hermes, gateway_status_indicates_running, is_local_api_healthy,
    local_api_url, merge_output, read_version, run_hermes, run_managed_hermes,
    start_or_restart_gateway,
};
use super::types::{RuntimeApiAuth, RuntimeCommandResult, RuntimeStatus};

static RUNTIME_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

pub(crate) fn start_runtime_on_startup(app: AppHandle) {
    RUNTIME_SHUTTING_DOWN.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || match runtime_prepare_for_startup(app) {
        Ok(result) if result.success => {
            eprintln!("Hermes 运行时已自动启动。");
        }
        Ok(result) => {
            eprintln!("Hermes 运行时自动启动需要处理：{}", merge_output(&result));
        }
        Err(error) => {
            eprintln!("Hermes 运行时自动启动失败：{error}");
        }
    });
}

pub(crate) fn stop_runtime_for_shutdown(app: AppHandle) {
    RUNTIME_SHUTTING_DOWN.store(true, Ordering::SeqCst);
    match runtime_gateway_stop_impl(app) {
        Ok(result) if result.success => {
            eprintln!("Hermes 运行时已在退出前停止。");
        }
        Ok(result) => {
            eprintln!("Hermes 运行时退出前停止需要处理：{}", merge_output(&result));
        }
        Err(error) => {
            eprintln!("Hermes 运行时退出前停止失败：{error}");
        }
    }
}

pub(crate) fn runtime_gateway_status_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    run_managed_hermes(&app, &["gateway", "status"])
}

pub(crate) fn runtime_doctor_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    run_managed_hermes(&app, &["doctor"])
}

pub(crate) fn runtime_setup_portal_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    run_managed_hermes(&app, &["setup", "--portal"])
}

pub(crate) fn runtime_status_impl(app: AppHandle) -> RuntimeStatus {
    let paths = runtime_paths(&app);
    let managed_path = find_managed_hermes(&paths);
    let version = managed_path
        .as_ref()
        .and_then(|path| read_version(path, &paths));
    let api_url = local_api_url();
    let bundled_runtime_archive = bundled_runtime_archive_path(&app)
        .unwrap_or_else(|_| PathBuf::from(runtime_archive_name()));
    let bundled_runtime_found = bundled_runtime_archive.is_file();
    let gateway_status_result = managed_path
        .as_ref()
        .and_then(|path| run_hermes(path, &paths, &["gateway", "status"]).ok())
        .map(|result| {
            let output = merge_output(&result);
            (gateway_status_indicates_running(&output), output)
        });
    let gateway_running = gateway_status_result
        .as_ref()
        .is_some_and(|(running, _)| *running);
    let gateway_status = gateway_status_result.map(|(_, output)| output);
    let legacy_config_path = legacy_config_path(&paths);
    let legacy_config_found = legacy_config_path
        .as_ref()
        .is_some_and(|path| path.is_file());

    RuntimeStatus {
        installed: managed_path.is_some(),
        running: is_local_api_healthy(),
        gateway_running,
        api_key_configured: read_api_server_key(&paths).is_some(),
        path: managed_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        version,
        mode: "local-app".to_string(),
        api_url,
        install_source: if managed_path.is_some() {
            "bundled".to_string()
        } else if bundled_runtime_found {
            "bundled-available".to_string()
        } else {
            "missing-bundle".to_string()
        },
        bundled_runtime_archive: bundled_runtime_archive.to_string_lossy().to_string(),
        bundled_runtime_found,
        managed_root: paths.root.to_string_lossy().to_string(),
        hermes_home: paths.hermes_home.to_string_lossy().to_string(),
        config_path: paths.config_path().to_string_lossy().to_string(),
        legacy_config_path: legacy_config_path.map(|path| path.to_string_lossy().to_string()),
        legacy_config_found,
        gateway_status,
    }
}

pub(crate) fn runtime_prepare_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    runtime_prepare_with_options(app, false)
}

pub(crate) fn runtime_prepare_for_startup(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    runtime_prepare_with_options(app, true)
}

fn runtime_prepare_with_options(
    app: AppHandle,
    skip_start_if_shutting_down: bool,
) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_dirs(&paths)?;

    let migration = migrate_legacy_config_if_needed(&paths)?;
    let mut result =
        RuntimeCommandResult::message(format!("本地引擎主目录已就绪。\n{}", migration.trim()));

    let runtime_result = ensure_bundled_runtime(&app, &paths)?;
    result = combine_results(result, runtime_result);
    if !result.success {
        return Ok(result);
    }

    ensure_api_server_config(&paths)?;
    let api_key_result = ensure_api_server_key(&paths)?;
    result = combine_results(result, api_key_result);

    if skip_start_if_shutting_down && RUNTIME_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Ok(combine_results(
            result,
            RuntimeCommandResult::message("应用正在退出，已跳过本地引擎启动。"),
        ));
    }

    let start_result = start_or_restart_gateway(&app, &paths)?;
    Ok(combine_results(result, start_result))
}

pub(crate) fn runtime_gateway_start_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    ensure_api_server_config(&paths)?;
    ensure_api_server_key(&paths)?;
    start_or_restart_gateway(&app, &paths)
}

pub(crate) fn runtime_gateway_stop_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    run_managed_hermes(&app, &["gateway", "stop"])
}

pub(crate) fn runtime_gateway_restart_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    ensure_api_server_config(&paths)?;
    ensure_api_server_key(&paths)?;
    run_managed_hermes(&app, &["gateway", "restart"])
}

pub(crate) fn runtime_api_auth_impl(app: AppHandle) -> Result<RuntimeApiAuth, String> {
    let paths = runtime_paths(&app);
    ensure_api_server_config(&paths)?;
    ensure_api_server_key(&paths)?;

    Ok(RuntimeApiAuth {
        api_url: local_api_url(),
        api_key: read_api_server_key(&paths),
    })
}
