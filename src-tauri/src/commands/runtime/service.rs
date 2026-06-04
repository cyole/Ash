use std::{
    path::PathBuf,
    process::{Child, Command},
    sync::{
        atomic::{AtomicBool, Ordering},
        LazyLock, Mutex,
    },
};

use reqwest::blocking::Client;
use reqwest::Method;
use serde_json::Value;
use tauri::AppHandle;

use super::bundle::{bundled_runtime_archive_path, ensure_bundled_runtime, runtime_archive_name};
use super::config::{ensure_runtime_config, migrate_legacy_config_if_needed};
use super::paths::{ensure_runtime_dirs, legacy_config_path, runtime_paths, RuntimePaths};
use super::process::{
    append_runtime_log, combine_results, default_dashboard_api_url, fetch_dashboard_status,
    find_managed_hermes, find_managed_python, is_dashboard_healthy, launch_dashboard, merge_output,
    read_version, run_managed_hermes, tail_runtime_log,
};
use super::types::{
    RuntimeCommandResult, RuntimeConnection, RuntimeDashboardApiInput, RuntimeStatus,
};

static RUNTIME_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static DASHBOARD_STATE: LazyLock<Mutex<Option<DashboardState>>> =
    LazyLock::new(|| Mutex::new(None));

struct DashboardState {
    api_url: String,
    child: Child,
    token: String,
    ws_url: String,
}

pub(crate) fn start_runtime_on_startup(app: AppHandle) {
    RUNTIME_SHUTTING_DOWN.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || match runtime_prepare_for_startup(app) {
        Ok(result) if result.success => {
            eprintln!("Hermes dashboard 已自动启动。");
        }
        Ok(result) => {
            eprintln!(
                "Hermes dashboard 自动启动需要处理：{}",
                merge_output(&result)
            );
        }
        Err(error) => {
            eprintln!("Hermes dashboard 自动启动失败：{error}");
        }
    });
}

pub(crate) fn stop_runtime_for_shutdown(_app: AppHandle) {
    RUNTIME_SHUTTING_DOWN.store(true, Ordering::SeqCst);
    match stop_dashboard_process() {
        Ok(result) if result.success => {
            eprintln!("Hermes dashboard 已在退出前停止。");
        }
        Ok(result) => {
            eprintln!(
                "Hermes dashboard 退出前停止需要处理：{}",
                merge_output(&result)
            );
        }
        Err(error) => {
            eprintln!("Hermes dashboard 退出前停止失败：{error}");
        }
    }
}

pub(crate) fn runtime_dashboard_status_impl(
    _app: AppHandle,
) -> Result<RuntimeCommandResult, String> {
    let snapshot = dashboard_snapshot()?;
    let Some(snapshot) = snapshot else {
        return Ok(RuntimeCommandResult::message(
            "Hermes dashboard 尚未由本应用启动。",
        ));
    };

    match fetch_dashboard_status(&snapshot.api_url, &snapshot.token) {
        Ok(status) => Ok(RuntimeCommandResult::message(
            serde_json::to_string_pretty(&status).map_err(|error| error.to_string())?,
        )),
        Err(error) => Ok(RuntimeCommandResult {
            success: false,
            code: Some(1),
            stdout: String::new(),
            stderr: error,
        }),
    }
}

pub(crate) fn runtime_doctor_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    run_managed_hermes(&paths, &["doctor"])
}

pub(crate) fn runtime_setup_portal_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    run_managed_hermes(&paths, &["setup", "--portal"])
}

