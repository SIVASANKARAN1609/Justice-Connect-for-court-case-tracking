import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from '../routes/justice';
import { db } from '@workspace/db';
import { usersTable, casesTable, documentsTable } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';
import { createToken } from '../middlewares/auth';
import { askJusticeConnectAI } from '../services/ai';
import { sendNotification } from '../services/notifications';

const app = express();
app.use(express.json());
app.use('/api', router);

// Mock external services to prevent real API calls
vi.mock('../services/ai', () => ({
  askJusticeConnectAI: vi.fn().mockResolvedValue('Mock AI response')
}));

vi.mock('../services/notifications', () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined)
}));

describe('Justice Connect API Routes', () => {
  let citizenToken = '';
  let citizenId = 0;
  let caseId = 0;

  beforeAll(async () => {
    // Check if test user exists, otherwise create
    const email = 'test_citizen@example.com';
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (users.length > 0) {
      citizenId = users[0].id;
    } else {
      const [newUser] = await db.insert(usersTable).values({
        name: 'Test Citizen',
        email,
        passwordHash: 'hash', // fake
        role: 'citizen'
      }).returning();
      citizenId = newUser.id;
    }

    citizenToken = createToken({
      id: citizenId,
      email,
      name: 'Test Citizen',
      role: 'citizen'
    });
  });

  it('should not allow unauthorized access to cases', async () => {
    const res = await request(app).get('/api/cases');
    expect(res.status).toBe(401);
  });

  it('should allow a citizen to create a case', async () => {
    const res = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Test Case',
        category: 'Property Dispute',
        description: 'Test description for a new case.',
        citizenId
      });

    expect(res.status).toBe(201);
    expect(res.body.caseNumber).toMatch(/^JC-\d{4}-\d{6}$/);
    expect(res.body.title).toBe('Test Case');
    caseId = res.body.id;

    // Verify notification was triggered
    expect(sendNotification).toHaveBeenCalled();
  });

  it('should block document upload to another users case', async () => {
    // Generate a case ID that doesn't belong to the user
    const res = await request(app)
      .post('/api/cases/999999/documents/upload')
      .set('Authorization', `Bearer ${citizenToken}`)
      .attach('file', Buffer.from('fake pdf content'), 'test.pdf');

    expect(res.status).toBe(404); // Case not found in visible cases
  });

  // Additional tests could be added here for AI and document retrieval
});
