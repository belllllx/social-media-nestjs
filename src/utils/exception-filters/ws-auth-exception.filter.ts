import { Catch, WsExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch(WsException)
export class WsAuthExceptionFilter implements WsExceptionFilter<WsException> {
  catch(exception: WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    client.emit('exception', {
      success: false,
      message: exception.message,
    });
  }
}