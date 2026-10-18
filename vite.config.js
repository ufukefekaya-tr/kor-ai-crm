// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5176,
    proxy: { "/api": "http://127.0.0.1:4320" },
  },
  preview: { host: "127.0.0.1", port: 4176 },
});
