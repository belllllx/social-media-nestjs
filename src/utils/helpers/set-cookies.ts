import { Response as ExpressResponse } from 'express';

export function setCookies(
  key: string[] | string,
  value: string[] | string,
  res: ExpressResponse,
) {
  if (Array.isArray(key) && Array.isArray(value)) {
    key.forEach((k, index) => {
      res.cookie(k, value[index], {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: k.includes("access_token")
          ?
          1000 * 60 * 10
          :
          k.includes("forgot_password_token")
            ?
            1000 * 60 * 5
            :
            1000 * 60 * 60 * 24 * 3,
      });
    });
  } else if (typeof key === 'string' && typeof value === 'string') {
    res.cookie(key, value, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: key.includes("access_token")
        ?
        1000 * 60 * 10
        :
        key.includes("forgot_password_token")
          ?
          1000 * 60 * 5
          :
          1000 * 60 * 60 * 24 * 3,
    });
  }
}