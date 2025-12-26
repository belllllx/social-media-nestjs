import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommonResponse } from '../swagger/common-response';
import { Response as ExpressResponse } from 'express';
import { ResponseFromService } from '../types';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, CommonResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<CommonResponse<T>> {
    const response = context.switchToHttp().getResponse<ExpressResponse>();

    return next.handle().pipe(
      map((data?: ResponseFromService<T>) => ({
        status: response.statusCode,
        success: true,
        message: data ? data.message : 'Operation successfully',
        ...(data && data.data ? { data: data.data } : {}),
      })),
    );
  }
}
