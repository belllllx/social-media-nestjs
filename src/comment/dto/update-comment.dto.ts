import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCommentDto } from './create-comment.dto';

export class UpdateCommentDto extends PartialType(CreateCommentDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shouldDeleteCurrentFile?: boolean;
}
