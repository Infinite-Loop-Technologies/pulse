use cef::*;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy)]
pub struct ContentBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl ContentBounds {
    pub fn to_rect(self) -> Rect {
        Rect {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}

struct ContentTabSession {
    browser_view: BrowserView,
    overlay_controller: Option<OverlayController>,
}

pub struct ShellState {
    pub ui_browser_id: Option<i32>,
    pub ui_browser_view: Option<BrowserView>,
    pub window: Option<Window>,
    content_tabs: BTreeMap<String, ContentTabSession>,
    pub active_tab_id: Option<String>,
    pub window_bounds: Rect,
    pub requested_content_bounds: Option<ContentBounds>,
    pub content_visible: bool,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            ui_browser_id: None,
            ui_browser_view: None,
            window: None,
            content_tabs: BTreeMap::new(),
            active_tab_id: None,
            window_bounds: Rect {
                x: 0,
                y: 0,
                width: 1440,
                height: 900,
            },
            requested_content_bounds: None,
            content_visible: true,
        }
    }
}

impl ShellState {
    pub fn set_ui_browser_id(&mut self, browser_id: Option<i32>) {
        self.ui_browser_id = browser_id;
    }

    pub fn set_ui_view(&mut self, ui_browser_view: Option<BrowserView>) {
        self.ui_browser_view = ui_browser_view;
        self.apply_layout();
    }

    pub fn set_window(&mut self, window: Option<Window>) {
        self.window = window;

        if let Some(window) = self.window.as_mut() {
            for tab_session in self.content_tabs.values_mut() {
                ensure_overlay_attached(window, tab_session);
            }
        }

        self.apply_layout();
    }

    pub fn set_window_bounds(&mut self, bounds: Rect) {
        self.window_bounds = bounds;
        self.apply_layout();
    }

    pub fn set_content_bounds(&mut self, bounds: ContentBounds) {
        self.requested_content_bounds = Some(bounds);
        self.apply_layout();
    }

    pub fn set_content_visible(&mut self, visible: bool) {
        self.content_visible = visible;
        self.apply_layout();
    }

    pub fn has_tab(&self, tab_id: &str) -> bool {
        self.content_tabs.contains_key(tab_id)
    }

    pub fn tab_id_for_browser_id(&self, browser_id: i32) -> Option<String> {
        for (tab_id, tab_session) in &self.content_tabs {
            if let Some(browser) = tab_session.browser_view.browser() {
                if browser.identifier() == browser_id {
                    return Some(tab_id.clone());
                }
            }
        }

        None
    }

    pub fn tab_runtime_url(&self, tab_id: &str) -> Option<String> {
        let tab_session = self.content_tabs.get(tab_id)?;
        let browser = tab_session.browser_view.browser()?;
        let main_frame = browser.main_frame()?;
        Some(CefString::from(&main_frame.url()).to_string())
    }

    pub fn register_content_tab(&mut self, tab_id: String, browser_view: BrowserView) {
        let mut tab_session = ContentTabSession {
            browser_view,
            overlay_controller: None,
        };

        if let Some(window) = self.window.as_mut() {
            ensure_overlay_attached(window, &mut tab_session);
        }

        self.content_tabs.insert(tab_id.clone(), tab_session);
        if self.active_tab_id.is_none() {
            self.active_tab_id = Some(tab_id);
        }

        self.apply_layout();
    }

    pub fn activate_tab(&mut self, tab_id: &str) {
        if self.content_tabs.contains_key(tab_id) {
            self.active_tab_id = Some(tab_id.to_string());
            self.apply_layout();
        }
    }

    pub fn navigate_active_tab(&mut self, url: &str) {
        let Some(active_tab_id) = self.active_tab_id.clone() else {
            return;
        };

        self.navigate_tab(&active_tab_id, url);
    }

    pub fn navigate_tab(&mut self, tab_id: &str, url: &str) {
        if let Some(tab_session) = self.content_tabs.get(tab_id) {
            if let Some(browser) = tab_session.browser_view.browser() {
                if let Some(frame) = browser.main_frame() {
                    frame.load_url(Some(&CefString::from(url)));
                }
            }
        }

        self.content_visible = true;
        self.apply_layout();
    }

    pub fn browser_back(&self, tab_id: &str) {
        if let Some(browser) = self.browser_for_tab(tab_id) {
            if browser.can_go_back() != 0 {
                browser.go_back();
            }
        }
    }

    pub fn browser_forward(&self, tab_id: &str) {
        if let Some(browser) = self.browser_for_tab(tab_id) {
            if browser.can_go_forward() != 0 {
                browser.go_forward();
            }
        }
    }

    pub fn browser_reload(&self, tab_id: &str) {
        if let Some(browser) = self.browser_for_tab(tab_id) {
            browser.reload();
        }
    }

    pub fn browser_stop(&self, tab_id: &str) {
        if let Some(browser) = self.browser_for_tab(tab_id) {
            browser.stop_load();
        }
    }

