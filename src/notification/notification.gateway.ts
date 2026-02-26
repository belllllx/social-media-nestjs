import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Notification } from 'generated/prisma';
import { Socket } from 'socket.io';
import { handleWsConnection } from 'src/utils/helpers/handle-ws-connection';
import { handleWsDisconnection } from 'src/utils/helpers/handle-ws-disconnection';

interface ServerToClientEvents {
  [event: `notification:${string}`]: (notifications: Notification) => void;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private jwtService: JwtService) {}

  private clients = new Map<string, Socket<any, ServerToClientEvents>>();

  handleConnection(client: Socket) {
    handleWsConnection(client, this.jwtService, this.clients);
  }

  handleDisconnect(client: Socket) {
    handleWsDisconnection(client, this.clients);
  }

  sendNotifications(
    userId: string,
    notifications: Notification | Notification[],
  ) {
    const client = this.clients.get(userId);
    if (client) {
      if (Array.isArray(notifications)) {
        notifications.forEach((notification) => {
          client.broadcast.emit(
            `notification:${notification.receiverId}`,
            notification,
          );
        });
      } else {
        client.broadcast.emit(
          `notification:${notifications.receiverId}`,
          notifications,
        );
      }
    }    
  }
}
