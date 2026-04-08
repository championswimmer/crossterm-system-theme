#[cfg(target_os = "macos")]
use objc2_foundation::{ns_string, NSDistributedNotificationCenter, NSNotificationCenter, NSNotification, NSDate, NSRunLoop};
#[cfg(target_os = "macos")]
use block2::RcBlock;
use std::ptr::NonNull;

fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("Starting test with AppleInterfaceThemeChangedNotification AND NSApplicationLoad...");
        
        // We need an NSApplication instance to start emitting UI notifications in background CLI tools
        #[link(name = "AppKit", kind = "framework")]
        extern "C" {
            fn NSApplicationLoad() -> bool;
        }
        
        unsafe {
            NSApplicationLoad();
        }
        
        let dist_center = NSDistributedNotificationCenter::defaultCenter();
        dist_center.setSuspended(false);

        let observer_block = RcBlock::new(move |_notification: NonNull<NSNotification>| {
            println!("DISTRIBUTED AppleInterfaceThemeChangedNotification RECEIVED!");
        });
        
        unsafe {
            dist_center.addObserverForName_object_queue_usingBlock(
                Some(ns_string!("AppleInterfaceThemeChangedNotification")),
                None,
                None,
                &observer_block,
            );
        }
        
        let observer_block2 = RcBlock::new(move |_notification: NonNull<NSNotification>| {
            println!("DISTRIBUTED AppleColorPreferencesChangedNotification RECEIVED!");
        });
        
        unsafe {
            dist_center.addObserverForName_object_queue_usingBlock(
                Some(ns_string!("AppleColorPreferencesChangedNotification")),
                None,
                None,
                &observer_block2,
            );
        }

        println!("Pumping NSRunLoop for 10 seconds. Please toggle theme now.");
        
        for i in 0..10 {
            unsafe {
                let date = NSDate::dateWithTimeIntervalSinceNow(1.0);
                NSRunLoop::currentRunLoop().runUntilDate(&date);
            }
            println!("Tick {}...", i);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        println!("This test is only supported on macOS.");
    }
}
