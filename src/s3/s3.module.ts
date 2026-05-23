import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3_CLIENT } from 'src/utils/types';

const s3ClientProvider = {
  provide: S3_CLIENT,
  useFactory: (configService: ConfigService) => {
    return new S3Client({
      region: configService.get<string>('AWS_BUCKET_REGION')!,
      endpoint: configService.get<string>('R2_ENDPOINT')!,
      credentials: {
        accessKeyId: configService.get<string>('AWS_ACCESS_KEY')!,
        secretAccessKey: configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        )!,
      },
    });
  },
  inject: [ConfigService],
}

@Module({
  providers: [s3ClientProvider, ConfigService],
  exports: [S3_CLIENT],
})

export class S3Module { }
