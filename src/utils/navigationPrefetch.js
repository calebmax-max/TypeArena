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

export const preloadPlayContent = async () => {
  const { generateRaceContent } = await import('./typingApi');
  return generateRaceContent('standard', 'english').catch(() => null);
};

export const warmNavigation = () => {
  if (warmupStarted) {
    return;
  }

  warmupStarted = true;
  const routesToWarm = ['play', 'tournaments', 'leaderboard', 'marketplace', 'profile', 'results', 'spectate', 'admin'];

  routesToWarm.forEach((routeName) => {
    void preloadRoute(routeName);
  });

  void preloadPlayContent();
};
