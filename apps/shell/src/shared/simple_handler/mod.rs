use super::state::{ContentBounds, ShellState};
use cef::rc::Rc;
use cef::*;
use serde_json::json;
use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
mod win;
#[cfg(target_os = "windows")]
use win::{platform_after_created, platform_title_change};

#[cfg(not(target_os = "windows"))]
fn platform_title_change(_browser: Option<&mut Browser>, _title: Option<&CefString>) {}

#[cfg(not(target_os = "windows"))]
fn platform_after_created(_browser: Option<&mut Browser>) {}

pub const IPC_COMMAND_MESSAGE: &str = "pulse-host-command";
pub const APP_RUNTIME_STYLE: RuntimeStyle = RuntimeStyle::ALLOY;
const CMD_ENSURE_TAB: &str = "ensure-tab";
const CMD_ACTIVATE_TAB: &str = "activate-tab";
const CMD_NAVIGATE_TAB: &str = "navigate-tab";
const CMD_NAVIGATE: &str = "navigate";
const CMD_CLOSE_TAB: &str = "close-tab";
const CMD_BROWSER_BACK: &str = "browser-back";
const CMD_BROWSER_FORWARD: &str = "browser-forward";
const CMD_BROWSER_RELOAD: &str = "browser-reload";
const CMD_BROWSER_STOP: &str = "browser-stop";
const CMD_SET_CONTENT_BOUNDS: &str = "set-content-bounds";
const CMD_SET_CONTENT_VISIBLE: &str = "set-content-visible";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrowserRole {
    UiChrome,
    WebContent,
}

pub struct SimpleHandler {
    role: BrowserRole,
    shell_state: Arc<Mutex<ShellState>>,
    trusted_ui_origin: String,
    content_client: Option<Client>,
    browser_list: Vec<Browser>,
}

impl SimpleHandler {
    pub fn new(
        role: BrowserRole,
        shell_state: Arc<Mutex<ShellState>>,
        trusted_ui_origin: String,
        content_client: Option<Client>,
    ) -> Arc<Mutex<Self>> {
        Arc::new(Mutex::new(Self {
            role,
            shell_state,
            trusted_ui_origin,
            content_client,
            browser_list: Vec::new(),
        }))
    }

    fn on_title_change(&mut self, browser: Option<&mut Browser>, title: Option<&CefString>) {
        debug_assert_ne!(currently_on(ThreadId::UI), 0);

        match self.role {
            BrowserRole::UiChrome => {
                platform_title_change(browser, title);
            }
            BrowserRole::WebContent => {
                let Some(browser) = browser else {
                    return;
                };
                let browser_id = browser.identifier();
                let tab_id = {
                    let state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.tab_id_for_browser_id(browser_id)
                };
                let Some(tab_id) = tab_id else {
                    return;
                };

                let title = title.map(CefString::to_string).unwrap_or_default();
                let url = browser
                    .main_frame()
                    .map(|frame| CefString::from(&frame.url()).to_string());

                self.emit_tab_runtime_update(
                    tab_id.as_str(),
                    url.as_deref(),
                    if title.is_empty() {
                        None
                    } else {
                        Some(title.as_str())
                    },
                );
            }
        }
    }

    fn on_address_change(
        &mut self,
        browser: Option<&mut Browser>,
        frame: Option<&mut Frame>,
        url: Option<&CefString>,
    ) {
        debug_assert_ne!(currently_on(ThreadId::UI), 0);

        if self.role != BrowserRole::WebContent {
            return;
        }

        let Some(frame) = frame else {
            return;
        };
        if frame.is_main() == 0 {
            return;
        }

        let Some(browser) = browser else {
            return;
        };

        let browser_id = browser.identifier();
        let tab_id = {
            let state = self.shell_state.lock().expect("Failed to lock shell state");
            state.tab_id_for_browser_id(browser_id)
        };
        let Some(tab_id) = tab_id else {
            return;
        };

        let current_url = if let Some(url) = url {
            let value = url.to_string();
            if value.is_empty() { None } else { Some(value) }
        } else {
            None
        };

        self.emit_tab_runtime_update(tab_id.as_str(), current_url.as_deref(), None);
    }

