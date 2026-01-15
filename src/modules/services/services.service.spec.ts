import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ServiceEntity } from '../../database/entities';
import { ConsistencyService } from '../shared/consistency.service';

import { ServicesService } from './services.service';

describe('ServicesService', () => {
  let service: ServicesService;

  const mockRepository = {
    createQueryBuilder: jest.fn(() => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };

  const mockConsistencyService = {
    getConsistencyFilter: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        {
          provide: getRepositoryToken(ServiceEntity),
          useValue: mockRepository,
        },
        {
          provide: ConsistencyService,
          useValue: mockConsistencyService,
        },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getServices', () => {
    it('should return services with pagination', async () => {
      const query = {
        limit: 10,
        offset: 0,
        orderBy: 'createdAt',
        order: 'DESC' as const,
      };

      const result = await service.getServices(query);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('limit', 10);
      expect(result.pagination).toHaveProperty('offset', 0);
      expect(result.pagination).toHaveProperty('total');
    });
  });
});

