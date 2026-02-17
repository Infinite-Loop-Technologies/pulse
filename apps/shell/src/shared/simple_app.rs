use cef::rc::Rc;
use cef::*;
use std::cell::RefCell;
use std::sync::{Arc, Mutex};

use super::persistence;
use super::simple_handler::*;
use super::state::ShellState;

const DEFAULT_UI_URL: &str = "http://localhost:5173";

pub fn ui_url() -> String {
    std::env::var("PULSE_UI_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| String::from(DEFAULT_UI_URL))
}

pub fn trusted_ui_origin_prefix() -> String {
    let raw = ui_url();
    let trimmed = raw.trim_end_matches('/');
    trimmed.to_string()
}

fn rect_copy(rect: &Rect) -> Rect {
    Rect {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    }
}

fn ipc_command_message_name() -> CefString {
    CefString::from(IPC_COMMAND_MESSAGE)
}

fn is_trusted_ui_url(url: &str, trusted_origin: &str) -> bool {
    let prefix = trusted_origin.trim_end_matches('/');
    url == prefix || url.starts_with(&(prefix.to_string() + "/"))
}

fn current_context_frame() -> Option<Frame> {
    let context = v8_context_get_current_context()?;
    context.frame()
}

fn is_trusted_ui_context() -> bool {
    let Some(frame) = current_context_frame() else {
        return false;
    };
    let frame_url = CefString::from(&frame.url()).to_string();
    is_trusted_ui_url(&frame_url, &trusted_ui_origin_prefix())
}

fn v8_value_to_command_arg(value: &V8Value) -> Option<String> {
    if value.is_string() != 0 {
        return Some(CefString::from(&value.string_value()).to_string());
    }
    if value.is_int() != 0 {
        return Some(value.int_value().to_string());
    }
    if value.is_uint() != 0 {
        return Some(value.uint_value().to_string());
    }
    if value.is_double() != 0 {
        return Some(value.double_value().to_string());
    }
    if value.is_bool() != 0 {
        return Some((value.bool_value() != 0).to_string());
    }

    None
}

wrap_v8_handler! {
    struct PulseHostV8Handler;

    impl V8Handler {
        fn execute(
            &self,
            _name: Option<&CefString>,
            _object: Option<&mut V8Value>,
            arguments: Option<&[Option<V8Value>]>,
            retval: Option<&mut Option<V8Value>>,
            exception: Option<&mut CefString>,
        ) -> i32 {
            if !is_trusted_ui_context() {
                if let Some(exception) = exception {
                    *exception = CefString::from(
                        "pulseHost.send is only available from the trusted Pulse UI origin",
                    );
                }
                return 0;
            }

            let Some(arguments) = arguments else {
                if let Some(exception) = exception {
                    *exception = CefString::from("pulseHost.send requires arguments");
                }
                return 0;
            };

            if arguments.is_empty() {
                if let Some(exception) = exception {
                    *exception = CefString::from("pulseHost.send requires a command argument");
                }
                return 0;
            }

            let mut encoded_args = Vec::with_capacity(arguments.len());
            for argument in arguments {
                let Some(argument) = argument.as_ref() else {
                    encoded_args.push(String::new());
                    continue;
                };

                let Some(value) = v8_value_to_command_arg(argument) else {
                    if let Some(exception) = exception {
                        *exception = CefString::from("Unsupported pulseHost.send argument type");
                    }
                    return 0;
                };
                encoded_args.push(value);
            }

            let Some(mut message) = process_message_create(Some(&ipc_command_message_name())) else {
                if let Some(exception) = exception {
                    *exception = CefString::from("Failed to create CEF process message");
                }
                return 0;
            };
            let Some(argument_list) = message.argument_list() else {
                if let Some(exception) = exception {
                    *exception = CefString::from("Failed to access CEF process message args");
                }
                return 0;
            };

            argument_list.set_size(encoded_args.len());
            for (index, value) in encoded_args.iter().enumerate() {
                argument_list.set_string(index, Some(&CefString::from(value.as_str())));
            }

            let Some(context) = v8_context_get_current_context() else {
                if let Some(exception) = exception {
                    *exception = CefString::from("No current V8 context");
                }
                return 0;
            };
            let Some(frame) = context.frame() else {
                if let Some(exception) = exception {
                    *exception = CefString::from("No current frame for V8 context");
                }
                return 0;
            };

            frame.send_process_message(ProcessId::BROWSER, Some(&mut message));

            if let Some(retval) = retval {
                *retval = v8_value_create_bool(1);
            }
            1
        }
    }
}

wrap_v8_handler! {
    struct PulseHostLoadStateV8Handler;

    impl V8Handler {
        fn execute(
            &self,
            _name: Option<&CefString>,
            _object: Option<&mut V8Value>,
            _arguments: Option<&[Option<V8Value>]>,
            retval: Option<&mut Option<V8Value>>,
            exception: Option<&mut CefString>,
        ) -> i32 {
            if !is_trusted_ui_context() {
                if let Some(exception) = exception {
                    *exception = CefString::from(
                        "pulseHost.loadState is only available from the trusted Pulse UI origin",
                    );
                }
                return 0;
            }

            let loaded_state = match persistence::load_ui_state_json() {
                Ok(value) => value,
                Err(error) => {
                    eprintln!("Pulse persistence warning: failed to load UI state: {error}");
                    None
                }
            };

            if let Some(retval) = retval {
                *retval = if let Some(json) = loaded_state {
                    let json = CefString::from(json.as_str());
                    v8_value_create_string(Some(&json))
                } else {
                    v8_value_create_null()
                };
            }

            1
        }
    }
}

wrap_v8_handler! {
    struct PulseHostSaveStateV8Handler;

    impl V8Handler {
        fn execute(
            &self,
            _name: Option<&CefString>,
            _object: Option<&mut V8Value>,
            arguments: Option<&[Option<V8Value>]>,
            retval: Option<&mut Option<V8Value>>,
            exception: Option<&mut CefString>,
        ) -> i32 {
            if !is_trusted_ui_context() {
                if let Some(exception) = exception {
                    *exception = CefString::from(
                        "pulseHost.saveState is only available from the trusted Pulse UI origin",
                    );
                }
                return 0;
            }

            let Some(arguments) = arguments else {
                if let Some(exception) = exception {
                    *exception = CefString::from("pulseHost.saveState requires one JSON argument");
                }
                return 0;
            };
            if arguments.is_empty() {
                if let Some(exception) = exception {
                    *exception = CefString::from("pulseHost.saveState requires one JSON argument");
                }
                return 0;
            }

            let Some(payload) = arguments[0].as_ref() else {
                if let Some(exception) = exception {
                    *exception = CefString::from("pulseHost.saveState requires a JSON string payload");
                }
                return 0;
            };
            if payload.is_string() == 0 {
                if let Some(exception) = exception {
                    *exception = CefString::from("pulseHost.saveState payload must be a JSON string");
                }
                return 0;
            }

            let payload_json = CefString::from(&payload.string_value()).to_string();
            let saved = match persistence::save_ui_state_json(payload_json.as_str()) {
                Ok(_) => true,
                Err(error) => {
                    eprintln!("Pulse persistence warning: failed to save UI state: {error}");
                    false
                }
            };

            if let Some(retval) = retval {
                *retval = v8_value_create_bool(if saved { 1 } else { 0 });
            }

            1
        }
    }
}

wrap_render_process_handler! {
    struct PulseRenderProcessHandler;

    impl RenderProcessHandler {
        fn on_context_created(
            &self,
            _browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            context: Option<&mut V8Context>,
        ) {
            let Some(frame) = frame else {
                return;
            };
            if frame.is_main() == 0 {
                return;
            }

            let Some(context) = context else {
                return;
            };
            let Some(global) = context.global() else {
                return;
            };

            let Some(pulse_host_object) = v8_value_create_object(None, None) else {
                return;
            };

            let mut host_send_handler = PulseHostV8Handler::new();
            let Some(mut send_fn) = v8_value_create_function(
                Some(&CefString::from("send")),
                Some(&mut host_send_handler),
            ) else {
                return;
            };

            let mut host_load_state_handler = PulseHostLoadStateV8Handler::new();
            let Some(mut load_state_fn) = v8_value_create_function(
                Some(&CefString::from("loadState")),
                Some(&mut host_load_state_handler),
            ) else {
                return;
            };

            let mut host_save_state_handler = PulseHostSaveStateV8Handler::new();
            let Some(mut save_state_fn) = v8_value_create_function(
                Some(&CefString::from("saveState")),
                Some(&mut host_save_state_handler),
            ) else {
                return;
            };

            pulse_host_object.set_value_bykey(
                Some(&CefString::from("send")),
                Some(&mut send_fn),
                V8Propertyattribute::default(),
            );
            pulse_host_object.set_value_bykey(
                Some(&CefString::from("loadState")),
                Some(&mut load_state_fn),
                V8Propertyattribute::default(),
            );
            pulse_host_object.set_value_bykey(
                Some(&CefString::from("saveState")),
                Some(&mut save_state_fn),
                V8Propertyattribute::default(),
            );
            let mut pulse_host_value = pulse_host_object;
            global.set_value_bykey(
                Some(&CefString::from("__pulseHost")),
                Some(&mut pulse_host_value),
                V8Propertyattribute::default(),
            );
        }
    }
}

wrap_window_delegate! {
    struct SimpleWindowDelegate {
        ui_browser_view: RefCell<Option<BrowserView>>,
        shell_state: Arc<Mutex<ShellState>>,
        runtime_style: RuntimeStyle,
        initial_show_state: ShowState,
    }

    impl ViewDelegate {
        fn preferred_size(&self, _view: Option<&mut View>) -> Size {
            Size {
                width: 1440,
                height: 900,
            }
        }
    }

    impl PanelDelegate {}

    impl WindowDelegate {
        fn on_window_created(&self, window: Option<&mut Window>) {
            let Some(window) = window else {
                return;
            };

            let ui_browser_view = self.ui_browser_view.borrow().clone();
            let Some(ui_browser_view) = ui_browser_view else {
                return;
            };

            let mut ui_view = View::from(&ui_browser_view);
            window.add_child_view(Some(&mut ui_view));

            {
                let mut state = self
                    .shell_state
                    .lock()
                    .expect("Failed to lock shell state");
                state.set_ui_view(self.ui_browser_view.borrow().as_ref().cloned());
                state.set_window(Some(window.clone()));

                let bounds = window.bounds();
                let bounds = if bounds.width <= 0 || bounds.height <= 0 {
                    Rect {
                        x: 0,
                        y: 0,
                        width: 1440,
                        height: 900,
                    }
                } else {
                    rect_copy(&bounds)
                };
                state.set_window_bounds(bounds);
            }

            if self.initial_show_state != ShowState::HIDDEN {
                window.show();
            }
        }

        fn on_window_bounds_changed(&self, _window: Option<&mut Window>, new_bounds: Option<&Rect>) {
            let Some(new_bounds) = new_bounds else {
                return;
            };

            let mut state = self
                .shell_state
                .lock()
                .expect("Failed to lock shell state");
            state.set_window_bounds(rect_copy(new_bounds));
        }

        fn on_window_destroyed(&self, _window: Option<&mut Window>) {
            let mut ui_browser_view = self.ui_browser_view.borrow_mut();
            *ui_browser_view = None;

            let mut state = self
                .shell_state
                .lock()
                .expect("Failed to lock shell state");
            state.set_ui_view(None);
            state.set_window(None);
            state.clear_content_tabs();
        }

        fn can_close(&self, _window: Option<&mut Window>) -> i32 {
            1
        }

        fn initial_show_state(&self, _window: Option<&mut Window>) -> ShowState {
            self.initial_show_state
        }

        fn window_runtime_style(&self) -> RuntimeStyle {
            self.runtime_style
        }
    }
}

wrap_browser_view_delegate! {
    struct SimpleBrowserViewDelegate {
        runtime_style: RuntimeStyle,
    }

    impl ViewDelegate {}

    impl BrowserViewDelegate {
        fn on_popup_browser_view_created(
            &self,
            _browser_view: Option<&mut BrowserView>,
            popup_browser_view: Option<&mut BrowserView>,
            _is_devtools: i32,
        ) -> i32 {
            let mut window_delegate = SimplePopupWindowDelegate::new(
                RefCell::new(popup_browser_view.cloned()),
                self.runtime_style,
                ShowState::NORMAL,
            );
            window_create_top_level(Some(&mut window_delegate));
            1
        }

        fn browser_runtime_style(&self) -> RuntimeStyle {
            self.runtime_style
        }
    }
}

wrap_window_delegate! {
    struct SimplePopupWindowDelegate {
        browser_view: RefCell<Option<BrowserView>>,
        runtime_style: RuntimeStyle,
        initial_show_state: ShowState,
    }

    impl ViewDelegate {
        fn preferred_size(&self, _view: Option<&mut View>) -> Size {
            Size {
                width: 1280,
                height: 820,
            }
        }
    }

    impl PanelDelegate {}

    impl WindowDelegate {
        fn on_window_created(&self, window: Option<&mut Window>) {
            let browser_view = self.browser_view.borrow();
            let (Some(window), Some(browser_view)) = (window, browser_view.as_ref()) else {
                return;
            };
            let mut view = View::from(browser_view);
            window.add_child_view(Some(&mut view));

            if self.initial_show_state != ShowState::HIDDEN {
                window.show();
            }
        }

        fn on_window_destroyed(&self, _window: Option<&mut Window>) {
            let mut browser_view = self.browser_view.borrow_mut();
            *browser_view = None;
        }

        fn can_close(&self, _window: Option<&mut Window>) -> i32 {
            let browser_view = self.browser_view.borrow();
            let Some(browser_view) = browser_view.as_ref() else {
                return 1;
            };

            if let Some(browser) = browser_view.browser() {
                let browser_host = browser.host().expect("BrowserHost is None");
                browser_host.try_close_browser()
            } else {
                1
            }
        }

        fn initial_show_state(&self, _window: Option<&mut Window>) -> ShowState {
            self.initial_show_state
        }

        fn window_runtime_style(&self) -> RuntimeStyle {
            self.runtime_style
        }
    }
}

wrap_app! {
    pub struct SimpleApp;

    impl App {
        fn on_before_command_line_processing(
            &self,
            process_type: Option<&CefString>,
            command_line: Option<&mut CommandLine>,
        ) {
            if let Some(command_line) = command_line {
                if process_type.is_none() {
                    let url_switch = CefString::from("url");
                    if command_line.has_switch(Some(&url_switch)) != 0 {
                        // CEF reserves `--url`; remove it so Pulse custom URL args don't hijack the UI browser.
                        command_line.remove_switch(Some(&url_switch));
                    }
                }

                let disable_gpu = std::env::var("PULSE_DISABLE_GPU")
                    .map(|value| value != "0")
                    .unwrap_or(cfg!(debug_assertions));
                if disable_gpu {
                    command_line.append_switch(Some(&CefString::from("disable-gpu")));
                    command_line.append_switch(Some(&CefString::from("disable-gpu-compositing")));
                }

                if cfg!(debug_assertions) {
                    // Avoid initialize=0 in elevated dev shells by keeping a single token.
                    command_line.append_switch(Some(&CefString::from("do-not-de-elevate")));
                }
            }
        }

        fn browser_process_handler(&self) -> Option<BrowserProcessHandler> {
            Some(SimpleBrowserProcessHandler::new(
                RefCell::new(None),
                RefCell::new(None),
                Arc::new(Mutex::new(ShellState::default())),
            ))
        }

        fn render_process_handler(&self) -> Option<RenderProcessHandler> {
            Some(PulseRenderProcessHandler::new())
        }
    }
}

wrap_browser_process_handler! {
    struct SimpleBrowserProcessHandler {
        ui_client: RefCell<Option<Client>>,
        content_client: RefCell<Option<Client>>,
        shell_state: Arc<Mutex<ShellState>>,
    }

    impl BrowserProcessHandler {
        fn on_context_initialized(&self) {
            debug_assert_ne!(currently_on(ThreadId::UI), 0);

            let trusted_ui_origin = trusted_ui_origin_prefix();
            let configured_ui_url = ui_url();
            eprintln!(
                "Pulse CEF context initialized: runtime_style=ALLOY ui_url='{}' trusted_origin='{}'",
                configured_ui_url,
                trusted_ui_origin
            );

            let content_handler = SimpleHandler::new(
                BrowserRole::WebContent,
                self.shell_state.clone(),
                trusted_ui_origin.clone(),
                None,
            );
            let content_client_instance = SimpleHandlerClient::new(content_handler);
            let ui_handler = SimpleHandler::new(
                BrowserRole::UiChrome,
                self.shell_state.clone(),
                trusted_ui_origin,
                Some(content_client_instance.clone()),
            );
            let ui_client_instance = SimpleHandlerClient::new(ui_handler);

            {
                let mut ui_client_slot = self.ui_client.borrow_mut();
                *ui_client_slot = Some(ui_client_instance);
            }
            {
                let mut content_client_slot = self.content_client.borrow_mut();
                *content_client_slot = Some(content_client_instance);
            }

            let browser_settings = BrowserSettings::default();
            let runtime_style = APP_RUNTIME_STYLE;
            let mut browser_delegate = SimpleBrowserViewDelegate::new(runtime_style);

            let ui_url = CefString::from(configured_ui_url.as_str());

            let mut ui_client = self.ui_client.borrow().clone();
            let ui_browser_view = browser_view_create(
                ui_client.as_mut(),
                Some(&ui_url),
                Some(&browser_settings),
                None,
                None,
                Some(&mut browser_delegate),
            );

            let mut window_delegate = SimpleWindowDelegate::new(
                RefCell::new(ui_browser_view),
                self.shell_state.clone(),
                runtime_style,
                ShowState::NORMAL,
            );
            window_create_top_level(Some(&mut window_delegate));
        }
    }
}
