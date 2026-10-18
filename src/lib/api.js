// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
export async function request(path, options = {}, token = "") {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-API-Key": token } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      value?.error?.message || `Local server returned ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return value;
}
export function subscribeEvents(token, onChange, onState) {
  const controller = new AbortController();
  let timer;
  let active = true;
  async function connect() {
    try {
      const response = await fetch("/api/events", {
        headers: token ? { "X-API-Key": token } : {},
        signal: controller.signal,
      });
      if (!response.ok) {
        onState(false);
        return;
      }
      onState(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (active) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (/^event:\s*change$/m.test(event)) onChange();
        }
        if (buffer.length > 100000) buffer = "";
      }
    } catch (error) {
      if (error.name === "AbortError") return;
    }
    onState(false);
    if (active) timer = setTimeout(connect, 3000);
  }
  connect();
  return () => {
    active = false;
    controller.abort();
    clearTimeout(timer);
  };
}
export const number = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    Number(value) || 0,
  );
export const day = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";
export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
