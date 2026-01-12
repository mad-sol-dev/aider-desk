import '@testing-library/jest-dom';
import { vi } from 'vitest';

import { globalMockApi } from './mocks/api';

process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

// Mock focus-trap-react
vi.mock('focus-trap-react', () => ({
  FocusTrap: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { provider?: string }) => options?.provider || key,
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock Electron APIs for renderer process
Object.defineProperty(window, 'electron', {
  value: {
    showSaveDialog: vi.fn(() => Promise.resolve({ canceled: false, filePath: '/mock/path' })),
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: ['/mock/path'] })),
  },
  writable: true,
});

Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

// Mock ApplicationAPI for renderer process
Object.defineProperty(window, 'api', {
  value: globalMockApi,
  writable: true,
});

const ignoredConsoleSubstrings = ['react-datepicker/dist/index.es.js', "Not implemented: Window's scrollTo() method", 'Sourcemap for "'];
const shouldIgnoreConsoleMessage = (args: unknown[]) =>
  args.some((arg) => typeof arg === 'string' && ignoredConsoleSubstrings.some((substring) => arg.includes(substring)));

/* eslint-disable no-console */
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
  if (shouldIgnoreConsoleMessage(args)) {
    return;
  }
  originalConsoleWarn(...args);
};

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  if (shouldIgnoreConsoleMessage(args)) {
    return;
  }
  originalConsoleError(...args);
};
/* eslint-enable no-console */
