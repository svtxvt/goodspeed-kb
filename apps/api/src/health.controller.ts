import { Controller, Get, Inject } from '@nestjs/common';
import type { EmbeddingModel } from '@kb/ai';
import type { HealthDto } from '@kb/shared';

import { Public } from './auth/auth.js';
import type { AppConfig } from './config.js';
import { APP_CONFIG, EMBEDDING_MODEL } from './tokens.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMBEDDING_MODEL) private readonly embeddings: EmbeddingModel,
  ) {}

  @Public()
  @Get()
  health(): HealthDto {
    const { ai } = this.config;
    return {
      status: 'ok',
      ai: {
        chatModel: ai.mock ? 'mock' : ai.chat.model,
        embeddingSpace: this.embeddings.space.id,
        mock: ai.mock,
      },
    };
  }
}
