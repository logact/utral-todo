use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

type ResponseMap = Arc<Mutex<HashMap<String, Option<serde_json::Value>>>>;
type TimerMap = Arc<Mutex<HashMap<String, bool>>>;

#[derive(Clone, Serialize)]
struct CliRequestEvent {
    req_id: String,
    entity: String,
    action: String,
    args: serde_json::Value,
}

#[tauri::command]
fn cli_respond(state: tauri::State<'_, ResponseMap>, req_id: String, result: serde_json::Value) {
    if let Ok(mut map) = state.lock() {
        map.insert(req_id, Some(result));
    }
}

fn json_header() -> tiny_http::Header {
    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()
}

fn start_cli_server(app_handle: AppHandle, responses: ResponseMap) {
    thread::spawn(move || {
        let server = match tiny_http::Server::http("127.0.0.1:9876") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[cli-server] Failed to start: {}", e);
                return;
            }
        };

        println!("[cli-server] Listening on 127.0.0.1:9876");

        for mut request in server.incoming_requests() {
            let method = request.method().as_str();
            let url = request.url();

            if method != "POST" || url != "/cli" {
                let _ = request.respond(
                    tiny_http::Response::from_string(r#"{"error":"Not found"}"#)
                        .with_status_code(404)
                        .with_header(json_header()),
                );
                continue;
            }

            let mut body = String::new();
            if let Err(e) = request.as_reader().read_to_string(&mut body) {
                let _ = request.respond(
                    tiny_http::Response::from_string(format!(
                        r#"{{"error":"Read error: {}"}}"#,
                        e
                    ))
                    .with_status_code(400)
                    .with_header(json_header()),
                );
                continue;
            }

            let payload: serde_json::Value = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(e) => {
                    let _ = request.respond(
                        tiny_http::Response::from_string(format!(
                            r#"{{"error":"Invalid JSON: {}"}}"#,
                            e
                        ))
                        .with_status_code(400)
                        .with_header(json_header()),
                    );
                    continue;
                }
            };

            let entity = payload
                .get("entity")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let action = payload
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args = payload.get("args").cloned().unwrap_or(serde_json::Value::Null);

            let req_id = uuid::Uuid::new_v4().to_string();

            responses.lock().unwrap().insert(req_id.clone(), None);

            let event = CliRequestEvent {
                req_id: req_id.clone(),
                entity,
                action,
                args,
            };

            if let Err(e) = app_handle.emit("cli-request", event) {
                eprintln!("[cli-server] Failed to emit: {}", e);
                responses.lock().unwrap().remove(&req_id);
                let _ = request.respond(
                    tiny_http::Response::from_string(r#"{"error":"App not ready"}"#)
                        .with_status_code(503)
                        .with_header(json_header()),
                );
                continue;
            }

            let response = wait_for_response(&responses, &req_id, 5);

            let response_body = match response {
                Some(result) => serde_json::to_string(&result).unwrap_or_else(|_| {
                    r#"{"error":"Serialization failed"}"#.to_string()
                }),
                None => {
                    r#"{"error":"Timeout waiting for app response"}"#.to_string()
                }
            };

            let _ = request.respond(
                tiny_http::Response::from_string(response_body)
                    .with_status_code(200)
                    .with_header(json_header()),
            );
        }
    });
}

fn wait_for_response(
    map: &ResponseMap,
    req_id: &str,
    timeout_secs: u64,
) -> Option<serde_json::Value> {
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if let Ok(mut locked) = map.lock() {
            if let Some(Some(value)) = locked.get(req_id) {
                let value = value.clone();
                locked.remove(req_id);
                return Some(value);
            }
        }
        thread::sleep(Duration::from_millis(50));
    }

    if let Ok(mut locked) = map.lock() {
        locked.remove(req_id);
    }
    None
}

#[tauri::command]
fn timer_schedule(
    app: AppHandle,
    timers: tauri::State<'_, TimerMap>,
    id: String,
    title: String,
    body: String,
    seconds: u64,
) {
    {
        let mut map = timers.lock().unwrap();
        map.insert(id.clone(), false);
    }

    let timers_clone = timers.inner().clone();
    let id_clone = id.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(seconds));
        let cancelled = {
            let map = timers_clone.lock().unwrap();
            map.get(&id_clone).copied().unwrap_or(true)
        };
        if cancelled {
            return;
        }
        let _ = app.notification().builder().title(title).body(body).show();
    });
}

#[tauri::command]
fn timer_cancel(timers: tauri::State<'_, TimerMap>, id: String) {
    let mut map = timers.lock().unwrap();
    map.insert(id, true);
}

#[tauri::command]
fn timer_cancel_all(timers: tauri::State<'_, TimerMap>) {
    let mut map = timers.lock().unwrap();
    for v in map.values_mut() {
        *v = true;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let responses: ResponseMap = Arc::new(Mutex::new(HashMap::new()));
    let timers: TimerMap = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .manage(responses.clone())
        .manage(timers.clone())
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            start_cli_server(app.handle().clone(), responses.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![cli_respond, timer_schedule, timer_cancel, timer_cancel_all])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
