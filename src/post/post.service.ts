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
import { ContentType, Like, Notification, Post, User } from 'generated/prisma';
import { createFileRecords } from 'src/utils/helpers/create-file-records';
import { putObjectS3 } from 'src/utils/helpers/put-object-s3';
import { getObjectS3 } from 'src/utils/helpers/get-object-s3';
import { genFilesName } from 'src/utils/helpers/gen-files-name';
import { findFiles } from 'src/utils/helpers/find-files';
import { getFileNameFromPresignedUrl } from 'src/utils/helpers/get-filename-from-presigned-url';
import { UpdatePostDto } from './dto/update-post.dto';
import { deleteObjectS3 } from 'src/utils/helpers/delete-object-s3';
import { getFileDirFromFile } from 'src/utils/helpers/get-file-dir-from-file';
import { getFileDirFromPresignedUrl } from 'src/utils/helpers/get-file-dir-from-presigned-url';
import { FileDir } from 'src/utils/types';
import { NotificationService } from 'src/notification/notification.service';
import { createNotifications } from 'src/utils/helpers/create-notifications';
import { createNotification } from 'src/utils/helpers/create-notification';
import { UserService } from 'src/user/user.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { PostGateway } from './post.gateway';
import { deleteFileFromS3 } from 'src/utils/helpers/delete-file-from-s3';
import { Express } from 'express';

