import { S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
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
import { ContentType, NotificationType, Notification, User } from 'generated/prisma';
import { getFileNameFromPresignedUrl } from 'src/utils/helpers/get-filename-from-presigned-url';
import { getFileDirFromPresignedUrl } from 'src/utils/helpers/get-file-dir-from-presigned-url';
import { deleteFileFromS3 } from 'src/utils/helpers/delete-file-from-s3';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CreateCommentDto } from './dto/create-comment.dto';
import { getFiles } from 'src/utils/helpers/get-files';
import { createNotification } from 'src/utils/helpers/create-notification';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { getFileInfo } from 'src/utils/helpers/get-file-info';
import { findFiles } from 'src/utils/helpers/find-files';
import { deleteObjectS3 } from 'src/utils/helpers/delete-object-s3';
import { Logger } from '@nestjs/common';
import { createTagUserNotification } from 'src/utils/helpers/create-tag-user-notification';
import { Express } from 'express';

@Injectable()
export class CommentService {
  private s3: S3Client;
  private readonly logger = new Logger(CommentService.name);

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
      const newFileName = genFilesName(file);
      const fileDir = getFileDirFromFileMulter(newFileName, 'comment');
      await putObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        fileDir,
        this.s3,
      );

      const fileUrl = await getObjectS3(
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
        fileUrl,
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
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
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
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
          replies: {
            include: {
              likes: {
                include: {
                  user: {
                    omit: {
                      passwordHash: true,
                    },
                  },
                },
              },
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
          NotificationType.COMMENT,
          userId,
          post.userId,
          'Comment on your post',
          post,
          comment,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }
        this.commentGateway.newComment(
          comment.userId,
          {
            ...comment,
            replysCount: comment.replies.length,
          }
        );

        return {
          ...comment,
          replysCount: comment.replies.length,
        };
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

        const fileFromS3 = await getFiles(
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
          'Comment on your post',
          post,
          comment,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }

        this.commentGateway.newComment(
          comment.userId,
          {
            ...comment,
            replysCount: comment.replies.length,
            fileUrl: fileFromS3[0],
          });

        return {
          ...comment,
          replysCount: comment.replies.length,
          fileUrl: fileFromS3[0],
        };
      }

      throw new BadRequestException('Cannot create comment');
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
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
    const { message, fileUrl, userId, parentId, postId, replyToUserId } =
      createCommentDto;
    if (!message && !fileUrl) {
      throw new BadRequestException('Comment must contain a message or file');
    }

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
          replyToUserId,
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
          replies: {
            include: {
              likes: {
                include: {
                  user: {
                    omit: {
                      passwordHash: true,
                    },
                  },
                },
              },
              user: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
          replyToUser: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      let notification: (Notification & { sender: Omit<User, "passwordHash"> }) | undefined;

      if (!fileUrl) {
        notification = await createNotification(
          this.notificationService,
          NotificationType.REPLY,
          userId,
          commentParent.userId,
          'Reply your comment',
          post,
          commentParent,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }
        this.commentGateway.newComment(
          comment.userId,
          {
            ...comment,
            replysCount: comment.replies.length,
          }
        );

        return {
          ...comment,
          replysCount: comment.replies.length,
        };
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

      const fileFromS3 = await getFiles(
        comment.id,
        this.prismaService,
        this.configService,
        this.s3,
      );

      notification = await createNotification(
        this.notificationService,
        NotificationType.REPLY,
        userId,
        commentParent.userId,
        'Reply your comment',
        post,
        commentParent,
      );
      if (notification) {
        this.notificationGateway.sendNotifications(userId, notification);
      }

      this.commentGateway.newComment(
        comment.userId,
        {
          ...comment,
          replysCount: comment.replies.length,
          fileUrl: fileFromS3[0],
        }
      );

      return {
        ...comment,
        replysCount: comment.replies.length,
        fileUrl: fileFromS3[0],
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async createTagUserComment(
    createCommentDto: CreateCommentDto & {
      userId: string;
      parentId: string;
      postId: string;
      replyId: string;
    },
  ) {
    const { message, fileUrl, userId, parentId, postId, replyToUserId, replyId } =
      createCommentDto;
    if (!message && !fileUrl) {
      throw new BadRequestException('Comment must contain a message or file');
    }

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

      const replyComment = await this.prismaService.comment.findUnique({
        where: {
          id: replyId,
        },
      });
      if (!replyComment) {
        throw new NotFoundException(`Reply Comment id ${replyId} not found`);
      }

      const tagComment = await this.prismaService.comment.create({
        data: {
          message,
          postId,
          userId,
          parentId,
          replyToUserId,
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
          replies: {
            include: {
              likes: {
                include: {
                  user: {
                    omit: {
                      passwordHash: true,
                    },
                  },
                },
              },
              user: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
          replyToUser: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      let notification: (Notification & { sender: Omit<User, "passwordHash"> }) | undefined;

      if (!fileUrl) {
        notification = await createTagUserNotification(
          this.notificationService,
          NotificationType.REPLY,
          userId,
          replyComment.userId,
          'Tag you in comment',
          post,
          replyComment,
        );
        if (notification) {
          this.notificationGateway.sendNotifications(userId, notification);
        }
        this.commentGateway.newComment(
          tagComment.userId,
          {
            ...tagComment,
            replysCount: tagComment.replies.length,
          }
        );

        return {
          ...tagComment,
          replysCount: tagComment.replies.length,
        };
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
            contentId: tagComment.id,
          },
          where: {
            id: file.id,
            fileName: `${fileDir}/${fileName}`,
            contentType: ContentType.COMMENT,
          },
        });
      }

      const fileFromS3 = await getFiles(
        tagComment.id,
        this.prismaService,
        this.configService,
        this.s3,
      );

      notification = await createTagUserNotification(
        this.notificationService,
        NotificationType.REPLY,
        userId,
        replyComment.userId,
        'Tag you in comment',
        post,
        replyComment,
      );
      if (notification) {
        this.notificationGateway.sendNotifications(userId, notification);
      }

      this.commentGateway.newComment(
        tagComment.userId,
        {
          ...tagComment,
          replysCount: tagComment.replies.length,
          fileUrl: fileFromS3[0],
        }
      );

      return {
        ...tagComment,
        replysCount: tagComment.replies.length,
        fileUrl: fileFromS3[0],
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findComments(postId: string, cursor?: string, limit: number = 5) {
    try {
      const commentOfPost = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
      });
      if (!commentOfPost) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const comments = await this.prismaService.comment.findMany({
        take: -(limit + 1),
        cursor: cursor
          ? {
            id: cursor,
          }
          : undefined,
        include: {
          likes: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              user: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
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
          replies: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              likes: {
                orderBy: {
                  createdAt: 'desc',
                },
                include: {
                  user: {
                    omit: {
                      passwordHash: true,
                    },
                  },
                },
              },
              user: {
                omit: {
                  passwordHash: true,
                },
              },
              replyToUser: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
        },
        where: {
          postId: commentOfPost.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const filterOnlyComment = comments.filter((comment) => !comment.parentId);

      const commentsWithFiles = await Promise.all(
        filterOnlyComment.map(async (comment) => {
          const filesFromS3 = await getFiles(
            comment.id,
            this.prismaService,
            this.configService,
            this.s3,
          );

          if (comment.replies.length) {
            return {
              ...comment,
              replysCount: comment.replies.length,
              fileUrl: filesFromS3[0],
              replies: await Promise.all(
                comment.replies.map(async (reply) => {
                  const replyFilesFromS3 = await getFiles(
                    reply.id,
                    this.prismaService,
                    this.configService,
                    this.s3,
                  );

                  return {
                    ...reply,
                    fileUrl: replyFilesFromS3[0],
                  };
                }),
              ),
            };
          }

          return {
            ...comment,
            replysCount: comment.replies.length,
            fileUrl: filesFromS3[0],
          };
        }),
      );

      let nextCursor: string | null = null;

      if (commentsWithFiles.length > limit) {
        const nextItem = commentsWithFiles.shift();
        nextCursor = nextItem!.id;
      }

      return {
        comments: commentsWithFiles,
        nextCursor,
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async updateComment(
    updateCommentDto: UpdateCommentDto & { commentId: string },
  ) {
    const { message, fileUrl, shouldDeleteCurrentFile, commentId } =
      updateCommentDto;

    if (!message && !fileUrl) {
      throw new BadRequestException('Comment must contain a message or file');
    }

    try {
      const commentRecord = await this.prismaService.comment.findUnique({
        where: {
          id: commentId,
        },
      });
      if (!commentRecord) {
        throw new NotFoundException(`Comment id ${commentId} not found`);
      }

      const comment = await this.prismaService.comment.update({
        where: {
          id: commentId,
        },
        data: {
          message,
        },
        include: {
          likes: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              user: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
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
          replies: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              likes: {
                orderBy: {
                  createdAt: 'desc',
                },
                include: {
                  user: {
                    omit: {
                      passwordHash: true,
                    },
                  },
                },
              },
              user: {
                omit: {
                  passwordHash: true,
                },
              },
              replyToUser: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
          replyToUser: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      if (!fileUrl || !shouldDeleteCurrentFile) {
        const fileRecords = await this.prismaService.file.findMany({
          where: {
            contentId: comment.id,
            contentType: ContentType.COMMENT,
          },
        });

        let filesData: { fileName: string; fileDir: FileDir }[] = [];
        fileRecords.forEach((fileRecord) => {
          const { fileDir, fileName } = getFileInfo(fileRecord.fileName);
          filesData.push({
            fileName,
            fileDir: fileDir as FileDir,
          });
        });
        const filesUrl = await Promise.all(
          filesData.map((fileData) => {
            return getObjectS3(
              fileData.fileName,
              this.configService.get<string>('AWS_BUCKET_NAME')!,
              fileData.fileDir,
              this.s3,
            );
          }),
        );

        this.commentGateway.updateComment(
          comment.userId,
          {
            ...comment,
            replysCount: comment.replies.length,
            fileUrl: filesUrl[0],
          }
        );

        return {
          ...comment,
          replysCount: comment.replies.length,
          fileUrl: filesUrl[0],
        };
      }

      if (fileUrl && shouldDeleteCurrentFile) {
        const commentFiles = await findFiles(comment.id, this.prismaService);

        if (commentFiles && commentFiles.length) {
          await Promise.all(
            commentFiles.map((commentFile) => {
              const { fileDir, fileName } = getFileInfo(commentFile.fileName);
              return deleteObjectS3(
                fileName,
                this.configService.get<string>('AWS_BUCKET_NAME')!,
                fileDir as FileDir,
                this.s3,
              );
            }),
          );
        }

        const fileDir = getFileDirFromPresignedUrl(fileUrl) as FileDir;
        const filename = getFileNameFromPresignedUrl(fileUrl);
        const fileUrlS3 = await getObjectS3(
          filename,
          this.configService.get<string>('AWS_BUCKET_NAME')!,
          fileDir,
          this.s3,
        );

        await Promise.all(
          commentFiles.map(async (commentFile) => {
            return this.prismaService.file.deleteMany({
              where: {
                fileName: commentFile.fileName,
                contentId: comment.id,
                contentType: ContentType.COMMENT,
              },
            });
          }),
        );

        const newfileDir = getFileDirFromPresignedUrl(fileUrl);
        const newfileName = getFileNameFromPresignedUrl(fileUrl);

        const file = await this.prismaService.file.findFirst({
          where: {
            fileName: `${newfileDir}/${newfileName}`,
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
              fileName: `${newfileDir}/${newfileName}`,
              contentType: ContentType.COMMENT,
            },
          });
        }

        this.commentGateway.updateComment(
          comment.userId,
          {
            ...comment,
            replysCount: comment.replies.length,
            fileUrl: fileUrlS3,
          }
        );

        return {
          ...comment,
          replysCount: comment.replies.length,
          fileUrl: fileUrlS3,
        };
      }

      throw new UnprocessableEntityException('Error cannot update post');
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async deleteComment(commentId: string, postId: string) {
    try {
      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
      });
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const comment = await this.prismaService.comment.findUnique({
        where: {
          id: commentId,
        },
        include: {
          parent: true,
        },
      });
      if (!comment) {
        throw new NotFoundException(`Comment id ${commentId} not found`);
      }

      const users = await this.prismaService.user.findMany({
        where: {
          id: {
            not: comment.userId,
          },
        },
        omit: {
          passwordHash: true,
        },
      });

      for (const user of users) {
        if (comment.parent) {
          const notification = await this.notificationService.findByUser(
            comment.userId,
            user.id,
            NotificationType.REPLY,
            post.id,
            comment.parent.id,
          );
          if (notification) {
            await this.notificationService.delete(notification);

            this.notificationGateway.sendNotifications(
              comment.userId,
              notification,
            );
          }
        } else {
          const notifications = await this.notificationService.findsNoti(
            comment.userId,
            user.id,
            post.id,
            comment.id,
          );
          if (notifications.length) {
            this.notificationGateway.sendNotifications(
              comment.userId,
              notifications,
            );
          }
        }
      }

      const commentFiles = await findFiles(comment.id, this.prismaService);
      for (const commentFile of commentFiles) {
        const { fileDir, fileName } = getFileInfo(commentFile.fileName);
        await deleteObjectS3(
          fileName,
          this.configService.get<string>('AWS_BUCKET_NAME')!,
          fileDir as FileDir,
          this.s3,
        );

        await this.prismaService.file.delete({
          where: {
            id: commentFile.id,
            fileName: commentFile.fileName,
            contentId: comment.id,
            contentType: ContentType.COMMENT,
          },
        });
      }

      const deletedComment = await this.prismaService.comment.delete({
        where: {
          id: comment.id,
        },
      });

      if (deletedComment.parentId) {
        this.commentGateway.deleteReplyComment(comment.userId, deletedComment);
      } else {
        this.commentGateway.deleteComment(comment.userId, deletedComment);
      }

      return deletedComment;
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async like(activeUserId: string, postId: string, commentId: string) {
    try {
      await this.userService.findById(activeUserId);
      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
      });
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const comment = await this.prismaService.comment.findUnique({
        where: {
          id: commentId,
        },
      });
      if (!comment) {
        throw new NotFoundException(`Comment id ${postId} not found`);
      }

      const like = await this.prismaService.like.findFirst({
        where: {
          userId: activeUserId,
          commentId,
        },
      });
      if (!like) {
        const createdLike = await this.prismaService.like.create({
          data: {
            userId: activeUserId,
            commentId,
          },
          include: {
            user: {
              omit: {
                passwordHash: true,
              },
            },
          },
        });
        const notification = await this.notificationService.create({
          type: NotificationType.LIKE,
          senderId: activeUserId,
          receiverId: comment.userId,
          postId,
          commentId,
          message: 'Like your comment',
        });
        this.notificationGateway.sendNotifications(activeUserId, notification);
        this.commentGateway.newLike(activeUserId, createdLike);

        return {
          message: 'Like successfully',
          data: createdLike,
        };
      }

      const deletedLike = await this.prismaService.like.delete({
        where: {
          id: like.id,
          userId: activeUserId,
          commentId,
        },
        include: {
          user: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      const notification = await this.notificationService.findByUser(
        activeUserId,
        comment.userId,
        NotificationType.LIKE,
        postId,
        commentId,
      );
      if (notification) {
        await this.notificationService.delete(notification);
        this.notificationGateway.sendNotifications(activeUserId, notification);
      }

      this.commentGateway.newLike(activeUserId, deletedLike);

      return {
        message: 'Unlike successfully',
        data: deletedLike,
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }
}
