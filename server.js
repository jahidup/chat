require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Models
const User = require('./models/User');
const Message = require('./models/Message');

// In-memory OTP store (Map with expiry)
const otpStore = new Map();

// Nodemailer transporter
const transporter = nodemailer.createTransformer({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// --------------------- AUTH ROUTES ---------------------
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const otp = generateOTP();
  const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(email, { otp, expiry });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for LightChat',
    text: `Your verification code is: ${otp}. It expires in 5 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

app.post('/verify-otp', async (req, res) => {
  const { email, otp, name } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  const record = otpStore.get(email);
  if (!record) return res.status(400).json({ error: 'No OTP requested for this email' });
  if (Date.now() > record.expiry) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP expired' });
  }
  if (record.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

  otpStore.delete(email); // OTP used, remove it

  // Check if user exists
  let user = await User.findOne({ email });
  if (!user) {
    // Register new user
    user = new User({ name: name || email.split('@')[0], email, isVerified: true });
    await user.save();
  }
  res.json({ message: 'Login successful', user: { email: user.email, name: user.name } });
});

// --------------------- USER ROUTES ---------------------
app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name email');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/delete-account', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    await User.deleteOne({ email });
    await Message.deleteMany({ $or: [{ senderEmail: email }, { receiverEmail: email }] });
    res.json({ message: 'Account and related messages deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// --------------------- MESSAGING ROUTES ---------------------
app.post('/send-message', async (req, res) => {
  const { senderEmail, receiverEmail, message } = req.body;
  if (!senderEmail || !receiverEmail || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const newMessage = new Message({ senderEmail, receiverEmail, message });
    await newMessage.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/messages/:email', async (req, res) => {
  const currentUserEmail = req.params.email;
  const { with: otherEmail } = req.query;

  if (!otherEmail) return res.status(400).json({ error: 'Missing conversation partner' });

  try {
    const messages = await Message.find({
      $or: [
        { senderEmail: currentUserEmail, receiverEmail: otherEmail },
        { senderEmail: otherEmail, receiverEmail: currentUserEmail },
      ],
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// --------------------- ADMIN ROUTES ---------------------
// Simple admin auth check
const adminAuth = (req, res, next) => {
  const { email, password } = req.headers;
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

app.get('/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email createdAt');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/admin/delete-user', adminAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    await User.deleteOne({ email });
    await Message.deleteMany({ $or: [{ senderEmail: email }, { receiverEmail: email }] });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
