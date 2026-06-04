use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const ILINK_BASE_URL: &str = "https://ilinkai.weixin.qq.com";
const QR_TIMEOUT: Duration = Duration::from_secs(15);
const QR_POLL_TIMEOUT: Duration = Duration::from_secs(35);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinQrCode {
    qrcode: String,
    qrcode_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinQrStatusInput {
    qrcode: String,
    base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinQrStatus {
    status: String,
    account_id: Option<String>,
    token: Option<String>,
    base_url: Option<String>,
    user_id: Option<String>,
    redirect_host: Option<String>,
}

#[tauri::command]
pub async fn weixin_qrcode_get() -> Result<WeixinQrCode, String> {
    tauri::async_runtime::spawn_blocking(fetch_qrcode)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn weixin_qrcode_poll(input: WeixinQrStatusInput) -> Result<WeixinQrStatus, String> {
    tauri::async_runtime::spawn_blocking(move || poll_qrcode(input))
        .await
        .map_err(|error| error.to_string())?
}

fn fetch_qrcode() -> Result<WeixinQrCode, String> {
    let client = Client::builder()
        .timeout(QR_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let data = get_json(
        &client,
        ILINK_BASE_URL,
        "ilink/bot/get_bot_qrcode",
        &[("bot_type", "3")],
    )?;

    let qrcode = json_string(&data, "qrcode").ok_or("iLink QR 响应缺少 qrcode。")?;
    let qrcode_url = json_string(&data, "qrcode_img_content").unwrap_or_default();

    Ok(WeixinQrCode {
        qrcode,
        qrcode_url,
    })
}

fn poll_qrcode(input: WeixinQrStatusInput) -> Result<WeixinQrStatus, String> {
    let qrcode = input.qrcode.trim().to_string();
    if qrcode.is_empty() {
        return Err("缺少微信二维码 ID。".to_string());
    }

    let base_url = validated_ilink_base(input.base_url.as_deref())?;
    let client = Client::builder()
        .timeout(QR_POLL_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let data = get_json(
        &client,
        &base_url,
        "ilink/bot/get_qrcode_status",
        &[("qrcode", qrcode.as_str())],
    )?;
    let status = json_string(&data, "status").unwrap_or_else(|| "wait".to_string());

    Ok(WeixinQrStatus {
        account_id: json_string(&data, "ilink_bot_id"),
        base_url: json_string(&data, "baseurl"),
        redirect_host: json_string(&data, "redirect_host"),
        status,
        token: json_string(&data, "bot_token"),
        user_id: json_string(&data, "ilink_user_id"),
    })
}

fn get_json(
    client: &Client,
    base_url: &str,
    endpoint: &str,
    query: &[(&str, &str)],
) -> Result<Value, String> {
    let mut url = Url::parse(&format!("{}/{}", base_url.trim_end_matches('/'), endpoint))
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut().extend_pairs(query.iter().copied());
    let response = client
        .get(url)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let text = response.text().map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(if text.trim().is_empty() {
            format!("iLink 返回 HTTP {status}。")
        } else {
            format!("iLink 返回 HTTP {status}: {}", text.trim())
        });
    }

    serde_json::from_str(&text).map_err(|error| format!("iLink 返回了非 JSON 响应：{error}"))
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn validated_ilink_base(base_url: Option<&str>) -> Result<String, String> {
    let raw = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(ILINK_BASE_URL)
        .trim_end_matches('/')
        .to_string();
    let url = Url::parse(&raw).map_err(|error| format!("微信 iLink 地址无效：{error}"))?;

    if url.scheme() != "https" {
        return Err("微信 iLink 地址必须使用 https。".to_string());
    }

    let host = url
        .host_str()
        .ok_or("微信 iLink 地址缺少 host。")?
        .to_ascii_lowercase();

    if host == "ilinkai.weixin.qq.com" || host == "weixin.qq.com" || host.ends_with(".weixin.qq.com") {
        return Ok(raw);
    }

    Err("微信 iLink 重定向地址不在允许的 weixin.qq.com 域名内。".to_string())
}
