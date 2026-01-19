import { S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { NotificationService } from 'src/notification/notification.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserService } from 'src/user/user.service';
import { CommentGateway } from './comment.gateway';
import { genFilesName } from 'src/utils/helpers/gen-files-name';
import { getFileDirFromFileMulter } from 'src/utils/helpers/get-file-dir-from-file-multer';
import { putObjectS3 } from 'src/utils/helpers/put-object-s3';
import { getObjectS3 } from 'src/utils/helpers/get-object-s3';
import { FileDir } from 'src/utils/types';
import {
  ContentType,
  NotificationType,
} from 'generated/prisma';
import { getFileNameFromPresignedUrl } from 'src/utils/helpers/get-filename-from-presigned-url';
import { getFileDirFromPresignedUrl } from 'src/utils/helpers/get-file-dir-from-presigned-url';
import { deleteFileFromS3 } from 'src/utils/helpers/delete-file-from-s3';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CreateCommentDto } from './dto/create-comment.dto';
import { getFiles } from 'src/utils/helpers/get-files';
import { createNotification } from 'src/utils/helpers/create-notification';

@Injectable()
export class CommentService {
  private s3: S3Client;

  constructor(
    configServiceParam: ConfigService,
    private configService: ConfigService,
    private prismaService: PrismaService,
    private notificationService: NotificationService,
    private userService: UserService,
    private notificationGateway: NotificationGateway,
    private commentGateway: CommentGateway,
  ) {
    this.s3 = new S3Client({
      region: configServiceParam.get<string>('AWS_BUCKET_REGION')!,
      credentials: {
        accessKeyId: configServiceParam.get<string>('AWS_ACCESS_KEY')!,
        secretAccessKey: configServiceParam.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        )!,
      },
    });
  }

  async createFile(file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException('File cannot be empty');
      }

      let fileDir: FileDir;

      const newFileName = genFilesName(file);
      fileDir = getFileDirFromFileMulter(newFileName, 'comment');
      await putObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        fileDir,
        this.s3,
      );

      fileDir = getFileDirFromFileMulter(newFileName, 'comment');
      const filesUrl = await getObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        fileDir,
        this.s3,
      );

      await this.prismaService.file.create({
        data: {
          fileName: `${fileDir}/${newFileName.filename}`,
          contentType: ContentType.COMMENT,
        },
      });

      return {
        filesUrl,
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async deleteFile(fileUrl: string) {
    try {
      const fileName = getFileNameFromPresignedUrl(fileUrl);
      const fileDir = getFileDirFromPresignedUrl(fileUrl);

      const file = await this.prismaService.file.findFirst({
        where: {
          fileName: `${fileDir}/${fileName}`,
        },
      });
      if (!file) {
        throw new NotFoundException(`File name ${fileUrl} not found`);
      }

      await Promise.all([
        this.prismaService.file.delete({
          where: {
            id: file.id,
            fileName: `${fileDir}/${fileName}`,
            contentType: ContentType.COMMENT,
          },
        }),
        deleteFileFromS3(file, this.configService, this.s3),
      ]);
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async createComment(
    createCommentDto: CreateCommentDto & { userId: string; postId: string },
  ) {
    const { message, userId, postId, fileUrl } = createCommentDto;

    if (!message && !fileUrl) {
      throw new BadRequestException('Comment must contain a message or file');
    }

    try {
      await this.userService.findById(userId);

      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
      });

      if (!post) {
        throw new NotFoundException(`Post with id ${postId} not found`);
      }

      const comment = await this.prismaService.comment.create({
        data: {
          message,
          userId,
          postId,
        },
        include: {
          likes: true,
          user: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      if (!fileUrl) {
        const notification = await createNotification(
          this.notificationService,
          NotificationType.COMMENT,
          userId,
          post.userId,
          'Create a new comment',
          post,
          comment.id,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }
        this.commentGateway.newComment(comment);

        return comment;
      }

      if (fileUrl) {
        const fileDir = getFileDirFromPresignedUrl(fileUrl);
        const fileName = getFileNameFromPresignedUrl(fileUrl);

        const file = await this.prismaService.file.findFirst({
          where: {
            fileName: `${fileDir}/${fileName}`,
            contentType: ContentType.COMMENT,
          },
        });

        if (file) {
          await this.prismaService.file.update({
            data: {
              contentId: comment.id,
            },
            where: {
              id: file.id,
              fileName: `${fileDir}/${fileName}`,
              contentType: ContentType.COMMENT,
            },
          });
        }

        const filesFromS3 = await getFiles(
          comment.id,
          this.prismaService,
          this.configService,
          this.s3,
        );

        const notification = await createNotification(
          this.notificationService,
          NotificationType.COMMENT,
          userId,
          post.userId,
          'Create a new comment',
          post,
          comment.id,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }

        this.commentGateway.newComment({
          ...comment,
          filesUrl: filesFromS3,
        });

        return {
          ...comment,
          filesUrl: filesFromS3,
        };
      }

      throw new BadRequestException('Cannot create comment');
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      } else if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async createReplyComment(
    createCommentDto: CreateCommentDto & {
      userId: string;
      parentId: string;
      postId: string;
    },
  ) {
    const { message, fileUrl, userId, parentId, postId } = createCommentDto;

    try {
      await this.userService.findById(userId);

      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
        include: {
          user: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const commentParent = await this.prismaService.comment.findUnique({
        where: {
          id: parentId,
        },
      });
      if (!commentParent) {
        throw new NotFoundException(`Comment id ${parentId} not found`);
      }

      const comment = await this.prismaService.comment.create({
        data: {
          message,
          postId,
          userId,
          parentId,
        },
        include: {
          likes: true,
          user: {
            omit: {
              passwordHash: true,
            },
          },
          parent: {
            include: {
              user: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
        },
      });

      if (!fileUrl) {
        const notification = await createNotification(
          this.notificationService,
          NotificationType.SHARE,
          userId,
          commentParent.userId,
          'Reply your comment',
          post,
          comment.id,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }
        this.commentGateway.newComment(comment);

        return comment;
      }

      const fileDir = getFileDirFromPresignedUrl(fileUrl);
      const fileName = getFileNameFromPresignedUrl(fileUrl);

      const file = await this.prismaService.file.findFirst({
        where: {
          fileName: `${fileDir}/${fileName}`,
          contentType: ContentType.COMMENT,
        },
      });

      if (file) {
        await this.prismaService.file.update({
          data: {
            contentId: comment.id,
          },
          where: {
            id: file.id,
            fileName: `${fileDir}/${fileName}`,
            contentType: ContentType.COMMENT,
          },
        });
      }

      const filesFromS3 = await getFiles(
        comment.id,
        this.prismaService,
        this.configService,
        this.s3,
      );

      const notification = await createNotification(
        this.notificationService,
        NotificationType.COMMENT,
        userId,
        commentParent.userId,
        'Reply your comment',
        post,
        comment.id,
      );
      if (notification) {
        this.notificationGateway.sendNotifications(userId, notification);
      }

      this.commentGateway.newComment({
        ...comment,
        filesUrl: filesFromS3,
      });

      return {
        ...comment,
        filesUrl: filesFromS3,
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }
}
