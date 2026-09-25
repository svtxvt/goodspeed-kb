import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AIProviderError, type EmbeddingModel } from '@kb/ai';

import { AppModule } from './app.module.js';
import { type AppConfig, loadConfig, loadEnvFile } from './config.js';
import { APP_CONFIG, EMBEDDING_MODEL } from './tokens.js';

/**
 * Embeds one word at boot. A dimension mismatch between the model and
 * AI_EMBEDDING_DIMENSIONS stops the API with a clear message; an unreachable
 * provider only warns, so documents can still be read.
 */
async function checkEmbeddingSpace(model: EmbeddingModel, logger: Logger): Promise<void> {
  try {
    await model.embed(['ping']);
    logger.log(`Embedding space ${model.space.id} OK`);
  } catch (error) {
    if (error instanceof AIProviderError && error.code === 'unavailable') {
      logger.warn(`Embedding provider unreachable at boot: ${error.message}`);
      return;
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  loadEnvFile();
  loadConfig(); // fail fast with a readable list of bad variables, before Nest starts
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // 100k-character documents fit comfortably; anything larger is a 413.
  app.useBodyParser('json', { limit: '1mb' });
  app.enableShutdownHooks();

  await checkEmbeddingSpace(app.get<EmbeddingModel>(EMBEDDING_MODEL), logger);

  const { port } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
