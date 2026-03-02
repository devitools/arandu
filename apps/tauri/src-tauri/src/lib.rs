use comrak::{markdown_to_html, Options};
use notify::{Event, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_cli::CliExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod acp;
#[cfg(target_os = "macos")]
mod cli_installer;
mod comments;
mod history;
mod plan_file;
mod sessions;
mod ipc_common;
#[cfg(unix)]
mod ipc;
mod tcp_ipc;
mod tray;
mod whisper;

#[derive(Debug, Serialize, Clone)]
pub struct Heading {
    level: u8,
    text: String,
    index: usize,
}

#[derive(Debug, Serialize, Clone)]
struct CliStatus {
    installed: bool,
    dismissed: bool,
}

#[derive(Debug, Serialize, Clone)]
struct InstallResult {
    success: bool,
    path: String,
    error: String,
}

#[tauri::command]
fn render_markdown(content: String) -> String {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    markdown_to_html(&content, &options)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    eprintln!("[DEBUG] read_file called with path: {:?}", path);

    // Try to canonicalize the path to handle relative paths correctly
    let resolved_path = match std::fs::canonicalize(&path) {
        Ok(p) => {
            eprintln!("[DEBUG] Canonicalized to: {:?}", p);
            p
        }
        Err(e) => {
            eprintln!("[DEBUG] Canonicalize failed ({}), trying as-is", e);
            PathBuf::from(&path)
        }
    };

    std::fs::read_to_string(&resolved_path)
        .map_err(|e| format!("Failed to read {}: {}", resolved_path.display(), e))
}

#[tauri::command]
fn extract_headings(markdown: String) -> Vec<Heading> {
    let mut headings = Vec::new();
    let mut index = 0;
    let mut in_code_block = false;

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block {
            continue;
        }
        let level = trimmed.chars().take_while(|&c| c == '#').count();
        if level >= 1 && level <= 4 && trimmed.len() > level {
            let text = trimmed[level..].trim().to_string();
            if !text.is_empty() {
                headings.push(Heading {
                    level: level as u8,
                    text,
                    index,
                });
                index += 1;
            }
        }
    }
    headings
}

struct WatcherState {
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    watched_paths: Mutex<HashSet<PathBuf>>,
}

struct InitialFile(Mutex<Option<String>>);

pub struct ExplicitQuit(pub Arc<AtomicBool>);
pub struct IsRecording(pub Arc<AtomicBool>);
pub struct RecordingMode(pub Mutex<Option<String>>);

fn create_file_watcher(app: tauri::AppHandle) -> Result<notify::RecommendedWatcher, String> {
    notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if event.kind.is_modify() {
                if let Some(path) = event.paths.first() {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = app.emit("file-changed", path_str);
                }
            }
        }
    })
    .map_err(|e| format!("Erro ao criar watcher: {}", e))
}

#[tauri::command]
fn watch_file(path: String, app: tauri::AppHandle, state: tauri::State<WatcherState>) -> Result<(), String> {
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Erro ao canonicalizar: {}", e))?;

    let mut watched = state.watched_paths.lock().map_err(|e| e.to_string())?;

    if watched.contains(&canonical) {
        return Ok(());
    }

    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;

    if guard.is_none() {
        *guard = Some(create_file_watcher(app.clone())?);
    }

    guard.as_mut()
        .unwrap()
        .watch(&canonical, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Erro ao observar arquivo: {}", e))?;

    watched.insert(canonical);
    Ok(())
}

#[tauri::command]
fn unwatch_file(path: String, state: tauri::State<WatcherState>) -> Result<(), String> {
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Arquivo não encontrado: {}", e))?;

    let mut watched = state.watched_paths.lock().map_err(|e| e.to_string())?;

    if let Ok(mut guard) = state.watcher.lock() {
        if let Some(w) = guard.as_mut() {
            let _ = w.unwatch(&canonical);
        }
    }

    watched.remove(&canonical);
    Ok(())
}

#[tauri::command]
fn get_initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut guard| guard.take())
}