@Injectable()
export class PostService {
  private s3: S3Client;

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
          const fileDir = getFileDirFromFile(newFileName, 'post');
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
          const fileDir = getFileDirFromFile(newFileName, 'post');
          return getObjectS3(
            newFileName.originalname,
            this.configService.get<string>('AWS_BUCKET_NAME')!,
            fileDir,
            this.s3,
          );
        }),
      );

      const createFileRecordsData = createFileRecords(filesUrl, ContentType.POST);
      await this.prismaService.file.createMany({
        data: createFileRecordsData,
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

  async createPost(createPostDto: CreatePostDto & { userId: string }): Promise<
    Post & {
      user: Omit<User, 'passwordHash'>;
      likes: Like[];
      filesUrl?: string[];
    }
  > {
    const { message, userId, filesUrl } = createPostDto;
    let notifications: (Notification & {
      sender: Omit<User, 'passwordHash'>;
    })[];
    if (!message && (!filesUrl || !filesUrl.length)) {
      throw new BadRequestException('Post must contain a message or files');
    }

    try {
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new NotFoundException(`User id ${userId} not found`);
      }

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
        },
      });

      if (!filesUrl || !filesUrl.length) {
        notifications = await createNotifications(
          this.prismaService,
          this.notificationService,
          userId,
          post.id,
        );
        notifications.forEach((notification) => {
          this.notificationGateway.sendNotifications(userId, notification);
        });
        this.postGateway.broadcastNewPost(userId, post);

        return post;
      }

      if (filesUrl && filesUrl.length) {
        const postFileRecords = createFileRecords(
          filesUrl,
          ContentType.POST,
          post.id,
        );
        await this.prismaService.file.createMany({
          data: postFileRecords,
        });
        notifications = await createNotifications(
          this.prismaService,
          this.notificationService,
          userId,
          post.id,
        );
        notifications.forEach((notification) => {
          this.notificationGateway.sendNotifications(userId, notification);
        });
        this.postGateway.broadcastNewPost(userId, post);

        return {
          ...post,
          filesUrl,
        };
      }

      throw new BadRequestException('Cannot create post');
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async createSharePost(
    createPostDto: CreatePostDto & { userId: string; parentId: string },
  ): Promise<Post & { user: Omit<User, 'passwordHash'>; likes: Like[] }> {
    const { message, userId, parentId } = createPostDto;

    try {
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new NotFoundException(`User id ${userId} not found`);
      }

      const post = await this.prismaService.post.findUnique({
        where: {
          id: parentId,
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
        },
      });
      const notification = await createNotification(
        this.notificationService,
        userId,
        post,
      );
      if (notification) {
        this.notificationGateway.sendNotifications(userId, notification);
      }
      this.postGateway.broadcastNewPost(userId, sharePost);

      return sharePost;
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      } else if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findPosts(
    cursor?: string,
    limit: number = 5,
  ): Promise<{
    posts: (Post & {
      user: Omit<User, 'passwordHash'>;
      likes: Like[];
      filesUrl: string[];
    })[];
    nextCursor: string | null;
  }> {
    try {
      const posts = await this.prismaService.post.findMany({
        take: -(limit + 1),
        cursor: cursor
          ? {
              id: cursor,
            }
          : undefined,
        include: {
          likes: true,
          user: {
            omit: {
              passwordHash: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const postsWithFiles = await Promise.all(
        posts.map(async (post) => {
          const files = await findFiles(post.id, this.prismaService);
          const filesUrl = files.map((file) => file.fileUrl);
          const filesFromS3 = await Promise.all(
            filesUrl.map((fileUrl) => {
              const fileName = getFileNameFromPresignedUrl(fileUrl);
              const fileDir = getFileDirFromPresignedUrl(fileUrl) as FileDir;
              return getObjectS3(
                fileName,
                this.configService.get<string>('AWS_BUCKET_NAME')!,
                fileDir,
                this.s3,
              );
            }),
          );

          return {
            ...post,
            filesUrl: filesFromS3,
          };
        }),
      );

      let nextCursor: string | null = null;

      if (postsWithFiles.length > limit) {
        const nextItem = postsWithFiles.shift();
        nextCursor = nextItem!.id;
      }

      return {
        posts: postsWithFiles,
        nextCursor,
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findPostById(postId: string): Promise<
    Post & {
      user: Omit<User, 'passwordHash'>;
      likes: Like[];
      filesUrl: string[];
    }
  > {
    try {
      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
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
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const files = await findFiles(post.id, this.prismaService);
      const filesUrl = files.map((file) => file.fileUrl);
      const filesFromS3 = await Promise.all(
        filesUrl.map((fileUrl) => {
          const fileName = getFileNameFromPresignedUrl(fileUrl);
          const fileDir = getFileDirFromPresignedUrl(fileUrl) as FileDir;
          return getObjectS3(
            fileName,
            this.configService.get<string>('AWS_BUCKET_NAME')!,
            fileDir,
            this.s3,
          );
        }),
      );

      return {
        ...post,
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

  async findPostByUser(
    userId: string,
    cursor?: string,
    limit: number = 5,
  ): Promise<{
    posts: (Post & {
      user: Omit<User, 'passwordHash'>;
      likes: Like[];
      filesUrl: string[];
    })[];
    nextCursor: string | null;
  }> {
    try {
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new NotFoundException(`User id ${userId} not found`);
      }

      const posts = await this.prismaService.post.findMany({
        where: {
          userId,
        },
        take: -(limit + 1),
        cursor: cursor
          ? {
              id: cursor,
            }
          : undefined,
        include: {
          likes: true,
          user: {
            omit: {
              passwordHash: true,
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
          const files = await findFiles(post.id, this.prismaService);
          const filesUrl = files.map((file) => file.fileUrl);
          const filesFromS3 = await Promise.all(
            filesUrl.map((fileUrl) => {
              const fileName = getFileNameFromPresignedUrl(fileUrl);
              const fileDir = getFileDirFromPresignedUrl(fileUrl) as FileDir;
              return getObjectS3(
                fileName,
                this.configService.get<string>('AWS_BUCKET_NAME')!,
                fileDir,
                this.s3,
              );
            }),
          );
          return {
            ...post,
            filesUrl: filesFromS3,
          };
        }),
      );

      let nextCursor: string | null = null;

      if (postsWithFiles.length > limit) {
        const nextItem = postsWithFiles.shift();
        nextCursor = nextItem!.id;
      }

      return {
        posts: postsWithFiles,
        nextCursor,
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

  async updatePost(updatePostDto: UpdatePostDto & { postId: string }): Promise<
    Post & {
      user: Omit<User, 'passwordHash'>;
      likes: Like[];
      filesUrl: string[];
    }
  > {
    const { message, postId, filesUrl } = updatePostDto;
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
          likes: true,
          user: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      if (!filesUrl || !filesUrl.length) {
        const fileRecords = await this.prismaService.file.findMany({
          where: {
            contentId: post.id,
            contentType: ContentType.POST,
          },
        });

        let filesData: { fileName: string; fileDir: FileDir }[] = [];
        fileRecords.forEach((fileRecord) => {
          const fileDir = getFileDirFromPresignedUrl(
            fileRecord.fileUrl,
          ) as FileDir;
          const fileName = getFileNameFromPresignedUrl(fileRecord.fileUrl);
          filesData.push({
            fileName,
            fileDir,
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

        return {
          ...post,
          filesUrl,
        };
      }

      if (filesUrl && filesUrl.length) {
        const postFiles = await findFiles(post.id, this.prismaService);

        if (postFiles && postFiles.length) {
          await Promise.all(
            postFiles.map((postFile) => {
              const fileDir = getFileDirFromPresignedUrl(
                postFile.fileUrl,
              ) as FileDir;
              const fileName = getFileNameFromPresignedUrl(postFile.fileUrl);
              return deleteObjectS3(
                fileName,
                this.configService.get<string>('AWS_BUCKET_NAME')!,
                fileDir,
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
                fileUrl: postFile.fileUrl,
                contentId: post.id,
                contentType: ContentType.POST,
              },
            });
          }),
        );

        const createFileRecordsData = createFileRecords(
          filesUrlS3,
          ContentType.POST,
          post.id,
        );
        await this.prismaService.file.createMany({
          data: createFileRecordsData,
        });

        return {
          ...post,
          filesUrl: filesUrlS3,
        };
      }

      throw new UnprocessableEntityException('Error cannot update post');
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(error.message);
      } else if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async deletePost(postId: string) {
    try {
      const post = await this.prismaService.post.findUnique({
        where: {
          id: postId,
        },
      });
      if (!post) {
        throw new NotFoundException(`Post id ${postId} not found`);
      }

      const postFiles = await findFiles(post.id, this.prismaService);
      await Promise.all([
        ...postFiles.map((postFile) => {
          const fileName = getFileNameFromPresignedUrl(postFile.fileUrl);
          const fileDir = getFileDirFromPresignedUrl(
            postFile.fileUrl,
          ) as FileDir;
          return deleteObjectS3(
            fileName,
            this.configService.get<string>('AWS_BUCKET_NAME')!,
            fileDir,
            this.s3,
          );
        }),
        ...postFiles.map((postFile) => {
          return this.prismaService.file.delete({
            where: {
              id: postFile.id,
              contentId: post.id,
              contentType: ContentType.POST,
            },
          });
        }),
        this.prismaService.post.delete({
          where: {
            id: postId,
          },
        }),
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

  async deleteFile(fileUrl: string) {
    try {
      const file = await this.prismaService.file.findFirst({
        where: {
          fileUrl,
        },
      });
      if (!file) {
        throw new NotFoundException(`File name ${fileUrl} not found`);
      }

      await Promise.all([
        this.prismaService.file.delete({
          where: {
            id: file.id,
            fileUrl,
            contentType: ContentType.POST,
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
}