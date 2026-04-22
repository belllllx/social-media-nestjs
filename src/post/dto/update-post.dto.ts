import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';
import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdatePostDto extends PartialType(CreatePostDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shouldDeleteCurrentFiles?: boolean;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isSharePost: boolean;
}
