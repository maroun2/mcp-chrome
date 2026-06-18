const collectCoverage = process.env.JEST_COVERAGE === '1';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverage,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/scripts/**/*'],
  coverageDirectory: 'coverage',
  ...(collectCoverage
    ? {
        coverageThreshold: {
          global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
      }
    : {}),
};
