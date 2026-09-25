/** Every non-2xx API response has this shape. */
export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable code, e.g. "version_conflict". */
  error: string;
  message: string;
  details?: unknown;
}

export interface HealthDto {
  status: 'ok';
  ai: {
    chatModel: string;
    embeddingSpace: string;
    /** True when the API runs the built-in mock models instead of a real provider. */
    mock: boolean;
  };
}
