#[cfg(target_os = "windows")]
fn main() {
    use std::path::PathBuf;

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let icon_path = PathBuf::from(manifest_dir)
        .join("..")
        .join("..")
        .join("heartbeat.ico");
    println!("cargo:rerun-if-changed={}", icon_path.display());

    if !icon_path.exists() {
        println!(
            "cargo:warning=heartbeat.ico not found at {}; skipping Windows icon embedding",
            icon_path.display()
        );
        return;
    }

    winres::WindowsResource::new()
        .set_icon(icon_path.to_str().unwrap_or("heartbeat.ico"))
        .compile()
        .expect("Failed to compile Windows resources");
}

#[cfg(not(target_os = "windows"))]
fn main() {}
