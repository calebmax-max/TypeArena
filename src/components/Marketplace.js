import React, { useEffect, useMemo, useState } from 'react';
import { fetchCurrentUser, fetchStoreCatalog, purchaseStoreItem } from '../utils/typingApi';
import '../styles/Marketplace.css';

const CATEGORY_COPY = {
  all: { label: 'All Drops', description: 'Everything available in the store right now.' },
  keyboardSkins: { label: 'Keyboard Skins', description: 'Fresh visual layouts for race mode and practice sessions.' },
  typingThemes: { label: 'Typing Themes', description: 'Mood-rich UI themes that reshape your whole arena.' },
  avatars: { label: 'Avatars', description: 'Profile identities that stand out on the leaderboard.' },
  premiumBadges: { label: 'Premium Badges', description: 'Status drops for players building a visible reputation.' },
  animatedEffects: { label: 'Animated Effects', description: 'Energy trails and visual finishers for wins and highlights.' },
  profileFrames: { label: 'Profile Frames', description: 'Premium framing for your public player card.' },
};

const RARITY_STYLES = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
};

const formatCategoryLabel = (category) => CATEGORY_COPY[category]?.label || category;

export default function Marketplace() {
  const [catalog, setCatalog] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [notice, setNotice] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [busyItemId, setBusyItemId] = useState('');

  const loadData = async () => {
    const [user, store] = await Promise.all([fetchCurrentUser(), fetchStoreCatalog()]);
    setCurrentUser(user);
    setCatalog(store.items || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const categories = useMemo(() => {
    const storeCategories = Array.from(new Set((catalog || []).map((item) => item.category).filter(Boolean)));
    return ['all', ...storeCategories];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (activeCategory === 'all') {
      return catalog;
    }
    return catalog.filter((item) => item.category === activeCategory);
  }, [activeCategory, catalog]);

  const ownedCount = useMemo(() => catalog.filter((item) => item.owned).length, [catalog]);
  const premiumCount = useMemo(
    () => catalog.filter((item) => item.category === 'premiumBadges' || item.rarity === 'legendary').length,
    [catalog]
  );
  const walletBalance = Number(currentUser?.balance || 0);
  const signedIn = Boolean(currentUser?.id);

  const featuredItem = useMemo(() => {
    if (!catalog.length) {
      return null;
    }
    return [...catalog].sort((left, right) => Number(right.price || 0) - Number(left.price || 0))[0];
  }, [catalog]);

  const handlePurchase = async (itemId) => {
    setBusyItemId(itemId);
    try {
      const result = await purchaseStoreItem(itemId);
      setNotice(result.message || 'Purchase complete.');
      await loadData();
    } catch (error) {
      setNotice(error.message || 'Purchase failed.');
    } finally {
      setBusyItemId('');
    }
  };

  const activeCopy = CATEGORY_COPY[activeCategory] || CATEGORY_COPY.all;

  return (
    <div className="marketplace-shell">
      <section className="marketplace-hero">
        <div className="marketplace-hero__copy">
          <span className="marketplace-eyebrow">Premium Customization Store</span>
          <h1>Build a player identity worth showing off.</h1>
          <p>
            Collect premium skins, avatars, badges, and animated effects, then turn every race result
            into something that looks sharp enough to share.
          </p>
          <div className="marketplace-hero__stats">
            <div className="marketplace-stat">
              <span>Wallet</span>
              <strong>KES {walletBalance.toLocaleString()}</strong>
            </div>
            <div className="marketplace-stat">
              <span>Owned</span>
              <strong>{ownedCount}</strong>
            </div>
            <div className="marketplace-stat">
              <span>Premium Drops</span>
              <strong>{premiumCount}</strong>
            </div>
          </div>
        </div>

        <div className="marketplace-hero__featured">
          <span className="marketplace-featured__label">Featured Drop</span>
          {featuredItem ? (
            <>
              <h2>{featuredItem.name}</h2>
              <p>{formatCategoryLabel(featuredItem.category)}</p>
              <strong>KES {Number(featuredItem.price || 0).toLocaleString()}</strong>
              <div className={`marketplace-rarity marketplace-rarity--${RARITY_STYLES[featuredItem.rarity] || 'common'}`}>
                {featuredItem.rarity}
              </div>
            </>
          ) : (
            <p>No drops available yet.</p>
          )}
        </div>
      </section>

      {notice && <div className="marketplace-notice">{notice}</div>}

      <section className="marketplace-toolbar">
        <div>
          <h2>{activeCopy.label}</h2>
          <p>{activeCopy.description}</p>
        </div>
        <div className="marketplace-filters">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`marketplace-filter ${category === activeCategory ? 'is-active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {formatCategoryLabel(category)}
            </button>
          ))}
        </div>
      </section>

      <section className="marketplace-grid">
        {filteredCatalog.length ? filteredCatalog.map((item) => {
          const canAfford = walletBalance >= Number(item.price || 0);
          const itemIsBusy = busyItemId === item.id;
          const actionDisabled = item.owned || itemIsBusy || !signedIn || !canAfford;
          return (
            <article key={item.id} className="marketplace-card">
              <div className="marketplace-card__top">
                <span className="marketplace-tag">{formatCategoryLabel(item.category)}</span>
                <span className={`marketplace-rarity marketplace-rarity--${RARITY_STYLES[item.rarity] || 'common'}`}>
                  {item.rarity}
                </span>
              </div>

              <div className="marketplace-card__art" aria-hidden="true">
                <span>{item.name.slice(0, 1)}</span>
              </div>

              <div className="marketplace-card__body">
                <h3>{item.name}</h3>
                <p>{item.description || 'Premium marketplace item.'}</p>
                <p>
                  {item.equipped
                    ? 'Owned and currently in use on your profile.'
                    : item.owned
                    ? 'Already unlocked on your profile.'
                    : !signedIn
                      ? 'Sign in to buy and unlock this item.'
                      : !canAfford
                        ? `Need KES ${(Number(item.price || 0) - walletBalance).toLocaleString()} more to unlock this item.`
                    : canAfford
                      ? 'Buy now and it will be equipped automatically.'
                      : 'Top up your wallet to unlock this item.'}
                </p>
              </div>

              <div className="marketplace-card__footer">
                <strong>KES {Number(item.price || 0).toLocaleString()}</strong>
                <button
                  className={`btn ${item.owned ? 'btn-success' : !signedIn || !canAfford ? 'btn-outline-primary' : 'btn-primary'}`}
                  disabled={actionDisabled}
                  onClick={() => handlePurchase(item.id)}
                >
                  {item.equipped ? 'In Use' : item.owned ? 'Owned' : itemIsBusy ? 'Processing...' : !signedIn ? 'Sign In Required' : !canAfford ? 'Insufficient Funds' : 'Buy Now'}
                </button>
              </div>
            </article>
          );
        }) : (
          <div className="marketplace-empty">
            <h3>No items in this category yet.</h3>
            <p>Switch filters or add more store inventory from the backend catalog.</p>
          </div>
        )}
      </section>
    </div>
  );
}
