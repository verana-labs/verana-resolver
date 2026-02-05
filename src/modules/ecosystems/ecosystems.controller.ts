import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { GetEcosystemsQueryDto } from './dto/get-ecosystems-query.dto';
import { EcosystemsService } from './ecosystems.service';

@ApiTags('Ecosystems')
@Controller('api/ecosystems')
export class EcosystemsController {
  constructor(private readonly ecosystemsService: EcosystemsService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of ecosystems' })
  @ApiResponse({ status: 200, description: 'List of ecosystems' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async getEcosystems(@Query() query: GetEcosystemsQueryDto) {
    return this.ecosystemsService.getEcosystems(query);
  }
}

