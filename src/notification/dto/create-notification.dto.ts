import { IsInt, IsNotEmpty, IsString } from 'class-validator';
import { NotificationType } from 'generated/prisma';
import { IsNotificationType } from 'src/utils/decorators/is-notification-type.decorator';

export class CreateNotificationDto {
  @IsNotificationType({ message: 'Invalid notification type' })
  type: NotificationType;

  @IsInt()
  @IsNotEmpty()
  senderId: string;

  @IsInt()
  @IsNotEmpty()
  receiverId: string;

  @IsInt()
  @IsNotEmpty()
  postId?: string;

  @IsInt()
  @IsNotEmpty()
  commentId?: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
