declare const __APP_VERSION__: string

interface ImportMetaEnv {
	// Adresse des WorkFlow-Backends (server/); leer = gleicher Host wie die Web-App.
	readonly VITE_API_URL?: string
	readonly VITE_LOKALE_DEMO?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
