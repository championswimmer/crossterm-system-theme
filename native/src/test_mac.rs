use objc2_foundation::{ns_string, NSDate, NSRunLoop};
use objc2::{msg_send, class};
use std::ffi::c_void;

#[repr(C)]
pub struct NSUserDefaultsObserver {
    isa: *const c_void,
}

fn main() {
    println!("Starting loop testing NSApp effectiveAppearance...");
    
    // We cannot easily do KVO in raw Rust without declaring a whole ObjC class.
    // Instead, let's just write a tight loop testing NSUserDefaults "AppleInterfaceStyle" directly
    // to see if it changes instantly upon theme toggle.
    
    println!("Looping for 15 seconds. Please toggle theme now.");
    for i in 0..15 {
        unsafe {
            let user_defaults: *mut objc2::runtime::AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
            let style: *mut objc2::runtime::AnyObject = msg_send![user_defaults, stringForKey: ns_string!("AppleInterfaceStyle")];
            
            let style_str = if style.is_null() {
                "Light"
            } else {
                "Dark"
            };
            
            println!("Tick {}: {}", i, style_str);
            
            let date: *mut objc2::runtime::AnyObject = msg_send![class!(NSDate), dateWithTimeIntervalSinceNow: 1.0f64];
            let run_loop: *mut objc2::runtime::AnyObject = msg_send![class!(NSRunLoop), currentRunLoop];
            let _: () = msg_send![run_loop, runUntilDate: date];
        }
    }
}
