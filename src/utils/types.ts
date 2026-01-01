import { ContentType } from 'generated/prisma';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

export type JwtPayload<T extends object = {}> = {
  iat: number;
  exp: number;
} & T;

export interface ISocialUserPayload {
  email: string;
  name: string;
  avatar: string;
}

export type CreateSocialUserDto = Omit<CreateUserDto, 'password' | 'username'> &
  Partial<Pick<CreateUserDto, 'password' | 'username'>>;

export interface IEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface ICreateFileRecord {
  fileUrl: string;
  contentId?: string;
  contentType: ContentType;
}

export type FileDir =
  | 'post-image'
  | 'post-video'
  | 'comment-image'
  | 'reply-image'
  | 'chat-image'
  | 'chat-video';

export interface ResponseFromService<T = any> {
  message: string;
  data?: T;
}

export interface ICookieObject {
  access_token: string;
  refresh_token: string;
}

export interface ITokenObject {
  accessToken: string;
  refreshToken: string;
}