import { S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import {
  ContentType,
  Notification,
  NotificationType,
  User,
} from 'generated/prisma';
import { createFileRecords } from 'src/utils/helpers/create-file-records';
import { putObjectS3 } from 'src/utils/helpers/put-object-s3';
import { getObjectS3 } from 'src/utils/helpers/get-object-s3';
import { genFilesName } from 'src/utils/helpers/gen-files-name';
import { findFiles } from 'src/utils/helpers/find-files';
import { getFileNameFromPresignedUrl } from 'src/utils/helpers/get-filename-from-presigned-url';
import { UpdatePostDto } from './dto/update-post.dto';
import { deleteObjectS3 } from 'src/utils/helpers/delete-object-s3';
import { getFileDirFromFileMulter } from 'src/utils/helpers/get-file-dir-from-file-multer';
import { getFileDirFromPresignedUrl } from 'src/utils/helpers/get-file-dir-from-presigned-url';
import { FileDir } from 'src/utils/types';
import { NotificationService } from 'src/notification/notification.service';
import { createNotifications } from 'src/utils/helpers/create-notifications';
import { createNotification } from 'src/utils/helpers/create-notification';
import { UserService } from 'src/user/user.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { PostGateway } from './post.gateway';
import { deleteFileFromS3 } from 'src/utils/helpers/delete-file-from-s3';
import { getFiles } from 'src/utils/helpers/get-files';
import { getFileInfo } from 'src/utils/helpers/get-file-info';
import { CreateSharePostDto } from './dto/create-share-post.dto';
import { Logger } from '@nestjs/common';
import { Express } from 'express';

@Injectable()
export class PostService {
  private s3: S3Client;
  private readonly logger = new Logger(PostService.name);

  constructor(
    configServiceParam: ConfigService,
    private configService: ConfigService,
    private prismaService: PrismaService,
    private notificationService: NotificationService,
    private userService: UserService,
    private notificationGateway: NotificationGateway,
    private postGateway: PostGateway,
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

  async createFiles(files: Express.Multer.File[]) {
    try {
      if (!files || !files.length) {
        throw new BadRequestException('Files cannot be empty');
      }

      const newFilesName = genFilesName(files);
      await Promise.all(
        newFilesName.map((newFileName) => {
          const fileDir = getFileDirFromFileMulter(newFileName, 'post');
          return putObjectS3(
            newFileName,
            this.configService.get<string>('AWS_BUCKET_NAME')!,
            fileDir,
            this.s3,
          );
        }),
      );

      const filesUrl = await Promise.all(
        newFilesName.map((newFileName) => {
          const fileDir = getFileDirFromFileMulter(newFileName, 'post');
          return getObjectS3(
            newFileName,
            this.configService.get<string>('AWS_BUCKET_NAME')!,
            fileDir,
            this.s3,
          );
        }),
      );

      const createFileRecordsData = createFileRecords(
        newFilesName,
        ContentType.POST,
      );
      await this.prismaService.file.createMany({
        data: createFileRecordsData,
      });

      return {
        filesUrl,
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async createPost(createPostDto: CreatePostDto & { userId: string }) {
    const { message, userId, filesUrl } = createPostDto;
    let notifications: (Notification & {
      sender: Omit<User, 'passwordHash'>;
    })[];
    if (!message && (!filesUrl || !filesUrl.length)) {
      throw new BadRequestException('Post must contain a message or files');
    }

    try {
      await this.userService.findById(userId);
      const post = await this.prismaService.post.create({
        data: {
          message,
          userId,
        },
        include: {
          likes: true,
          user: {
            omit: {
              passwordHash: true,
            },
          },
          comments: true,
        },
      });

      if (!filesUrl || !filesUrl.length) {
        notifications = await createNotifications(
          this.prismaService,
          this.notificationService,
          NotificationType.POST,
          userId,
          'Create a new post',
          post.id,
        );
        notifications.forEach((notification) => {
          this.notificationGateway.sendNotifications(userId, notification);
        });
        this.postGateway.newPost(
          post.userId,
          {
            ...post,
            commentsCount: post.comments.length,
          }
        );

        return {
          ...post,
          commentsCount: post.comments.length,
        };
      }

      if (filesUrl && filesUrl.length) {
        for (const fileUrl of filesUrl) {
          const fileDir = getFileDirFromPresignedUrl(fileUrl);
          const fileName = getFileNameFromPresignedUrl(fileUrl);

          const file = await this.prismaService.file.findFirst({
            where: {
              fileName: `${fileDir}/${fileName}`,
              contentType: ContentType.POST,
            },
          });

          if (file) {
            await this.prismaService.file.update({
              data: {
                contentId: post.id,
              },
              where: {
                id: file.id,
                fileName: `${fileDir}/${fileName}`,
                contentType: ContentType.POST,
              },
            });
          }
        }

        const filesFromS3 = await getFiles(
          post.id,
          this.prismaService,
          this.configService,
          this.s3,
        );

        notifications = await createNotifications(
          this.prismaService,
          this.notificationService,
          NotificationType.POST,
          userId,
          'Create a new post',
          post.id,
        );
        notifications.forEach((notification) => {
          this.notificationGateway.sendNotifications(userId, notification);
        });
        this.postGateway.newPost(
          post.userId,
          {
            ...post,
            filesUrl: filesFromS3,
            commentsCount: post.comments.length,
          }
        );

        return {
          ...post,
          filesUrl,
          commentsCount: post.comments.length,
        };
      }

      throw new BadRequestException('Cannot create post');
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof BadRequestException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async createSharePost(
    createPostDto: CreateSharePostDto & { userId: string; parentId: string },
  ) {
    const { message, userId, parentId } = createPostDto;

    try {
      await this.userService.findById(userId);

      const post = await this.prismaService.post.findUnique({
        where: {
          id: parentId,
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
        throw new NotFoundException(`Parent id ${parentId} not found`);
      }

      const sharePost = await this.prismaService.post.create({
        data: {
          message,
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
          comments: true,
        },
      });
      const notification = await createNotification(
        this.notificationService,
        NotificationType.SHARE,
        userId,
        post.userId,
        'Share your post',
        sharePost,
      );
      if (notification) {
        this.notificationGateway.sendNotifications(userId, notification);
      }

      const filesFromS3 = await getFiles(
        post.id,
        this.prismaService,
        this.configService,
        this.s3,
      );
      this.postGateway.newPost(
        sharePost.userId,
        {
          ...sharePost,
          commentsCount: sharePost.comments.length,
          parent: {
            ...post,
            filesUrl: filesFromS3,
          },
        }
      );

      return {
        ...sharePost,
        commentsCount: sharePost.comments.length,
        parent: {
          ...post,
          filesUrl: filesFromS3,
        },
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

  async findPosts(cursor?: string, limit: number = 5) {
    try {
      const posts = await this.prismaService.post.findMany({
        take: limit + 1,
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
          comments: {
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
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const postsWithFiles = await Promise.all(
        posts.map(async (post) => {
          const commentsCount = post.comments.filter(
            (comment) => !comment.parentId,
          ).length;

          const filesFromS3 = await getFiles(
            post.id,
            this.prismaService,
            this.configService,
            this.s3,
          );

          if (post.parent) {
            const postParentFilesFromS3 = await getFiles(
              post.parent.id,
              this.prismaService,
              this.configService,
              this.s3,
            );

            return {
              ...post,
              commentsCount,
              filesUrl: filesFromS3,
              parent: {
                ...post.parent,
                filesUrl: postParentFilesFromS3,
              },
            };
          }

          return {
            ...post,
            commentsCount,
            filesUrl: filesFromS3,
          };
        }),
      );

      let nextCursor: string | null = null;

      if (postsWithFiles.length > limit) {
        const nextItem = postsWithFiles.pop();
        nextCursor = nextItem!.id;
      }

      return {
        posts: postsWithFiles,
        nextCursor,
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

  async findPostById(postId: string) {
    try {
      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
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
          comments: {
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
        },
      });
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const commentsCount = post.comments.filter(
        (comment) => !comment.parentId,
      ).length;

      const filesFromS3 = await getFiles(
        post.id,
        this.prismaService,
        this.configService,
        this.s3,
      );

      if (post.parent) {
        const postParentFilesFromS3 = await getFiles(
          post.parent.id,
          this.prismaService,
          this.configService,
          this.s3,
        );

        return {
          ...post,
          commentsCount,
          filesUrl: filesFromS3,
          parent: {
            ...post.parent,
            filesUrl: postParentFilesFromS3,
          },
        };
      }

      return {
        ...post,
        commentsCount,
        filesUrl: filesFromS3,
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

  async findPostByUser(userId: string, cursor?: string, limit: number = 5) {
    try {
      await this.userService.findById(userId);

      const posts = await this.prismaService.post.findMany({
        where: {
          userId,
        },
        take: limit + 1,
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
          comments: {
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
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      if (!posts || !posts.length) {
        throw new NotFoundException(`Post by user id ${userId} not found`);
      }

      const postsWithFiles = await Promise.all(
        posts.map(async (post) => {
          const commentsCount = post.comments.filter(
            (comment) => !comment.parentId,
          ).length;

          const filesFromS3 = await getFiles(
            post.id,
            this.prismaService,
            this.configService,
            this.s3,
          );

          if (post.parent) {
            const postParentFilesFromS3 = await getFiles(
              post.parent.id,
              this.prismaService,
              this.configService,
              this.s3,
            );

            return {
              ...post,
              commentsCount,
              filesUrl: filesFromS3,
              parent: {
                ...post.parent,
                filesUrl: postParentFilesFromS3,
              },
            };
          }

          return {
            ...post,
            commentsCount,
            filesUrl: filesFromS3,
          };
        }),
      );

      let nextCursor: string | null = null;

      if (postsWithFiles.length > limit) {
        const nextItem = postsWithFiles.pop();
        nextCursor = nextItem!.id;
      }

      return {
        posts: postsWithFiles,
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

  async updatePost(updatePostDto: UpdatePostDto & { postId: string }) {
    const { message, postId, filesUrl, shouldDeleteCurrentFiles } =
      updatePostDto;
    if (!message && (!filesUrl || !filesUrl.length)) {
      throw new BadRequestException('Post must contain a message or files');
    }

    try {
      const postRecord = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
      });
      if (!postRecord) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const post = await this.prismaService.post.update({
        where: {
          id: postId,
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
          comments: {
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
        },
      });

      const commentsCount = post.comments.filter(
        (comment) => !comment.parentId,
      ).length;

      if (!filesUrl || !filesUrl.length || !shouldDeleteCurrentFiles) {
        const fileRecords = await this.prismaService.file.findMany({
          where: {
            contentId: post.id,
            contentType: ContentType.POST,
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

        if (post.parent) {
          const postParentFilesFromS3 = await getFiles(
            post.parent.id,
            this.prismaService,
            this.configService,
            this.s3,
          );

          this.postGateway.updatePost(
            post.userId,
            {
              ...post,
              commentsCount,
              filesUrl,
            }
          );

          return {
            ...post,
            commentsCount,
            filesUrl,
            parent: {
              ...post.parent,
              filesUrl: postParentFilesFromS3,
            },
          };
        }

        this.postGateway.updatePost(
          post.userId,
          {
            ...post,
            commentsCount,
            filesUrl,
          }
        );

        return {
          ...post,
          commentsCount,
          filesUrl,
        };
      }

      if (filesUrl && filesUrl.length && shouldDeleteCurrentFiles) {
        const postFiles = await findFiles(post.id, this.prismaService);

        if (postFiles && postFiles.length) {
          await Promise.all(
            postFiles.map((postFile) => {
              const { fileDir, fileName } = getFileInfo(postFile.fileName);
              return deleteObjectS3(
                fileName,
                this.configService.get<string>('AWS_BUCKET_NAME')!,
                fileDir as FileDir,
                this.s3,
              );
            }),
          );
        }

        const filesUrlS3 = await Promise.all(
          filesUrl.map((fileUrl) => {
            const fileDir = getFileDirFromPresignedUrl(fileUrl) as FileDir;
            const filename = getFileNameFromPresignedUrl(fileUrl);
            return getObjectS3(
              filename,
              this.configService.get<string>('AWS_BUCKET_NAME')!,
              fileDir,
              this.s3,
            );
          }),
        );

        await Promise.all(
          postFiles.map(async (postFile) => {
            return this.prismaService.file.deleteMany({
              where: {
                fileName: postFile.fileName,
                contentId: post.id,
                contentType: ContentType.POST,
              },
            });
          }),
        );

        for (const fileUrl of filesUrl) {
          const fileDir = getFileDirFromPresignedUrl(fileUrl);
          const fileName = getFileNameFromPresignedUrl(fileUrl);

          const file = await this.prismaService.file.findFirst({
            where: {
              fileName: `${fileDir}/${fileName}`,
              contentType: ContentType.POST,
            },
          });

          if (file) {
            await this.prismaService.file.update({
              data: {
                contentId: post.id,
              },
              where: {
                id: file.id,
                fileName: `${fileDir}/${fileName}`,
                contentType: ContentType.POST,
              },
            });
          }
        }

        if (post.parent) {
          const postParentFilesFromS3 = await getFiles(
            post.parent.id,
            this.prismaService,
            this.configService,
            this.s3,
          );

          this.postGateway.updatePost(
            post.userId,
            {
              ...post,
              commentsCount,
              filesUrl: filesUrlS3,
            }
          );

          return {
            ...post,
            commentsCount,
            filesUrl,
            parent: {
              ...post.parent,
              filesUrl: postParentFilesFromS3,
            },
          };
        }

        this.postGateway.updatePost(
          post.userId,
          {
            ...post,
            commentsCount,
            filesUrl: filesUrlS3,
          }
        );

        return {
          ...post,
          commentsCount,
          filesUrl: filesUrlS3,
        };
      }

      throw new UnprocessableEntityException('Error cannot update post');
    } catch (error: unknown) {
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

  async deletePost(postId: string) {
    try {
      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
        include: {
          parent: true,
        },
      });
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const users = await this.prismaService.user.findMany({
        where: {
          id: {
            not: post.userId,
          },
        },
        omit: {
          passwordHash: true,
        },
      });

      for (const user of users) {
        if (post.parent) {
          const notifications = await this.notificationService.findsNoti(
            post.userId,
            user.id,
            post.parent.id,
          );
          if (notifications.length) {
            await this.notificationService.delete(notifications);

            this.notificationGateway.sendNotifications(
              post.userId,
              notifications,
            );
          }
        } else {
          const notifications = await this.notificationService.findsNoti(
            post.userId,
            user.id,
            post.id,
          );
          if (notifications.length) {
            this.notificationGateway.sendNotifications(
              post.userId,
              notifications,
            );
          }
        }
      }

      const postFiles = await findFiles(post.id, this.prismaService);

      for (const postFile of postFiles) {
        const { fileDir, fileName } = getFileInfo(postFile.fileName);
        await deleteObjectS3(
          fileName,
          this.configService.get<string>('AWS_BUCKET_NAME')!,
          fileDir as FileDir,
          this.s3,
        );

        await this.prismaService.file.delete({
          where: {
            id: postFile.id,
            fileName: postFile.fileName,
            contentId: post.id,
            contentType: ContentType.POST,
          },
        });
      }

      const deletedPost = await this.prismaService.post.delete({
        where: {
          id: postId,
        },
      });

      this.postGateway.deletePost(post.userId, post);

      return deletedPost;
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
            contentType: ContentType.POST,
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

  async like(activeUserId: string, postId: string) {
    try {
      await this.userService.findById(activeUserId);
      const post = await this.findPostById(postId);
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const like = await this.prismaService.like.findFirst({
        where: {
          userId: activeUserId,
          postId,
        },
      });
      if (!like) {
        const createdLike = await this.prismaService.like.create({
          data: {
            userId: activeUserId,
            postId,
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
          receiverId: post.userId,
          postId,
          message: 'Like your post',
        });
        this.notificationGateway.sendNotifications(activeUserId, notification);
        this.postGateway.newLike(activeUserId, createdLike);

        return {
          message: 'Like successfully',
          data: createdLike,
        };
      }

      const deletedLike = await this.prismaService.like.delete({
        where: {
          id: like.id,
          userId: activeUserId,
          postId,
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
        post.userId,
        NotificationType.LIKE,
        postId,
      );
      if (notification) {
        await this.notificationService.delete(notification);
        this.notificationGateway.sendNotifications(activeUserId, notification);
      }

      this.postGateway.newLike(activeUserId, deletedLike);

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
