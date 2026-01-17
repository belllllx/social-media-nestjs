import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileDir } from '../types';

export function getObjectS3(
  file: Express.Multer.File | string,
  bucketName: string,
  fileDir: FileDir,
  s3: S3Client,
) {
  if (typeof file === 'string') {
    return getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `${fileDir}/${file}`,
      }),
      {
        expiresIn: 60 * 60 * 24,
      },
    );
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: `${fileDir}/${file.filename}`,
    }),
    {
      expiresIn: 60 * 60 * 24,
    },
  );
}
