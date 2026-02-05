import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { CredentialsService } from './credentials.service';
import { GetCredentialsQueryDto } from './dto/get-credentials-query.dto';

@ApiTags('Credentials')
@Controller('api/credentials')
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of credentials' })
  @ApiResponse({ status: 200, description: 'List of credentials' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async getCredentials(@Query() query: GetCredentialsQueryDto) {
    return this.credentialsService.getCredentials(query);
  }
}

