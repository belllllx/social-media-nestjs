import { Comment, NotificationType, Post } from 'generated/prisma';
import { NotificationService } from 'src/notification/notification.service';

export function createNotification(
  notificationService: NotificationService,
  type: NotificationType,
  activeUserId: string,
  receiverId: string,
  message: string,
  post: Post,
  comment?: Comment,
) {
  if (activeUserId !== post.userId || activeUserId !== comment?.userId) {
    return notificationService.create({
      type,
      senderId: activeUserId,
      receiverId,
      postId: post.id,
      commentId: comment?.id,
      message,
    });
  }
}
