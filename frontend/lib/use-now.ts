"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  const id = setInterval(onStoreChange, 1000);
  return () => clearInterval(id);
}

function getNow() {
  return Date.now();
}

function getServerNow() {
  return 0;
}

export function useNow() {
  return useSyncExternalStore(subscribe, getNow, getServerNow);
}
