import axios from 'axios';
import { buildApiUrl } from './api';

// ✅ ONE correct endpoint only
const EVENT_BOOKING_URL = buildApiUrl('/api/event_bookings');

export const submitEventBooking = async (payload) => {
  try {
    const response = await axios.post(
      EVENT_BOOKING_URL,
      payload, // ✅ send JSON only
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
        withCredentials: true, // ✅ important for your Flask sessions
      }
    );

    return response.data;

  } catch (error) {
    console.error("EVENT BOOKING ERROR:", error.response?.data || error.message);
    throw error;
  }
};