
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  BadGatewayException,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<HttpException> {
    return next
      .handle()
      .pipe(
        catchError((err) => {
          if(err instanceof HttpException){
            return throwError(() => err);
          }
          return throwError(() => new BadGatewayException());
        }),
      );
  }
}