#[tauri::command]
fn get_home_dir() -> Option<String> {
    std::env::var("HOME").ok().or_else(|| std::env::var("USERPROFILE").ok())
}

#[tauri::command]
fn check_cli_status(app: tauri::AppHandle) -> CliStatus {
    #[cfg(target_os = "macos")]
    {
        let app_data_dir = app.path().app_data_dir().unwrap_or_default();
        CliStatus {
            installed: cli_installer::is_cli_installed(),
            dismissed: cli_installer::has_been_dismissed(&app_data_dir),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        CliStatus {
            installed: true,
            dismissed: true,
        }
    }
}

#[tauri::command]
fn install_cli() -> InstallResult {
    #[cfg(target_os = "macos")]
    {
        let r = cli_installer::install();
        InstallResult {
            success: r.success,
            path: r.path,
            error: r.error,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        InstallResult {
            success: true,
            path: String::new(),
            error: String::new(),
        }
    }
}

#[tauri::command]
fn dismiss_cli_prompt(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let app_data_dir = app.path().app_data_dir().unwrap_or_default();
        cli_installer::set_dismissed(&app_data_dir);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
}

#[tauri::command]
fn get_cli_suggested_paths() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        cli_installer::get_suggested_paths()
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

#[tauri::command]
fn install_cli_to_path(path: String) -> InstallResult {
    #[cfg(target_os = "macos")]
    {
        let dest_dir = std::path::Path::new(&path);
        let r = cli_installer::install_to_dir(dest_dir);
        InstallResult {
            success: r.success,
            path: r.path,
            error: r.error,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        InstallResult {
            success: false,
            path: String::new(),
            error: "CLI installer is only supported on macOS".to_string(),
        }
    }
}

#[tauri::command]
fn load_comments(
    markdown_path: String,
    db: tauri::State<comments::CommentsDb>,
) -> Result<comments::CommentsData, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let data = comments::load_comments(&conn, &markdown_path)?;
    if data.comments.is_empty() && data.file_hash.is_empty() {
        if comments::migrate_json_file(&conn, &markdown_path)? {
            return comments::load_comments(&conn, &markdown_path);
        }
    }
    Ok(data)
}

#[tauri::command]
fn save_comments(
    markdown_path: String,
    comments_data: comments::CommentsData,
    db: tauri::State<comments::CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    comments::save_comments(&conn, &markdown_path, &comments_data)
}

#[tauri::command]
fn count_unresolved_comments(
    file_paths: Vec<String>,
    db: tauri::State<comments::CommentsDb>,
) -> Result<Vec<(String, i64)>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    comments::count_unresolved_batch(&conn, &file_paths)
}

#[tauri::command]
fn hash_file(path: String) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    let content = std::fs::read(&path)
        .map_err(|e| format!("Read error: {}", e))?;
    let hash = Sha256::digest(&content);
    Ok(format!("{:x}", hash))
}

#[tauri::command]
fn show_whisper_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("whisper") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_whisper_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("whisper") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn write_clipboard(text: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))
}

pub fn handle_recording_cancel(handle: &tauri::AppHandle) {
    let is_recording = handle.state::<IsRecording>();
    if !is_recording.0.load(Ordering::Relaxed) {
        return;
    }

    is_recording.0.store(false, Ordering::Relaxed);
    let recorder_state = handle.state::<whisper::commands::RecorderState>();
    if let Ok(mut guard) = recorder_state.0.lock() {
        *guard = None;
    }

    let _ = handle.emit("recording-cancelled", ());

    if let Some(window) = handle.get_webview_window("whisper") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn show_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_menu_labels(
    app: tauri::AppHandle,
    settings: String,
    install_cli: String,
    file_menu: String,
    open_file: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return rebuild_macos_menu(&app, &settings, &install_cli, &file_menu, &open_file)
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, settings, install_cli, file_menu, open_file);
        Ok(())
    }
}