    fn on_after_created(&mut self, mut browser: Option<&mut Browser>) {
        debug_assert_ne!(currently_on(ThreadId::UI), 0);
        platform_after_created(browser.as_deref_mut());

        let Some(browser) = browser.cloned() else {
            return;
        };

        let browser_id = browser.identifier();
        eprintln!(
            "Pulse browser created: role={:?} id={}",
            self.role, browser_id
        );
        self.browser_list.push(browser);

        if self.role == BrowserRole::UiChrome {
            let mut state = self.shell_state.lock().expect("Failed to lock shell state");
            state.set_ui_browser_id(Some(browser_id));
        }
    }

    fn do_close(&mut self, _browser: Option<&mut Browser>) -> bool {
        debug_assert_ne!(currently_on(ThreadId::UI), 0);
        false
    }

    fn on_before_close(&mut self, browser: Option<&mut Browser>) {
        debug_assert_ne!(currently_on(ThreadId::UI), 0);

        let closing_id = browser.as_deref().map(Browser::identifier);

        if let Some(closing_id) = closing_id {
            self.browser_list
                .retain(|item| item.identifier() != closing_id);

            let mut state = self.shell_state.lock().expect("Failed to lock shell state");
            match self.role {
                BrowserRole::UiChrome if state.ui_browser_id == Some(closing_id) => {
                    state.set_ui_browser_id(None);
                }
                BrowserRole::WebContent => {
                    state.remove_content_tab_by_browser_id(closing_id);
                }
                _ => {}
            }
        }

        if self.role == BrowserRole::UiChrome && self.browser_list.is_empty() {
            quit_message_loop();
        }
    }

    fn on_process_message_received(
        &mut self,
        browser: Option<&mut Browser>,
        frame: Option<&mut Frame>,
        source_process: ProcessId,
        message: Option<&mut ProcessMessage>,
    ) -> i32 {
        debug_assert_ne!(currently_on(ThreadId::UI), 0);

        if self.role != BrowserRole::UiChrome {
            return 0;
        }

        if source_process != ProcessId::RENDERER {
            return 0;
        }

        let Some(message) = message else {
            return 0;
        };

        let message_name = CefString::from(&message.name()).to_string();
        if message_name != IPC_COMMAND_MESSAGE {
            return 0;
        }

        if !self.is_expected_ui_browser(browser) || !self.is_trusted_ui_frame(frame) {
            return 1;
        }

        let Some(args) = message.argument_list() else {
            return 1;
        };

        let Some(command) = list_string_arg(&args, 0) else {
            return 1;
        };

        match command.as_str() {
            CMD_ENSURE_TAB => {
                let Some(tab_id) = list_string_arg(&args, 1) else {
                    return 1;
                };
                let initial_url =
                    list_string_arg(&args, 2).unwrap_or_else(|| String::from("about:blank"));
                eprintln!(
                    "Pulse host cmd ensure-tab: tab_id='{}' initial_url='{}'",
                    tab_id, initial_url
                );
                self.ensure_tab(&tab_id, &initial_url);
            }
            CMD_ACTIVATE_TAB => {
                let Some(tab_id) = list_string_arg(&args, 1) else {
                    return 1;
                };
                eprintln!("Pulse host cmd activate-tab: tab_id='{}'", tab_id);
                let tab_url = {
                    let mut state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.activate_tab(&tab_id);
                    state.set_content_visible(true);
                    state.tab_runtime_url(&tab_id)
                };

                self.emit_tab_runtime_update(tab_id.as_str(), tab_url.as_deref(), None);
            }
            CMD_NAVIGATE_TAB => {
                let Some(tab_id) = list_string_arg(&args, 1) else {
                    return 1;
                };
                let Some(url) = list_string_arg(&args, 2) else {
                    return 1;
                };
                let trimmed = url.trim();
                if !trimmed.is_empty() {
                    eprintln!(
                        "Pulse host cmd navigate-tab: tab_id='{}' url='{}'",
                        tab_id, trimmed
                    );
                    self.ensure_tab(&tab_id, trimmed);
                    let mut state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.activate_tab(&tab_id);
                    state.navigate_tab(&tab_id, trimmed);
                }
            }
            CMD_CLOSE_TAB => {
                let Some(tab_id) = list_string_arg(&args, 1) else {
                    return 1;
                };

                let browser_to_close = {
                    let mut state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.close_tab(&tab_id)
                };

                if let Some(browser) = browser_to_close {
                    if let Some(browser_host) = browser.host() {
                        browser_host.close_browser(1);
                    }
                }
            }
            CMD_BROWSER_BACK => {
                if let Some(tab_id) = list_string_arg(&args, 1) {
                    let state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.browser_back(&tab_id);
                }
            }
            CMD_BROWSER_FORWARD => {
                if let Some(tab_id) = list_string_arg(&args, 1) {
                    let state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.browser_forward(&tab_id);
                }
            }
            CMD_BROWSER_RELOAD => {
                if let Some(tab_id) = list_string_arg(&args, 1) {
                    let state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.browser_reload(&tab_id);
                }
            }
            CMD_BROWSER_STOP => {
                if let Some(tab_id) = list_string_arg(&args, 1) {
                    let state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.browser_stop(&tab_id);
                }
            }
            CMD_NAVIGATE => {
                // Backward compatibility with the previous single-content command shape.
                if let Some(url) = list_string_arg(&args, 1) {
                    let trimmed = url.trim();
                    if !trimmed.is_empty() {
                        let mut state =
                            self.shell_state.lock().expect("Failed to lock shell state");
                        state.navigate_active_tab(trimmed);
                    }
                }
            }
            CMD_SET_CONTENT_BOUNDS => {
                let x = list_i32_arg(&args, 1);
                let y = list_i32_arg(&args, 2);
                let width = list_i32_arg(&args, 3);
                let height = list_i32_arg(&args, 4);

                if let (Some(x), Some(y), Some(width), Some(height)) = (x, y, width, height) {
                    eprintln!(
                        "Pulse host cmd set-content-bounds: x={} y={} width={} height={}",
                        x, y, width, height
                    );
                    let mut state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.set_content_bounds(ContentBounds {
                        x,
                        y,
                        width: width.max(1),
                        height: height.max(1),
                    });
                }
            }
            CMD_SET_CONTENT_VISIBLE => {
                if let Some(visible) = list_bool_arg(&args, 1) {
                    let mut state = self.shell_state.lock().expect("Failed to lock shell state");
                    state.set_content_visible(visible);
                }
            }
            _ => {}
        }

        1
    }

