import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { GetServicesQueryDto } from './dto/get-services-query.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@Controller('api/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of services' })
  @ApiQuery({ name: 'did', required: false, description: 'Filter by DID' })
  @ApiQuery({ name: 'vprName', required: false, description: 'Filter by VPR name' })
  @ApiQuery({ name: 'trustStatus', required: false, enum: ['trusted', 'partially_trusted', 'untrusted'], description: 'Filter by trust status' })
  @ApiQuery({ name: 'location', required: false, description: 'Filter by location' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results', example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Pagination offset', example: 0 })
  @ApiQuery({ name: 'orderBy', required: false, description: 'Field to sort by', example: 'createdAt' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'], description: 'Sort direction', example: 'DESC' })
  @ApiResponse({ status: 200, description: 'List of services' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async getServices(@Query() query: GetServicesQueryDto) {
    return this.servicesService.getServices(query);
  }
}

