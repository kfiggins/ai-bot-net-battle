import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load env vars from the project root so WS_PORT in root .env is available
  const env = loadEnv(mode, "../", "");
  const wsPort = env.WS_PORT ?? "3000";

  return {
    define: {
      // Make process.env.WS_PORT available in the browser bundle
      // so shared/src/constants.ts SERVER_PORT reads correctly on the client
      "process.env.WS_PORT": JSON.stringify(wsPort),
    },
  };
});
