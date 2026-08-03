/// <reference types="vite/client" />

// Contract with the platform: merged into Vite's ImportMetaEnv so that
// import.meta.env stays fully typed (interface is required for merging).
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_USER_POOL_ID: string
  readonly VITE_USER_POOL_CLIENT_ID: string
  readonly VITE_USER_POOL_DOMAIN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
