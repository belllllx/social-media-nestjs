import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileDir } from '../types';

export function getObjectS3(
  fileName: string,
  bucketName: string,
  fileDir: FileDir,
  s3: S3Client,
) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: `${fileDir}/${fileName}`,
    }),
    {
      expiresIn: 60 * 60 * 24,
    },
  );
}
