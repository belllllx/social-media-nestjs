import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class DeleteUserImageDto {
  @ApiProperty()
  @IsUrl()
  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}