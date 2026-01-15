import { PrismaService } from "src/prisma/prisma.service";
import { findFiles } from "./find-files";
import { getFileNameFromPresignedUrl } from "./get-filename-from-presigned-url";
import { getFileDirFromPresignedUrl } from "./get-file-dir-from-presigned-url";
import { FileDir } from "../types";
import { getObjectS3 } from "./get-object-s3";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";

export async function getFiles(
  postId: string,
  prismaService: PrismaService,
  configService: ConfigService,
  s3: S3Client,
) {
  const files = await findFiles(postId, prismaService);
  const filesUrl = files.map((file) => file.fileUrl);
  return Promise.all(
    filesUrl.map((fileUrl) => {
      const fileName = getFileNameFromPresignedUrl(fileUrl);
      const fileDir = getFileDirFromPresignedUrl(fileUrl) as FileDir;
      return getObjectS3(
        fileName,
        configService.get<string>('AWS_BUCKET_NAME')!,
        fileDir,
        s3,
      );
    }),
  );
}
