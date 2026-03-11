import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Validates that a route parameter is a valid MongoDB ObjectId.
 *
 * Usage: @Param('id', ParseObjectIdPipe) id: string
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid ID format');
    }
    return value;
  }
}
