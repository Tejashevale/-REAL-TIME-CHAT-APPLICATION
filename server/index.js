require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');
const leaveRoom = require('./utils/leave-room');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
};

// Authentication routes
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const username = email.split('@')[0]; // Use email prefix as username

    const user = new User({
      email,
      password: hashedPassword,
      username,
    });

    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token, username });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token, username: user.username });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Protected route to verify token
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, userId: req.user.userId });
});

const server = http.createServer(app);

// Create an io server and allow for CORS from http://localhost:3000 with GET and POST methods
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Socket.io middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

const CHAT_BOT = 'ChatBot';
let chatRoom = ''; // E.g. javascript, node,...
let allUsers = []; // All users in current chat room

// Listen for when the client connects via socket.io-client
io.on('connection', (socket) => {
  console.log('User connected', socket.id);

  socket.on('join_room', async ({ username, room }) => {
    // Verify user is authenticated
    if (!socket.user) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }

    // Join the room
    socket.join(room);
    
    // Get the last 100 messages for this room
    try {
      const last100Messages = await Message.find({ room })
        .sort({ __createdtime__: -1 })
        .limit(100)
        .lean();
      
      // Send the messages to the user
      socket.emit('last_100_messages', last100Messages.reverse());
      
      // Get all users in the room
      const usersInRoom = Array.from(io.sockets.adapter.rooms.get(room) || [])
        .map(socketId => ({
          id: socketId,
          username: io.sockets.sockets.get(socketId)?.username || 'Anonymous'
        }));
      
      // Broadcast the updated user list to everyone in the room
      io.to(room).emit('chatroom_users', usersInRoom);

      // Notify others that a new user has joined
      socket.to(room).emit('receive_message', {
        message: `${username} has joined the room`,
        username: CHAT_BOT,
        __createdtime__: Date.now()
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      socket.emit('error', { message: 'Error joining room' });
    }
  });

  socket.on('send_message', async (data) => {
    // Verify user is authenticated
    if (!socket.user) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }

    try {
      // Save message to database
      const message = new Message({
        room: data.room,
        username: data.username,
        message: data.message,
        __createdtime__: data.__createdtime__
      });
      await message.save();

      // Broadcast the message to everyone in the room
      io.to(data.room).emit('receive_message', data);
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('error', { message: 'Error sending message' });
    }
  });

  socket.on('leave_room', (data) => {
    try {
      const { username, room } = data;
      socket.leave(room);
      const __createdtime__ = Date.now();
      allUsers = leaveRoom(socket.id, allUsers);
      socket.to(room).emit('chatroom_users', allUsers);
      socket.to(room).emit('receive_message', {
        message: `${username} has left the group`,
        username: CHAT_BOT,
        __createdtime__,
      });
      console.log(`${username} has left the chat`);
    } catch (error) {
      console.error('Error in leave_room:', error);
      socket.emit('error', { message: 'Error leaving room' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected from the chat');
    const user = allUsers.find((user) => user.id == socket.id);
    if (user?.username) {
      allUsers = leaveRoom(socket.id, allUsers);
      socket.to(chatRoom).emit('chatroom_users', allUsers);
      socket.to(chatRoom).emit('receive_message', {
        message: `${user.username} has disconnected from the chat.`,
        username: CHAT_BOT,
        __createdtime__: Date.now(),
      });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