pub(crate) fn runtime_status_impl(app: AppHandle) -> RuntimeStatus {
    let paths = runtime_paths(&app);
    let managed_path = find_managed_hermes(&paths);
    let python_path = find_managed_python(&paths);
    let version = managed_path
        .as_ref()
        .and_then(|path| read_version(path, &paths));
    let bundled_runtime_archive = bundled_runtime_archive_path(&app)
        .unwrap_or_else(|_| PathBuf::from(runtime_archive_name()));
    let bundled_runtime_found = bundled_runtime_archive.is_file();
    let legacy_config_path = legacy_config_path(&paths);
    let legacy_config_found = legacy_config_path
        .as_ref()
        .is_some_and(|path| path.is_file());
    let log_path = paths.desktop_log_path();
    let recent_log_lines = tail_runtime_log(&log_path, 12).unwrap_or_default();

    let dashboard = dashboard_snapshot().ok().flatten();
    let mut dashboard_status = None;
    let mut background_gateway_running = false;
    let mut dashboard_running = false;

    if let Some(snapshot) = dashboard.as_ref() {
        if let Ok(status) = fetch_dashboard_status(&snapshot.api_url, &snapshot.token) {
            dashboard_running = true;
            background_gateway_running = status
                .get("gateway_running")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            dashboard_status = serde_json::to_string_pretty(&status).ok();
        }
    }

    RuntimeStatus {
        installed: managed_path.is_some() || python_path.is_some(),
        running: dashboard_running,
        dashboard_running,
        background_gateway_running,
        session_token_configured: dashboard
            .as_ref()
            .is_some_and(|snapshot| !snapshot.token.is_empty()),
        path: managed_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        python_path: python_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        version,
        mode: "local-managed-dashboard".to_string(),
        api_url: dashboard
            .as_ref()
            .map(|snapshot| snapshot.api_url.clone())
            .unwrap_or_else(default_dashboard_api_url),
        ws_url: dashboard.as_ref().map(|snapshot| snapshot.ws_url.clone()),
        install_source: if managed_path.is_some() || python_path.is_some() {
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
        log_path: log_path.to_string_lossy().to_string(),
        recent_log_lines,
        dashboard_status,
        backend_pid: dashboard.as_ref().map(|snapshot| snapshot.pid),
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
    let log_path = paths.desktop_log_path();
    append_runtime_log(&log_path, "desktop", "Preparing app-managed Hermes runtime");

    let migration = migrate_legacy_config_if_needed(&paths)?;
    let mut result =
        RuntimeCommandResult::message(format!("内置 Hermes 主目录已就绪。\n{}", migration.trim()));

    let runtime_result = ensure_bundled_runtime(&app, &paths)?;
    result = combine_results(result, runtime_result);
    if !result.success {
        append_runtime_log(&log_path, "desktop", merge_output(&result));
        return Ok(result);
    }

    ensure_runtime_config(&paths)?;

    if skip_start_if_shutting_down && RUNTIME_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Ok(combine_results(
            result,
            RuntimeCommandResult::message("应用正在退出，已跳过 Hermes dashboard 启动。"),
        ));
    }

    let start_result = start_dashboard_process(&paths)?;
    let result = combine_results(result, start_result);
    append_runtime_log(&log_path, "desktop", merge_output(&result));
    Ok(result)
}

pub(crate) fn runtime_dashboard_start_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_dirs(&paths)?;
    ensure_runtime_config(&paths)?;
    start_dashboard_process(&paths)
}

pub(crate) fn runtime_dashboard_stop_impl(_app: AppHandle) -> Result<RuntimeCommandResult, String> {
    stop_dashboard_process()
}

pub(crate) fn runtime_dashboard_restart_impl(
    app: AppHandle,
) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    let stop_result = stop_dashboard_process()?;
    let start_result = start_dashboard_process(&paths)?;
    Ok(combine_results(stop_result, start_result))
}

pub(crate) fn runtime_reveal_logs_impl(app: AppHandle) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_dirs(&paths)?;
    let log_path = paths.desktop_log_path();
    append_runtime_log(&log_path, "desktop", "Log directory opened from settings");

    let log_dir = log_path.parent().ok_or("无法确定 Hermes 日志目录。")?;
    let mut command = log_directory_open_command(log_dir);
    let status = command.status().map_err(|error| error.to_string())?;

    Ok(RuntimeCommandResult {
        success: status.success(),
        code: status.code(),
        stdout: if status.success() {
            format!("已打开日志目录：{}", log_dir.to_string_lossy())
        } else {
            String::new()
        },
        stderr: if status.success() {
            String::new()
        } else {
            format!("打开日志目录失败：{}", log_dir.to_string_lossy())
        },
    })
}

pub(crate) fn runtime_connection_impl(app: AppHandle) -> Result<RuntimeConnection, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_dirs(&paths)?;

    if find_managed_python(&paths).is_none() && find_managed_hermes(&paths).is_none() {
        let runtime_result = ensure_bundled_runtime(&app, &paths)?;
        if !runtime_result.success {
            return Err(merge_output(&runtime_result));
        }
    }

    ensure_runtime_config(&paths)?;
    start_dashboard_process(&paths)?;
    let snapshot = dashboard_snapshot()?.ok_or("Hermes dashboard 尚未启动。")?;

    Ok(RuntimeConnection {
        api_url: snapshot.api_url,
        ws_url: Some(snapshot.ws_url),
        session_token: Some(snapshot.token),
    })
}

