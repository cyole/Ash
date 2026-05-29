use std::time::Duration;

pub(crate) const LOCAL_API_HOST: &str = "127.0.0.1";
pub(crate) const LOCAL_API_PORT: u16 = 8642;
pub(crate) const RUNTIME_BUNDLE_DIR: &str = "hermes-runtime";
pub(crate) const RUNTIME_MANIFEST_FILE: &str = "runtime-manifest.json";
pub(crate) const HERMES_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
pub(crate) const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_millis(750);
pub(crate) const PROVIDER_MODEL_FETCH_TIMEOUT: Duration = Duration::from_secs(10);
pub(crate) const API_SERVER_KEY_ENV: &str = "API_SERVER_KEY";
pub(crate) const DESKTOP_API_CORS_ORIGIN: &str = "*";

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
