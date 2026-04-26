import { OmitType } from '@nestjs/swagger';
import { CreateUserDto } from 'src/auth/dto/create-user.dto';

export class CreateUserWithoutEmailDto extends OmitType(CreateUserDto, ['email'] as const) {}