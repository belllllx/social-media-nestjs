import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification, NotificationType, User } from 'generated/prisma';
import { Logger } from '@nestjs/common';
import { getUserImage } from 'src/utils/helpers/get-user-image';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { catchErrors } from 'src/utils/helpers/catch-errors';
import { S3_CLIENT } from 'src/utils/types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(S3_CLIENT)
    private s3: S3Client,

    private configService: ConfigService,
    private prismaService: PrismaService,
  ) { }

  async create(createNotificationDto: CreateNotificationDto) {
    try {
      const notification = await this.prismaService.notification.create({
        data: createNotificationDto,
        include: {
          sender: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      const userUpdated = await getUserImage(notification.sender, this.configService, this.s3);
      return {
        ...notification,
        sender: userUpdated,
      }
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot create notification');
    }
  }

  async createMany(createNotificationDto: CreateNotificationDto[]) {
    try {
      const notifications =
        await this.prismaService.notification.createManyAndReturn({
          data: createNotificationDto,
        });
      const notificationsWithSender =
        await this.prismaService.notification.findMany({
          where: {
            id: { in: notifications.map((notification) => notification.id) },
          },
          include: {
            sender: {
              omit: {
                passwordHash: true,
              },
            },
          },
        });

      const updatedNotificationsWithSender = await Promise.all(
        notificationsWithSender.map(async (notiWithSender) => {
          const userUpdated = await getUserImage(notiWithSender.sender, this.configService, this.s3);
          return {
            ...notiWithSender,
            sender: userUpdated,
          }
        }),
      );

      return updatedNotificationsWithSender;
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot create notifications');
    }
  }

  async findPagination(
    activeUserId: string,
    cursor?: string,
    limit: number = 5,
  ) {
    try {
      const notifies = await this.prismaService.notification.findMany({
        where: {
          senderId: {
            not: {
              equals: activeUserId,
            },
          },
          receiverId: activeUserId,
        },
        take: limit + 1,
        cursor: cursor
          ? {
            id: cursor,
          }
          : undefined,
        include: {
          sender: {
            omit: {
              passwordHash: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const updatedNotifies = await Promise.all(
        notifies.map(async (notify) => {
          const userUpdated = await getUserImage(notify.sender, this.configService, this.s3);
          return {
            ...notify,
            sender: userUpdated,
          }
        }),
      );

      let nextCursor: string | null = null;

      if (notifies.length > limit) {
        const nextItem = notifies.pop();
        nextCursor = nextItem!.id;
      }

      return {
        notifies: updatedNotifies,
        nextCursor,
      };
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot find notifications pagination');
    }
  }

  async updateToRead(notificationId: string) {
    try {
      const notification = await this.prismaService.notification.findUnique({
        where: {
          id: notificationId,
        },
      });
      if (!notification) {
        throw new NotFoundException(
          `Notification of id ${notificationId} not found`,
        );
      }

      const updatedNotify = await this.prismaService.notification.update({
        where: {
          id: notification.id,
        },
        data: {
          isRead: true,
        },
        include: {
          sender: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      const userUpdated = await getUserImage(updatedNotify.sender, this.configService, this.s3);
      return {
        ...updatedNotify,
        sender: userUpdated,
      }
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot read notification');
    }
  }

  async findsNoti(
    senderId: string,
    receiverId: string,
    postId?: string,
    commentId?: string,
  ) {
    try {
      const notifies = await this.prismaService.notification.findMany({
        where: {
          senderId,
          receiverId,
          postId,
          commentId,
        },
        include: {
          sender: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });

      const updatedNotifies = await Promise.all(
        notifies.map(async (notify) => {
          const userUpdated = await getUserImage(notify.sender, this.configService, this.s3);
          return {
            ...notify,
            sender: userUpdated,
          }
        }),
      );

      return updatedNotifies;
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot find notifications');
    }
  }

  async findByUser(
    senderId: string,
    receiverId: string,
    type: NotificationType,
    postId?: string,
    commentId?: string,
  ) {
    try {
      let notification:
        | (Notification & { sender: Omit<User, 'passwordHash'> })
        | null;
      if (postId || commentId) {
        notification = await this.prismaService.notification.findFirst({
          where: {
            senderId,
            receiverId,
            type,
            postId,
            commentId,
          },
          include: {
            sender: {
              omit: {
                passwordHash: true,
              },
            },
          },
        });
      } else {
        notification = await this.prismaService.notification.findFirst({
          where: {
            senderId,
            receiverId,
            type,
          },
          include: {
            sender: {
              omit: {
                passwordHash: true,
              },
            },
          },
        });
      }

      if (notification) {
        const userUpdated = await getUserImage(notification.sender, this.configService, this.s3);
        return {
          ...notification,
          sender: userUpdated,
        }
      }

      return notification;
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot find notification by user');
    }
  }

  delete(notification: Notification | Notification[]) {
    try {
      if (!Array.isArray(notification)) {
        const { id, senderId, receiverId, type } = notification;

        return this.prismaService.notification.delete({
          where: {
            id,
            senderId,
            receiverId,
            type,
          },
        });
      }

      return Promise.all(
        notification.map((noti) =>
          this.prismaService.notification.delete({
            where: {
              id: noti.id,
              senderId: noti.senderId,
              receiverId: noti.receiverId,
              type: noti.type,
            },
          }),
        ),
      );
    } catch (error: unknown) {
      catchErrors(error, this.logger);

      throw new InternalServerErrorException('Cannot delete notification');
    }
  }
}
