import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Comment, Like, User } from 'generated/prisma';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { JwtService } from '@nestjs/jwt';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';

interface ServerToClientEvents {
  createComment: (
    comment: Comment & {
      user: Omit<User, 'passwordHash'>;
      fileUrl?: string;
      parent?:
      | (Comment & {
        user: Omit<User, 'passwordHash'>;
        fileUrl?: string;
      })
      | null;
      replysCount: number;
    },
  ) => void;
  updateComment: (
    comment: Comment & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Comment & { user: Omit<User, 'passwordHash'> }) | null;
      fileUrl?: string;
      replysCount: number;
    },
  ) => void;
  deleteComment: (comment: Comment) => void;
  deleteReplyComment: (comment: Comment) => void;
  newLikeComment: (like: Like & { user: Omit<User, 'passwordHash'> }) => void;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class CommentGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private jwtService: JwtService) {}

  private clients = new Map<string, Socket<any, ServerToClientEvents>>();

  handleConnection(client: Socket) {
    handleWsConnection(client, this.jwtService, this.clients);
  }

  handleDisconnect(client: Socket<any, ServerToClientEvents>) {
    handleWsDisconnection(client, this.clients);
  }

  newComment(
    userId: string,
    comment: Comment & {
      user: Omit<User, 'passwordHash'>;
      fileUrl?: string;
      parent?:
      | (Comment & {
        user: Omit<User, 'passwordHash'>;
        fileUrl?: string;
      })
      | null;
      replysCount: number;
    },
  ) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('createComment', comment);
    }
  }

  updateComment(
    userId: string,
    comment: Comment & {
      likes: (Like & { user: Omit<User, 'passwordHash'> })[];
      user: Omit<User, 'passwordHash'>;
      parent: (Comment & { user: Omit<User, 'passwordHash'> }) | null;
      fileUrl?: string;
      replysCount: number;
    },
  ) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('updateComment', comment);
    }
  }

  deleteComment(userId: string, comment: Comment) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('deleteComment', comment);
    }
  }

  deleteReplyComment(userId: string, comment: Comment) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('deleteReplyComment', comment);
    }
  }

  newLike(userId: string, like: Like & { user: Omit<User, 'passwordHash'> }) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('newLikeComment', like);
    }
  }
}
