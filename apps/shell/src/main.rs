#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod shared;

use anyhow::{Result, anyhow};
use velopack::{UpdateManager, VelopackApp, sources::HttpSource};

const DEFAULT_DEV_UI_URL: &str = "http://localhost:5173";
const COMPILED_UPDATE_URL: Option<&str> = option_env!("PULSE_UPDATE_URL");

fn main() -> Result<()> {
    initialize_velopack();
    configure_runtime_env()?;

    let _library = shared::load_cef();
    let args = cef::args::Args::new();
    let cmd_line = args
        .as_cmd_line()
        .ok_or_else(|| anyhow!("Failed to parse command line arguments for CEF"))?;

    shared::run_main(args.as_main_args(), &cmd_line, std::ptr::null_mut());
    Ok(())
}

fn initialize_velopack() {
    VelopackApp::build().run();
    maybe_check_for_updates_in_background();
}

fn maybe_check_for_updates_in_background() {
    let Some(update_url) = resolve_update_url() else {
        return;
    };

    std::thread::spawn(move || {
        let source = HttpSource::new(update_url, None);
        let update_manager = UpdateManager::new(source, None, None);

        let available_update = match update_manager.check_for_updates() {
            Ok(Some(update)) => update,
            Ok(None) => return,
            Err(err) => {
                eprintln!("Pulse updater warning: failed to check for updates: {err}");
                return;
            }
        };

        if let Err(err) = update_manager.download_updates(&available_update, None) {
            eprintln!("Pulse updater warning: failed to download update: {err}");
            return;
        }

        let _ = update_manager.wait_exit_then_apply_updates(&available_update, true);
    });
}

fn resolve_update_url() -> Option<String> {
    std::env::var("PULSE_UPDATE_URL")
        .ok()
        .and_then(non_empty)
        .or_else(|| COMPILED_UPDATE_URL.and_then(non_empty).map(str::to_string))
}

fn non_empty(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn configure_runtime_env() -> Result<()> {
    if let Ok(cef_path) = std::env::var("CEF_PATH") {
        if !cef_path.is_empty() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let has_cef_path = current_path
                .split(';')
                .any(|entry| entry.eq_ignore_ascii_case(&cef_path));

            if !has_cef_path {
                let new_path = format!("{current_path};{cef_path}");
                // Keep CEF binaries discoverable (e.g. libcef.dll) in dev runs.
                unsafe {
                    std::env::set_var("PATH", new_path);
                }
            }
        }
    }

    let ui_url = resolve_flag_from_args("--pulse-ui-url")
        .or_else(|| resolve_flag_from_args("--ui-url"))
        .or_else(|| std::env::var("PULSE_UI_URL").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(resolve_default_ui_url);
    let content_url = resolve_flag_from_args("--pulse-content-url")
        .or_else(|| std::env::var("PULSE_URL").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| String::from("https://www.microsoft.com/edge"));

    unsafe {
        std::env::set_var("PULSE_UI_URL", ui_url);
        std::env::set_var("PULSE_URL", content_url);
    }

    if resolve_flag_from_args("--type").is_none() {
        eprintln!(
            "Pulse startup env configured: PULSE_UI_URL='{}' PULSE_URL='{}'",
            std::env::var("PULSE_UI_URL").unwrap_or_default(),
            std::env::var("PULSE_URL").unwrap_or_default()
        );
    }

    Ok(())
}

fn resolve_default_ui_url() -> String {
    if cfg!(debug_assertions) {
        return String::from(DEFAULT_DEV_UI_URL);
    }

    resolve_packaged_ui_url().unwrap_or_else(|| String::from(DEFAULT_DEV_UI_URL))
}

fn resolve_packaged_ui_url() -> Option<String> {
    let executable_path = std::env::current_exe().ok()?;
    let executable_dir = executable_path.parent()?;
    let ui_index = executable_dir.join("ui").join("index.html");
    if !ui_index.exists() {
        return None;
    }

    let canonical = ui_index.canonicalize().ok()?;
    url::Url::from_file_path(canonical)
        .ok()
        .map(|url| url.to_string())
}

fn resolve_flag_from_args(flag: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let equals_prefix = format!("{flag}=");

    for (index, arg) in args.iter().enumerate() {
        if let Some(value) = arg.strip_prefix(&equals_prefix) {
            if !value.trim().is_empty() {
                return Some(value.to_string());
            }
        }

        if arg == flag {
            if let Some(next) = args.get(index + 1) {
                if !next.trim().is_empty() {
                    return Some(next.clone());
                }
            }
        }
    }

    None
}
