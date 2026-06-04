use serde_json::Value;
use std::{
    env,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::Instant,
};

use super::constants::{
    DASHBOARD_PORT_END, DASHBOARD_PORT_START, DASHBOARD_START_TIMEOUT, HEALTH_CHECK_TIMEOUT,
    HERMES_COMMAND_TIMEOUT, LOCAL_API_HOST, SESSION_TOKEN_HEADER,
};
use super::paths::{home_dir, RuntimePaths};
use super::types::RuntimeCommandResult;

pub(crate) struct DashboardLaunch {
    pub(crate) api_url: String,
    pub(crate) backend_path: PathBuf,
    pub(crate) child: Child,
    pub(crate) token: String,
    pub(crate) ws_url: String,
}

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

pub(crate) fn local_dashboard_api_url(port: u16) -> String {
    format!("http://{}:{}", LOCAL_API_HOST, port)
}

pub(crate) fn local_dashboard_ws_url(port: u16, token: &str) -> String {
    format!("ws://{}:{}/api/ws?token={}", LOCAL_API_HOST, port, token)
}

pub(crate) fn default_dashboard_api_url() -> String {
    local_dashboard_api_url(DASHBOARD_PORT_START)
}

pub(crate) fn generate_session_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(hex_encode(&bytes))
}

pub(crate) fn pick_dashboard_port() -> Result<u16, String> {
    for port in DASHBOARD_PORT_START..=DASHBOARD_PORT_END {
        if TcpListener::bind((LOCAL_API_HOST, port)).is_ok() {
            return Ok(port);
        }
    }

    Err(format!(
        "没有可用的 Hermes dashboard 端口（{}-{}）。",
        DASHBOARD_PORT_START, DASHBOARD_PORT_END
    ))
}

pub(crate) fn is_dashboard_healthy(api_url: &str, token: &str) -> bool {
    fetch_dashboard_status(api_url, token).is_ok()
}

pub(crate) fn fetch_dashboard_status(api_url: &str, token: &str) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(HEALTH_CHECK_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(format!("{api_url}/api/status"))
        .header(SESSION_TOKEN_HEADER, token)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();

    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(if body.trim().is_empty() {
            format!("Hermes dashboard 返回 HTTP {status}。")
        } else {
            format!("Hermes dashboard 返回 HTTP {status}: {}", body.trim())
        });
    }

    response.json::<Value>().map_err(|error| error.to_string())
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

pub(crate) fn find_managed_python(paths: &RuntimePaths) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        executable_names("python")
            .into_iter()
            .chain(executable_names("python3"))
            .map(|name| paths.install_dir.join("venv").join("Scripts").join(name))
            .find(|path| path.is_file())
    }

    #[cfg(not(windows))]
    {
        ["python", "python3"]
            .into_iter()
            .map(|name| paths.install_dir.join("venv").join("bin").join(name))
            .find(|path| path.is_file())
    }
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
    paths: &RuntimePaths,
    args: &[&str],
) -> Result<RuntimeCommandResult, String> {
    let hermes = find_managed_hermes(paths).ok_or("内置 Hermes 运行时尚未准备好。")?;

    run_hermes(&hermes, paths, args)
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
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PATH", enhanced_path(paths));
    command.env_remove("PYTHONHOME");

    run_command(&mut command)
}

pub(crate) fn launch_dashboard(paths: &RuntimePaths) -> Result<DashboardLaunch, String> {
    let token = generate_session_token()?;
    let port = pick_dashboard_port()?;
    let api_url = local_dashboard_api_url(port);
    let ws_url = local_dashboard_ws_url(port, &token);

    let (backend_path, mut command) = dashboard_command(paths, port, &token)?;
    let child = command.spawn().map_err(|error| {
        format!(
            "Hermes dashboard 启动失败（{}）：{}",
            backend_path.to_string_lossy(),
            error
        )
    })?;

    let mut launch = DashboardLaunch {
        api_url,
        backend_path,
        child,
        token,
        ws_url,
    };
    wait_for_dashboard(&mut launch)?;
    Ok(launch)
}

