import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  type DocumentDto,
  documentInputSchema,
  type DocumentSummaryDto,
  documentUpdateSchema,
} from '@kb/shared';
import type { z } from 'zod';

import { Auth, type AuthContext } from '../auth/auth.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DocumentsService } from './documents.service.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Auth() auth: AuthContext): Promise<DocumentSummaryDto[]> {
    return this.documents.list(auth.db);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<DocumentDto> {
    return this.documents.get(auth.db, id);
  }

  @Post()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(documentInputSchema)) input: z.output<typeof documentInputSchema>,
  ): Promise<DocumentDto> {
    return this.documents.create(auth.db, input);
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(documentUpdateSchema)) input: z.output<typeof documentUpdateSchema>,
  ): Promise<DocumentDto> {
    return this.documents.update(auth.db, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.documents.remove(auth.db, id);
  }
}
