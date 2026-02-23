import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import { Notification, NotificationType, User } from 'generated/prisma';
import { Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prismaService: PrismaService) {}

  create(createNotificationDto: CreateNotificationDto) {
    try {
      return this.prismaService.notification.create({
        data: createNotificationDto,
        include: {
          sender: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
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
      return notificationsWithSender;
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findPagination(
    activeUserId: string,
    cursor?: string,
    limit: number = 5,
  ) {
    const notifies = await this.prismaService.notification.findMany({
      where: {
        senderId: {
          not: {
            equals: activeUserId,
          },
        },
        receiverId: activeUserId,
      },
      take: -(limit + 1),
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

    let nextCursor: string | null = null;

    if (notifies.length > limit) {
      const nextItem = notifies.shift();
      nextCursor = nextItem!.id;
    }

    return {
      notifies,
      nextCursor,
    };
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

      return this.prismaService.notification.update({
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
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(
          'Error cannot update notification something went wrong',
        );
      } else if (error instanceof NotFoundException) {
        this.logger.warn(error.message, error.stack);
        throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findsNoti(
    senderId: string,
    receiverId: string,
    postId?: string,
    commentId?: string,
  ) {
    try {
      return this.prismaService.notification.findMany({
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
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
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

      return notification;
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
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
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      }

      this.logger.error(error);
      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }
}