    fn ensure_tab(&mut self, tab_id: &str, initial_url: &str) {
        let tab_id = tab_id.trim();
        if tab_id.is_empty() {
            return;
        }

        {
            let state = self.shell_state.lock().expect("Failed to lock shell state");
            if state.has_tab(tab_id) {
                return;
            }
        }

        let Some(content_client) = self.content_client.clone() else {
            return;
        };

        let normalized_url = if initial_url.trim().is_empty() {
            "about:blank"
        } else {
            initial_url.trim()
        };

        let browser_settings = BrowserSettings::default();
        let url = CefString::from(normalized_url);
        let mut browser_view_delegate = ContentBrowserViewDelegate::new(APP_RUNTIME_STYLE);
        let mut client = Some(content_client);
        let Some(browser_view) = browser_view_create(
            client.as_mut(),
            Some(&url),
            Some(&browser_settings),
            None,
            None,
            Some(&mut browser_view_delegate),
        ) else {
            eprintln!(
                "Failed to create content BrowserView for tab_id='{tab_id}' url='{normalized_url}'"
            );
            return;
        };

        let mut state = self.shell_state.lock().expect("Failed to lock shell state");
        state.register_content_tab(tab_id.to_string(), browser_view);
    }

    fn emit_tab_runtime_update(&self, tab_id: &str, url: Option<&str>, title: Option<&str>) {
        let ui_main_frame = {
            let state = self.shell_state.lock().expect("Failed to lock shell state");
            state
                .ui_browser_view
                .as_ref()
                .and_then(|view| view.browser())
                .and_then(|browser| browser.main_frame())
        };

        let Some(ui_main_frame) = ui_main_frame else {
            return;
        };

        let detail = json!({
            "tabId": tab_id,
            "url": url,
            "title": title,
        });

        let script = format!(
            "(function(){{window.dispatchEvent(new CustomEvent('pulse:tab-runtime-updated',{{detail:{detail}}}));}})();",
            detail = detail
        );

        ui_main_frame.execute_java_script(
            Some(&CefString::from(script.as_str())),
            Some(&CefString::from("pulse://host-events")),
            0,
        );
    }

