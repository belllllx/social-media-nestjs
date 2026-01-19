import { PrismaService } from "src/prisma/prisma.service";
import { findFiles } from "./find-files";
import { getObjectS3 } from "./get-object-s3";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { getFileInfo } from "./get-file-info";
import { FileDir } from "../types";

export async function getFiles(
  contentId: string,
  prismaService: PrismaService,
  configService: ConfigService,
  s3: S3Client,
) {
  const files = await findFiles(contentId, prismaService);
  const filesName = files.map((file) => file.fileName);

  return Promise.all(
    filesName.map((fileNameData) => {
      const { fileDir, fileName } = getFileInfo(fileNameData);
      return getObjectS3(
        fileName,
        configService.get<string>('AWS_BUCKET_NAME')!,
        fileDir as FileDir,
        s3,
      );
    }),
  );
}