pub(crate) fn runtime_dashboard_api_impl(
    app: AppHandle,
    input: RuntimeDashboardApiInput,
) -> Result<Value, String> {
    let paths = runtime_paths(&app);
    ensure_runtime_dirs(&paths)?;
    ensure_runtime_config(&paths)?;
    start_dashboard_process(&paths)?;

    let snapshot = dashboard_snapshot()?.ok_or("Hermes dashboard 尚未启动。")?;
    let path = validate_dashboard_api_path(&input.path)?;
    let method = parse_dashboard_api_method(input.method.as_deref().unwrap_or("GET"))?;
    let url = format!("{}{}", snapshot.api_url, path);

    let client = Client::builder()
        .timeout(super::constants::HERMES_COMMAND_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let mut request = client
        .request(method, url)
        .header(super::constants::SESSION_TOKEN_HEADER, snapshot.token)
        .header("Accept", "application/json");

    if let Some(body) = input.body {
        request = request.json(&body);
    }

    let response = request.send().map_err(|error| error.to_string())?;
    let status = response.status();
    let text = response.text().map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(if text.trim().is_empty() {
            format!("Hermes dashboard 返回 HTTP {status}。")
        } else {
            format!("Hermes dashboard 返回 HTTP {status}: {}", text.trim())
        });
    }

    if text.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str(&text)
        .map_err(|error| format!("Hermes dashboard 返回了非 JSON 响应（HTTP {status}）：{error}"))
}

fn start_dashboard_process(paths: &RuntimePaths) -> Result<RuntimeCommandResult, String> {
    let mut guard = DASHBOARD_STATE.lock().map_err(|error| error.to_string())?;
    let log_path = paths.desktop_log_path();

    if let Some(state) = guard.as_mut() {
        let still_running = state
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none();
        if still_running && is_dashboard_healthy(&state.api_url, &state.token) {
            append_runtime_log(
                &log_path,
                "desktop",
                format!("Reusing healthy Hermes dashboard at {}", state.api_url),
            );
            return Ok(RuntimeCommandResult::message(format!(
                "Hermes dashboard 已在 {} 运行。",
                state.api_url
            )));
        }

        append_runtime_log(
            &log_path,
            "desktop",
            "Stopping stale Hermes dashboard process",
        );
        let _ = state.child.kill();
        let _ = state.child.wait();
        *guard = None;
    }

    let launch = launch_dashboard(paths)?;
    let pid = launch.child.id();
    let api_url = launch.api_url.clone();
    let backend_path = launch.backend_path.clone();
    *guard = Some(DashboardState {
        api_url: launch.api_url,
        child: launch.child,
        token: launch.token,
        ws_url: launch.ws_url,
    });

    Ok(RuntimeCommandResult::message(format!(
        "Hermes dashboard 已启动。\nPID: {pid}\nURL: {api_url}\n后端: {}",
        backend_path.to_string_lossy()
    )))
}

fn validate_dashboard_api_path(path: &str) -> Result<&str, String> {
    if !path.starts_with("/api/") {
        return Err("Hermes dashboard API 路径必须以 /api/ 开头。".to_string());
    }

    if path.starts_with("//") || path.contains('\r') || path.contains('\n') {
        return Err("Hermes dashboard API 路径无效。".to_string());
    }

    Ok(path)
}

fn parse_dashboard_api_method(method: &str) -> Result<Method, String> {
    match method.trim().to_ascii_uppercase().as_str() {
        "DELETE" => Ok(Method::DELETE),
        "GET" => Ok(Method::GET),
        "PATCH" => Ok(Method::PATCH),
        "POST" => Ok(Method::POST),
        other => Err(format!("不支持的 Hermes dashboard API 方法：{other}。")),
    }
}

fn stop_dashboard_process() -> Result<RuntimeCommandResult, String> {
    let mut guard = DASHBOARD_STATE.lock().map_err(|error| error.to_string())?;
    let Some(mut state) = guard.take() else {
        return Ok(RuntimeCommandResult::message(
            "Hermes dashboard 未由本应用启动。",
        ));
    };

    let pid = state.child.id();
    let _ = state.child.kill();
    let status = state.child.wait().map_err(|error| error.to_string())?;

    Ok(RuntimeCommandResult {
        success: true,
        code: status.code(),
        stdout: format!("已停止 Hermes dashboard（PID {pid}）。"),
        stderr: String::new(),
    })
}

#[cfg(target_os = "macos")]
fn log_directory_open_command(path: &std::path::Path) -> Command {
    let mut command = Command::new("open");
    command.arg(path);
    command
}

#[cfg(target_os = "windows")]
fn log_directory_open_command(path: &std::path::Path) -> Command {
    let mut command = Command::new("explorer.exe");
    command.arg(path);
    command
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn log_directory_open_command(path: &std::path::Path) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(path);
    command
}

#[derive(Clone)]
struct DashboardSnapshot {
    api_url: String,
    pid: u32,
    token: String,
    ws_url: String,
}

fn dashboard_snapshot() -> Result<Option<DashboardSnapshot>, String> {
    let mut guard = DASHBOARD_STATE.lock().map_err(|error| error.to_string())?;
    let Some(state) = guard.as_mut() else {
        return Ok(None);
    };

    if state
        .child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        *guard = None;
        return Ok(None);
    }

    Ok(Some(DashboardSnapshot {
        api_url: state.api_url.clone(),
        pid: state.child.id(),
        token: state.token.clone(),
        ws_url: state.ws_url.clone(),
    }))
}
