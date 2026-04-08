#![allow(non_snake_case)]
#![allow(unexpected_cfgs)]

#[macro_use]
extern crate objc;

use cocoa::appkit::{NSApp, NSApplication};
use cocoa::base::{id, nil};
use cocoa::foundation::{NSArray, NSAutoreleasePool, NSDictionary, NSString, NSUInteger};
use lazy_static::lazy_static;
use objc::declare::ClassDecl;
use objc::rc::{StrongPtr, WeakPtr};
use objc::runtime::{Class, Object, Sel};
use std::io::Write;
use std::ops::Deref;

bitflags::bitflags! {
    struct NSKeyValueObservingOptions: NSUInteger {
        const NEW = 0x01;
        const OLD = 0x02;
    }
}

type ObserverCallback = Box<dyn Fn(id)>;

fn get_callback(self_obj: &mut Object) -> &mut dyn Fn(id) {
    let boxed: *mut libc::c_void = unsafe { *self_obj.get_ivar("_callback") };
    let callback: *mut ObserverCallback = boxed.cast();
    unsafe { &mut **callback }
}

lazy_static! {
    static ref RUST_KVO_HELPER: &'static Class = {
        let superclass = class!(NSObject);
        let mut decl = ClassDecl::new("CrosstermThemeKVOHelper", superclass).unwrap();

        decl.add_ivar::<*mut libc::c_void>("_callback");

        fn emit(callback: &dyn Fn(id), changes: impl NSDictionary) {
            let new_value = unsafe {
                let new_key = StrongPtr::new(NSString::alloc(nil).init_str("new"));
                changes.valueForKey_(*new_key.deref())
            };
            callback(new_value);
        }

        extern "C" fn observe(
            self_obj: &mut Object,
            _self_selector: Sel,
            _key_path: id,
            _of_object: id,
            changes: id,
            _context: *mut libc::c_void,
        ) {
            let callback = get_callback(self_obj);
            emit(callback, changes)
        }

        unsafe {
            decl.add_method(
                sel!(observeValueForKeyPath:ofObject:change:context:),
                observe as extern "C" fn(&mut Object, Sel, id, id, id, *mut libc::c_void),
            );
        }

        decl.register();
        class!(CrosstermThemeKVOHelper)
    };
}

struct KeyValueObserver {
    observer: StrongPtr,
    observed_object: WeakPtr,
    key_path: id,
}

impl KeyValueObserver {
    fn observe(
        object: id,
        key_path: id,
        options: NSKeyValueObservingOptions,
        closure: impl Fn(id) + 'static,
    ) -> Option<Self> {
        if object == nil {
            return None;
        }

        unsafe {
            let inner: ObserverCallback = Box::new(closure);
            let double_boxed = Box::new(inner);
            let callback: *mut ObserverCallback = Box::into_raw(double_boxed);

            let observer: id = msg_send![*RUST_KVO_HELPER, new];
            (*observer).set_ivar("_callback", callback.cast::<libc::c_void>());

            let _: libc::c_void = msg_send![object,
                addObserver: observer
                 forKeyPath: key_path
                    options: options
                    context: nil
            ];

            Some(KeyValueObserver {
                observer: StrongPtr::new(observer),
                observed_object: WeakPtr::new(object),
                key_path,
            })
        }
    }
}

impl Drop for KeyValueObserver {
    fn drop(&mut self) {
        unsafe {
            let observed = self.observed_object.load();
            if observed.is_null() {
                return;
            }
            let observed = *observed.deref();
            let observer = *self.observer.deref();
            let _: libc::c_void =
                msg_send![observed, removeObserver: observer forKeyPath: self.key_path];
            let callback = get_callback(&mut *observer);
            drop(Box::from_raw(callback));
        }
    }
}

#[link(name = "AppKit", kind = "framework")]
extern "C" {
    static NSAppearanceNameAqua: id;
    static NSAppearanceNameDarkAqua: id;
}

fn appearance_to_theme(names: id, appearance: id) -> &'static str {
    unsafe {
        let best_match: id = msg_send![appearance, bestMatchFromAppearancesWithNames: names];
        if best_match == NSAppearanceNameDarkAqua {
            "dark"
        } else {
            "light"
        }
    }
}

fn emit_theme(theme: &str) {
    println!("{}", theme);
    let _ = std::io::stdout().flush();
}

fn main() {
    unsafe {
        let _pool = NSAutoreleasePool::new(nil);

        let app = NSApp();
        app.setActivationPolicy_(
            cocoa::appkit::NSApplicationActivationPolicy::NSApplicationActivationPolicyProhibited,
        );

        let names =
            NSArray::arrayWithObjects(nil, &[NSAppearanceNameAqua, NSAppearanceNameDarkAqua])
                .autorelease();

        let effectiveAppearance = NSString::alloc(nil).init_str("effectiveAppearance");

        let emit = move |appearance: id| {
            if appearance == nil {
                return;
            }
            emit_theme(appearance_to_theme(names, appearance));
        };

        let initial: id = msg_send![app, effectiveAppearance];
        emit(initial);

        let _observer = KeyValueObserver::observe(
            app,
            effectiveAppearance,
            NSKeyValueObservingOptions::NEW | NSKeyValueObservingOptions::OLD,
            emit,
        );

        app.run();
    }
}
