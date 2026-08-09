import express from 'express';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { neon } from '@neondatabase/serverless';
import { hashPassword, verifyPassword, generateToken, authenticate } from './auth.js';
import { userSchema, loginSchema } from './validation.js';
import { validate } from './middleware.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const sql = neon(process.env.DATABASE_URL);

// Register new user
router.post('/register', validate(userSchema), async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Check username
    const existingUsername = await db.select().from(users).where(eq(users.username, username));
    if (existingUsername.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const newUser = await db.insert(users).values({
      username,
      email,
      passwordHash,
      balance: '1000.00',
    }).returning({
      id: users.id,
      username: users.username,
      email: users.email,
      balance: users.balance,
      createdAt: users.createdAt,
    });
    
    // Generate token
    const token = generateToken(newUser[0].id, newUser[0].email, newUser[0].username);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: newUser[0],
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await db.select().from(users).where(eq(users.email, email));
    
    if (user.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const isValid = await verifyPassword(password, user[0].passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = generateToken(user[0].id, user[0].email, user[0].username);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user[0].id,
        username: user[0].username,
        email: user[0].email,
        balance: user[0].balance,
        createdAt: user[0].createdAt
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user profile (protected)
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      balance: users.balance,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, req.user.userId));
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user[0]);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user balance (protected)
router.get('/balance', authenticate, async (req, res) => {
  try {
    const user = await db.select({
      balance: users.balance,
    }).from(users).where(eq(users.id, req.user.userId));
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ balance: user[0].balance });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
