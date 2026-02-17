use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use super::pulse_app_data_root;

const STATE_SCHEMA_VERSION: u32 = 1;
const STATE_DIR_NAME: &str = "state";
const PRIMARY_FILE_NAME: &str = "workspace-state.json";
const BACKUP_FILE_NAME: &str = "workspace-state.backup.json";
const TEMP_FILE_NAME: &str = "workspace-state.tmp.json";

#[derive(Debug, Serialize, Deserialize)]
struct PersistedStateV1 {
    schema_version: u32,
    updated_at_unix_ms: u64,
    ui_state: Value,
}

struct DecodedState {
    ui_state: Value,
    needs_rewrite: bool,
}

#[derive(Clone)]
struct StatePaths {
    dir: PathBuf,
    primary: PathBuf,
    backup: PathBuf,
    temp: PathBuf,
}

pub fn load_ui_state_json() -> Result<Option<String>> {
    let Some(state) = load_ui_state_value()? else {
        return Ok(None);
    };

    let serialized = serde_json::to_string(&state)
        .context("Failed to serialize persisted UI state for renderer bridge")?;
    Ok(Some(serialized))
}

pub fn save_ui_state_json(serialized_state: &str) -> Result<()> {
    let parsed: Value =
        serde_json::from_str(serialized_state).context("UI state payload is not valid JSON")?;
    save_ui_state_value(&parsed)
}

fn load_ui_state_value() -> Result<Option<Value>> {
    let _guard = io_lock();
    let paths = state_paths();
    fs::create_dir_all(&paths.dir).with_context(|| {
        format!(
            "Failed to create Pulse state directory '{}'",
            paths.dir.display()
        )
    })?;

    match read_state_file(&paths.primary) {
        Ok(Some(decoded)) => {
            if decoded.needs_rewrite {
                save_ui_state_value_inner(&paths, &decoded.ui_state)?;
            }
            return Ok(Some(decoded.ui_state));
        }
        Ok(None) => {}
        Err(primary_err) => {
            eprintln!(
                "Pulse state warning: failed to read primary state '{}': {primary_err}",
                paths.primary.display()
            );
        }
    }

    match read_state_file(&paths.backup) {
        Ok(Some(decoded)) => {
            if let Err(restore_err) = restore_primary_copy(&paths, &decoded.ui_state) {
                eprintln!(
                    "Pulse state warning: failed to restore primary from backup '{}': {restore_err}",
                    paths.backup.display()
                );
            }
            Ok(Some(decoded.ui_state))
        }
        Ok(None) => Ok(None),
        Err(backup_err) => {
            eprintln!(
                "Pulse state warning: failed to read backup state '{}': {backup_err}",
                paths.backup.display()
            );
            Ok(None)
        }
    }
}

fn save_ui_state_value(ui_state: &Value) -> Result<()> {
    let _guard = io_lock();
    let paths = state_paths();
    fs::create_dir_all(&paths.dir).with_context(|| {
        format!(
            "Failed to create Pulse state directory '{}'",
            paths.dir.display()
        )
    })?;
    save_ui_state_value_inner(&paths, ui_state)
}

fn save_ui_state_value_inner(paths: &StatePaths, ui_state: &Value) -> Result<()> {
    let envelope = PersistedStateV1 {
        schema_version: STATE_SCHEMA_VERSION,
        updated_at_unix_ms: unix_time_ms(),
        ui_state: ui_state.clone(),
    };
    let mut serialized = serde_json::to_vec_pretty(&envelope)
        .context("Failed to encode UI state envelope for persistence")?;
    serialized.push(b'\n');

    write_temp_file(&paths.temp, &serialized)?;

    if paths.backup.exists() {
        let _ = fs::remove_file(&paths.backup);
    }

    if paths.primary.exists() {
        fs::rename(&paths.primary, &paths.backup).with_context(|| {
            format!(
                "Failed to rotate primary state '{}' to backup '{}'",
                paths.primary.display(),
                paths.backup.display()
            )
        })?;
    }

    fs::rename(&paths.temp, &paths.primary).with_context(|| {
        format!(
            "Failed to commit temp state '{}' to '{}'",
            paths.temp.display(),
            paths.primary.display()
        )
    })?;

    Ok(())
}

