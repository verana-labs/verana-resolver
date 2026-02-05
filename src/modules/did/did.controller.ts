import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import { DidService } from './did.service';

@ApiTags('DID')
@Controller('api/did')
export class DidController {
  constructor(private readonly didService: DidService) {}

  @Get(':did/usage')
  @ApiOperation({ summary: 'Get DID usage information' })
  @ApiParam({ name: 'did', description: 'The DID to query' })
  @ApiResponse({ status: 200, description: 'DID usage information' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async getDidUsage(@Param('did') did: string) {
    return this.didService.getDidUsage(did);
  }
}

