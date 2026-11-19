use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// The directory the app reads projects from: `DRIVER_ROOT` if set, else `$HOME/.driver`.
struct Root(PathBuf);

/// Returns the root directory to the frontend, which cannot read environment variables.
#[tauri::command]
fn root(root: tauri::State<'_, Root>) -> String {
    root.0.to_string_lossy().into_owned()
}

/// Builds and runs the app.
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_fs::init());

    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .setup(|app| {
            let root = match std::env::var_os("DRIVER_ROOT") {
                Some(dir) => {
                    let dir = PathBuf::from(dir);
                    app.fs_scope().allow_directory(&dir, true)?;
                    dir
                }
                None => app.path().home_dir()?.join(".driver"),
            };
            eprintln!("driver: reading projects from {}", root.display());
            app.manage(Root(root));

            #[cfg(feature = "e2e")]
            app.add_capability(include_str!("../capabilities-e2e/webdriver.json"))?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![root])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
