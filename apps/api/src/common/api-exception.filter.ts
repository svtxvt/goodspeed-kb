import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AIProviderError } from '@kb/ai';
import type { ApiErrorBody } from '@kb/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
};

/** Maps any thrown value to the one error shape the web app understands. */
export function toErrorBody(exception: unknown): ApiErrorBody {
  if (exception instanceof ZodError) {
    return {
      statusCode: 400,
      error: 'validation_failed',
      message: exception.issues[0]?.message ?? 'Invalid request',
      details: exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (exception instanceof AIProviderError) {
    return exception.code === 'unavailable'
      ? {
          statusCode: 503,
          error: 'ai_unavailable',
          message: 'The AI provider is unavailable right now. Nothing was saved; please try again.',
        }
      : {
          statusCode: 502,
          error: `ai_${exception.code}`,
          message: 'The AI provider returned an unusable response. Check the API logs and AI_* settings.',
        };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const body = typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);
    // Our own exceptions carry a snake_case code; Nest's built-ins carry "Not Found" etc.
    const error =
      typeof body.error === 'string' && /^[a-z_]+$/.test(body.error)
        ? body.error
        : (CODE_BY_STATUS[statusCode] ?? 'error');
    const message = Array.isArray(body.message) ? body.message.join('; ') : String(body.message ?? exception.message);
    return { statusCode, error, message };
  }

  // Express body-parser errors (payload too large, malformed JSON) are not HttpExceptions.
  const status = (exception as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return {
      statusCode: status,
      error: CODE_BY_STATUS[status] ?? 'bad_request',
      message: status === 413 ? 'Request body is too large' : 'Malformed request body',
    };
  }

  return { statusCode: 500, error: 'internal_error', message: 'Something went wrong' };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  readonly #logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toErrorBody(exception);
    if (exception instanceof AIProviderError) {
      // Operational, not a bug: the full provider message goes to the log only.
      this.#logger.warn(`${exception.code}: ${exception.message}`);
    } else if (body.statusCode >= 500) {
      this.#logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : exception);
    }
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }
}
