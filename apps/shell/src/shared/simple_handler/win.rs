use cef::*;
use std::iter;
use windows_sys::Win32::{
    Foundation::HWND,
    System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::{
        GA_ROOT, GetAncestor, ICON_BIG, ICON_SMALL, IMAGE_ICON, LR_DEFAULTSIZE, LR_SHARED,
        LoadImageW, SendMessageW, SetWindowTextW, WM_SETICON,
    },
};

fn window_from_browser(browser: Option<&mut Browser>) -> Option<HWND> {
    let window = browser?.host()?.window_handle().0;
    let window: HWND = window.cast();
    let root = unsafe { GetAncestor(window, GA_ROOT) };
    if !root.is_null() {
        Some(root)
    } else {
        Some(window)
    }
}

fn make_int_resource(id: u16) -> *const u16 {
    id as usize as *const u16
}

fn set_window_icon(window: HWND) {
    let instance = unsafe { GetModuleHandleW(std::ptr::null()) };
    if instance.is_null() {
        return;
    }

    // `winres` uses resource ID 1 by default for the executable icon.
    let icon = unsafe {
        LoadImageW(
            instance,
            make_int_resource(1),
            IMAGE_ICON,
            0,
            0,
            LR_DEFAULTSIZE | LR_SHARED,
        )
    };
    if icon.is_null() {
        return;
    }

    unsafe {
        SendMessageW(window, WM_SETICON, ICON_SMALL as usize, icon as isize);
        SendMessageW(window, WM_SETICON, ICON_BIG as usize, icon as isize);
    }
}

pub fn platform_after_created(browser: Option<&mut Browser>) {
    let Some(window) = window_from_browser(browser) else {
        return;
    };

    set_window_icon(window);
}

pub fn platform_title_change(browser: Option<&mut Browser>, title: Option<&CefString>) {
    let Some(window) = window_from_browser(browser) else {
        return;
    };

    set_window_icon(window);

    let title = title.map(CefString::to_string).unwrap_or_default();
    let title_utf16: Vec<_> = title.encode_utf16().chain(iter::once(0)).collect();
    unsafe {
        SetWindowTextW(window, title_utf16.as_ptr());
    }
}
