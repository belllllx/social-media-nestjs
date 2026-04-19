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
  Put,
  Query,
  Request,
  Response,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ResetPasswordAuthGuard } from 'src/auth/guards/reset-password-auth.guard';
import { CommonResponse } from 'src/utils/swagger/common-response';
import { UserService } from './user.service';
import { JwtPayload, ResponseFromService } from 'src/utils/types';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AtAuthGuard } from 'src/auth/guards/at-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserFileTypeValidationPipe } from 'src/utils/validations/user-file-type-validation-pipe';
import { DeleteUserImageDto } from './dto/delete-user-image.dto';
import { EditUserInfoDto } from './dto/edit-user-info.dto';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) { }

  @UseGuards(ResetPasswordAuthGuard)
  @Patch('reset-password')
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Reset password successfully',
    type: CommonResponse,
  })
  async resetPassword(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<ResponseFromService> {
    await this.userService.resetPassword({
      ...resetPasswordDto,
      email: (
        req.user as JwtPayload<{
          email: string;
        }>
      ).email,
    });

    res.clearCookie('reset_password_token');
    return {
      message: 'Reset password successfully',
    };
  }

  @UseGuards(AtAuthGuard)
  @Get('find-by-fullname/:activeUserId')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: String })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Users retreived successfully',
    type: CommonResponse,
  })
  async findByFullname(
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
    @Query('fullname') fullname: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ResponseFromService> {
    const users = await this.userService.findByFullname(
      activeUserId,
      fullname,
      cursor,
      limit,
    );

    return {
      message: 'Users retreived successfully',
      data: users,
    };
  }

  @UseGuards(AtAuthGuard)
  @Get('find/:userId')
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'User retreived successfully',
    type: CommonResponse,
  })
  async findById(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ResponseFromService> {
    const user = await this.userService.findById(userId);

    return {
      message: 'User retreived successfully',
      data: user,
    }
  }

  @UseGuards(AtAuthGuard)
  @Get('finds/:activeUserId')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: String })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Users retreived successfully',
    type: CommonResponse,
  })
  async findUsers(
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ResponseFromService> {
    const users = await this.userService.findMany(activeUserId, cursor, limit);

    return {
      message: 'Users retreived successfully',
      data: users,
    };
  }

  @UseGuards(AtAuthGuard)
  @Post('follow/:followerId/:followingId')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Follow action successfully',
    type: CommonResponse,
  })
  async follow(
    @Param('followerId', ParseUUIDPipe) followerId: string,
    @Param('followingId', ParseUUIDPipe) followingId: string,
  ): Promise<ResponseFromService> {
    const follower = await this.userService.follow(followerId, followingId);

    return {
      message: `${follower.status === 'follow' ? 'Follow' : 'Unfollow'} action successfully`,
      data: {
        follower: follower.follower,
      },
    }
  }

  @UseGuards(AtAuthGuard)
  @Put('background/edit/:activeUserId')
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
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Edit user background successfully',
    type: CommonResponse,
  })
  async editUserBackground(
    @UploadedFile(new UserFileTypeValidationPipe()) file: Express.Multer.File,
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
  ): Promise<ResponseFromService> {
    const { fileUrl } = await this.userService.editUserBackground(file, activeUserId);

    return {
      message: 'Edit user background successfully',
      data: {
        fileUrl,
      },
    }
  }

  @UseGuards(AtAuthGuard)
  @Put('profile/edit/:activeUserId')
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
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Edit user profile successfully',
    type: CommonResponse,
  })
  async editUserProfile(
    @UploadedFile(new UserFileTypeValidationPipe()) file: Express.Multer.File,
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
  ): Promise<ResponseFromService> {
    const { fileUrl } = await this.userService.editUserProfile(file, activeUserId);

    return {
      message: 'Edit user profile successfully',
      data: {
        fileUrl,
      },
    }
  }

  @UseGuards(AtAuthGuard)
  @Delete('background/delete/file/:activeUserId')
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Delete user background successfully',
    type: CommonResponse,
  })
  async deleteUserBackground(
    @Body() deleteUserImageDto: DeleteUserImageDto,
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
  ): Promise<ResponseFromService> {
    await this.userService.deleteUserBackground(deleteUserImageDto.fileUrl, activeUserId);

    return {
      message: 'Delete user background successfully',
    }
  }

  @UseGuards(AtAuthGuard)
  @Delete('profile/delete/file/:activeUserId')
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Delete user profile successfully',
    type: CommonResponse,
  })
  async deleteUserProfile(
    @Body() deleteUserImageDto: DeleteUserImageDto,
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
  ): Promise<ResponseFromService> {
    await this.userService.deleteUserProfile(deleteUserImageDto.fileUrl, activeUserId);

    return {
      message: 'Delete user profile successfully',
    }
  }

  @UseGuards(AtAuthGuard)
  @Put('edit-info/:activeUserId')
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Edit user info successfully',
    type: CommonResponse,
  })
  async editUserInfo(
    @Body() editUserInfoDto: EditUserInfoDto,
    @Param('activeUserId', ParseUUIDPipe) activeUserId: string,
  ): Promise<ResponseFromService>{
    const { user } = await this.userService.editUserInfo({...editUserInfoDto, activeUserId});

    return {
      message: 'Edit user info successfully',
      data: {
        user,
      },
    }
  }
}
