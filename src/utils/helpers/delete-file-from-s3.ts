import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { File } from 'generated/prisma';
import { deleteObjectS3 } from './delete-object-s3';
import { FileDir } from '../types';
import { getFileInfo } from './get-file-info';

export function deleteFileFromS3(
  file: File,
  configService: ConfigService,
  s3: S3Client,
) {
  const { fileDir, fileName } = getFileInfo(file.fileName);
  return deleteObjectS3(
    fileName,
    configService.get<string>('AWS_BUCKET_NAME')!,
    fileDir as FileDir,
    s3,
  );
}
