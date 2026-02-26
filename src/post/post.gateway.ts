import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Like, Post, User } from 'generated/prisma';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { JwtService } from '@nestjs/jwt';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';

interface ServerToClientEvents {
  createPost: (
    post: Post & {
      user: Omit<User, 'passwordHash'>;
      filesUrl?: string[];
      parent?: Post & {
        user: Omit<User, 'passwordHash'>;
        filesUrl?: string[];
      } | null;
      commentsCount: number,
    },
  ) => void;
  updatePost: (
    post: Post & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Post & { user: Omit<User, 'passwordHash'> }) | null;
      filesUrl?: string[];
      commentsCount: number,
    },
  ) => void;
  deletePost: (post: Post) => void;
  newLike: (like: Like) => void;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class PostGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private jwtService: JwtService) { }

  private clients = new Map<string, Socket<any, ServerToClientEvents>>();

  handleConnection(client: Socket) {
    handleWsConnection(client, this.jwtService, this.clients);
  }

  handleDisconnect(client: Socket<any, ServerToClientEvents>) {
    handleWsDisconnection(client, this.clients);
  }

  newPost(
    userId: string,
    post: Post & {
      user: Omit<User, 'passwordHash'>;
      filesUrl?: string[];
      parent?: Post & {
        user: Omit<User, 'passwordHash'>;
        filesUrl?: string[];
      } | null;
      commentsCount: number,
    },
  ) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('createPost', post);
    }
  }

  updatePost(
    userId: string,
    post: Post & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Post & { user: Omit<User, 'passwordHash'> }) | null;
      filesUrl?: string[];
      commentsCount: number,
    },
  ) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('updatePost', post);
    }
  }

  deletePost(userId: string, post: Post) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('deletePost', post);
    }
  }

  newLike(userId: string, like: Like) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('newLike', like);
    }
  }
}