    pub fn remove_content_tab_by_browser_id(&mut self, browser_id: i32) {
        let mut removed_tab: Option<String> = None;

        for (tab_id, tab_session) in &self.content_tabs {
            if let Some(browser) = tab_session.browser_view.browser() {
                if browser.identifier() == browser_id {
                    removed_tab = Some(tab_id.clone());
                    break;
                }
            }
        }

        if let Some(tab_id) = removed_tab {
            if let Some(tab_session) = self.content_tabs.remove(&tab_id) {
                if let Some(overlay_controller) = tab_session.overlay_controller {
                    overlay_controller.destroy();
                }
            }

            if self.active_tab_id.as_deref() == Some(tab_id.as_str()) {
                self.active_tab_id = self.content_tabs.keys().next().cloned();
            }
            self.apply_layout();
        }
    }

    pub fn close_tab(&mut self, tab_id: &str) -> Option<Browser> {
        let tab_session = self.content_tabs.remove(tab_id)?;

        if let Some(overlay_controller) = tab_session.overlay_controller {
            overlay_controller.destroy();
        }

        let browser = tab_session.browser_view.browser();

        if self.active_tab_id.as_deref() == Some(tab_id) {
            self.active_tab_id = self.content_tabs.keys().next().cloned();
        }

        self.apply_layout();
        browser
    }

    pub fn clear_content_tabs(&mut self) {
        for tab_session in self.content_tabs.values() {
            if let Some(overlay_controller) = tab_session.overlay_controller.as_ref() {
                overlay_controller.destroy();
            }
        }

        self.content_tabs.clear();
        self.active_tab_id = None;
        self.apply_layout();
    }

    fn apply_layout(&mut self) {
        self.layout_ui_view();
        self.layout_content_views();
    }

    fn layout_ui_view(&mut self) {
        if let Some(ui_browser_view) = self.ui_browser_view.as_ref() {
            let ui_view = View::from(ui_browser_view);
            ui_view.set_bounds(Some(&self.window_bounds));
            ui_view.set_visible(1);
        }
    }

    fn layout_content_views(&mut self) {
        let window_bounds = self.window_bounds.clone();
        let content_bounds = self
            .requested_content_bounds
            .map(ContentBounds::to_rect)
            .unwrap_or_else(|| fallback_content_bounds(&window_bounds));
        let content_bounds = clamp_to_window(content_bounds, &window_bounds);

        for (tab_id, tab_session) in &self.content_tabs {
            let is_active = self.active_tab_id.as_deref() == Some(tab_id.as_str());
            let should_show = self.content_visible && is_active;

            if let Some(overlay_controller) = tab_session.overlay_controller.as_ref() {
                if should_show {
                    overlay_controller.set_bounds(Some(&content_bounds));
                    overlay_controller.set_visible(1);
                } else {
                    overlay_controller.set_visible(0);
                }
                continue;
            }

            // Fallback path when overlay has not yet been attached.
            let content_view = View::from(&tab_session.browser_view);
            if should_show {
                content_view.set_bounds(Some(&content_bounds));
                content_view.set_visible(1);
            } else {
                content_view.set_visible(0);
            }
        }
    }
}

fn ensure_overlay_attached(window: &mut Window, tab_session: &mut ContentTabSession) {
    if tab_session.overlay_controller.is_some() {
        return;
    }

    let mut view = View::from(&tab_session.browser_view);
    tab_session.overlay_controller =
        window.add_overlay_view(Some(&mut view), DockingMode::CUSTOM, 1);
}

fn fallback_content_bounds(window_bounds: &Rect) -> Rect {
    // Tuned to match the prototype UI composition until the UI reports exact bounds.
    let margin = 12;
    let sidebar_width = 320;
    let section_header_height = 48;
    let surface_padding = 12;
    let tab_strip_height = 32;

    let x = margin + sidebar_width + 1 + surface_padding;
    let y = margin + section_header_height + surface_padding + tab_strip_height;
    let width = window_bounds.width - x - margin - surface_padding;
    let height = window_bounds.height - y - margin - surface_padding;

    Rect {
        x,
        y,
        width: width.max(1),
        height: height.max(1),
    }
}

fn clamp_to_window(rect: Rect, window: &Rect) -> Rect {
    let max_x = (window.width - 1).max(0);
    let max_y = (window.height - 1).max(0);

    let x = rect.x.clamp(0, max_x);
    let y = rect.y.clamp(0, max_y);

    let max_width = (window.width - x).max(1);
    let max_height = (window.height - y).max(1);

    Rect {
        x,
        y,
        width: rect.width.max(1).min(max_width),
        height: rect.height.max(1).min(max_height),
    }
}

impl ShellState {
    fn browser_for_tab(&self, tab_id: &str) -> Option<Browser> {
        let tab_session = self.content_tabs.get(tab_id)?;
        tab_session.browser_view.browser()
    }
}
