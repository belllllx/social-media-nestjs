import { UseFilters, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { User } from 'generated/prisma';
import { Server, Socket } from 'socket.io';
import { WsAuthGuard } from 'src/auth/guards/ws-auth.guard';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';
import { WsAuthExceptionFilter } from 'src/utils/exception-filters/ws-auth-exception.filter';

interface ServerToClientEvents {
  usersActive: (
    users: (Omit<User, 'passwordHash'> & { active: boolean })[],
  ) => void;
}

@UseGuards(WsAuthGuard)
@UseFilters(WsAuthExceptionFilter)
@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private jwtService: JwtService) {}

  private clients = new Map<string, Socket<any, ServerToClientEvents>>();

  @WebSocketServer()
  private server: Server<any, ServerToClientEvents>;

  private users: (Omit<User, 'passwordHash'> & {
    socketClientId: string;
    active: boolean;
  })[] = [];

  handleConnection(client: Socket) {
    handleWsConnection(client, this.jwtService, this.clients);
  }

  @SubscribeMessage('connected')
  connected(
    @MessageBody()
    activeUser: Omit<User, 'passwordHash'>,
    @ConnectedSocket()
    client: Socket,
  ) {
    if (!this.users.some((user) => user.id === activeUser.id)) {
      const activeUserData: Omit<User, 'passwordHash'> & {
        socketClientId: string;
        active: boolean;
      } = {
        ...activeUser,
        socketClientId: client.id,
        active: true,
      };
      this.users.push(activeUserData);
    }

    const filterUsers = this.users.map(
      ({ socketClientId, ...others }) => others,
    );
    this.server.emit('usersActive', filterUsers);
  }

  handleDisconnect(client: Socket<any, ServerToClientEvents>) {
    handleWsDisconnection(client, this.clients);

    let userIdToDelete = '';

    const updateUsers = this.users.map(({ socketClientId, ...others }) => {
      if (socketClientId === client.id) {
        userIdToDelete = others.id;
        return {
          ...others,
          socketClientId,
          active: false,
        };
      }

      return {
        ...others,
        socketClientId,
      };
    });

    this.users = updateUsers;

    const filterUsers = updateUsers.map(
      ({ socketClientId, ...others }) => others,
    );
    client.broadcast.emit('usersActive', filterUsers);

    const index = this.users.findIndex((user) => user.id === userIdToDelete);
    if (index !== -1) {
      this.users.splice(index, 1);
    }
  }
}
