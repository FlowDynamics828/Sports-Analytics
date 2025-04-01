// @ts-nocheck
// Load environment variables for testing
require('dotenv').config({ path: '.env.test' });

// Import Jest types
import { jest } from '@jest/globals';

// Increase timeout for all tests
jest.setTimeout(30000);

// Mock console methods to keep test output clean
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  assert: jest.fn(),
  clear: jest.fn(),
  count: jest.fn(),
  countReset: jest.fn(),
  dir: jest.fn(),
  dirxml: jest.fn(),
  group: jest.fn(),
  groupCollapsed: jest.fn(),
  groupEnd: jest.fn(),
  table: jest.fn(),
  time: jest.fn(),
  timeEnd: jest.fn(),
  timeLog: jest.fn(),
  trace: jest.fn(),
  profile: jest.fn(),
  profileEnd: jest.fn(),
};

global.console = mockConsole;

// Mock WebSocket to avoid actual connections
jest.mock('ws', () => {
  return {
    WebSocket: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
    })),
    Server: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  };
});

// Mock Redis client
jest.mock('redis', () => {
  return {
    createClient: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    })),
  };
});

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn(),
      list: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
      update: jest.fn(),
      del: jest.fn(),
    },
    paymentMethods: {
      attach: jest.fn(),
      detach: jest.fn(),
    },
  }));
});

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    verify: jest.fn().mockResolvedValue(true),
  }),
}));

// Mock mongoose
jest.mock('mongoose', () => {
  const mongoose = jest.requireActual('mongoose');
  return {
    ...mongoose,
    connect: jest.fn().mockResolvedValue(mongoose),
    connection: {
      ...mongoose.connection,
      close: jest.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock Python-Shell
jest.mock('python-shell', () => ({
  PythonShell: {
    run: jest.fn().mockImplementation((script, options, callback) => {
      if (callback) {
        callback(null, ['test output']);
      }
      return Promise.resolve(['test output']);
    }),
  },
}));

// Add custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Global test setup
beforeAll(() => {
  // Any setup needed before all tests
});

// Global test teardown
afterAll(() => {
  // Any cleanup needed after all tests
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  // Any cleanup needed after each test
}); 