import { API_BASE } from './api';

import { io } from 'socket.io-client';

const socketUrl = API_BASE || window.location.origin;

export const liveRaceSocket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  withCredentials: true,
});

export const liveRaceRoomName = (roomId) => `live_race:${roomId}`;
