use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use super::model_manager;

/// Debounce window for filesystem events.  500 ms is enough to collapse
/// rapid events (chunked writes, editor save-then-rename) while still
/// feeling instant to users.
const DEBOUNCE_MS: u64 = 500;

/// Managed state holding the two whisper-related file watchers.
pub struct WhisperWatcherState {
    pub models_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    pub settings_watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

/// Timestamp-based deduplication: returns `true` if enough time has
/// elapsed since the last emitted event.  Returns `false` on a
/// poisoned mutex instead of panicking so the watcher thread survives.
fn should_emit(last_event: &Arc<Mutex<Instant>>) -> bool {
    let Ok(mut last) = last_event.lock() else {
        return false;
    };
    if last.elapsed() < Duration::from_millis(DEBOUNCE_MS) {
        return false;
    }
    *last = Instant::now();
    true
}

/// Only `.bin` files are actual Whisper models — ignore `.tmp` partial
/// downloads and any other files that may live in the models directory.
fn is_model_file(path: &std::path::Path) -> bool {
    path.extension().map(|ext| ext == "bin").unwrap_or(false)
}

/// Model-relevant event kinds: creation, deletion, and renames
/// (the download flow does a `.tmp` → `.bin` rename on completion).
fn is_relevant_model_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(notify::event::ModifyKind::Name(_))
    )
}

/// Settings-relevant event kinds: creation and any modification.
fn is_relevant_settings_event(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Create(_) | EventKind::Modify(_))
}

/// Create a `RecommendedWatcher` that emits `"whisper:models-changed"`
/// whenever a `.bin` file is created, removed, or renamed in the
/// models directory.
fn create_models_watcher(app: AppHandle) -> Result<notify::RecommendedWatcher, String> {
    // Initialise in the past so the very first filesystem event fires.
    let last_event = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(10)));

    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if !is_relevant_model_event(&event.kind) {
                return;
            }
            let has_model_file = event.paths.iter().any(|p| is_model_file(p));
            if !has_model_file {
                return;
            }
            if should_emit(&last_event) {
                let _ = app.emit("whisper:models-changed", ());
            }
        }
    })
    .map_err(|e| format!("Failed to create models watcher: {}", e))?;

    Ok(watcher)
}

/// Create a `RecommendedWatcher` that emits `"whisper:settings-changed"`
/// whenever the settings JSON file is created or modified.
///
/// NOTE: When the app itself calls `save_settings()`, this watcher fires
/// back to the frontend.  This is intentional — the frontend guards on
/// modal visibility, so the harmless re-read is cheaper than adding a
/// suppression mechanism.
fn create_settings_watcher(
    app: AppHandle,
    settings_file: &PathBuf,
) -> Result<notify::RecommendedWatcher, String> {
    let last_event = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(10)));
    // Canonicalize so the path comparison works reliably on macOS where
    // FSEvents may return resolved/canonical paths.
    let watched_path =
        std::fs::canonicalize(settings_file).unwrap_or_else(|_| settings_file.clone());

    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if !is_relevant_settings_event(&event.kind) {
                return;
            }
            // Verify the event is for our specific settings file (we watch
            // the parent directory for cross-platform reliability).
            let is_settings = event.paths.iter().any(|p| {
                std::fs::canonicalize(p)
                    .map(|cp| cp == watched_path)
                    .unwrap_or_else(|_| p == &watched_path)
            });
            if !is_settings {
                return;
            }
            if should_emit(&last_event) {
                let _ = app.emit("whisper:settings-changed", ());
            }
        }
    })
    .map_err(|e| format!("Failed to create settings watcher: {}", e))?;

    Ok(watcher)
}

/// Initialise both whisper file watchers and store them in managed state.
///
/// Called from `lib.rs setup()`.  Errors are non-fatal — each watcher is
/// set up independently so a failure in one doesn't prevent the other.
pub fn init(app: &tauri::App) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let models_path = model_manager::models_dir(&app_data_dir);
    let settings_file = model_manager::settings_path(&app_data_dir);

    let state = app.state::<WhisperWatcherState>();

    // --- Models directory watcher ---
    match setup_models_watcher(app, &models_path, &state) {
        Ok(()) => {}
        Err(e) => eprintln!("Whisper models watcher failed: {}", e),
    }

    // --- Settings file watcher ---
    match setup_settings_watcher(app, &settings_file, &app_data_dir, &state) {
        Ok(()) => {}
        Err(e) => eprintln!("Whisper settings watcher failed: {}", e),
    }

    Ok(())
}

fn setup_models_watcher(
    app: &tauri::App,
    models_path: &PathBuf,
    state: &WhisperWatcherState,
) -> Result<(), String> {
    // Ensure the models directory exists before watching.
    std::fs::create_dir_all(models_path)
        .map_err(|e| format!("Failed to create models dir: {}", e))?;

    let mut watcher = create_models_watcher(app.handle().clone())?;
    watcher
        .watch(models_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch models dir: {}", e))?;

    let mut guard = state.models_watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}

fn setup_settings_watcher(
    app: &tauri::App,
    settings_file: &PathBuf,
    app_data_dir: &PathBuf,
    state: &WhisperWatcherState,
) -> Result<(), String> {
    // Ensure the settings file's parent directory exists.
    if let Some(parent) = settings_file.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings dir: {}", e))?;
    }

    // Watch the parent directory because macOS FSEvents doesn't reliably
    // watch individual files that may not exist yet.
    let settings_watch_path = settings_file
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| app_data_dir.clone());

    let mut watcher = create_settings_watcher(app.handle().clone(), settings_file)?;
    watcher
        .watch(&settings_watch_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch settings file: {}", e))?;

    let mut guard = state.settings_watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}
