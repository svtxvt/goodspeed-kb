/**
 * - unavailable: the provider could not serve the request (network, timeout,
 *   429 or 5xx after the SDK's own retries). Worth retrying later.
 * - rejected: the provider refused the request (bad key, unknown model, input
 *   too large). Retrying will not help; configuration or input must change.
 * - invalid_response: the provider answered, but not with something usable
 *   (wrong number of vectors, wrong dimension, empty completion).
 */
export type AIErrorCode = 'unavailable' | 'rejected' | 'invalid_response';

export class AIProviderError extends Error {
  override readonly name = 'AIProviderError';

  constructor(
    readonly code: AIErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class AIConfigError extends Error {
  override readonly name = 'AIConfigError';
}
