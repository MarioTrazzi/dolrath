// Vercel Serverless Socket.IO
const { Server } = require('socket.io');

const SocketHandler = (req, res) => {
  if (res.socket.server.io) {
    console.log('Socket is already running');
  } else {
    console.log('Socket is initializing');
    const io = new Server(res.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://your-vercel-app.vercel.app'] 
          : ['http://localhost:3000'],
        methods: ['GET', 'POST']
      }
    });
    res.socket.server.io = io;

    const combatRooms = new Map();

    io.on('connection', (socket) => {
      console.log('User connected:', socket.id);

      socket.on('join-room', (data) => {
        const { roomId, player } = data;
        socket.join(roomId);
        
        if (!combatRooms.has(roomId)) {
          combatRooms.set(roomId, { players: [], messages: [] });
        }
        
        const room = combatRooms.get(roomId);
        const existingPlayer = room.players.find(p => p.id === player.id);
        
        if (!existingPlayer) {
          room.players.push(player);
        }
        
        socket.emit('room-joined', { 
          roomId, 
          players: room.players,
          messages: room.messages 
        });
        
        socket.to(roomId).emit('player-joined', player);
      });

      socket.on('chat-message', (data) => {
        const { roomId, message, player } = data;
        const room = combatRooms.get(roomId);
        
        if (room) {
          const chatMessage = {
            id: Date.now(),
            player: player.name,
            message,
            timestamp: new Date()
          };
          
          room.messages.push(chatMessage);
          io.to(roomId).emit('chat-message', chatMessage);
        }
      });

      socket.on('combat-action', (data) => {
        const { roomId, action, player } = data;
        socket.to(roomId).emit('combat-action', { action, player });
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up player from rooms
        combatRooms.forEach((room, roomId) => {
          room.players = room.players.filter(p => p.socketId !== socket.id);
          if (room.players.length === 0) {
            combatRooms.delete(roomId);
          }
        });
      });
    });
  }
  res.end();
};

export default SocketHandler;