fn restore_primary_copy(paths: &StatePaths, ui_state: &Value) -> Result<()> {
    let envelope = PersistedStateV1 {
        schema_version: STATE_SCHEMA_VERSION,
        updated_at_unix_ms: unix_time_ms(),
        ui_state: ui_state.clone(),
    };
    let mut serialized =
        serde_json::to_vec_pretty(&envelope).context("Failed to encode backup recovery state")?;
    serialized.push(b'\n');

    write_temp_file(&paths.temp, &serialized)?;
    if paths.primary.exists() {
        let _ = fs::remove_file(&paths.primary);
    }

    fs::rename(&paths.temp, &paths.primary).with_context(|| {
        format!(
            "Failed to restore primary state file '{}' from backup",
            paths.primary.display()
        )
    })?;

    Ok(())
}

fn write_temp_file(path: &Path, bytes: &[u8]) -> Result<()> {
    if path.exists() {
        let _ = fs::remove_file(path);
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .with_context(|| format!("Failed to open temporary state file '{}'", path.display()))?;
    file.write_all(bytes)
        .with_context(|| format!("Failed to write temporary state file '{}'", path.display()))?;
    file.flush()
        .with_context(|| format!("Failed to flush temporary state file '{}'", path.display()))?;
    file.sync_all()
        .with_context(|| format!("Failed to sync temporary state file '{}'", path.display()))?;
    Ok(())
}

fn read_state_file(path: &Path) -> Result<Option<DecodedState>> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path)
        .with_context(|| format!("Failed to read state file '{}'", path.display()))?;
    let parsed: Value = serde_json::from_slice(&bytes)
        .with_context(|| format!("State file '{}' is not valid JSON", path.display()))?;
    let decoded = decode_persisted_value(parsed)?;
    Ok(Some(decoded))
}

fn decode_persisted_value(raw: Value) -> Result<DecodedState> {
    let Some(raw_obj) = raw.as_object() else {
        // Legacy v0 format: raw state value without envelope metadata.
        return Ok(DecodedState {
            ui_state: raw,
            needs_rewrite: true,
        });
    };

    let Some(schema_value) = raw_obj.get("schema_version") else {
        return Ok(DecodedState {
            ui_state: Value::Object(raw_obj.clone()),
            needs_rewrite: true,
        });
    };

    let Some(schema_version) = schema_value.as_u64() else {
        return Err(anyhow!(
            "Persisted state schema_version must be an integer, got '{}'",
            schema_value
        ));
    };

    match schema_version {
        1 => {
            let Some(ui_state) = raw_obj.get("ui_state") else {
                return Err(anyhow!(
                    "Persisted state schema v1 is missing required 'ui_state' field"
                ));
            };
            Ok(DecodedState {
                ui_state: ui_state.clone(),
                needs_rewrite: false,
            })
        }
        0 => decode_legacy_envelope_v0(raw_obj),
        _ => Err(anyhow!(
            "Unsupported persisted state schema_version={schema_version}. This build supports up to {}",
            STATE_SCHEMA_VERSION
        )),
    }
}

fn decode_legacy_envelope_v0(raw_obj: &Map<String, Value>) -> Result<DecodedState> {
    let Some(legacy_state) = raw_obj.get("state").or_else(|| raw_obj.get("ui_state")) else {
        return Err(anyhow!(
            "Legacy persisted state schema v0 must contain either 'state' or 'ui_state'"
        ));
    };

    Ok(DecodedState {
        ui_state: legacy_state.clone(),
        needs_rewrite: true,
    })
}

fn state_paths() -> StatePaths {
    let dir = pulse_app_data_root().join(STATE_DIR_NAME);
    StatePaths {
        primary: dir.join(PRIMARY_FILE_NAME),
        backup: dir.join(BACKUP_FILE_NAME),
        temp: dir.join(TEMP_FILE_NAME),
        dir,
    }
}

fn io_lock() -> MutexGuard<'static, ()> {
    static IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
