use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// The directory the app reads projects from, or why there is none.
struct Root(Result<PathBuf, String>);

/// `DRIVER_ROOT` if set, else `$HOME/.driver`, canonicalized so watcher paths match it.
/// `DRIVER_ROOT` must be absolute, like the MCP server requires; `~` is not expanded.
fn resolve_root(home: PathBuf) -> Result<PathBuf, String> {
    let root = match std::env::var_os("DRIVER_ROOT").map(PathBuf::from) {
        Some(dir) if !dir.is_absolute() => {
            return Err(format!(
                "DRIVER_ROOT must be an absolute path, got {}",
                dir.display()
            ))
        }
        Some(dir) => dir,
        None => home.join(".driver"),
    };
    Ok(std::fs::canonicalize(&root).unwrap_or(root))
}

/// Returns the root directory to the frontend, which cannot read environment variables.
#[tauri::command]
fn root(root: tauri::State<'_, Root>) -> Result<String, String> {
    root.0
        .as_ref()
        .map(|dir| dir.to_string_lossy().into_owned())
        .map_err(Clone::clone)
}

/// Builds and runs the app.
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .setup(|app| {
            let root = resolve_root(app.path().home_dir()?);
            match &root {
                Ok(dir) => {
                    app.fs_scope().allow_directory(dir, true)?;
                    eprintln!("driver: reading projects from {}", dir.display());
                }
                Err(message) => eprintln!("driver: {message}"),
            }
            app.manage(Root(root));

            #[cfg(feature = "e2e")]
            app.add_capability(include_str!("../capabilities-e2e/webdriver.json"))?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![root])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
