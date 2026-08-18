"use client";

import { useEffect } from "react";

const CASTINGCOMPASS_CACHE_PREFIXES = [
  "castingcompass-",
  "castcompass-",
  "contourcast-",
];

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
          ),
        "caches" in window
          ? caches
              .keys()
              .then((keys) =>
                Promise.all(
                  keys
                    .filter((key) =>
                      CASTINGCOMPASS_CACHE_PREFIXES.some((prefix) =>
                        key.startsWith(prefix),
                      ),
                    )
                    .map((key) => caches.delete(key)),
                ),
              )
          : Promise.resolve([]),
      ]).catch(() => {
        // Local preview cleanup is best effort and never blocks rendering.
      });
      return;
    }

    // A newly installed worker should not reload a first-time visitor. When an
    // existing worker is replaced, reload once so every browser uses the new
    // app shell instead of keeping an older client open indefinitely.
    const hadController = navigator.serviceWorker.controller !== null;
    let hasReloaded = false;

    const handleControllerChange = () => {
      if (!hadController || hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // The app remains usable online when registration or update checks fail.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
