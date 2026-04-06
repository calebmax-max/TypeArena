import axios from 'axios';
import { buildApiUrl } from './api';

// ✅ Endpoints (correct and consistent)
const ROOM_BOOKING_ENDPOINT = buildApiUrl('/api/room_bookings');
const FOOD_ORDER_ENDPOINT = buildApiUrl('/api/food_orders');
const STAY_BOOKING_ENDPOINT = buildApiUrl('/api/stay_bookings');

// ---------------- GENERIC POST ----------------
const postCheckoutData = async (endpoint, payload) => {
  try {
    const response = await axios.post(endpoint, payload, {
      timeout: 10000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.data;

  } catch (error) {
    console.error("API ERROR:", endpoint, error.response?.data || error.message);
    throw error;
  }
};

// ---------------- ROOM BOOKING ----------------
export const submitRoomBooking = (payload) => {
  const cleanedPayload = {
    ...payload,
    // ✅ Ensure correct key name
    room_name: payload.room_name || payload.roomName || "Standard Room",
  };

  return postCheckoutData(ROOM_BOOKING_ENDPOINT, cleanedPayload);
};

// ---------------- FOOD ORDER ----------------
export const submitFoodOrder = (payload) => {
  return postCheckoutData(FOOD_ORDER_ENDPOINT, payload);
};

// ---------------- STAY BOOKING ----------------
export const submitStayBooking = (payload) => {
  const cleanedPayload = {
    ...payload,

    // ✅ Fix room name
    room_name: payload.room_name || payload.roomName || "Standard Room",

    // ✅ Fix payment phone
    payment_phone: payload.payment_phone || payload.phone || "0700000000",
  };

  console.log("FINAL STAY PAYLOAD:", cleanedPayload);

  return postCheckoutData(STAY_BOOKING_ENDPOINT, cleanedPayload);
};