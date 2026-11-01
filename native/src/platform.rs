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
