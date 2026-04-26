import { JwtService } from '@nestjs/jwt';

export function createJwt(
  payload: Record<string, unknown>,
  secret: string,
  jwtService: JwtService,
): Promise<string> {
  return jwtService.signAsync(payload, {
    secret,
  });
}
