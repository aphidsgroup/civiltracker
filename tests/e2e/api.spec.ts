import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('/api/auth/session returns JSON', async ({ request }) => {
    const response = await request.get('/api/auth/session');
    
    expect(response.status()).not.toBe(404);
    
    const contentType = response.headers()['content-type'];
    if (contentType) {
      expect(contentType).toContain('application/json');
    }
  });

  test('/api/upload endpoint exists', async ({ request }) => {
    const response = await request.post('/api/upload', {
      data: {}
    });
    
    // Usually it should return 400, 401, or 405 depending on implementation. But not 404 html
    expect(response.status()).not.toBe(404);
    
    const contentType = response.headers()['content-type'];
    if (contentType && contentType.includes('text/html')) {
      const text = await response.text();
      expect(text).not.toContain('This page could not be found');
    }
  });
});
