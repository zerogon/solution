"use client";

import { useEffect, useState } from "react";

const DEVICE_ID_KEY = "dailyword_device_id";

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      setDeviceId(id);
    } catch {
      setDeviceId(crypto.randomUUID());
    }
  }, []);

  return deviceId;
}
