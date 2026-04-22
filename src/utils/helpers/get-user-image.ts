import { User } from "generated/prisma";
import { getFileInfo } from "./get-file-info";
import { isExternalUrl } from "./is-external-url";
import { getObjectS3 } from "./get-object-s3";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";

export async function getUserImage<T extends Omit<User, 'passwordHash'>>(
  user: T,
  configService: ConfigService,
  s3: S3Client,
): Promise<T> {
  // เป็น url ของ google or github login
  if (user.profileUrl && isExternalUrl(user.profileUrl)) {
    return user;
  }

  if (user.profileUrl && user.profileBackgroundUrl) {
    const { fileName: userProfileFileName } = getFileInfo(user.profileUrl);
    const { fileName: userProfileBackgroundFileName } = getFileInfo(user.profileBackgroundUrl);

    const [profileS3Url, profileBackgroundS3Url] = await Promise.all([
      getObjectS3(
        userProfileFileName,
        configService.get<string>('AWS_BUCKET_NAME')!,
        'user-profile-image',
        s3,
      ),
      getObjectS3(
        userProfileBackgroundFileName,
        configService.get<string>('AWS_BUCKET_NAME')!,
        'user-background-image',
        s3,
      ),
    ]);

    return {
      ...user,
      profileUrl: profileS3Url,
      profileBackgroundUrl: profileBackgroundS3Url,
    }
  }

  if (user.profileUrl) {
    const { fileName: userProfileFileName } = getFileInfo(user.profileUrl);

    const profileS3Url = await getObjectS3(
      userProfileFileName,
      configService.get<string>('AWS_BUCKET_NAME')!,
      'user-profile-image',
      s3,
    );

    return {
      ...user,
      profileUrl: profileS3Url,
    }
  }

  if (user.profileBackgroundUrl) {
    const { fileName: userProfileBackgroundFileName } = getFileInfo(user.profileBackgroundUrl);

    const profileBackgroundS3Url = await getObjectS3(
      userProfileBackgroundFileName,
      configService.get<string>('AWS_BUCKET_NAME')!,
      'user-background-image',
      s3,
    );

    return {
      ...user,
      profileBackgroundUrl: profileBackgroundS3Url,
    }
  }

  return user;
}