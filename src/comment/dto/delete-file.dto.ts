import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsUrl } from "class-validator";

export class DeleteFileDto {
  @ApiProperty()
  @IsString()
  @IsUrl()
  @IsNotEmpty()
  fileUrl: string;
}