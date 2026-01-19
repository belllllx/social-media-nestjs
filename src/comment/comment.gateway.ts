import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Comment, Like, User } from 'generated/prisma';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { JwtService } from '@nestjs/jwt';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';

interface ServerToClientEvents {
  createComment: (
    comment: Comment & {
      likes: Like[];
      user: Omit<User, 'passwordHash'>;
      filesUrl?: string[];
      parent?:
        | (Comment & {
            user: Omit<User, 'passwordHash'>;
            filesUrl?: string[];
          })
        | null;
    },
  ) => void;
  updateComment: (
    comment: Comment & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Comment & { user: Omit<User, 'passwordHash'> }) | null;
      filesUrl?: string[];
    },
  ) => void;
  deleteComment: (comment: Comment) => void;
  newLike: (like: Like) => void;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class CommentGateway implements OnGatewayConnection, OnGatewayDisconnect {
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

  newComment(
    comment: Comment & {
      likes: Like[];
      user: Omit<User, 'passwordHash'>;
      filesUrl?: string[];
      parent?:
        | (Comment & {
            user: Omit<User, 'passwordHash'>;
            filesUrl?: string[];
          })
        | null;
    },
  ) {
    this.server.emit('createComment', comment);
  }

  updateComment(
    comment: Comment & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Comment & { user: Omit<User, 'passwordHash'> }) | null;
      filesUrl?: string[];
    },
  ) {
    this.server.emit('updateComment', comment);
  }

  deleteComment(comment: Comment) {
    this.server.emit('deleteComment', comment);
  }

  newLike(like: Like) {
    this.server.emit('newLike', like);
  }
}
