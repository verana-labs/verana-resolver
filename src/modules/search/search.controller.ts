import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('api/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search across all indexed entities' })
  @ApiQuery({ name: 'text', required: true, description: 'Search query string' })
  @ApiResponse({ status: 200, description: 'Search results' })
  @ApiResponse({ status: 400, description: 'Bad request - search text is required' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}

