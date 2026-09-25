import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Validates and transforms a request part with a shared zod schema. ZodError -> 400. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    return this.schema.parse(value);
  }
}
