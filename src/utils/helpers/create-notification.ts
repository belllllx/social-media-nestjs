import { NotificationType, Post } from 'generated/prisma';
import { NotificationService } from 'src/notification/notification.service';

export function createNotification(
  notificationService: NotificationService,
  type: NotificationType,
  activeUserId: string,
  receiverId: string,
  message: string,
  post: Post,
  commentId?: string
) {
  if (activeUserId !== post.userId) {
    return notificationService.create({
      type,
      senderId: activeUserId,
      receiverId,
      postId: post.id,
      commentId,
      message,
    });
  }
}
