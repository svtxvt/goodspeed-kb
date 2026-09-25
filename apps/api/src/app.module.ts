import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createChatModel, createEmbeddingModel } from '@kb/ai';

import { AuthGuard } from './auth/auth.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatService } from './chat/chat.service.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { type AppConfig, loadConfig } from './config.js';
import { DocumentsController } from './documents/documents.controller.js';
import { DocumentsService } from './documents/documents.service.js';
import { HealthController } from './health.controller.js';
import { APP_CONFIG, CHAT_MODEL, EMBEDDING_MODEL } from './tokens.js';

@Module({
  controllers: [HealthController, DocumentsController, ChatController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    // The only place that decides which AI implementation runs.
    {
      provide: CHAT_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createChatModel(config.ai),
    },
    {
      provide: EMBEDDING_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createEmbeddingModel(config.ai),
    },
    DocumentsService,
    ChatService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
