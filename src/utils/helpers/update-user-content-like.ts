import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Comment, Follower, Like, Post, User } from 'generated/prisma';
import { getUserImage } from './get-user-image';

export function updateUsersPostLike(
  post: Post & {
    likes: (Like & { user: Omit<User, 'passwordHash'> })[];
  },
  configService: ConfigService,
  s3: S3Client,
) {
  return Promise.all(
    post.likes.map(async (like) => {
      const userLikeUpdated = await getUserImage(like.user, configService, s3);
      return {
        ...like,
        user: userLikeUpdated,
      }
    }),
  );
}

export function updateUsersCommentLike(
  comment: Comment & {
    likes: (Like & { user: Omit<User, 'passwordHash'> })[];
  },
  configService: ConfigService,
  s3: S3Client,
) {
  return Promise.all(
    comment.likes.map(async (like) => {
      const userLikeUpdated = await getUserImage(like.user, configService, s3);
      return {
        ...like,
        user: userLikeUpdated,
      }
    }),
  );
}

export function updateUsersReplies(
  comment: Comment & {
    replies: (Comment & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      replyToUser: Omit<User, 'passwordHash'> | null;
    })[];
  },
  configService: ConfigService,
  s3: S3Client,
) {
  return Promise.all(
    comment.replies.map(async (reply) => {
      const userReplyUpdated = await getUserImage(reply.user, configService, s3);
      return {
        ...reply,
        user: userReplyUpdated,
        likes: await Promise.all(
          reply.likes.map(async (like) => {
            const userReplyLikeUpdated = await getUserImage(like.user, configService, s3);
            return {
              ...like,
              user: userReplyLikeUpdated,
            }
          }),
        ),
      }
    }),
  );
}

export function updateUsersFollowing(
  user: Omit<User, 'passwordHash'> & {
    followings: (Follower & { following: Omit<User, 'passwordHash'> })[];
  },
  configService: ConfigService,
  s3: S3Client,
) {
  return Promise.all(
    user.followings.map(async (following) => {
      const userFollowingUpdated = await getUserImage(following.following, configService, s3);
      return {
        ...following,
        following: userFollowingUpdated,
      };
    }),
  );
}

export async function updateUserFollowing(
  following: Omit<User, 'passwordHash'> & { followers: Follower[] },
  configService: ConfigService,
  s3: S3Client,
) {
  const userFollowingUpdated = await getUserImage(following, configService, s3);
  return {
    ...following,
    ...userFollowingUpdated,
  }
}

export function updateUsersFollower(
  user: Omit<User, 'passwordHash'> & {
    followers: (Follower & { follower: Omit<User, 'passwordHash'> })[];
  },
  configService: ConfigService,
  s3: S3Client,
) {
  return Promise.all(
    user.followers.map(async (follower) => {
      const userFollowerUpdated = await getUserImage(follower.follower, configService, s3);
      return {
        ...follower,
        follower: userFollowerUpdated,
      };
    }),
  );
}

export async function updateUserFollower(
  follower: Omit<User, 'passwordHash'> & { followers: Follower[] },
  configService: ConfigService,
  s3: S3Client,
) {
  const userFollowerpdated = await getUserImage(follower, configService, s3);
  return {
    ...follower,
    ...userFollowerpdated,
  }
}