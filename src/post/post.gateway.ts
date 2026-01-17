import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Like, Post, User } from 'generated/prisma';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { JwtService } from '@nestjs/jwt';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';

interface ServerToClientEvents {
  createPost: (
    post: Post & {
      likes: Like[];
      user: Omit<User, 'passwordHash'>;
      filesUrl?: string[];
    },
  ) => void;
  updatePost: (
    post: Post & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Post & { user: Omit<User, 'passwordHash'> }) | null;
      filesUrl?: string[];
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
  constructor(private jwtService: JwtService) {}

  @WebSocketServer()
  private server: Server<any, ServerToClientEvents>;

  private clients = new Map<string, Socket<any, ServerToClientEvents>>();

  handleConnection(client: Socket) {
    handleWsConnection(client, this.jwtService, this.clients);
  }

  handleDisconnect(client: Socket<any, ServerToClientEvents>) {
    handleWsDisconnection(client, this.clients);
  }

  newPost(
    post: Post & {
      likes: Like[];
      user: Omit<User, 'passwordHash'>;
      filesUrl?: string[];
    },
  ) {
    this.server.emit('createPost', post);
  }

  updatePost(
    post: Post & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Post & { user: Omit<User, 'passwordHash'> }) | null;
      filesUrl?: string[];
    },
  ) {
    this.server.emit('updatePost', post);
  }

  deletePost(post: Post){
    this.server.emit('deletePost', post);
  }

  newLike(like: Like) {
    this.server.emit('newLike', like);
  }
}
