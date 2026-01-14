import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Like, Post } from 'generated/prisma';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { JwtService } from '@nestjs/jwt';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';

interface ServerToClientEvents {
  createPost: (post: Post) => void;
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

  broadcastNewPost(userId: string, post: Post) {
    const client = this.clients.get(userId);
    if (client) {
      client.broadcast.emit('createPost', post);
    }
  }

  NewLike(like: Like){
    this.server.emit('newLike', like);
  }
}
