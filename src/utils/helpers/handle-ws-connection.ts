import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { parseCookieStringToObject } from './parseCookieStringToObject';
import { ICookieObject, JwtPayload } from '../types';

export function handleWsConnection(
  client: Socket<any, any, any, { token: Omit<ICookieObject, 'refresh_token'> }>,
  jwtService: JwtService,
  clients: Map<string, Socket>,
) {
  const cookies = client.handshake.headers.cookie;
  if (cookies) {
    const cookieObj = parseCookieStringToObject(cookies);
    const { access_token } = (cookieObj as unknown as ICookieObject);
    if (!access_token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload =
        jwtService.verify<JwtPayload<{ id: string; authVerified: boolean }>>(
          access_token,
        );

      clients.set(payload.id, client);
      client.data.token = {
        access_token,
      }
    } catch (error: unknown) {
      if (error instanceof TokenExpiredError) {
        client.disconnect(true);
      }

      client.disconnect(true);
    }
  }

  client.disconnect(true);
}
