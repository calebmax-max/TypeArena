import React, { useEffect, useMemo, useState } from 'react';
import { fetchCurrentUser, fetchStoreCatalog, purchaseStoreBundle, purchaseStoreItem } from '../utils/typingApi';
import '../styles/Marketplace.css';

const CATEGORY_COPY = {
  all: { label: 'All Drops', description: 'A sharper, more premium store lineup for serious TypeArena players.' },
  keyboardSkins: { label: 'Keyboard Skins', description: 'Cleaner decks with stronger contrast and a more tournament-grade feel.' },
  typingThemes: { label: 'Typing Themes', description: 'Full arena looks that change the mood from casual app to premium competition.' },
  avatars: { label: 'Avatars', description: 'Stronger player identities with more edge, status, and personality.' },
  premiumBadges: { label: 'Premium Badges', description: 'Visible trust, streak, and founder signals for players building reputation.' },
  animatedEffects: { label: 'Animated Effects', description: 'Win animations and finish effects that make top results hit harder.' },
  profileFrames: { label: 'Profile Frames', description: 'Better framing options for profile cards that should look elite, not generic.' },
  utilityPasses: { label: 'Utility Passes', description: 'Permanent gameplay perks that affect tournaments, progression, and private rooms.' },
};

const RARITY_STYLES = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
};

const ITEM_MARKETING = {
  skin_frostline_pro: ['Limited Drop', 'Best Seller'],
  theme_nairobi_night: ['Trending', 'Night Pack'],
  theme_stealth_hq: ['Elite Pick'],
  avatar_crown_hawk: ['Creator Favorite'],
  badge_founders_mark: ['Founder Exclusive'],
  effect_royal_echo: ['Legendary Finish'],
  frame_imperial_crown: ['Top Tier'],
  perk_signature_invites: ['Private Rooms Pro'],
};

const BUNDLE_DEFS = [
  {
    id: 'bundle_ranked_identity',
    name: 'Ranked Identity Pack',
    description: 'A sharper competitive identity for players who want their profile and race setup to feel premium instantly.',
    itemIds: ['avatar_crown_hawk', 'frame_carbonglass', 'badge_elite_verified'],
    discountRate: 0.15,
    savingsLabel: 'Save 15%',
  },
  {
    id: 'bundle_arena_luxe',
    name: 'Arena Luxe Pack',
    description: 'A premium typing setup with a full arena mood shift, high-end deck, and richer finish effect.',
    itemIds: ['theme_nairobi_night', 'skin_frostline_pro', 'effect_afterburn_wave'],
    discountRate: 0.18,
    savingsLabel: 'Save 18%',
  },
  {
    id: 'bundle_creator_room',
    name: 'Creator Room Pack',
    description: 'Built for private-room hosts who want better invite presence, stronger visuals, and a more branded profile.',
    itemIds: ['perk_signature_invites', 'avatar_signal_ghost', 'frame_imperial_crown'],
    discountRate: 0.12,
    savingsLabel: 'Save 12%',
  },
];

const formatCategoryLabel = (category) => CATEGORY_COPY[category]?.label || category;

function MarketplacePreview({ item }) {
  const mark = item.displayMark || item.name.slice(0, 2).toUpperCase();

  if (item.category === 'keyboardSkins') {
    const skinClass = `preview-skin preview-skin--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--keyboard" aria-hidden="true">
        <div className={`preview-keyboard ${skinClass}`}>
          {[
            ['Q', 'W', 'E', 'R', 'T', 'Y'],
            ['A', 'S', 'D', 'F', 'G', 'H'],
            ['Z', 'X', 'C', 'V', 'B', 'N'],
          ].map((row, rowIndex) => (
            <div key={rowIndex} className="preview-keyboard__row">
              {row.map((key) => (
                <span key={key} className="preview-keyboard__key">{key}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (item.category === 'typingThemes') {
    const themeClass = `preview-theme preview-theme--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--theme" aria-hidden="true">
        <div className={themeClass}>
          <div className="preview-theme__top">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-theme__hero" />
          <div className="preview-theme__stats">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  if (item.category === 'avatars') {
    const avatarClass = `preview-avatar preview-avatar--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--avatar" aria-hidden="true">
        <div className={avatarClass}>
          <span>{mark}</span>
        </div>
      </div>
    );
  }

  if (item.category === 'premiumBadges') {
    const badgeClass = `preview-badge preview-badge--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--badge" aria-hidden="true">
        <div className={badgeClass}>
          <span>{mark}</span>
        </div>
      </div>
    );
  }

  if (item.category === 'animatedEffects') {
    const effectClass = `preview-effect preview-effect--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--effect" aria-hidden="true">
        <div className={effectClass}>
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (item.category === 'profileFrames') {
    const frameClass = `preview-frame preview-frame--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--frame" aria-hidden="true">
        <div className={frameClass}>
          <div className="preview-frame__inner">
            <span>{mark}</span>
          </div>
        </div>
      </div>
    );
  }

  if (item.category === 'utilityPasses') {
    const passClass = `preview-pass preview-pass--${item.id}`;
    return (
      <div className="preview-canvas preview-canvas--pass" aria-hidden="true">
        <div className={passClass}>
          <div className="preview-pass__chip">{mark}</div>
          <div className="preview-pass__lines">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-canvas" aria-hidden="true">
      <span className="preview-fallback">{mark}</span>
    </div>
  );
}

