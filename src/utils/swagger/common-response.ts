import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommonResponse<T = any> {
  @ApiProperty()
  status: number;

  @ApiProperty()
  success: boolean;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiPropertyOptional()
  data?: T;
}
