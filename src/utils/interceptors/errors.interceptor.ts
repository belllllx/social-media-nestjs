import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  InternalServerErrorException,
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
          return throwError(() => new InternalServerErrorException('Something went wrong'));
        }),
      );
  }
}