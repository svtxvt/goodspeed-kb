import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { chatRequestSchema, type ChatResponseDto } from '@kb/shared';
import type { z } from 'zod';

import { Auth, type AuthContext } from '../auth/auth.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Stateless: the client sends its session history with every question. */
  @Post()
  @HttpCode(200)
  ask(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(chatRequestSchema)) request: z.output<typeof chatRequestSchema>,
  ): Promise<ChatResponseDto> {
    return this.chat.ask(auth.db, request);
  }
}
