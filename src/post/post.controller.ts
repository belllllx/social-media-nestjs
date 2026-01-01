import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PostService } from './post.service';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CreatePostDto } from './dto/create-post.dto';
import { CommonResponse } from 'src/utils/swagger/common-response';
import { AtAuthGuard } from 'src/auth/guards/at-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileTypeValidationPipe } from 'src/utils/validations/file-type-validation-pipe';
import { UpdatePostDto } from './dto/update-post.dto';
import { ResponseFromService } from 'src/utils/types';
import { DeleteFileDto } from './dto/delete-file.dto';
import { Express } from 'express';

@UseGuards(AtAuthGuard)
@Controller('post')
export class PostController {
  constructor(private postService: PostService) {}

  @Post('files/create')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Files created successfully',
    type: CommonResponse,
  })
  async createFiles(
    @UploadedFiles(new FileTypeValidationPipe()) files: Express.Multer.File[],
  ): Promise<ResponseFromService> {
    const filesUrl = await this.postService.createFiles(files);

    return {
      message: 'Files created successfully',
      data: filesUrl,
    };
  }

  @Post('create/:userId')
  @ApiCreatedResponse({
    description: 'Post created successfully',
    type: CommonResponse,
  })
  async createPost(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() createPostDto: CreatePostDto,
  ): Promise<ResponseFromService> {
    const post = await this.postService.createPost({
      ...createPostDto,
      userId,
    });

    return {
      message: 'Post created successfully',
      data: post,
    };
  }

  @Post('share/create/:userId/:parentId')
  @ApiCreatedResponse({
    description: 'Share post created successfully',
    type: CommonResponse,
  })
  async createSharePost(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Body() createPostDto: CreatePostDto,
  ): Promise<ResponseFromService> {
    const sharePost = await this.postService.createSharePost({
      ...createPostDto,
      userId,
      parentId,
    });

    return {
      message: 'Share post created successfully',
      data: sharePost,
    };
  }

  @Get('find')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: String })
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Post retrived succussfully',
    type: CommonResponse,
  })
  async findPosts(
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ResponseFromService> {
    const posts = await this.postService.findPosts(cursor, limit);

    return {
      message: 'Post retrived succussfully',
      data: posts,
    };
  }

  @Get('find/:postId')
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Post retrived succussfully',
    type: CommonResponse,
  })
  async findPostById(
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<ResponseFromService> {
    const post = await this.postService.findPostById(postId);

    return {
      message: 'Post retrived succussfully',
      data: post,
    };
  }

  @Get('find/user/:userId')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: String })
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Post retrived succussfully',
    type: CommonResponse,
  })
  async findPostByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ResponseFromService> {
    const posts = await this.postService.findPostByUser(userId, cursor, limit);

    return {
      message: 'Post retrived succussfully',
      data: posts,
    };
  }

  @Patch('update/:postId')
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Post updated successfully',
    type: CommonResponse,
  })
  async updatePost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() updatePostDto: UpdatePostDto,
  ): Promise<ResponseFromService> {
    const post = await this.postService.updatePost({
      ...updatePostDto,
      postId,
    });

    return {
      message: 'Post updated successfully',
      data: post,
    };
  }

  @Delete('delete/file')
  @ApiOkResponse({
    description: 'File deleted successfully',
    type: CommonResponse,
  })
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  async deleteFile(
    @Body() deleteFileDto: DeleteFileDto
  ): Promise<ResponseFromService> {
    await this.postService.deleteFile(deleteFileDto.fileUrl);

    return {
      message: 'File deleted successfully',
    };
  }

  @Delete('delete/:postId')
  @ApiOkResponse({
    description: 'Post deleted successfully',
    type: CommonResponse,
  })
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  async deletePost(
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<ResponseFromService> {
    await this.postService.deletePost(postId);

    return {
      message: 'Post deleted successfully',
    };
  }
}
