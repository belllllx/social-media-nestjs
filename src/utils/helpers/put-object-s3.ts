import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { FileDir } from '../types';

export function putObjectS3(
  file: Express.Multer.File,
  bucketName: string,
  fileDir: FileDir,
  s3: S3Client,
) {
  return s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${fileDir}/${file.filename}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );
}
