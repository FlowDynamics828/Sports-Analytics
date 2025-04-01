module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test files pattern
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/coverage/'],

  // Module file extensions
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],

  // Transform configuration
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },

  // Setup files
  setupFiles: ['<rootDir>/jest.setup.js'],

  // Module name mapper for aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Maximum number of concurrent workers
  maxWorkers: '50%',

  // Fail on console errors/warnings
  errorOnDeprecated: true,

  // Global teardown
  globalTeardown: '<rootDir>/jest.teardown.js',

  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],

  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],
}; 