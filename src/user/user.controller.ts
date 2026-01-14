import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import {
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

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

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
  ): Promise<ResponseFromService>{
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
  ): Promise<ResponseFromService>{
    const follower = await this.userService.follow(followerId, followingId);

    return {
      message: `${follower.status === 'follow' ? 'Follow' : 'Unfollow'} action successfully`,
      data: {
        follower: follower.follower,
      },
    }
  }
}
