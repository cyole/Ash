use std::{
    env,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::AppHandle;

use super::config::read_api_server_key;
use super::constants::{
    API_SERVER_KEY_ENV, HEALTH_CHECK_TIMEOUT, HERMES_COMMAND_TIMEOUT, LOCAL_API_HOST,
    LOCAL_API_PORT,
};
use super::paths::{home_dir, runtime_paths, RuntimePaths};
use super::types::RuntimeCommandResult;

pub(crate) fn read_version(path: &Path, paths: &RuntimePaths) -> Option<String> {
    let output = run_hermes(path, paths, &["--version"]).ok()?;
    if !output.success {
        return None;
    }

    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn is_local_api_healthy() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], LOCAL_API_PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, HEALTH_CHECK_TIMEOUT) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(HEALTH_CHECK_TIMEOUT));
    let _ = stream.set_write_timeout(Some(HEALTH_CHECK_TIMEOUT));

    let request = format!(
        "GET /health HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
        LOCAL_API_HOST, LOCAL_API_PORT
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = [0; 256];
    let Ok(bytes_read) = stream.read(&mut response) else {
        return false;
    };

    if bytes_read == 0 {
        return false;
    }

    let response_head = String::from_utf8_lossy(&response[..bytes_read]);
    http_response_is_success(&response_head)
}

fn http_response_is_success(response_head: &str) -> bool {
    let Some(status_line) = response_head.lines().next() else {
        return false;
    };

    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|status| status.parse::<u16>().ok())
        .is_some_and(|status| (200..300).contains(&status))
}

pub(crate) fn local_api_url() -> String {
    format!("http://{}:{}", LOCAL_API_HOST, LOCAL_API_PORT)
}

fn enhanced_path(paths: &RuntimePaths) -> String {
    let mut entries = Vec::new();

    #[cfg(windows)]
    {
        entries.push(paths.install_dir.join("venv").join("Scripts"));
    }

    #[cfg(not(windows))]
    {
        if let Some(home) = home_dir() {
            entries.push(home.join(".local").join("bin"));
            entries.push(home.join(".cargo").join("bin"));
        }
        entries.push(paths.install_dir.join("venv").join("bin"));
        entries.push(PathBuf::from("/opt/homebrew/bin"));
        entries.push(PathBuf::from("/usr/local/bin"));
    }

    let mut path_value = env::join_paths(entries.iter())
        .ok()
        .and_then(|value| value.into_string().ok())
        .unwrap_or_default();

    if let Some(existing) = env::var_os("PATH").and_then(|value| value.into_string().ok()) {
        if !path_value.is_empty() {
            path_value.push(if cfg!(windows) { ';' } else { ':' });
        }
        path_value.push_str(&existing);
    }

    path_value
}

pub(crate) fn find_managed_hermes(paths: &RuntimePaths) -> Option<PathBuf> {
    find_hermes_in_install_dir(&paths.install_dir)
}

pub(crate) fn find_hermes_in_install_dir(install_dir: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        executable_names("hermes")
            .into_iter()
            .map(|name| install_dir.join("venv").join("Scripts").join(name))
            .find(|path| path.is_file())
    }

    #[cfg(not(windows))]
    {
        let script = install_dir.join("hermes");
        if script.is_file() {
            return Some(script);
        }

        executable_names("hermes")
            .into_iter()
            .map(|name| install_dir.join("venv").join("bin").join(name))
            .find(|path| path.is_file())
    }
}

pub(crate) fn run_managed_hermes(
    app: &AppHandle,
    args: &[&str],
) -> Result<RuntimeCommandResult, String> {
    let paths = runtime_paths(app);
    let hermes = find_managed_hermes(&paths).ok_or("本地引擎尚未准备好。")?;

    run_hermes(&hermes, &paths, args)
}

pub(crate) fn start_or_restart_gateway(
    app: &AppHandle,
    paths: &RuntimePaths,
) -> Result<RuntimeCommandResult, String> {
    if is_local_api_healthy() {
        return Ok(RuntimeCommandResult::message("本地引擎 API 已在运行。"));
    }

    if !is_gateway_running(paths) {
        return run_managed_hermes(app, &["gateway", "start"]);
    }

    run_managed_hermes(app, &["gateway", "restart"])
}

fn is_gateway_running(paths: &RuntimePaths) -> bool {
    let Some(hermes) = find_managed_hermes(paths) else {
        return false;
    };

    run_hermes(&hermes, paths, &["gateway", "status"])
        .ok()
        .map(|result| gateway_status_indicates_running(&merge_output(&result)))
        .unwrap_or(false)
}

pub(crate) fn gateway_status_indicates_running(output: &str) -> bool {
    output
        .lines()
        .any(|line| line.contains("\"PID\"") || line.trim_start().starts_with("PID="))
}

pub(crate) fn run_hermes(
    hermes: &Path,
    paths: &RuntimePaths,
    args: &[&str],
) -> Result<RuntimeCommandResult, String> {
    let mut command = Command::new(hermes);
    command
        .args(args)
        .current_dir(&paths.install_dir)
        .env("HERMES_HOME", &paths.hermes_home)
        .env("HERMES_DESKTOP_RUNTIME", &paths.root)
        .env("API_SERVER_ENABLED", "true")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PATH", enhanced_path(paths));
    if let Some(api_key) = read_api_server_key(paths) {
        command.env(API_SERVER_KEY_ENV, api_key);
    }
    command.env_remove("PYTHONHOME");

    run_command(&mut command)
}

fn run_command(command: &mut Command) -> Result<RuntimeCommandResult, String> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let started = Instant::now();

    loop {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            let output = child
                .wait_with_output()
                .map_err(|error| error.to_string())?;

            return Ok(RuntimeCommandResult {
                success: output.status.success(),
                code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }

        if started.elapsed() >= HERMES_COMMAND_TIMEOUT {
            let _ = child.kill();
            let output = child
                .wait_with_output()
                .map_err(|error| error.to_string())?;
            let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !stderr.trim().is_empty() {
                stderr.push('\n');
            }
            stderr.push_str(&format!(
                "Hermes 命令在 {} 秒后超时。",
                HERMES_COMMAND_TIMEOUT.as_secs()
            ));

            return Ok(RuntimeCommandResult {
                success: false,
                code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr,
            });
        }

        thread::sleep(Duration::from_millis(100));
    }
}

pub(crate) fn combine_results(
    left: RuntimeCommandResult,
    right: RuntimeCommandResult,
) -> RuntimeCommandResult {
    RuntimeCommandResult {
        success: left.success && right.success,
        code: if right.code.is_some() {
            right.code
        } else {
            left.code
        },
        stdout: join_non_empty(&[left.stdout, right.stdout]),
        stderr: join_non_empty(&[left.stderr, right.stderr]),
    }
}

fn join_non_empty(parts: &[String]) -> String {
    parts
        .iter()
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn merge_output(result: &RuntimeCommandResult) -> String {
    join_non_empty(&[result.stdout.clone(), result.stderr.clone()])
}

fn executable_names(name: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        let pathext = env::var_os("PATHEXT")
            .map(|value| {
                env::split_paths(&value)
                    .map(|path| path.to_string_lossy().to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|| vec![".exe".to_string(), ".cmd".to_string(), ".bat".to_string()]);

        let mut names = vec![name.to_string()];
        names.extend(pathext.into_iter().map(|ext| format!("{name}{ext}")));
        names
    }

    #[cfg(not(windows))]
    {
        vec![name.to_string()]
    }
}
