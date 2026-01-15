import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { GetTrustEvaluationQueryDto } from './dto/get-trust-evaluation-query.dto';
import { TrustService } from './trust.service';

@ApiTags('Trust')
@Controller('api/trust-evaluation')
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get(':did')
  @ApiOperation({ summary: 'Get trust evaluation for a DID' })
  @ApiParam({ name: 'did', description: 'The DID to evaluate' })
  @ApiQuery({ name: 'vprName', required: false, description: 'Filter by VPR name' })
  @ApiResponse({ status: 200, description: 'Trust evaluation result' })
  @ApiResponse({ status: 404, description: 'Trust evaluation not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async getTrustEvaluation(
    @Param('did') did: string,
    @Query() query: GetTrustEvaluationQueryDto,
  ) {
    return this.trustService.getTrustEvaluation(did, query);
  }
}