fn dashboard_command(
    paths: &RuntimePaths,
    port: u16,
    token: &str,
) -> Result<(PathBuf, Command), String> {
    let (backend_path, args) = if let Some(python) = find_managed_python(paths) {
        (
            python,
            vec![
                "-m".to_string(),
                "hermes_cli.main".to_string(),
                "dashboard".to_string(),
                "--no-open".to_string(),
                "--tui".to_string(),
                "--host".to_string(),
                LOCAL_API_HOST.to_string(),
                "--port".to_string(),
                port.to_string(),
            ],
        )
    } else if let Some(hermes) = find_managed_hermes(paths) {
        (
            hermes,
            vec![
                "dashboard".to_string(),
                "--no-open".to_string(),
                "--tui".to_string(),
                "--host".to_string(),
                LOCAL_API_HOST.to_string(),
                "--port".to_string(),
                port.to_string(),
            ],
        )
    } else {
        return Err("内置 Hermes 运行时尚未准备好。".to_string());
    };

    let mut command = Command::new(&backend_path);
    command
        .args(args)
        .current_dir(&paths.install_dir)
        .env("HERMES_HOME", &paths.hermes_home)
        .env("HERMES_DESKTOP_RUNTIME", &paths.root)
        .env("HERMES_DASHBOARD_SESSION_TOKEN", token)
        .env("HERMES_DASHBOARD_TUI", "1")
        .env("HERMES_WEB_DIST", paths.web_dist_path())
        .env("PYTHONPATH", &paths.install_dir)
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PATH", enhanced_path(paths))
        .env_remove("PYTHONHOME")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    Ok((backend_path, command))
}

fn wait_for_dashboard(launch: &mut DashboardLaunch) -> Result<(), String> {
    let started = Instant::now();

    loop {
        if is_dashboard_healthy(&launch.api_url, &launch.token) {
            return Ok(());
        }

        if let Some(status) = launch.child.try_wait().map_err(|error| error.to_string())? {
            return Err(format!(
                "Hermes dashboard 过早退出：{}。",
                status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "无退出码".to_string())
            ));
        }

        if started.elapsed() >= DASHBOARD_START_TIMEOUT {
            let _ = launch.child.kill();
            let _ = launch.child.wait();
            return Err(format!(
                "Hermes dashboard 在 {} 秒内没有就绪。",
                DASHBOARD_START_TIMEOUT.as_secs()
            ));
        }

        thread::sleep(HEALTH_CHECK_TIMEOUT);
    }
}

fn run_command(command: &mut Command) -> Result<RuntimeCommandResult, String> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let child = command.spawn().map_err(|error| error.to_string())?;
    let output = child
        .wait_with_output_timeout(HERMES_COMMAND_TIMEOUT)
        .map_err(|error| error.to_string())?;

    Ok(RuntimeCommandResult {
        success: output.status.success(),
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
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

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);

    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }

    output
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

trait ChildTimeoutExt {
    fn wait_with_output_timeout(
        self,
        timeout: std::time::Duration,
    ) -> Result<std::process::Output, String>;
}

impl ChildTimeoutExt for Child {
    fn wait_with_output_timeout(
        mut self,
        timeout: std::time::Duration,
    ) -> Result<std::process::Output, String> {
        let started = Instant::now();

        loop {
            if self.try_wait().map_err(|error| error.to_string())?.is_some() {
                return self.wait_with_output().map_err(|error| error.to_string());
            }

            if started.elapsed() >= timeout {
                let _ = self.kill();
                let output = self.wait_with_output().map_err(|error| error.to_string())?;
                let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if !stderr.trim().is_empty() {
                    stderr.push('\n');
                }
                stderr.push_str(&format!("Hermes 命令在 {} 秒后超时。", timeout.as_secs()));

                return Ok(std::process::Output {
                    status: output.status,
                    stdout: output.stdout,
                    stderr: stderr.into_bytes(),
                });
            }

            thread::sleep(std::time::Duration::from_millis(100));
        }
    }
}
