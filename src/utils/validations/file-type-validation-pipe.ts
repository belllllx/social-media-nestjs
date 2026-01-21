import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class FileTypeValidationPipe implements PipeTransform {
  transform(
    value: Express.Multer.File[] | Express.Multer.File,
    metadata: ArgumentMetadata,
  ) {
    const allowedMimeTypes = [
      'image/png',
      'image/jpg',
      'image/jpeg',
      'image/webp',
      'video/mp4',
    ];

    if (Array.isArray(value)) {
      if (!value.length) {
        throw new BadRequestException('File cannot be empty');
      }

      value.forEach((file) => {
        if (!allowedMimeTypes.includes(file.mimetype)) {
          throw new BadRequestException(
            `File type ${file.mimetype} is not allow from server`,
          );
        }
      });
      return value;
    }

    if (!allowedMimeTypes.includes(value.mimetype)) {
      throw new BadRequestException(
        `File type ${value.mimetype} is not allow from server`,
      );
    }

    return value;
  }
}
