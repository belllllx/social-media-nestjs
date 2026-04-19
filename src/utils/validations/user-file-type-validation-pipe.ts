import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class UserFileTypeValidationPipe implements PipeTransform {
  transform(
    value: Express.Multer.File,
  ) {
    const allowedMimeTypes = [
      'image/png',
      'image/jpg',
      'image/jpeg',
      'image/webp',
    ];

    if (!allowedMimeTypes.includes(value.mimetype)) {
      throw new BadRequestException(
        `File type ${value.mimetype} is not allow from server`,
      );
    }

    return value;
  }
}
