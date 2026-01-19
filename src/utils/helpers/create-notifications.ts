import { NotificationType } from 'generated/prisma';
import { CreateNotificationDto } from 'src/notification/dto/create-notification.dto';
import { NotificationService } from 'src/notification/notification.service';
import { PrismaService } from 'src/prisma/prisma.service';

export async function createNotifications(
  prismaService: PrismaService,
  notificationService: NotificationService,
  type: NotificationType,
  activeUserId: string,
  message: string,
  postId?: string,
  commentId?: string,
) {
  const users = await prismaService.user.findMany({
    where: {
      id: {
        not: activeUserId,
      },
    },
    omit: {
      passwordHash: true,
    },
  });
  const notifications: CreateNotificationDto[] = users.map((user) => ({
    type,
    senderId: activeUserId,
    receiverId: user.id,
    postId,
    commentId,
    message,
  }));

  return notificationService.createMany(notifications);
}
