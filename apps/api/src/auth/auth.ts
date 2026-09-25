import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';

import { createUserClient } from '../common/supabase.js';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';

export interface AuthContext {
  userId: string;
  /** Supabase client scoped to this user; every query runs under RLS. */
  db: SupabaseClient;
}

type AuthedRequest = Request & { auth?: AuthContext };

const IS_PUBLIC = 'kb:isPublic';

/** Opts a route out of the global AuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Injects the caller's AuthContext (set by AuthGuard). */
export const Auth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) throw new UnauthorizedException();
    return auth;
  },
);

/**
 * Global guard: every route needs a valid Supabase access token unless marked
 * @Public(). The JWT is verified locally against the project's JWKS (cached),
 * so there is no auth round trip per request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;
  readonly #issuer: string;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {
    this.#issuer = `${config.supabase.url}/auth/v1`;
    this.#jwks = createRemoteJWKSet(new URL(`${this.#issuer}/.well-known/jwks.json`));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedException({ error: 'unauthorized', message: 'Missing bearer token' });
    }

    let userId: unknown;
    try {
      const { payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.#issuer,
        audience: 'authenticated',
      });
      userId = payload.sub;
    } catch (error) {
      if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) {
        throw new UnauthorizedException({
          error: 'unauthorized',
          message: 'Invalid or expired token',
        });
      }
      throw new ServiceUnavailableException({
        error: 'auth_unavailable',
        message: 'Could not verify the token right now',
      });
    }
    if (typeof userId !== 'string') {
      throw new UnauthorizedException({ error: 'unauthorized', message: 'Token has no subject' });
    }

    request.auth = { userId, db: createUserClient(this.config.supabase, token) };
    return true;
  }
}
