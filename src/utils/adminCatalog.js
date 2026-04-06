import axios from 'axios';
import { defaultRoomOptions } from '../data/roomsCatalog';
import {
  defaultDiningCategories,
  defaultFeaturedPlates,
  createFoodCheckoutItem,
} from '../data/diningMenu';
import { buildApiUrl } from './api';

const ROOMS_KEY = 'admin_rooms_catalog';
const DINING_KEY = 'admin_dining_catalog';

const clone = (value) => JSON.parse(JSON.stringify(value));

const defaultRoomsCatalog = () => clone(defaultRoomOptions);

const defaultDiningCatalog = () => ({
  categories: clone(defaultDiningCategories),
  featuredPlates: clone(defaultFeaturedPlates),
});

const mergeRoomsWithDefaults = (rooms) => {
  const incomingRooms = Array.isArray(rooms) ? rooms : [];
  const defaultRooms = defaultRoomsCatalog();
  const incomingNames = new Set(
    incomingRooms
      .map((room) => room?.name?.trim().toLowerCase())
      .filter(Boolean)
  );

  return [
    ...incomingRooms,
    ...defaultRooms.filter((room) => !incomingNames.has(room.name.trim().toLowerCase())),
  ];
};

const mergeDiningCatalogWithDefaults = (catalog) => {
  const safeCatalog = catalog && typeof catalog === 'object' ? catalog : {};
  const baseCatalog = defaultDiningCatalog();
  const incomingCategories = Array.isArray(safeCatalog.categories) ? safeCatalog.categories : [];
  const incomingFeaturedPlates = Array.isArray(safeCatalog.featuredPlates)
    ? safeCatalog.featuredPlates
    : [];

  const categories = [
    ...baseCatalog.categories.map((defaultCategory) => {
      const matchingCategory = incomingCategories.find(
        (category) =>
          category?.title?.trim().toLowerCase() === defaultCategory.title.trim().toLowerCase()
      );

      if (!matchingCategory) {
        return defaultCategory;
      }

      const currentItems = Array.isArray(matchingCategory.items) ? matchingCategory.items : [];
      const currentItemNames = new Set(
        currentItems
          .map((item) => item?.name?.trim().toLowerCase())
          .filter(Boolean)
      );

      return {
        ...defaultCategory,
        ...matchingCategory,
        description: matchingCategory.description || defaultCategory.description,
        items: [
          ...currentItems,
          ...defaultCategory.items.filter(
            (item) => !currentItemNames.has(item.name.trim().toLowerCase())
          ),
        ],
      };
    }),
    ...incomingCategories.filter(
      (category) =>
        !baseCatalog.categories.some(
          (defaultCategory) =>
            defaultCategory.title.trim().toLowerCase() === category?.title?.trim().toLowerCase()
        )
    ),
  ];

  const featuredPlateTitles = new Set(
    incomingFeaturedPlates
      .map((plate) => plate?.title?.trim().toLowerCase())
      .filter(Boolean)
  );

  const featuredPlates = [
    ...incomingFeaturedPlates,
    ...baseCatalog.featuredPlates.filter(
      (plate) => !featuredPlateTitles.has(plate.title.trim().toLowerCase())
    ),
  ];

  return {
    categories,
    featuredPlates,
  };
};

export const getManagedRooms = () => {
  try {
    const rawValue = localStorage.getItem(ROOMS_KEY);
    const parsedRooms = rawValue ? JSON.parse(rawValue) : defaultRoomsCatalog();
    const mergedRooms = mergeRoomsWithDefaults(parsedRooms);
    cacheManagedRooms(mergedRooms);
    return mergedRooms;
  } catch (error) {
    return defaultRoomsCatalog();
  }
};

export const cacheManagedRooms = (rooms) => {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
};

export const fetchManagedRooms = async () => {
  try {
    const response = await axios.get(buildApiUrl('/api/catalog/rooms'));
    const rooms = mergeRoomsWithDefaults(response.data.rooms);
    cacheManagedRooms(rooms);
    return rooms;
  } catch (error) {
    const rooms = getManagedRooms();
    cacheManagedRooms(rooms);
    return rooms;
  }
};

export const saveManagedRooms = async (rooms) => {
  const mergedRooms = mergeRoomsWithDefaults(rooms);

  try {
    const response = await axios.put(
      buildApiUrl('/api/admin/catalog/rooms'),
      { rooms: mergedRooms },
      { withCredentials: true }
    );
    const nextRooms = mergeRoomsWithDefaults(response.data.rooms || mergedRooms);
    cacheManagedRooms(nextRooms);
    return nextRooms;
  } catch (error) {
    cacheManagedRooms(mergedRooms);
    return mergedRooms;
  }
};

export const getManagedDiningCatalog = () => {
  try {
    const rawValue = localStorage.getItem(DINING_KEY);
    const parsedCatalog = rawValue ? JSON.parse(rawValue) : defaultDiningCatalog();
    const mergedCatalog = mergeDiningCatalogWithDefaults(parsedCatalog);
    cacheManagedDiningCatalog(mergedCatalog);
    return mergedCatalog;
  } catch (error) {
    return defaultDiningCatalog();
  }
};

export const cacheManagedDiningCatalog = (catalog) => {
  localStorage.setItem(DINING_KEY, JSON.stringify(catalog));
};

export const fetchManagedDiningCatalog = async () => {
  try {
    const response = await axios.get(buildApiUrl('/api/catalog/dining'));
    const catalog = mergeDiningCatalogWithDefaults(response.data.catalog);
    cacheManagedDiningCatalog(catalog);
    return catalog;
  } catch (error) {
    const catalog = getManagedDiningCatalog();
    cacheManagedDiningCatalog(catalog);
    return catalog;
  }
};

export const saveManagedDiningCatalog = async (catalog) => {
  const mergedCatalog = mergeDiningCatalogWithDefaults(catalog);

  try {
    const response = await axios.put(
      buildApiUrl('/api/admin/catalog/dining'),
      { catalog: mergedCatalog },
      { withCredentials: true }
    );
    const nextCatalog = mergeDiningCatalogWithDefaults(response.data.catalog || mergedCatalog);
    cacheManagedDiningCatalog(nextCatalog);
    return nextCatalog;
  } catch (error) {
    cacheManagedDiningCatalog(mergedCatalog);
    return mergedCatalog;
  }
};

export const getManagedFoodCheckoutItems = () => {
  const { categories, featuredPlates } = getManagedDiningCatalog();

  return [
    ...featuredPlates.map((plate) =>
      createFoodCheckoutItem({
        title: plate.title,
        description: plate.description,
        image: plate.image,
        price: plate.price,
        type: 'Featured Dish',
        category: plate.tag,
      })
    ),
    ...categories.flatMap((category) =>
      category.items.map((item) =>
        createFoodCheckoutItem({
          title: item.name,
          description: `${category.title} selection`,
          image: item.image,
          price: item.price,
          type: 'Food Order',
          category: category.title,
        })
      )
    ),
  ];
};
