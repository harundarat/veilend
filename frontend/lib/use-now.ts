"use client";

import { useSyncExternalStore } from "react";

let now = 0;
if (typeof window !== "undefined") {
  now = Date.now();
}

function subscribe(onStoreChange: () => void) {
  const id = setInterval(() => {
    now = Date.now();
    onStoreChange();
  }, 1000);
  return () => clearInterval(id);
}

function getNow() {
  return now;
}

function getServerNow() {
  return 0;
}

export function useNow() {
  return useSyncExternalStore(subscribe, getNow, getServerNow);
}
