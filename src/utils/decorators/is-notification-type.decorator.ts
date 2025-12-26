import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { NotificationType } from 'generated/prisma';

export function IsNotificationType(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isNotificationType',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && value in NotificationType;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be one of: (${Object.values(NotificationType).join(',')})`;
        },
      },
    });
  };
}
