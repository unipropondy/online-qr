import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    BrowserRouter: ({ children }) => <>{children}</>,
    Routes: ({ children }) => <>{children}</>,
    Route: ({ element }) => <>{element}</>,
  };
});

import App from './App';

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(global, 'fetch').mockImplementation((url) => {
    if (String(url).includes('/api/app-settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, enableLogin: 0 }),
      });
    }

    if (String(url).includes('/api/company/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ServiceChargePercentage: 0, GSTPercentage: 0 }),
      });
    }

    if (String(url).includes('/api/paymodes/qrs')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ paynow: '', upi: '' }),
      });
    }

    if (String(url).includes('/api/kitchens')) {
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => [],
    });
  });
});

afterEach(() => {
  global.fetch.mockRestore();
});

test('shows the login page on first load when the user is not logged in', async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  expect(await screen.findByText(/Sign In/i)).toBeInTheDocument();
});
