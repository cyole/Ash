use tauri::{
    window::{Color, Effect, EffectState, EffectsBuilder},
    AppHandle, Manager,
};

#[tauri::command]
pub fn window_translucency_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    if enabled {
        window
            .set_background_color(Some(Color(0, 0, 0, 0)))
            .map_err(|error| error.to_string())?;
        window
            .set_effects(Some(
                EffectsBuilder::new()
                    .effects([Effect::Sidebar, Effect::Mica, Effect::Acrylic])
                    .state(EffectState::Active)
                    .build(),
            ))
            .map_err(|error| error.to_string())?;
    } else {
        window
            .set_effects(None::<tauri::utils::config::WindowEffectsConfig>)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}
