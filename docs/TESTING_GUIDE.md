# Testing Guide for NestJS

## Framework: Jest (Official NestJS Recommendation)

We use **Jest** as it's the official testing framework for NestJS with built-in support.

## Installation

Dependencies are already configured in `package.json`:
- `jest` - Testing framework
- `ts-jest` - TypeScript support for Jest
- `@nestjs/testing` - NestJS testing utilities
- `@types/jest` - TypeScript types for Jest

## Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:cov

# Run tests in debug mode
pnpm run test:debug
```

## Writing Tests

### Unit Test Example (Service)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ServicesService } from './services.service';
import { ServiceEntity } from '../../database/entities';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        {
          provide: getRepositoryToken(ServiceEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

### Integration Test Example (Controller)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { AppModule } from '../../app.module';

describe('ServicesController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/services (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/services')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('pagination');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

## Test File Naming

- Unit tests: `*.spec.ts` (e.g., `services.service.spec.ts`)
- Integration tests: `*.spec.ts` (e.g., `services.controller.spec.ts`)
- E2E tests: `*.e2e-spec.ts` (e.g., `app.e2e-spec.ts`)

## Mocking

### Mocking Repositories

```typescript
{
  provide: getRepositoryToken(Entity),
  useValue: {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  },
}
```

### Mocking Services

```typescript
{
  provide: SomeService,
  useValue: {
    method: jest.fn().mockResolvedValue(mockData),
  },
}
```

## Coverage

Coverage thresholds are set in `jest.config.js`:
- Branches: 0% (will increase as tests are added)
- Functions: 0% (will increase as tests are added)
- Lines: 0% (will increase as tests are added)
- Statements: 0% (will increase as tests are added)

Run coverage report:
```bash
pnpm run test:cov
```

## Best Practices

1. Use `Test.createTestingModule()` for NestJS module testing
2. Mock dependencies using `useValue` or `useClass`
3. Use `getRepositoryToken()` for TypeORM repositories
4. Test one thing per test - keep tests focused
5. Use descriptive test names - `it('should return services when called')`
6. Clean up - use `afterEach` or `afterAll` for cleanup
7. Mock external dependencies - don't make real HTTP calls in unit tests

## Resources

- [NestJS Testing Documentation](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TypeORM Testing](https://typeorm.io/testing)