export default function Marketplace() {
  const [catalog, setCatalog] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [notice, setNotice] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [busyItemId, setBusyItemId] = useState('');
  const [busyBundleId, setBusyBundleId] = useState('');
  const [previewItemId, setPreviewItemId] = useState('');

  const loadData = async () => {
    const [user, store] = await Promise.all([fetchCurrentUser(), fetchStoreCatalog()]);
    setCurrentUser(user);
    setCatalog(store.items || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!catalog.length) {
      setPreviewItemId('');
      return;
    }
    setPreviewItemId((current) => current || catalog[0].id);
  }, [catalog]);

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

  const previewItem = useMemo(
    () => catalog.find((item) => item.id === previewItemId) || featuredItem || null,
    [catalog, featuredItem, previewItemId]
  );

  const bundles = useMemo(() => {
    const itemMap = new Map(catalog.map((item) => [item.id, item]));
    return BUNDLE_DEFS.map((bundle) => {
      const items = bundle.itemIds.map((itemId) => itemMap.get(itemId)).filter(Boolean);
      const totalPrice = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const ownedCount = items.filter((item) => item.owned).length;
      const unownedItems = items.filter((item) => !item.owned);
      const unownedTotalPrice = unownedItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const discountedPrice = Math.round(unownedTotalPrice * (1 - Number(bundle.discountRate || 0)));
      return {
        ...bundle,
        items,
        totalPrice,
        ownedCount,
        unownedItems,
        unownedTotalPrice,
        discountedPrice,
      };
    }).filter((bundle) => bundle.items.length);
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

  const handleBundlePreview = (bundle) => {
    if (!bundle.items[0]) {
      return;
    }
    setPreviewItemId(bundle.items[0].id);
    setActiveCategory('all');
    setNotice(`${bundle.name} loaded into live preview.`);
  };

  const handleBundlePurchase = async (bundle) => {
    setBusyBundleId(bundle.id);
    try {
      const result = await purchaseStoreBundle(bundle.id);
      setNotice(result.message || 'Bundle purchased successfully.');
      await loadData();
      if (bundle.items[0]) {
        setPreviewItemId(bundle.items[0].id);
      }
    } catch (error) {
      setNotice(error.message || 'Bundle purchase failed.');
    } finally {
      setBusyBundleId('');
    }
  };

  const activeCopy = CATEGORY_COPY[activeCategory] || CATEGORY_COPY.all;
  const previewThemeItem = previewItem?.category === 'typingThemes' ? previewItem : catalog.find((item) => item.id === 'theme_nairobi_night') || previewItem;
  const previewSkinItem = previewItem?.category === 'keyboardSkins' ? previewItem : catalog.find((item) => item.id === 'skin_velocity_black') || previewItem;
  const previewAvatarItem = previewItem?.category === 'avatars' ? previewItem : catalog.find((item) => item.id === 'avatar_crown_hawk') || previewItem;
  const previewFrameItem = previewItem?.category === 'profileFrames' ? previewItem : catalog.find((item) => item.id === 'frame_carbonglass') || previewItem;
  const previewEffectItem = previewItem?.category === 'animatedEffects' ? previewItem : catalog.find((item) => item.id === 'effect_afterburn_wave') || previewItem;

  return (
    <div className="marketplace-shell">
      <section className="marketplace-hero">
        <div className="marketplace-hero__copy">
          <span className="marketplace-eyebrow">Premium Customization Store</span>
          <h1>Pick drops that actually feel worth buying.</h1>
          <p>
            The catalog now leans into premium competitive identity: cleaner themes, stronger frames,
            sharper avatars, and cosmetics that feel more like status upgrades than filler.
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
          <span className="marketplace-featured__label">Live Try-On Preview</span>
          {previewItem ? (
            <>
              <div className={`marketplace-live-preview marketplace-live-preview--${previewThemeItem?.id || 'default'}`}>
                <div className="marketplace-live-preview__header">
                  <div className={`marketplace-live-preview__avatar marketplace-live-preview__avatar--${previewAvatarItem?.id || 'default'}`}>
                    <div className={`marketplace-live-preview__frame marketplace-live-preview__frame--${previewFrameItem?.id || 'default'}`}>
                      <span>{previewAvatarItem?.displayMark || previewAvatarItem?.name?.slice(0, 2).toUpperCase() || 'TA'}</span>
                    </div>
                  </div>
                  <div>
                    <h2>{previewItem.name}</h2>
                    <p>{previewItem.collection || formatCategoryLabel(previewItem.category)}</p>
                  </div>
                </div>
                <div className="marketplace-live-preview__arena">
                  <div className={`marketplace-live-preview__keyboard marketplace-live-preview__keyboard--${previewSkinItem?.id || 'default'}`}>
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={`marketplace-live-preview__effect marketplace-live-preview__effect--${previewEffectItem?.id || 'default'}`}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
              <strong>KES {Number(previewItem.price || 0).toLocaleString()}</strong>
              <div className={`marketplace-rarity marketplace-rarity--${RARITY_STYLES[previewItem.rarity] || 'common'}`}>
                {previewItem.rarity}
              </div>
              <p>Hover any store card to preview that item in this live try-on stage.</p>
            </>
          ) : (
            <p>No drops available yet.</p>
          )}
        </div>
      </section>

      {notice && <div className="marketplace-notice">{notice}</div>}

      {bundles.length ? (
        <section className="marketplace-bundles">
          <div className="marketplace-bundles__header">
            <h2>Conversion Bundles</h2>
            <p>Curated packs help users buy faster because the look feels complete, not piecemeal.</p>
          </div>
          <div className="marketplace-bundles__grid">
            {bundles.map((bundle) => (
              <article key={bundle.id} className="marketplace-bundle-card">
                <div className="marketplace-bundle-card__top">
                  <span className="marketplace-bundle-pill">{bundle.savingsLabel}</span>
                  <span className="marketplace-bundle-total">KES {bundle.discountedPrice.toLocaleString()}</span>
                </div>
                <h3>{bundle.name}</h3>
                <p>{bundle.description}</p>
                <div className="marketplace-bundle-items">
                  {bundle.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="marketplace-bundle-chip"
                      onClick={() => {
                        setPreviewItemId(item.id);
                        setActiveCategory(item.category);
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <div className="marketplace-bundle-card__footer">
                  <span>
                    Regular total: KES {bundle.totalPrice.toLocaleString()}
                    {bundle.ownedCount ? ` | ${bundle.ownedCount} already owned` : ''}
                  </span>
                  <div className="marketplace-bundle-actions">
                    <button
                      type="button"
                      className="btn btn-outline-light"
                      onClick={() => handleBundlePreview(bundle)}
                    >
                      Preview Bundle
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!signedIn || busyBundleId === bundle.id || bundle.unownedItems.length === 0 || walletBalance < bundle.discountedPrice}
                      onClick={() => handleBundlePurchase(bundle)}
                    >
                      {bundle.unownedItems.length === 0
                        ? 'Bundle Owned'
                        : busyBundleId === bundle.id
                          ? 'Buying Bundle...'
                          : !signedIn
                            ? 'Sign In Required'
                            : walletBalance < bundle.discountedPrice
                              ? 'Insufficient Funds'
                              : 'Buy Bundle'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
          const marketingTags = ITEM_MARKETING[item.id] || [];
          return (
            <article
              key={item.id}
              className={`marketplace-card ${previewItemId === item.id ? 'is-previewing' : ''}`}
              onMouseEnter={() => setPreviewItemId(item.id)}
              onFocus={() => setPreviewItemId(item.id)}
            >
              <div className="marketplace-card__top">
                <div className="marketplace-card__labels">
                  <span className="marketplace-tag">{formatCategoryLabel(item.category)}</span>
                  {marketingTags.map((tag) => (
                    <span key={tag} className="marketplace-tag marketplace-tag--promo">{tag}</span>
                  ))}
                </div>
                <span className={`marketplace-rarity marketplace-rarity--${RARITY_STYLES[item.rarity] || 'common'}`}>
                  {item.rarity}
                </span>
              </div>

              <div className="marketplace-card__art">
                <MarketplacePreview item={item} />
              </div>

              <div className="marketplace-card__body">
                <h3>{item.name}</h3>
                <p className="marketplace-card__collection">{item.collection || formatCategoryLabel(item.category)}</p>
                {item.benefit && <p className="marketplace-card__benefit">{item.benefit}</p>}
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
