import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePostDto extends PartialType(CreatePostDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shouldDeleteCurrentFiles?: boolean;
}
