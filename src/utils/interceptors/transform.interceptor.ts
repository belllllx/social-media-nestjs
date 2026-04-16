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
  implements NestInterceptor<T, CommonResponse> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<CommonResponse> {
    const response = context.switchToHttp().getResponse<ExpressResponse>();

    return next.handle().pipe(
      map((res?: ResponseFromService<T>) => ({
        status: response.statusCode,
        success: true,
        message: res ? res.message : 'Operation successfully',
        ...(res?.data ? { data: res.data } : {}),
      })),
    );
  }
}
