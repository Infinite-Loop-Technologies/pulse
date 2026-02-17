use cef::*;
use std::path::{Path, PathBuf};

pub mod persistence;
pub mod simple_app;
pub mod simple_handler;
pub mod state;

#[cfg(target_os = "macos")]
pub type Library = library_loader::LibraryLoader;

#[cfg(not(target_os = "macos"))]
pub struct Library;

pub fn load_cef() -> Library {
    #[cfg(target_os = "macos")]
    let library = {
        let loader = library_loader::LibraryLoader::new(&std::env::current_exe().unwrap(), false);
        assert!(loader.load());
        loader
    };

    #[cfg(not(target_os = "macos"))]
    let library = Library;

    let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);

    #[cfg(target_os = "macos")]
    crate::mac::setup_simple_application();

    library
}

pub fn run_main(main_args: &MainArgs, cmd_line: &CommandLine, sandbox_info: *mut u8) {
    let switch = CefString::from("type");
    let is_browser_process = cmd_line.has_switch(Some(&switch)) != 1;

    let mut app = simple_app::SimpleApp::new();
    let ret = execute_process(Some(main_args), Some(&mut app), sandbox_info);
    if is_browser_process {
        assert_eq!(ret, -1, "Cannot execute browser process");
    } else {
        assert!(ret >= 0, "Cannot execute non-browser process");
        return;
    }

    let mut settings = Settings {
        no_sandbox: 1,
        ..Default::default()
    };

    let app_data_root = pulse_app_data_root();
    let cache_path = app_data_root.join("cache").join("default");
    let log_file = app_data_root.join("debug.log");
    let _ = std::fs::create_dir_all(&cache_path);

    let root_cache_path = app_data_root.to_string_lossy().to_string();
    let cache_path = cache_path.to_string_lossy().to_string();
    let log_file = log_file.to_string_lossy().to_string();
    settings.root_cache_path = CefString::from(root_cache_path.as_str());
    settings.cache_path = CefString::from(cache_path.as_str());
    settings.log_file = CefString::from(log_file.as_str());
    settings.log_severity = if std::env::var("PULSE_CEF_VERBOSE_LOG").ok().as_deref() == Some("1") {
        LogSeverity::VERBOSE
    } else {
        LogSeverity::INFO
    };

    // Use CEF default subprocess path resolution (current executable).

    let initialized = initialize(
        Some(main_args),
        Some(&settings),
        Some(&mut app),
        sandbox_info,
    );
    if initialized != 1 {
        eprintln!(
            "CEF initialize returned {initialized}. Verify matching CEF binaries and runtime layout."
        );
        print_cef_diagnostics();
        return;
    }

    run_message_loop();
    shutdown();
}

fn print_cef_diagnostics() {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let cef_path = std::env::var("CEF_PATH").ok();
    let root_cache = pulse_app_data_root();
    let log_path = root_cache.join("debug.log");

    eprintln!("Diagnostics:");
    eprintln!("  CEF_PATH={}", cef_path.as_deref().unwrap_or("<unset>"));
    eprintln!(
        "  exe_dir={}",
        exe_dir
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<unknown>".into())
    );
    eprintln!("  root_cache_path={}", root_cache.display());
    eprintln!("  log_file={}", log_path.display());

    if let Some(dir) = exe_dir {
        eprintln!(
            "  exe_dir libcef.dll exists={}",
            dir.join("libcef.dll").exists()
        );
        eprintln!(
            "  exe_dir resources.pak exists={}",
            dir.join("resources.pak").exists()
        );
        eprintln!("  exe_dir locales exists={}", dir.join("locales").exists());
    }

    if let Some(path) = cef_path {
        let base = PathBuf::from(path);
        eprintln!(
            "  CEF_PATH archive.json exists={}",
            base.join("archive.json").exists()
        );
        eprintln!(
            "  CEF_PATH libcef.dll exists={}",
            base.join("libcef.dll").exists()
        );
        eprintln!(
            "  CEF_PATH resources.pak exists={}",
            base.join("resources.pak").exists()
        );
        eprintln!(
            "  CEF_PATH locales exists={}",
            base.join("locales").exists()
        );
    }

    if let Ok(text) = std::fs::read_to_string(&log_path) {
        let tail = text.lines().rev().take(20).collect::<Vec<_>>();
        if !tail.is_empty() {
            eprintln!("  debug.log tail:");
            for line in tail.iter().rev() {
                eprintln!("    {line}");
            }
        }
    }
}

pub fn pulse_app_data_root() -> PathBuf {
    let cache_root_name =
        std::env::var("PULSE_CACHE_ROOT").unwrap_or_else(|_| String::from("Pulse"));
    std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(cache_root_name)
}
