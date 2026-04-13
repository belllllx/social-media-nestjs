import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommonResponse {
  @ApiProperty()
  status: number;

  @ApiProperty()
  success: boolean;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiPropertyOptional({
    oneOf: [
      { type: 'object', additionalProperties: true },
      { type: 'string' },
      { type: 'array', items: {} },
    ],
  })
  data?: Record<string, unknown> | string | unknown[];
}