#[tauri::command]
fn update_tray_labels(
    app: tauri::AppHandle,
    show: String,
    record: String,
    settings: String,
    quit: String,
) -> Result<(), String> {
    tray::update_labels(&app, show, record, settings, quit)
}

pub fn handle_recording_toggle(handle: &tauri::AppHandle) {
    let is_recording = handle.state::<IsRecording>();
    let currently_recording = is_recording.0.load(Ordering::Relaxed);

    if currently_recording {
        let _ = handle.emit("stop-recording", ());
    } else {
        if let Ok(mut guard) = handle.state::<RecordingMode>().0.lock() {
            *guard = Some("shortcut".to_string());
        }

        if let Some(window) = handle.get_webview_window("whisper") {
            let _ = window.show();
        }

        let _ = handle.emit("start-recording-shortcut", ());

        let recorder_state = handle.state::<whisper::commands::RecorderState>();
        if let Err(e) = whisper::commands::start_recording(recorder_state, handle.clone()) {
            eprintln!("Failed to start recording: {}", e);
            let _ = handle.emit("recording-error", e);
        }
    }
}

#[cfg(target_os = "macos")]
fn rebuild_macos_menu(
    app: &tauri::AppHandle,
    settings: &str,
    install_cli: &str,
    file_menu: &str,
    open_file: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let settings_item = MenuItemBuilder::with_id("settings", settings)
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let install_cli_item = MenuItemBuilder::with_id("install-cli", install_cli)
        .build(app)?;
    let open_file_item = MenuItemBuilder::with_id("open-file", open_file)
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let app_submenu = SubmenuBuilder::new(app, "Arandu")
        .about(None)
        .separator()
        .item(&settings_item)
        .item(&install_cli_item)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, file_menu)
        .item(&open_file_item)
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&window_submenu)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn setup_macos_menu(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    rebuild_macos_menu(
        app.handle(),
        "Configurações\u{2026}",
        "Instalar Ferramenta de Linha de Comando\u{2026}",
        "Arquivo",
        "Abrir\u{2026}",
    )?;

    let app_handle = app.handle().clone();
    app.on_menu_event(move |_app, event| {
        match event.id().as_ref() {
            "settings" => {
                if let Some(window) = app_handle.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "install-cli" => {
                let _ = app_handle.emit("menu-install-cli", ());
            }
            "open-file" => {
                let _ = app_handle.emit("menu-open-file", ());
            }
            _ => {}
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["whisper", "settings"])
                .build()
        )
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            eprintln!("[DEBUG] Second instance detected: {:?}", args);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            if args.len() > 1 {
                let file_path = &args[1];
                eprintln!("[DEBUG] Processing file argument: {:?}", file_path);
                if !file_path.is_empty() && !file_path.starts_with('-') {
                    let abs_path = std::fs::canonicalize(file_path).unwrap_or_else(|e| {
                        eprintln!("[DEBUG] Canonicalize failed ({}), using as-is", e);
                        PathBuf::from(file_path)
                    });
                    let path_str = abs_path.to_string_lossy().to_string();
                    eprintln!("[DEBUG] Emitting open-file with: {:?}", path_str);
                    let _ = app.emit("open-file", &path_str);
                }
            }
        }))
        .manage(WatcherState {
            watcher: Mutex::new(None),
            watched_paths: Mutex::new(HashSet::new()),
        })
        .manage(InitialFile(Mutex::new(None)))
        .manage(ExplicitQuit(Arc::new(AtomicBool::new(false))))
        .manage(IsRecording(Arc::new(AtomicBool::new(false))))
        .manage(RecordingMode(Mutex::new(None)))
        .manage(whisper::commands::RecorderState(Mutex::new(None)))
        .manage(whisper::commands::TranscriberState(Mutex::new(None)))
        .manage(acp::commands::AcpState::default())
        .manage(whisper::watcher::WhisperWatcherState {
            models_watcher: Mutex::new(None),
            settings_watcher: Mutex::new(None),
        });

    #[cfg(unix)]
    let builder = builder.manage(ipc::SocketState(Mutex::new(None)));

    let builder = builder.manage(tcp_ipc::TcpSocketState(Mutex::new(None)));

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            setup_macos_menu(app)?;

            if let Some(main_window) = app.get_webview_window("main") {
                let w = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        use tauri_plugin_window_state::AppHandleExt;
                        let _ = w.app_handle().save_window_state(tauri_plugin_window_state::StateFlags::all());
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            tray::setup(app)?;

            #[cfg(unix)]
            {
                if let Err(e) = ipc::setup(app) {
                    eprintln!("Failed to setup IPC socket: {}", e);
                }
            }

            // TCP IPC setup (works on all platforms, including from containers)
            if let Err(e) = tcp_ipc::setup(app) {
                eprintln!("Failed to setup TCP IPC: {}", e);
            }

            let app_data = app.path().app_data_dir()
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let conn = comments::init_db(&app_data)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            sessions::init_sessions_table(&conn)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(comments::CommentsDb(Mutex::new(conn)));

            let shortcut_str = if let Ok(app_data_dir) = app.path().app_data_dir() {
                let settings = whisper::model_manager::load_settings(&app_data_dir);
                settings.shortcut
            } else {
                whisper::model_manager::DEFAULT_SHORTCUT.to_string()
            };

            let handle = app.handle().clone();

            let register = app.global_shortcut().on_shortcut(shortcut_str.as_str(), move |_app, _shortcut, event| {
                if let ShortcutState::Pressed = event.state {
                    handle_recording_toggle(&handle);
                }
            });

            if let Err(e) = register {
                eprintln!("Invalid shortcut '{}': {e}. Falling back to default.", shortcut_str);
                let handle = app.handle().clone();
                if let Err(e) = app.global_shortcut().on_shortcut(whisper::model_manager::DEFAULT_SHORTCUT, move |_app, _shortcut, event| {
                    if let ShortcutState::Pressed = event.state {
                        handle_recording_toggle(&handle);
                    }
                }) {
                    eprintln!("Failed to register default shortcut: {e}");
                }
            }

            let cancel_shortcut_str = if let Ok(dir) = app.path().app_data_dir() {
                let s = whisper::model_manager::load_settings(&dir);
                s.cancel_shortcut
            } else {
                whisper::model_manager::DEFAULT_CANCEL_SHORTCUT.to_string()
            };

            let cancel_handle = app.handle().clone();
            if let Err(e) = app.global_shortcut().on_shortcut(cancel_shortcut_str.as_str(), move |_app, _shortcut, event| {
                if let ShortcutState::Pressed = event.state {
                    handle_recording_cancel(&cancel_handle);
                }
            }) {
                eprintln!("Failed to register cancel shortcut '{}': {e}", cancel_shortcut_str);
            }

            // Auto-load saved whisper model
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let settings = whisper::model_manager::load_settings(&app_data_dir);
                if let Some(model_id) = &settings.active_model {
                    if let Some(path) = whisper::model_manager::model_path(&app_data_dir, model_id) {
                        if path.exists() {
                            if let Ok(transcriber) = whisper::transcriber::WhisperTranscriber::new(&path.to_string_lossy()) {
                                let state = app.state::<whisper::commands::TranscriberState>();
                                let mut guard = state.0.lock().unwrap();
                                *guard = Some(transcriber);
                            }
                        }
                    }
                }
            }

            // Initialize whisper file watchers (models dir + settings file)
            if let Err(e) = whisper::watcher::init(app) {
                eprintln!("Failed to setup whisper file watchers: {}", e);
            }

            let matches = app.cli().matches().ok();
            if let Some(matches) = matches {
                if let Some(arg) = matches.args.get("file") {
                    if let serde_json::Value::String(path) = &arg.value {
                        eprintln!("[DEBUG] CLI argument received: {:?}", path);
                        if !path.is_empty() {
                            let abs = std::fs::canonicalize(path).unwrap_or_else(|e| {
                                eprintln!("[DEBUG] Canonicalize failed ({}), using as-is", e);
                                PathBuf::from(path)
                            });
                            eprintln!("[DEBUG] Setting initial file to: {:?}", abs);
                            let initial = app.state::<InitialFile>();
                            if let Ok(mut guard) = initial.0.lock() {
                                *guard = Some(abs.to_string_lossy().into());
                            };
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            render_markdown,
            read_file,
            extract_headings,
            watch_file,
            unwatch_file,
            get_initial_file,
            get_home_dir,
            check_cli_status,
            install_cli,
            dismiss_cli_prompt,
            get_cli_suggested_paths,
            install_cli_to_path,
            load_comments,
            save_comments,
            count_unresolved_comments,
            hash_file,
            history::load_history,
            history::save_history,
            history::add_to_history,
            history::remove_from_history,
            history::clear_history,
            show_whisper_window,
            hide_whisper_window,
            show_settings_window,
            update_tray_labels,
            update_menu_labels,
            write_clipboard,
            whisper::commands::is_currently_recording,
            whisper::commands::start_recording,
            whisper::commands::start_recording_button_mode,
            whisper::commands::start_recording_field_mode,
            whisper::commands::get_recording_mode,
            whisper::commands::cancel_recording,
            whisper::commands::stop_and_transcribe,
            whisper::commands::load_whisper_model,
            whisper::commands::is_model_loaded,
            whisper::commands::list_models,
            whisper::commands::download_model,
            whisper::commands::delete_model,
            whisper::commands::get_whisper_settings,
            whisper::commands::set_whisper_settings,
            whisper::commands::set_active_model,
            whisper::commands::set_shortcut,
            whisper::commands::set_cancel_shortcut,
            whisper::commands::check_audio_permissions,
            whisper::commands::list_audio_devices,
            whisper::commands::set_audio_device,
            acp::commands::acp_connect,
            acp::commands::acp_disconnect,
            acp::commands::acp_new_session,
            acp::commands::acp_list_sessions,
            acp::commands::acp_load_session,
            acp::commands::acp_send_prompt,
            acp::commands::acp_set_mode,
            acp::commands::acp_cancel,
            sessions::session_list,
            sessions::session_create,
            sessions::session_get,
            sessions::session_update_acp_id,
            sessions::session_update_plan,
            sessions::session_update_plan_file_path,
            sessions::session_update_phase,
            sessions::session_delete,
            plan_file::plan_write,
            plan_file::plan_read,
            plan_file::plan_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                let quit_flag = app_handle.state::<ExplicitQuit>();
                if quit_flag.0.load(Ordering::Relaxed) {
                    #[cfg(unix)]
                    {
                        let socket_state = app_handle.state::<ipc::SocketState>();
                        ipc::cleanup(socket_state);
                    }
                    {
                        let tcp_socket_state = app_handle.state::<tcp_ipc::TcpSocketState>();
                        tcp_ipc::cleanup(tcp_socket_state);
                    }
                    {
                        let acp_state = app_handle.state::<acp::commands::AcpState>();
                        tauri::async_runtime::block_on(acp::commands::disconnect_all(&acp_state));
                    }
                    return;
                }
                api.prevent_exit();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }

            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        eprintln!("[DEBUG] Opened event received with path: {:?}", path);
                        // Canonicalize to ensure absolute path
                        let abs_path = std::fs::canonicalize(&path).unwrap_or_else(|e| {
                            eprintln!("[DEBUG] Canonicalize failed ({}), using as-is", e);
                            path
                        });
                        let path_str = abs_path.to_string_lossy().to_string();
                        eprintln!("[DEBUG] Emitting open-file with: {:?}", path_str);
                        let initial = app_handle.state::<InitialFile>();
                        if let Ok(mut guard) = initial.0.lock() {
                            *guard = Some(path_str.clone());
                        }
                        let _ = app_handle.emit("open-file", &path_str);
                    }
                }
            }
        });
}