    fn is_expected_ui_browser(&self, browser: Option<&mut Browser>) -> bool {
        let Some(browser) = browser else {
            return false;
        };

        let browser_id = browser.identifier();
        let state = self.shell_state.lock().expect("Failed to lock shell state");
        state.ui_browser_id == Some(browser_id)
    }

    fn is_trusted_ui_frame(&self, frame: Option<&mut Frame>) -> bool {
        let Some(frame) = frame else {
            return false;
        };

        let frame_url = CefString::from(&frame.url()).to_string();
        is_trusted_ui_url(&frame_url, &self.trusted_ui_origin)
    }
}

fn is_trusted_ui_url(url: &str, trusted_origin: &str) -> bool {
    let prefix = trusted_origin.trim_end_matches('/');
    url == prefix || url.starts_with(&(prefix.to_string() + "/"))
}

fn list_string_arg(args: &ListValue, index: usize) -> Option<String> {
    if index >= args.size() {
        return None;
    }

    Some(CefString::from(&args.string(index)).to_string())
}

fn list_i32_arg(args: &ListValue, index: usize) -> Option<i32> {
    list_string_arg(args, index)?.trim().parse::<i32>().ok()
}

fn list_bool_arg(args: &ListValue, index: usize) -> Option<bool> {
    let value = list_string_arg(args, index)?;
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" => Some(true),
        "0" | "false" => Some(false),
        _ => None,
    }
}

wrap_browser_view_delegate! {
    struct ContentBrowserViewDelegate {
        runtime_style: RuntimeStyle,
    }

    impl ViewDelegate {}

    impl BrowserViewDelegate {
        fn browser_runtime_style(&self) -> RuntimeStyle {
            self.runtime_style
        }
    }
}

wrap_client! {
    pub struct SimpleHandlerClient {
        inner: Arc<Mutex<SimpleHandler>>,
    }

    impl Client {
        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(SimpleHandlerDisplayHandler::new(self.inner.clone()))
        }

        fn life_span_handler(&self) -> Option<LifeSpanHandler> {
            Some(SimpleHandlerLifeSpanHandler::new(self.inner.clone()))
        }

        fn on_process_message_received(
            &self,
            browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            source_process: ProcessId,
            message: Option<&mut ProcessMessage>,
        ) -> i32 {
            let mut inner = self.inner.lock().expect("Failed to lock SimpleHandler");
            inner.on_process_message_received(browser, frame, source_process, message)
        }
    }
}

wrap_display_handler! {
    struct SimpleHandlerDisplayHandler {
        inner: Arc<Mutex<SimpleHandler>>,
    }

    impl DisplayHandler {
        fn on_title_change(&self, browser: Option<&mut Browser>, title: Option<&CefString>) {
            let mut inner = self.inner.lock().expect("Failed to lock SimpleHandler");
            inner.on_title_change(browser, title);
        }

        fn on_address_change(
            &self,
            browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            url: Option<&CefString>,
        ) {
            let mut inner = self.inner.lock().expect("Failed to lock SimpleHandler");
            inner.on_address_change(browser, frame, url);
        }
    }
}

wrap_life_span_handler! {
    struct SimpleHandlerLifeSpanHandler {
        inner: Arc<Mutex<SimpleHandler>>,
    }

    impl LifeSpanHandler {
        fn on_after_created(&self, browser: Option<&mut Browser>) {
            let mut inner = self.inner.lock().expect("Failed to lock SimpleHandler");
            inner.on_after_created(browser);
        }

        fn do_close(&self, browser: Option<&mut Browser>) -> i32 {
            let mut inner = self.inner.lock().expect("Failed to lock SimpleHandler");
            inner.do_close(browser).into()
        }

        fn on_before_close(&self, browser: Option<&mut Browser>) {
            let mut inner = self.inner.lock().expect("Failed to lock SimpleHandler");
            inner.on_before_close(browser);
        }
    }
}
