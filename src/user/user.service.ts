import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, ProviderType } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import { hashSecret } from 'src/utils/helpers/hash-secret';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateSocialUserDto } from 'src/utils/types';
import { formatString } from 'src/utils/helpers/format-string';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { Logger } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { genFilesName } from 'src/utils/helpers/gen-files-name';
import { putObjectS3 } from 'src/utils/helpers/put-object-s3';
import { getObjectS3 } from 'src/utils/helpers/get-object-s3';
import { getFileNameFromPresignedUrl } from 'src/utils/helpers/get-filename-from-presigned-url';
import { deleteObjectS3 } from 'src/utils/helpers/delete-object-s3';
import { EditUserInfoDto } from './dto/edit-user-info.dto';
import { getUserImage } from 'src/utils/helpers/get-user-image';
import { updateUserFollower, updateUserFollowing, updateUsersFollower, updateUsersFollowing } from 'src/utils/helpers/update-user-content-like';
import { Express } from 'express';
import { UserGateway } from './user.gateway';

@Injectable()
export class UserService {
  private s3: S3Client;
  private readonly logger = new Logger(UserService.name);

  constructor(
    configServiceParam: ConfigService,
    private prismaService: PrismaService,
    private notificationService: NotificationService,
    private notificationGateway: NotificationGateway,
    private userGateway: UserGateway,
    private configService: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: configServiceParam.get<string>('AWS_BUCKET_REGION')!,
      endpoint: configServiceParam.get<string>('R2_ENDPOINT')!,
      credentials: {
        accessKeyId: configServiceParam.get<string>('AWS_ACCESS_KEY')!,
        secretAccessKey: configServiceParam.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        )!,
      },
    });
  }

  async findOne(username: string) {
    return await this.prismaService.user.findUnique({
      where: {
        username,
      },
    });
  }

  async createUser(createUserDto: CreateUserDto | CreateSocialUserDto) {
    const { fullname, username, email, password, profileUrl, providerType } =
      createUserDto;
    try {
      if (
        providerType === ProviderType.GOOGLE ||
        providerType === ProviderType.GITHUB
      ) {
        return await this.prismaService.user.create({
          data: {
            fullname,
            email,
            profileUrl,
            providerType,
          },
          omit: {
            passwordHash: true,
          },
        });
      }

      if (password) {
        const passwordHash = await hashSecret(password);
        return await this.prismaService.user.create({
          data: {
            fullname,
            username,
            email,
            passwordHash,
            providerType,
          },
          omit: {
            passwordHash: true,
          },
        });
      }

      throw new Error('Invalid input data');
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.error(error.message, error.stack);
        throw new BadRequestException(
          `${formatString(error.meta?.target?.[0])} already exists`,
        );
      }

      this.logger.error(error);
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async findById(id: string) {
    try {
      const user = await this.prismaService.user.findUnique({
        where: {
          id,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          followings: {
            include: {
              following: {
                include: {
                  followers: true,
                },
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
          followers: {
            include: {
              follower: {
                include: {
                  followers: true,
                },
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
        },
      });
      if (!user) {
        throw new NotFoundException(`User id ${id} not found`);
      }

      const userUpdated = await getUserImage(user, this.configService, this.s3);
      const usersFollowingUpdated = await updateUsersFollowing(user, this.configService, this.s3);
      const usersFollowerUpdated = await updateUsersFollower(user, this.configService, this.s3);

      return {
        ...userUpdated,
        followings: usersFollowingUpdated,
        followers: usersFollowerUpdated,
      }
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException('Error cannot find user');
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto & { email: string }) {
    const { password, confirmPassword, email } = resetPasswordDto;
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const passwordHash = await hashSecret(confirmPassword);
    try {
      await this.prismaService.user.update({
        where: {
          email,
        },
        data: {
          passwordHash,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        this.logger.error(error.message, error.stack);
        throw new NotFoundException('User not found');
      } else if (error instanceof BadRequestException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException('Failed to reset password');
    }
  }

  async findByEmail(email: string) {
    return await this.prismaService.user.findUnique({
      where: {
        email,
      },
      omit: {
        passwordHash: true,
      },
    });
  }

  async findByFullname(
    activeUserId: string,
    query: string,
    cursor?: string,
    limit: number = 5,
  ) {
    const users = await this.prismaService.user.findMany({
      where: {
        fullname: {
          contains: query,
          mode: 'insensitive',
        },
        id: {
          not: activeUserId,
        },
      },
      take: limit + 1,
      cursor: cursor
        ? {
          id: cursor,
        }
        : undefined,
      omit: {
        passwordHash: true,
      },
    });

    const updatedUsers = await Promise.all(
      users.map(async (user) => {
        const userUpdated = await getUserImage(user, this.configService, this.s3);
        return userUpdated;
      }),
    );

    let nextCursor: string | null = null;

    if (users.length > limit) {
      const nextItem = users.pop();
      nextCursor = nextItem!.id;
    }

    return {
      users: updatedUsers,
      nextCursor,
    };
  }

  async findMany(activeUserId: string, cursor?: string, limit: number = 5) {
    try {
      const activeUser = await this.prismaService.user.findUnique({
        where: {
          id: activeUserId,
        },
      });
      if (!activeUser) {
        throw new NotFoundException(
          `Active user by user id ${activeUserId} not found`,
        );
      }

      const users = await this.prismaService.user.findMany({
        where: {
          id: {
            not: {
              equals: activeUserId,
            },
          },
        },
        take: limit + 1,
        cursor: cursor
          ? {
            id: cursor,
          }
          : undefined,
        omit: {
          passwordHash: true,
        },
        include: {
          followings: {
            include: {
              following: {
                omit: {
                  passwordHash: true,
                },
              },
            },
          },
          followers: {
            include: {
              follower: {
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

      const updatedUsers = await Promise.all(
        users.map(async (user) => {
          const userUpdated = await getUserImage(user, this.configService, this.s3);
          return {
            ...user,
            ...userUpdated,
          };
        }),
      );

      let nextCursor: string | null = null;

      if (users.length > limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return {
        users: updatedUsers,
        nextCursor,
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async follow(followerId: string, followingId: string) {
    try {
      const followerUser = await this.findById(followerId);
      if (!followerUser) {
        throw new NotFoundException(`Follower user id ${followerId} not found`);
      }

      const followingUser = await this.findById(followingId);
      if (!followingUser) {
        throw new NotFoundException(
          `Following user id ${followingId} not found`,
        );
      }

      const followed = await this.prismaService.follower.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });
      if (!followed) {
        const follower = await this.prismaService.follower.create({
          data: {
            followerId,
            followingId,
          },
          include: {
            following: {
              include: {
                followers: true,
              },
              omit: {
                passwordHash: true,
              },
            },
            follower: {
              include: {
                followers: true,
              },
              omit: {
                passwordHash: true,
              },
            },
          },
        });

        const userFollowingUpdated = await updateUserFollowing(follower.following, this.configService, this.s3);
        const userFollowerUpdated = await updateUserFollower(follower.follower, this.configService, this.s3);

        this.userGateway.follow(
          followerId,
          {
            ...follower,
            following: userFollowingUpdated,
            follower: userFollowerUpdated,
          },
        );

        const notification = await this.notificationService.create({
          type: NotificationType.FOLLOW,
          senderId: followerId,
          receiverId: followingId,
          message: 'Following you',
        });
        this.notificationGateway.sendNotifications(followerId, notification);

        return {
          status: 'follow',
          follower: {
            ...follower,
            following: userFollowingUpdated,
            follower: userFollowerUpdated,
          },
        };
      }

      const follower = await this.prismaService.follower.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
        include: {
          following: {
            include: {
              followers: true,
            },
            omit: {
              passwordHash: true,
            },
          },
          follower: {
            include: {
              followers: true,
            },
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      const userFollowingUpdated = await updateUserFollowing(follower.following, this.configService, this.s3);
      const userFollowerUpdated = await updateUserFollower(follower.follower, this.configService, this.s3);

      this.userGateway.follow(
        followerId,
        {
          ...follower,
          following: userFollowingUpdated,
          follower: userFollowerUpdated,
        },
      );

      const notification = await this.notificationService.findByUser(
        followerId,
        followingId,
        NotificationType.FOLLOW,
      );
      if (notification) {
        await this.notificationService.delete(notification);
        this.notificationGateway.sendNotifications(followerId, notification);
      }

      return {
        status: 'unfollow',
        follower: {
          ...follower,
          following: userFollowingUpdated,
          follower: userFollowerUpdated,
        },
      };
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async editUserBackground(file: Express.Multer.File, activeUserId: string) {
    try {
      const newFileName = genFilesName(file);

      await putObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        'user-background-image',
        this.s3,
      );

      const fileUrl = await getObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        'user-background-image',
        this.s3,
      );

      await this.findById(activeUserId);

      await this.prismaService.user.update({
        where: {
          id: activeUserId,
        },
        data: {
          profileBackgroundUrl: `user-background-image/${newFileName.filename}`,
        },
      });

      return {
        fileUrl,
      }
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async editUserProfile(file: Express.Multer.File, activeUserId: string) {
    try {
      const newFileName = genFilesName(file);

      await putObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        'user-profile-image',
        this.s3,
      );

      const fileUrl = await getObjectS3(
        newFileName,
        this.configService.get<string>('AWS_BUCKET_NAME')!,
        'user-profile-image',
        this.s3,
      );

      await this.findById(activeUserId);

      await this.prismaService.user.update({
        where: {
          id: activeUserId,
        },
        data: {
          profileUrl: `user-profile-image/${newFileName.filename}`,
        },
      });

      return {
        fileUrl,
      }
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async deleteUserBackground(fileUrl: string, activeUserId: string) {
    try {
      await this.findById(activeUserId);

      const fileName = getFileNameFromPresignedUrl(fileUrl);

      await Promise.all([
        deleteObjectS3(
          fileName,
          this.configService.get<string>('AWS_BUCKET_NAME')!,
          'user-background-image',
          this.s3,
        ),
        this.prismaService.user.update({
          where: {
            id: activeUserId,
          },
          data: {
            profileBackgroundUrl: null,
          },
        }),
      ]);
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async deleteUserProfile(fileUrl: string, activeUserId: string) {
    try {
      await this.findById(activeUserId);

      const fileName = getFileNameFromPresignedUrl(fileUrl);

      await Promise.all([
        deleteObjectS3(
          fileName,
          this.configService.get<string>('AWS_BUCKET_NAME')!,
          'user-profile-image',
          this.s3,
        ),
        this.prismaService.user.update({
          where: {
            id: activeUserId,
          },
          data: {
            profileUrl: null,
          },
        }),
      ]);
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async editUserInfo(editUserInfoDto: EditUserInfoDto & { activeUserId: string; }) {
    try {
      const { activeUserId, fullname, dateOfBirth, info } = editUserInfoDto;

      await this.findById(activeUserId);
      const user = await this.prismaService.user.update({
        where: {
          id: activeUserId,
        },
        data: {
          fullname,
          dateOfBirth,
          info,
        },
        omit: {
          passwordHash: true,
        },
      });

      return {
        user,
      };
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        this.logger.warn(error.message, error.stack);
        throw new BadRequestException("Fullname already exists");
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }
}
