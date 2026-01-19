import { OmitType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';

export class CreateSharePostDto extends OmitType(CreatePostDto, ['filesUrl'] as const){}