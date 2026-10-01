import { API_BASE } from './api';

import { io } from 'socket.io-client';

const socketBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
const socketUrl = socketBase || window.location.origin;

export const liveRaceSocket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  withCredentials: true,
});

export const liveRaceRoomName = (roomId) => `live_race:${roomId}`;
