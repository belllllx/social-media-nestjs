import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CommonResponse } from 'src/utils/swagger/common-response';
import { FileTypeValidationPipe } from 'src/utils/validations/file-type-validation-pipe';
import { ResponseFromService } from 'src/utils/types';
import { AtAuthGuard } from 'src/auth/guards/at-auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { DeleteFileDto } from './dto/delete-file.dto';
import { Express } from 'express';

@UseGuards(AtAuthGuard)
@Controller('comment')
export class CommentController {
  constructor(private commentService: CommentService) { }

  @Post('file/create')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'File created successfully',
    type: CommonResponse,
  })
  async createFile(
    @UploadedFile(new FileTypeValidationPipe()) file: Express.Multer.File,
  ): Promise<ResponseFromService> {
    const fileUrl = await this.commentService.createFile(file);

    return {
      message: 'File created successfully',
      data: fileUrl,
    };
  }

  @Post('create/:userId/:postId')
  @ApiCreatedResponse({
    description: 'Comment created successfully',
    type: CommonResponse,
  })
  async createComment(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() createCommentDto: CreateCommentDto,
  ): Promise<ResponseFromService> {
    const comment = await this.commentService.createComment({
      ...createCommentDto,
      userId,
      postId,
    });

    return {
      message: 'Comment created successfully',
      data: comment,
    };
  }

  @Post('tag/create/:userId/:parentId/:replyId/:postId')
  @ApiCreatedResponse({
    description: 'Tag user comment created successfully',
    type: CommonResponse,
  })
  async createTagUserComment(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() createReplyComment: CreateCommentDto,
  ): Promise<ResponseFromService> {
    const tagUserComment = await this.commentService.createTagUserComment({
      ...createReplyComment,
      userId,
      parentId,
      postId,
      replyId,
    });

    return {
      message: 'Tag user comment created successfully',
      data: tagUserComment,
    };
  }

  @Post('reply/create/:userId/:parentId/:postId')
  @ApiCreatedResponse({
    description: 'Reply comment created successfully',
    type: CommonResponse,
  })
  async createReplyComment(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() createReplyComment: CreateCommentDto,
  ): Promise<ResponseFromService> {
    const replyComment = await this.commentService.createReplyComment({
      ...createReplyComment,
      userId,
      parentId,
      postId,
    });

    return {
      message: 'Reply comment created successfully',
      data: replyComment,
    };
  }

  @Get('find/:postId')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: String })
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Comment retrived succussfully',
    type: CommonResponse,
  })
  async findComments(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ResponseFromService> {
    const comments = await this.commentService.findComments(
      postId,
      cursor,
      limit,
    );

    return {
      message: 'Comment retrived succussfully',
      data: comments,
    };
  }

  @Patch('update/:commentId')
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Comment updated successfully',
    type: CommonResponse,
  })
  async updateComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() updateCommentDto: UpdateCommentDto,
  ): Promise<ResponseFromService> {
    const comment = await this.commentService.updateComment({
      ...updateCommentDto,
      commentId,
    });

    return {
      message: 'Comment updated successfully',
      data: comment,
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
    @Body() deleteFileDto: DeleteFileDto,
  ): Promise<ResponseFromService> {
    await this.commentService.deleteFile(deleteFileDto.fileUrl);

    return {
      message: 'File deleted successfully',
    };
  }

  @Delete('delete/:postId/:commentId')
  @ApiOkResponse({
    description: 'Comment deleted successfully',
    type: CommonResponse,
  })
  @ApiNotFoundResponse({
    description: 'Not found',
    type: CommonResponse,
  })
  async deleteComment(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<ResponseFromService> {
    const deletedComment = await this.commentService.deleteComment(
      commentId,
      postId,
    );

    return {
      message: 'Comment deleted successfully',
      data: deletedComment,
    };
  }

  @Post('like/:activeUserId/:postId/:commentId')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Like action successfully',
    type: CommonResponse,
  })
  async like(
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<ResponseFromService> {
    return await this.commentService.like(activeUserId, postId, commentId);
  }
}
