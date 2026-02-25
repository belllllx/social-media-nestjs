import { Comment, NotificationType, Post } from 'generated/prisma';
import { NotificationService } from 'src/notification/notification.service';

export function createTagUserNotification(
  notificationService: NotificationService,
  type: NotificationType,
  activeUserId: string,
  receiverId: string,
  message: string,
  post: Post,
  comment: Comment,
) {
  if (activeUserId !== comment.userId) {
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
