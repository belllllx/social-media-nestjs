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

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private notificationGateway: NotificationGateway,
  ) { }

  async findOne(username: string) {
    return await this.prisma.user.findUnique({
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
        return await this.prisma.user.create({
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
        return await this.prisma.user.create({
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
      const user = await this.prisma.user.findUnique({
        where: {
          id,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          followings: true,
        },
      });
      if (!user) {
        throw new NotFoundException(`User id ${id} not found`);
      }

      return user;
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
      await this.prisma.user.update({
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
    return await this.prisma.user.findUnique({
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
    const users = await this.prisma.user.findMany({
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

    let nextCursor: string | null = null;

    if (users.length > limit) {
      const nextItem = users.pop();
      nextCursor = nextItem!.id;
    }

    return {
      users,
      nextCursor,
    };
  }

  async findMany(activeUserId: string, cursor?: string, limit: number = 5) {
    try {
      const activeUser = await this.prisma.user.findUnique({
        where: {
          id: activeUserId,
        },
      });
      if (!activeUser) {
        throw new NotFoundException(
          `Active user by user id ${activeUserId} not found`,
        );
      }

      const users = await this.prisma.user.findMany({
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
          followers: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      let nextCursor: string | null = null;

      if (users.length > limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return {
        users,
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

      const followed = await this.prisma.follower.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });
      if (!followed) {
        const follower = await this.prisma.follower.create({
          data: {
            followerId,
            followingId,
          },
        });

        const notification = await this.notificationService.create({
          type: NotificationType.FOLLOW,
          senderId: followerId,
          receiverId: followingId,
          message: 'Following you',
        });
        this.notificationGateway.sendNotifications(followerId, notification);

        return {
          status: 'follow',
          follower,
        };
      }

      const follower = await this.prisma.follower.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });

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
        follower,
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
}
