use std::time::Duration;

pub(crate) const LOCAL_API_HOST: &str = "127.0.0.1";
pub(crate) const DASHBOARD_PORT_START: u16 = 9120;
pub(crate) const DASHBOARD_PORT_END: u16 = 9199;
pub(crate) const RUNTIME_BUNDLE_DIR: &str = "hermes-runtime";
pub(crate) const RUNTIME_MANIFEST_FILE: &str = "runtime-manifest.json";
pub(crate) const HERMES_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
pub(crate) const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_millis(750);
pub(crate) const DASHBOARD_START_TIMEOUT: Duration = Duration::from_secs(45);
pub(crate) const SESSION_TOKEN_HEADER: &str = "X-Hermes-Session-Token";

pub(crate) const MIGRATABLE_CONFIG_KEYS: &[&str] = &[
    "accounts",
    "auth",
    "channels",
    "credentials",
    "memory",
    "models",
    "portal",
    "preferences",
    "profiles",
    "providers",
    "settings",
    "skills",
    "tools",
];
