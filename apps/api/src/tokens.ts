// Dependency-injection tokens. Application code depends on these interfaces,
// never on a concrete provider or SDK.
export const APP_CONFIG = Symbol('APP_CONFIG');
export const CHAT_MODEL = Symbol('CHAT_MODEL');
export const EMBEDDING_MODEL = Symbol('EMBEDDING_MODEL');
