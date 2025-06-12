import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './styles.module.css';
import io from 'socket.io-client';

const Home = () => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  const [users, setUsers] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [isInRoom, setIsInRoom] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    if (token && savedUsername) {
      setIsAuthenticated(true);
      setUsername(savedUsername);
    }
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const response = await fetch(`http://localhost:4000/api/${isLogin ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      setIsAuthenticated(true);
      setUsername(data.username);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (room !== '') {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication required');
        return;
      }

      const newSocket = io('http://localhost:4000', {
        auth: {
          token
        }
      });

      newSocket.on('connect_error', (error) => {
        if (error.message === 'Authentication error') {
          setError('Authentication failed. Please log in again.');
          setIsAuthenticated(false);
          localStorage.removeItem('token');
          localStorage.removeItem('username');
        }
      });

      newSocket.on('error', (error) => {
        setError(error.message);
      });

      setSocket(newSocket);
      
      newSocket.emit('join_room', { username, room });
      setIsInRoom(true);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (message !== '' && socket) {
      const __createdtime__ = Date.now();
      socket.emit('send_message', { username, room, message, __createdtime__ });
      setMessage('');
    }
  };

  useEffect(() => {
    if (socket) {
      socket.on('receive_message', (data) => {
        setMessages((msgs) => [...msgs, data]);
      });

      socket.on('chatroom_users', (data) => {
        setUsers(data);
      });

      socket.on('last_100_messages', (last100Messages) => {
        if (last100Messages) {
          setMessages(last100Messages);
        }
      });

      return () => {
        socket.off('receive_message');
        socket.off('chatroom_users');
        socket.off('last_100_messages');
        socket.disconnect();
      };
    }
  }, [socket]);

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setIsAuthenticated(false);
    setIsInRoom(false);
    setSocket(null);
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.auth_container}>
        <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
        <form onSubmit={handleAuth}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
          />
          <button type="submit">{isLogin ? 'Login' : 'Sign Up'}</button>
        </form>
        {error && <p className={styles.error_message}>{error}</p>}
        <p>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <a onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Sign Up' : 'Login'}
          </a>
        </p>
      </div>
    );
  }

  if (!isInRoom) {
    return (
      <div className={styles.auth_container}>
        <h2>Join a Room</h2>
        <form onSubmit={handleJoinRoom}>
          <input
            type="text"
            placeholder="Room name"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            required
          />
          <button type="submit">Join Room</button>
        </form>
        <button onClick={handleLogout} className={styles.logout_button}>
          Logout
        </button>
        {error && <p className={styles.error_message}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.chat_container}>
      <div className={styles.room_and_users_column}>
        <h2 className={styles.room_title}>Room: {room}</h2>
        <div>
          <h3 className={styles.users_title}>Users in room:</h3>
          <ul className={styles.users_list}>
            {users.map((user) => (
              <li key={user.id}>{user.username}</li>
            ))}
          </ul>
        </div>
        <button onClick={handleLogout} className={styles.logout_button}>
          Logout
        </button>
      </div>
      <div className={styles.messages_column}>
        {messages.map((msg, i) => (
          <div key={i} className={styles.message}>
            <div className={styles.msg_meta}>
              {msg.username} {new Date(msg.__createdtime__).toLocaleString()}
            </div>
            <p className={styles.msg_text}>{msg.message}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
        <form onSubmit={sendMessage} className={styles.send_message_container}>
          <input
            type="text"
            placeholder="Message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
};

export default Home;
