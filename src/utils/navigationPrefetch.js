const routeLoaders = {
  play: () => import('../components/Play'),
  tournaments: () => import('../components/Tournaments'),
  leaderboard: () => import('../components/Leaderboard'),
  profile: () => import('../components/TypeProfile'),
  admin: () => import('../components/AdminPanel'),
  marketplace: () => import('../components/Marketplace'),
  results: () => import('../components/Results'),
  spectate: () => import('../components/Spectate'),
};

const preloadedRoutes = new Set();
const contentPromises = new Map();
let warmupStarted = false;

export const preloadRoute = (routeName) => {
  const loader = routeLoaders[routeName];
  if (!loader || preloadedRoutes.has(routeName)) {
    return Promise.resolve();
  }

  preloadedRoutes.add(routeName);
  return loader().catch(() => {
    preloadedRoutes.delete(routeName);
  });
};

export const getRaceContent = async (mode = 'standard', language = 'english', options = {}) => {
  const { generateRaceContent } = await import('./typingApi');
  const excludeContentIds = Array.isArray(options.excludeContentIds)
    ? [...options.excludeContentIds].map(String).sort()
    : [];
  const key = `${mode}__${language}__${excludeContentIds.join(',')}`;
  if (!contentPromises.has(key)) {
    // Only dedupe truly concurrent, in-flight requests for the same
    // mode/language/excludeIds combo (e.g. React StrictMode double-invoking
    // an effect). Once the request settles - success or failure - the entry
    // is removed so the next call always reaches the backend again, instead
    // of permanently replaying whatever was fetched the first time this key
    // was ever requested (which made freshly-added/edited admin content
    // invisible for the rest of the tab's session).
    const request = generateRaceContent(mode, language, { excludeContentIds })
      .then((result) => {
        contentPromises.delete(key);
        return result;
      })
      .catch(() => {
        contentPromises.delete(key);
        return null;
      });
    contentPromises.set(key, request);
  }
  return contentPromises.get(key);
};

export const preloadPlayContent = async (mode = 'standard', language = 'english') => {
  return getRaceContent(mode, language);
};

export const warmNavigation = () => {
  if (warmupStarted) {
    return;
  }

  warmupStarted = true;
  const routesToWarm = ['play', 'leaderboard', 'tournaments', 'marketplace', 'profile', 'results', 'spectate', 'admin'];

  routesToWarm.forEach((routeName) => {
    void preloadRoute(routeName);
  });

  void preloadPlayContent();
};