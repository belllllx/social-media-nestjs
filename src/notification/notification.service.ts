import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import { Notification, User } from 'generated/prisma';

@Injectable()
export class NotificationService {
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
        throw new InternalServerErrorException(error.message);
      }

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
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findPagination(
    activeUserId: string,
    cursor?: string,
    limit: number = 5,
  ): Promise<{
    notifies: Notification[];
    nextCursor: string | null;
  }> {
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

  async updateToRead(
    notificationId: string,
  ): Promise<Notification & { sender: Omit<User, 'passwordHash'> }> {
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
        throw new InternalServerErrorException(
          'Error cannot update notification something went wrong',
        );
      } else if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  async findByUser(
    senderId: string,
    receiverId: string,
  ) {
    try {
      const notification = await this.prismaService.notification.findFirst({
        where: {
          senderId,
          receiverId,
        },
        include: {
          sender: {
            omit: {
              passwordHash: true,
            },
          },
        },
      });
      if (!notification) {
        throw new NotFoundException(
          `Notification from senderId ${senderId} and receiverId ${receiverId} not found`,
        );
      }

      return notification;
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      } else if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }

  delete(notificationId: string) {
    try {
      return this.prismaService.notification.delete({
        where: {
          id: notificationId,
        },
      });
    } catch (error: unknown) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new InternalServerErrorException(
          error,
          'Error something went wrong',
        );
      }

      throw new InternalServerErrorException(error, 'Unexpected error');
    }
  }
}
