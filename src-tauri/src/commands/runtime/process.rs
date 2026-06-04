use serde_json::Value;
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{LazyLock, Mutex},
    thread,
    time::{Instant, SystemTime, UNIX_EPOCH},
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

static LOG_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
const LOG_TAIL_BYTES: u64 = 64 * 1024;

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
        "没有可用的 本地 dashboard 端口（{}-{}）。",
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
            format!("本地 dashboard 返回 HTTP {status}。")
        } else {
            format!("本地 dashboard 返回 HTTP {status}: {}", body.trim())
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
    let hermes = find_managed_hermes(paths).ok_or("内置本地引擎尚未准备好。")?;

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
        .env("ASH_DESKTOP_RUNTIME", &paths.root)
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PATH", enhanced_path(paths));
    command.env_remove("PYTHONHOME");

    let result = run_command(&mut command)?;
    let log_path = paths.desktop_log_path();
    append_runtime_log(
        &log_path,
        "command",
        format!(
            "hermes {} -> success={} code={:?}",
            args.join(" "),
            result.success,
            result.code
        ),
    );
    if !result.stdout.trim().is_empty() {
        append_runtime_log(&log_path, "command:stdout", &result.stdout);
    }
    if !result.stderr.trim().is_empty() {
        append_runtime_log(&log_path, "command:stderr", &result.stderr);
    }

    Ok(result)
}

pub(crate) fn launch_dashboard(paths: &RuntimePaths) -> Result<DashboardLaunch, String> {
    let token = generate_session_token()?;
    let port = pick_dashboard_port()?;
    let api_url = local_dashboard_api_url(port);
    let ws_url = local_dashboard_ws_url(port, &token);

    let (backend_path, mut command) = dashboard_command(paths, port, &token)?;
    let log_path = paths.desktop_log_path();
    append_runtime_log(
        &log_path,
        "desktop",
        format!(
            "Launching 本地 dashboard on {api_url} via {}",
            backend_path.to_string_lossy()
        ),
    );

    let mut child = command.spawn().map_err(|error| {
        format!(
            "本地 dashboard 启动失败（{}）：{}",
            backend_path.to_string_lossy(),
            error
        )
    })?;
    pipe_child_output(&mut child, &log_path);

    let mut launch = DashboardLaunch {
        api_url,
        backend_path,
        child,
        token,
        ws_url,
    };
    wait_for_dashboard(&mut launch, &log_path)?;
    append_runtime_log(
        &log_path,
        "desktop",
        format!("本地 dashboard is healthy at {}", launch.api_url),
    );
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
        return Err("内置本地引擎尚未准备好。".to_string());
    };

    let mut command = Command::new(&backend_path);
    command
        .args(args)
        .current_dir(&paths.install_dir)
        .env("HERMES_HOME", &paths.hermes_home)
        .env("ASH_DESKTOP_RUNTIME", &paths.root)
        .env("HERMES_DASHBOARD_SESSION_TOKEN", token)
        .env("HERMES_DASHBOARD_TUI", "1")
        .env("HERMES_WEB_DIST", paths.web_dist_path())
        .env("PYTHONPATH", &paths.install_dir)
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PATH", enhanced_path(paths))
        .env_remove("PYTHONHOME")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    Ok((backend_path, command))
}

fn wait_for_dashboard(launch: &mut DashboardLaunch, log_path: &Path) -> Result<(), String> {
    let started = Instant::now();

    loop {
        if is_dashboard_healthy(&launch.api_url, &launch.token) {
            return Ok(());
        }

        if let Some(status) = launch.child.try_wait().map_err(|error| error.to_string())? {
            append_runtime_log(
                log_path,
                "desktop",
                format!("本地 dashboard exited before readiness: {status}"),
            );
            return Err(format!(
                "本地 dashboard 过早退出：{}。",
                status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "无退出码".to_string())
            ));
        }

        if started.elapsed() >= DASHBOARD_START_TIMEOUT {
            let _ = launch.child.kill();
            let _ = launch.child.wait();
            append_runtime_log(
                log_path,
                "desktop",
                format!(
                    "本地 dashboard did not become healthy within {} seconds",
                    DASHBOARD_START_TIMEOUT.as_secs()
                ),
            );
            return Err(format!(
                "本地 dashboard 在 {} 秒内没有就绪。",
                DASHBOARD_START_TIMEOUT.as_secs()
            ));
        }

        thread::sleep(HEALTH_CHECK_TIMEOUT);
    }
}

fn pipe_child_output(child: &mut Child, log_path: &Path) {
    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(stdout, log_path.to_path_buf(), "dashboard:stdout");
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, log_path.to_path_buf(), "dashboard:stderr");
    }
}

fn spawn_log_reader<R>(reader: R, log_path: PathBuf, source: &'static str)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(line) => append_runtime_log(&log_path, source, line),
                Err(error) => {
                    append_runtime_log(
                        &log_path,
                        "desktop",
                        format!("读取 本地 dashboard 输出失败：{error}"),
                    );
                    break;
                }
            }
        }
    });
}

pub(crate) fn append_runtime_log(log_path: &Path, source: &str, text: impl AsRef<str>) {
    let text = text.as_ref().trim();
    if text.is_empty() {
        return;
    }

    let Ok(_guard) = LOG_LOCK.lock() else {
        return;
    };

    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) else {
        return;
    };

    let timestamp = runtime_log_timestamp();
    for line in text
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
    {
        let _ = writeln!(file, "[{timestamp}] [{source}] {line}");
    }
}

pub(crate) fn tail_runtime_log(log_path: &Path, max_lines: usize) -> Result<Vec<String>, String> {
    if max_lines == 0 || !log_path.is_file() {
        return Ok(Vec::new());
    }

    let mut file = File::open(log_path).map_err(|error| error.to_string())?;
    let size = file.metadata().map_err(|error| error.to_string())?.len();
    let start = size.saturating_sub(LOG_TAIL_BYTES);
    file.seek(SeekFrom::Start(start))
        .map_err(|error| error.to_string())?;

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|error| error.to_string())?;
    let mut text = String::from_utf8_lossy(&buffer).to_string();

    if start > 0 {
        if let Some((_, remainder)) = text.split_once('\n') {
            text = remainder.to_string();
        }
    }

    let mut lines = text
        .lines()
        .rev()
        .take(max_lines)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    lines.reverse();
    Ok(lines)
}

fn runtime_log_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
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
            if self
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_some()
            {
                return self.wait_with_output().map_err(|error| error.to_string());
            }

            if started.elapsed() >= timeout {
                let _ = self.kill();
                let output = self.wait_with_output().map_err(|error| error.to_string())?;
                let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if !stderr.trim().is_empty() {
                    stderr.push('\n');
                }
                stderr.push_str(&format!("运行时命令在 {} 秒后超时。", timeout.as_secs()));

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
