use serde::Serialize;
use serde_json::json;
use std::io::Read;
use tauri::{AppHandle, Emitter};

use super::config::{ensure_api_server_config, ensure_api_server_key, read_api_server_key};
use super::constants::HERMES_COMMAND_TIMEOUT;
use super::paths::runtime_paths;
use super::process::local_api_url;
use super::types::HermesChatStreamInput;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HermesChatStreamEvent {
    stream_id: String,
    #[serde(rename = "type")]
    event_type: String,
    data: serde_json::Value,
}

pub(crate) fn hermes_chat_stream_impl(
    app: AppHandle,
    input: HermesChatStreamInput,
) -> Result<(), String> {
    let paths = runtime_paths(&app);
    ensure_api_server_config(&paths)?;
    ensure_api_server_key(&paths)?;

    let api_key = read_api_server_key(&paths).ok_or("本地 API 认证未配置。")?;
    let message = input.message.trim();
    let files = input.files.filter(|files| !files.is_empty());
    if message.is_empty() && files.is_none() {
        return Err("消息不能为空。".to_string());
    }

    let mut body = json!({
        "stream": true,
        "session_id": input.session_id,
        "messages": [
            {
                "role": "user",
                "content": message,
            }
        ],
    });

    if let Some(model) = input
        .model
        .as_deref()
        .map(str::trim)
        .filter(|model| !model.is_empty())
    {
        body["model"] = json!(model);
    }

    if let Some(files) = files {
        body["files"] = json!(files);
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(HERMES_COMMAND_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(format!("{}/v1/chat/completions", local_api_url()))
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header("X-Hermes-Session-Id", input.session_id.as_str())
        .json(&body)
        .send()
        .map_err(|error| format!("消息发送失败：{error}"))?;
    let status = response.status();

    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(if body.trim().is_empty() {
            format!("Hermes API 返回 HTTP {status}。")
        } else {
            format!("Hermes API 返回 HTTP {status}: {}", body.trim())
        });
    }

    read_and_emit_sse(&app, &input.stream_id, response)?;
    emit_chat_stream_event(
        &app,
        HermesChatStreamEvent {
            stream_id: input.stream_id,
            event_type: "transport.done".to_string(),
            data: serde_json::Value::Null,
        },
    )
}

fn read_and_emit_sse(
    app: &AppHandle,
    stream_id: &str,
    mut response: reqwest::blocking::Response,
) -> Result<(), String> {
    let mut chunk = [0_u8; 8192];
    let mut buffer = String::new();

    loop {
        let bytes_read = response
            .read(&mut chunk)
            .map_err(|error| error.to_string())?;
        if bytes_read == 0 {
            break;
        }

        buffer.push_str(&String::from_utf8_lossy(&chunk[..bytes_read]));
        while let Some((index, delimiter_len)) = find_sse_delimiter(&buffer) {
            let block = buffer[..index].to_string();
            buffer = buffer[index + delimiter_len..].to_string();
            emit_sse_block(&app, stream_id, &block)?;
        }
    }

    if !buffer.trim().is_empty() {
        emit_sse_block(&app, stream_id, &buffer)?;
    }

    Ok(())
}

fn find_sse_delimiter(buffer: &str) -> Option<(usize, usize)> {
    let lf_index = buffer.find("\n\n");
    let crlf_index = buffer.find("\r\n\r\n");

    match (lf_index, crlf_index) {
        (None, None) => None,
        (Some(index), None) => Some((index, 2)),
        (None, Some(index)) => Some((index, 4)),
        (Some(lf), Some(crlf)) if lf < crlf => Some((lf, 2)),
        (Some(_), Some(crlf)) => Some((crlf, 4)),
    }
}

fn emit_sse_block(app: &AppHandle, stream_id: &str, block: &str) -> Result<(), String> {
    let mut event_type = "message".to_string();
    let mut data_lines = Vec::new();

    for line in block.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event_type = value.trim().to_string();
        } else if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.trim_start().to_string());
        }
    }

    if data_lines.is_empty() {
        return Ok(());
    }

    let raw_data = data_lines.join("\n");
    let data = if raw_data == "[DONE]" {
        serde_json::Value::String(raw_data)
    } else {
        serde_json::from_str(&raw_data).unwrap_or(serde_json::Value::String(raw_data))
    };

    emit_chat_stream_event(
        app,
        HermesChatStreamEvent {
            stream_id: stream_id.to_string(),
            event_type,
            data,
        },
    )
}

fn emit_chat_stream_event(app: &AppHandle, event: HermesChatStreamEvent) -> Result<(), String> {
    app.emit("hermes-chat-stream", event)
        .map_err(|error| error.to_string())
}
