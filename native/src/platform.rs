/// Use the existing GPUI window handle for taskbar attention; no helper process.
#[cfg(target_os = "windows")]
pub fn alert(window: &gpui::Window, sound: bool, notify: bool) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    #[repr(C)]
    struct FlashInfo {
        size: u32,
        hwnd: *mut std::ffi::c_void,
        flags: u32,
        count: u32,
        timeout: u32,
    }
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBeep(kind: u32) -> i32;
        fn FlashWindowEx(info: *const FlashInfo) -> i32;
    }
    if sound {
        unsafe {
            MessageBeep(0x40);
        }
    }
    if notify
        && let Ok(handle) = HasWindowHandle::window_handle(window)
        && let RawWindowHandle::Win32(handle) = handle.as_raw()
    {
        let info = FlashInfo {
            size: std::mem::size_of::<FlashInfo>() as u32,
            hwnd: handle.hwnd.get() as *mut _,
            flags: 3,
            count: 3,
            timeout: 0,
        };
        // SAFETY: the HWND is owned by the live GPUI window; info is valid for this call.
        unsafe {
            FlashWindowEx(&info);
        }
    }
}
#[cfg(not(target_os = "windows"))]
pub fn alert(_: &gpui::Window, _: bool, _: bool) {}

#[cfg(target_os = "windows")]
pub fn reduced_motion() -> bool {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn SystemParametersInfoW(
            action: u32,
            param: u32,
            value: *mut std::ffi::c_void,
            flags: u32,
        ) -> i32;
    }
    let mut enabled: i32 = 1;
    // SPI_GETCLIENTAREAANIMATION reads the user's existing accessibility preference.
    unsafe {
        SystemParametersInfoW(0x1042, 0, (&mut enabled as *mut i32).cast(), 0);
    }
    enabled == 0
}
#[cfg(not(target_os = "windows"))]
pub fn reduced_motion() -> bool {
    true
}

/// GPUI 0.2.2 initially places a window using its creation monitor's DPI.
/// Recenter after WM_DPICHANGED using physical coordinates on the final monitor.
#[cfg(target_os = "windows")]
pub fn fit_window(handle: raw_window_handle::RawWindowHandle) -> anyhow::Result<()> {
    use std::ffi::c_void;
    #[repr(C)]
    #[derive(Default)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct MonitorInfo {
        size: u32,
        monitor: Rect,
        work: Rect,
        flags: u32,
    }
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MonitorFromWindow(hwnd: *mut c_void, flags: u32) -> *mut c_void;
        fn GetMonitorInfoW(monitor: *mut c_void, info: *mut MonitorInfo) -> i32;
        fn GetWindowRect(hwnd: *mut c_void, rect: *mut Rect) -> i32;
        fn SetWindowPos(
            hwnd: *mut c_void,
            after: *mut c_void,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> i32;
    }
    let raw_window_handle::RawWindowHandle::Win32(handle) = handle else {
        anyhow::bail!("Expected a Windows window handle");
    };
    let hwnd = handle.hwnd.get() as *mut c_void;
    let mut info = MonitorInfo {
        size: std::mem::size_of::<MonitorInfo>() as u32,
        monitor: Rect::default(),
        work: Rect::default(),
        flags: 0,
    };
    let mut rect = Rect::default();
    // SAFETY: the caller retains the live GPUI window; all output structs are valid.
    unsafe {
        let monitor = MonitorFromWindow(hwnd, 2); // MONITOR_DEFAULTTONEAREST
        if monitor.is_null()
            || GetMonitorInfoW(monitor, &mut info) == 0
            || GetWindowRect(hwnd, &mut rect) == 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
        let work_width = info.work.right - info.work.left;
        let work_height = info.work.bottom - info.work.top;
        let width = (rect.right - rect.left).min(work_width - 48).max(1);
        let height = (rect.bottom - rect.top).min(work_height - 80).max(1);
        if SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            info.work.left + (work_width - width) / 2,
            info.work.top + (work_height - height) / 2,
            width,
            height,
            0x0014, // SWP_NOZORDER | SWP_NOACTIVATE
        ) == 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    Ok(())
}
