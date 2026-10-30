import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `vite build --mode demo` produces the static, mock-backed demo served under /demos/taskflow/.
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    base: demo ? "/demos/taskflow/" : "/",
    plugins: [react(), tailwindcss()],
    build: { outDir: demo ? "dist-demo" : "dist", emptyOutDir: true },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
