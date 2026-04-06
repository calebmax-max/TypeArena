const ROOM_BOOKINGS_KEY = 'elitehotels-room-bookings';

const isBrowser = typeof window !== 'undefined';
const formatDate = (date) => date.toISOString().split('T')[0];

const sortBookings = (bookings) =>
  [...bookings].sort((first, second) => first.checkIn.localeCompare(second.checkIn));

const pruneExpiredBookings = (bookings) => {
  const today = formatDate(new Date());
  return bookings.filter((booking) => booking?.checkOut && booking.checkOut >= today);
};

export const getStoredRoomBookings = () => {
  if (!isBrowser) {
    return [];
  }

  try {
    const savedBookings = window.localStorage.getItem(ROOM_BOOKINGS_KEY);
    const parsedBookings = savedBookings ? JSON.parse(savedBookings) : [];
    const activeBookings = sortBookings(pruneExpiredBookings(parsedBookings));

    if (savedBookings && activeBookings.length !== parsedBookings.length) {
      window.localStorage.setItem(ROOM_BOOKINGS_KEY, JSON.stringify(activeBookings));
    }

    return activeBookings;
  } catch (error) {
    console.error('Unable to read stored room bookings.', error);
    return [];
  }
};

export const saveRoomBooking = (booking) => {
  const currentBookings = getStoredRoomBookings();
  const nextBookings = sortBookings([...currentBookings, booking]);

  if (isBrowser) {
    window.localStorage.setItem(ROOM_BOOKINGS_KEY, JSON.stringify(nextBookings));
  }

  return nextBookings;
};

export const getRoomBookings = (roomName) =>
  getStoredRoomBookings().filter((booking) => booking.roomName === roomName);

export const isRoomBookedForRange = (roomName, checkIn, checkOut) => {
  if (!checkIn || !checkOut) {
    return false;
  }

  return getRoomBookings(roomName).some(
    (booking) => checkIn < booking.checkOut && checkOut > booking.checkIn
  );
};
