"use client";

import { useState, useEffect } from "react";

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let id = sessionStorage.getItem("dailyword_session");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("dailyword_session", id);
    }
    setSessionId(id);
  }, []);

  return sessionId;
}
