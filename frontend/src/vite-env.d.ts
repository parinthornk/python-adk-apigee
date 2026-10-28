/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ADK API server, without a trailing slash. */
  readonly VITE_ADK_BASE_URL?: string;
  /** App name served by the API server (the agent folder name). */
  readonly VITE_ADK_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
