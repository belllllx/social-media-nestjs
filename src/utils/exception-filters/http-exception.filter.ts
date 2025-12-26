import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import {
  Response as ExpressResponse,
} from 'express';
import { CommonResponse } from '../swagger/common-response';
import { isObjectExceptionResponse, isStringExceptionResponse } from '../helpers/predicate-exception-response';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    
    let exceptionMessages: string = ''; 
    if(isStringExceptionResponse(exceptionResponse)){
      exceptionMessages = exceptionResponse;
    }else if(isObjectExceptionResponse(exceptionResponse)){
      exceptionMessages = exceptionResponse['message'];
    }

    response.status(status).json({
      status,
      success: false,
      message: exceptionMessages || 'Error something went wrong',
    } satisfies CommonResponse);
  }
}
