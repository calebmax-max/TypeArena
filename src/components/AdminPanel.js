import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addFundsToAdminWallet,
  createAdminContent,
  deleteAdminContent,
  adminCreateTournament,
  adminImpersonateUser,
  adminUpdateTournament,
  adminDeleteAllTournaments,
  adminDeleteTournament,
  adminLogout,
  fetchAdminAnalytics,
  fetchAdminContent,
  fetchAdminLeaderboardSettings,
  fetchAdminMediaSettings,
  fetchAdminMarketplace,
  createAdminMarketplaceItem,
  updateAdminMarketplaceItem,
  fetchAdminAiSettings,
  fetchAdminSiteMarquee,
  fetchAdminWallet,
  fetchTournamentParticipants,
  fetchTournaments,
  getAdminToken,
  verifyAdminSession,
  updateAdminAiSettings,
  updateAdminContent,
  updateAdminLeaderboardSettings,
  updateAdminMediaSettings,
  updateAdminSiteMarquee,
  withdrawFromAdminWallet,
} from '../utils/typingApi';
import { arenaMusic, useMusicState } from '../utils/arenaMusic';

const DEFAULT_SITE_MARQUEE_ITEMS = [
  'Product Update',
  'Private friend battles are live now.',
  'Wallet top-up, tournaments, and marketplace are active.',
];
const SITE_MARQUEE_CHANGE_EVENT = 'typearena-site-marquee-changed';
const normalizeTournamentList = (v) => (Array.isArray(v) ? v : []);
const normalizeAiSettings = (v) => ({
  provider: String(v?.provider || 'auto'),
  model: String(v?.model || 'gpt-5.2'),
  hasApiKey: Boolean(v?.hasApiKey),
});
const DEFAULT_LEADERBOARD_TIERS = { bronze: 500, silver: 851, gold: 1500, diamond: 1760, grandmaster: 2001 };

const formatCommentatorPhrases = (phrases = []) => (Array.isArray(phrases) ? phrases : [])
  .map((line) => (Array.isArray(line) ? line.join(' | ') : String(line || '').trim()))
  .filter(Boolean)
  .join('\n');

const parseCommentatorPhrases = (text = '') => String(text || '')
  .split(/\r?\n/)
  .map((line) => line.split('|').map((part) => part.trim()).filter(Boolean))
  .filter((line) => line.length > 0);

const NAV_ITEMS = [
  { id: 'overview',    label: 'Overview',     icon: 'â—ˆ' },
  { id: 'wallet',      label: 'Wallet',        icon: 'â—Ž' },
  { id: 'tournaments', label: 'Tournaments',   icon: 'â¬¡' },
  { id: 'players',     label: 'Top Players',   icon: 'â—‰' },
  { id: 'leaderboard', label: 'Leaderboard',   icon: 'â˜…' },
  { id: 'music',       label: 'Music',         icon: 'â™«' },
    { id: 'content',     label: 'Content',       icon: 'Content' },
    { id: 'marketplace', label: 'Marketplace',   icon: 'Store' },
  { id: 'ai',          label: 'AI Settings',   icon: 'â¬¡' },
];

export default function AdminPanel() {
  const navigate = useNavigate();
  const [token, setToken] = useState(getAdminToken());
  const [authChecked, setAuthChecked] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [formData, setFormData] = useState({ name: '', entryFee: '', maxParticipants: '3', image: 'TT', startDate: '', startTime: '', matchDurationMins: '10' });
  const [notice, setNotice] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [aiSettings, setAiSettings] = useState(normalizeAiSettings());
  const [adminContent, setAdminContent] = useState([]);
  const [contentForm, setContentForm] = useState({ id: null, contentType: 'practice', mode: 'standard', language: 'english', passage: '', dailyDate: '', publishAt: '', expiryAt: '', isActive: true });
  const [marketplaceItems, setMarketplaceItems] = useState([]);
  const [marketplaceForm, setMarketplaceForm] = useState({ id: '', name: '', category: 'avatars', price: '', rarity: 'common', collection: '', description: '', benefit: '', isActive: true });
  const [editingMarketplaceId, setEditingMarketplaceId] = useState(null);
  const [commentatorEnabled, setCommentatorEnabled] = useState(true);
  const [leaderboardTiers, setLeaderboardTiers] = useState(DEFAULT_LEADERBOARD_TIERS);
  const [commentatorConfig, setCommentatorConfig] = useState({ rate: 1.08, pitch: 0.92, gap: 220, volume: 1, cooldown: 3500 });
  const [commentatorPhrasesText, setCommentatorPhrasesText] = useState({ raceStart: '', finish: '' });
  const [siteMarqueeText, setSiteMarqueeText] = useState(DEFAULT_SITE_MARQUEE_ITEMS.join('\n'));
  const [adminWallet, setAdminWallet] = useState({ adminEmail: '', adminUsername: 'Admin', balance: 0, marketplaceRevenueTotal: 0, history: { items: [] } });
  const [walletForm, setWalletForm] = useState({ topupAmount: '', topupNote: '', withdrawAmount: '', withdrawNote: '' });
  const [deletingTournamentId, setDeletingTournamentId] = useState(null);
  const [clearingTournaments, setClearingTournaments] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', entryFee: '', maxParticipants: '3', image: '', startDate: '', startTime: '', matchDurationMins: '10' });
  const [savingEditId, setSavingEditId] = useState(null);
  const [viewingParticipantsId, setViewingParticipantsId] = useState(null);
  const [participants, setParticipants] = useState({});
  const [loadingParticipantsId, setLoadingParticipantsId] = useState(null);
  const [impersonatingId, setImpersonatingId] = useState(null);

  // Music
  const musicState = useMusicState();
  const [newTrack, setNewTrack] = useState({ title: '', artist: '', url: '' });
  const [musicNotice, setMusicNotice] = useState('');
  const [trackAddMode, setTrackAddMode] = useState('file');
  const [localFileObjectUrl, setLocalFileObjectUrl] = useState(null);
  const noticeTimerRef = React.useRef(null);

  const loadAdminData = React.useCallback(async () => {
    const [analyticsData, tournamentData, aiSettingsData, siteMarqueeData, walletData, contentData, mediaData, leaderboardData, marketplaceData] = await Promise.all([
      fetchAdminAnalytics(), fetchTournaments(), fetchAdminAiSettings(), fetchAdminSiteMarquee(), fetchAdminWallet(), fetchAdminContent(), fetchAdminMediaSettings(), fetchAdminLeaderboardSettings(), fetchAdminMarketplace(),
    ]);
    setAnalytics(analyticsData);
    setTournaments(normalizeTournamentList(tournamentData));
    setAiSettings(normalizeAiSettings(aiSettingsData));
    setSiteMarqueeText((siteMarqueeData?.items || DEFAULT_SITE_MARQUEE_ITEMS).join('\n'));
    setAdminWallet(walletData);
    setAdminContent(Array.isArray(contentData) ? contentData : []);
    setMarketplaceItems(Array.isArray(marketplaceData?.items) ? marketplaceData.items : []);
    setCommentatorEnabled(mediaData?.commentatorEnabled !== false);
    if (mediaData?.commentatorConfig) setCommentatorConfig(mediaData.commentatorConfig);
    if (mediaData?.commentatorPhrases) {
      setCommentatorPhrasesText({
        raceStart: formatCommentatorPhrases(mediaData.commentatorPhrases.raceStart || []),
        finish: formatCommentatorPhrases(mediaData.commentatorPhrases.finish || []),
      });
    }
    if (leaderboardData?.tiers) setLeaderboardTiers({ ...DEFAULT_LEADERBOARD_TIERS, ...leaderboardData.tiers });
    if (Array.isArray(mediaData?.musicTracks) && mediaData.musicTracks.length) {
      arenaMusic.setTracks(mediaData.musicTracks);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      if (!token) {
        if (active) {
          setAuthChecked(true);
        }
        return;
      }

      setAuthChecked(false);
      try {
        await verifyAdminSession();
      } catch (error) {
        if (!active) return;
        adminLogout();
        setToken(null);
        setAnalytics(null);
        setTournaments([]);
        setAiSettings(normalizeAiSettings());
        setAdminWallet({ adminEmail: '', adminUsername: 'Admin', balance: 0, marketplaceRevenueTotal: 0, history: { items: [] } });
        setNotice('Admin session expired. Please sign in again.');
        setAuthChecked(true);
        return;
      }

      if (!active) return;
      try {
        await loadAdminData();
      } catch (error) {
        if (active) {
          setNotice(error.message || 'Admin session is valid, but some admin data could not be loaded.');
        }
      } finally {
        if (active) setAuthChecked(true);
      }
    };

    checkAccess();
    return () => { active = false; };
  }, [token, loadAdminData]);

  useEffect(() => () => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    if (localFileObjectUrl) {
      URL.revokeObjectURL(localFileObjectUrl);
    }
  }, [localFileObjectUrl]);

  const showNotice = (msg) => {
    setNotice(msg);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => setNotice(''), 4000);
  };

  const computeStatus = (startDate, startTime) => {
    if (!startDate || !startTime) return 'upcoming';
    const start = new Date(`${startDate}T${startTime}`);
    return isNaN(start.getTime()) ? 'upcoming' : (Date.now() >= start.getTime() ? 'active' : 'upcoming');
  };

  const handleCreateTournament = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      const entryFee = Number(formData.entryFee || 0);
      const maxParticipants = Math.max(2, Number(formData.maxParticipants || 2));
      const startTime = (formData.startDate && formData.startTime)
        ? new Date(`${formData.startDate}T${formData.startTime}`).toISOString()
        : null;
      const status = computeStatus(formData.startDate, formData.startTime);
      const result = await adminCreateTournament({
        ...formData,
        description: '',
        entryFee,
        prizePool: entryFee * maxParticipants,
        maxParticipants,
        matchDurationMins: Math.max(1, Number(formData.matchDurationMins || 10)),
        duration: '5d',
        startTime,
        status,
      });
      showNotice(result.message || 'Tournament created.');
      setFormData({ name: '', entryFee: '', maxParticipants: '3', image: 'TT', startDate: '', startTime: '', matchDurationMins: '10' });
      await loadAdminData();
    } catch (err) { showNotice(err.message || 'Could not create tournament.'); }
  };

  const handleSignOut = () => { adminLogout(); setToken(null); };

  const handleImpersonatePlayer = async (player) => {
    if (!player?.id) return;
    setImpersonatingId(player.id);
    try {
      const result = await adminImpersonateUser({ userId: player.id });
      showNotice(result.message || `Signed in as ${player.username || 'player'}.`);
      navigate('/profile');
    } catch (err) {
      showNotice(err.message || 'Could not sign in as that player.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleAiSettingsSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      const result = await updateAdminAiSettings({ provider: aiSettings.provider, model: aiSettings.model });
      setAiSettings(normalizeAiSettings(result.settings || aiSettings));
      showNotice(result.message || 'AI settings updated.');
    } catch (err) { showNotice(err.message || 'Could not update AI settings.'); }
  };

  const handleSiteMarqueeSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const items = siteMarqueeText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!items.length) { showNotice('Add at least one marquee line.'); return; }
    try {
      const result = await updateAdminSiteMarquee({ items });
      setSiteMarqueeText((result?.settings?.items || items).join('\n'));
      window.dispatchEvent(new Event(SITE_MARQUEE_CHANGE_EVENT));
      showNotice(result.message || 'Marquee updated.');
    } catch (err) { showNotice(err.message || 'Could not update marquee.'); }
  };

  const resetContentForm = () => setContentForm({ id: null, contentType: 'practice', mode: 'standard', language: 'english', passage: '', dailyDate: '', publishAt: '', expiryAt: '', isActive: true });

  const handleContentSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!contentForm.passage.trim()) {
      showNotice('Add passage text before saving.');
      return;
    }
    try {
      const payload = { ...contentForm, passage: contentForm.passage.trim() };
      const result = contentForm.id
        ? await updateAdminContent(contentForm.id, payload)
        : await createAdminContent(payload);
      setAdminContent((items) => contentForm.id
        ? items.map((item) => item.id === contentForm.id ? result.content : item)
        : [result.content, ...items]);
      resetContentForm();
      showNotice(result.message || 'Typing content saved.');
    } catch (err) { showNotice(err.message || 'Could not save typing content.'); }
  };

  const resetMarketplaceForm = () => setMarketplaceForm({ id: '', name: '', category: 'avatars', price: '', rarity: 'common', collection: '', description: '', benefit: '', isActive: true });

  const handleMarketplaceSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const itemId = marketplaceForm.id.trim().toLowerCase();
    const name = marketplaceForm.name.trim();
    const price = Number(marketplaceForm.price);
    if (!itemId || !/^[a-z0-9_-]+$/.test(itemId)) { showNotice('Use a unique ID with lowercase letters, numbers, hyphens, or underscores.'); return; }
    if (!name || !Number.isFinite(price) || price < 0) { showNotice('Enter an item name and a valid non-negative price.'); return; }
    try {
      const payload = { ...marketplaceForm, id: itemId, name, price };
      const result = editingMarketplaceId
        ? await updateAdminMarketplaceItem(editingMarketplaceId, payload)
        : await createAdminMarketplaceItem(payload);
      const savedItem = result.item;
      setMarketplaceItems((items) => editingMarketplaceId
        ? items.map((item) => item.id === editingMarketplaceId ? savedItem : item)
        : [savedItem, ...items]);
      resetMarketplaceForm();
      setEditingMarketplaceId(null);
      showNotice(result.message || 'Marketplace item saved.');
    } catch (err) { showNotice(err.message || 'Could not save marketplace item.'); }
  };

  const openMarketplaceEdit = (item) => {
    setEditingMarketplaceId(item.id);
    setMarketplaceForm({
      id: item.id || '', name: item.name || '', category: item.category || 'avatars',
      price: String(item.price ?? ''), rarity: item.rarity || 'common', collection: item.collection || '',
      description: item.description || '', benefit: item.benefit || '', isActive: item.isActive !== false,
    });
    setActiveSection('marketplace');
  };
  const handleContentDelete = async (item) => {
    if (!window.confirm(item.content_type === 'daily' ? 'Archive this Daily Passage? It will remain in history.' : 'Delete this passage? Active-room passages will be deactivated instead.')) return;
    try {
      const result = await deleteAdminContent(item.id);
      setAdminContent((items) => items.filter((entry) => entry.id !== item.id));
      showNotice(result.message || 'Typing content deleted.');
    } catch (err) { showNotice(err.message || 'Could not delete typing content.'); }
  };

  const handleAdminWalletTopUp = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      const result = await addFundsToAdminWallet(walletForm.topupAmount, walletForm.topupNote);
      showNotice(result.message || 'Admin wallet funded.');
      setWalletForm(p => ({ ...p, topupAmount: '', topupNote: '' }));
      await loadAdminData();
    } catch (err) { showNotice(err.message || 'Could not add funds.'); }
  };

  const handleAdminWalletWithdraw = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      const result = await withdrawFromAdminWallet(walletForm.withdrawAmount, walletForm.withdrawNote);
      showNotice(result.message || 'Withdrawal completed.');
      setWalletForm(p => ({ ...p, withdrawAmount: '', withdrawNote: '' }));
      await loadAdminData();
    } catch (err) { showNotice(err.message || 'Could not withdraw.'); }
  };

  const handleDeleteTournament = async (t) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    setDeletingTournamentId(t.id);
    try {
      const result = await adminDeleteTournament(t.id);
      setTournaments(prev => normalizeTournamentList(prev).filter(x => x.id !== t.id));
      showNotice(result.message || 'Tournament deleted.');
    } catch (err) { showNotice(err.message || 'Could not delete.'); }
    finally { setDeletingTournamentId(null); }
  };

  const openEditTournament = (t) => {
    const existingStart = t.startTime ? new Date(t.startTime) : null;
    const startDate = existingStart ? existingStart.toISOString().slice(0, 10) : '';
    const startTime = existingStart ? existingStart.toTimeString().slice(0, 5) : '';
    const newEditForm = {
      name: t.name || '',
      entryFee: String(t.entryFee || ''),
      maxParticipants: String(t.matchSize || t.maxParticipants || 2),
      image: t.image || '',
      startDate,
      startTime,
      matchDurationMins: String(t.matchDurationMins || 10),
    };
    // Set both atomically to prevent mismatch between editingTournament and editForm
    setEditForm(newEditForm);
    setEditingTournament(t);
  };

  const handleSaveEdit = async () => {
    if (!editingTournament) return;
    setSavingEditId(editingTournament.id);
    try {
      const entryFee = Number(editForm.entryFee || 0);
      const maxParticipants = Math.max(2, Number(editForm.maxParticipants || 2));
      const startTime = (editForm.startDate && editForm.startTime)
        ? new Date(`${editForm.startDate}T${editForm.startTime}`).toISOString()
        : null;
      const status = computeStatus(editForm.startDate, editForm.startTime);
      const result = await adminUpdateTournament(editingTournament.id, {
        name: editForm.name,
        entryFee,
        maxParticipants,
        image: editForm.image,
        prizePool: entryFee * maxParticipants,
        matchDurationMins: Math.max(1, Number(editForm.matchDurationMins || 10)),
        startTime,
        status,
      });
      setTournaments(prev => normalizeTournamentList(prev).map(t =>
        t.id === editingTournament.id ? (result.tournament || { ...t, ...editForm, startTime, status }) : t
      ));
      showNotice(result.message || 'Tournament updated.');
      setEditingTournament(null);
    } catch (err) { showNotice(err.message || 'Could not update tournament.'); }
    finally { setSavingEditId(null); }
  };

  const handleViewParticipants = async (t) => {
    if (viewingParticipantsId === t.id) { setViewingParticipantsId(null); return; }
    setViewingParticipantsId(t.id);
    // Always re-fetch to avoid stale data
    setLoadingParticipantsId(t.id);
    try {
      const data = await fetchTournamentParticipants(t.id);
      setParticipants(prev => ({ ...prev, [t.id]: Array.isArray(data) ? data : (data.participants || []) }));
    } catch (err) {
      setParticipants(prev => ({ ...prev, [t.id]: [] }));
      showNotice(err.message || 'Could not load participants.');
    } finally { setLoadingParticipantsId(null); }
  };

  const handleClearAllTournaments = async () => {
    if (!window.confirm('Clear all tournaments?')) return;
    setClearingTournaments(true);
    try {
      const result = await adminDeleteAllTournaments();
      setTournaments([]);
      showNotice(result.message || 'All tournaments cleared.');
    } catch (err) { showNotice(err.message || 'Could not clear.'); }
    finally { setClearingTournaments(false); }
  };

  // Music
  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localFileObjectUrl) URL.revokeObjectURL(localFileObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    setLocalFileObjectUrl(objectUrl);
    const autoTitle = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    setNewTrack(p => ({ ...p, url: objectUrl, title: p.title || autoTitle }));
  };

  const handleSwitchMode = (mode) => {
    setTrackAddMode(mode);
    if (mode === 'url' && localFileObjectUrl) { URL.revokeObjectURL(localFileObjectUrl); setLocalFileObjectUrl(null); }
    setNewTrack(p => ({ ...p, url: '' }));
  };

  const persistMediaSettings = async (tracks, nextCommentatorEnabled = commentatorEnabled, nextCommentatorConfig = commentatorConfig, nextCommentatorPhrases = commentatorPhrasesText) => {
    try {
      const result = await updateAdminMediaSettings({
        musicTracks: tracks,
        commentatorEnabled: nextCommentatorEnabled,
        commentatorConfig: nextCommentatorConfig,
        commentatorPhrases: {
          raceStart: parseCommentatorPhrases(nextCommentatorPhrases.raceStart),
          finish: parseCommentatorPhrases(nextCommentatorPhrases.finish),
        },
      });
      if (Array.isArray(result?.settings?.musicTracks)) arenaMusic.setTracks(result.settings.musicTracks);
      if (result?.settings?.commentatorPhrases) {
        setCommentatorPhrasesText({
          raceStart: formatCommentatorPhrases(result.settings.commentatorPhrases.raceStart || []),
          finish: formatCommentatorPhrases(result.settings.commentatorPhrases.finish || []),
        });
      }
      showNotice(result.message || 'Media settings updated.');
    } catch (err) { showNotice(err.message || 'Could not update media settings.'); }
  };

  const handleAddTrack = () => {
    if (trackAddMode === 'file') {
      setMusicNotice('Use a hosted audio URL for a shared playlist. Device files only work in this browser.');
      return;
    }
    const url = trackAddMode === 'file' ? (localFileObjectUrl || '') : newTrack.url.trim();
    const title = newTrack.title.trim() || 'Untitled Track';
    const artist = newTrack.artist.trim() || 'Unknown Artist';
    if (!url) { setMusicNotice(trackAddMode === 'file' ? 'Select an audio file.' : 'Enter a URL.'); return; }
    const track = { id: 'track_' + Date.now(), title, artist, url };
    arenaMusic.addTrack(track);
    void persistMediaSettings([...musicState.tracks, track]);
    setNewTrack({ title: '', artist: '', url: '' });
    setLocalFileObjectUrl(null);
    setMusicNotice(`"${title}" added.`);
    setTimeout(() => setMusicNotice(''), 3000);
    if (!musicState.playing) arenaMusic.play();
  };

  const handleRemoveTrack = (id, title) => {
    if (!window.confirm(`Remove "${title}"?`)) return;
    arenaMusic.removeTrack(id);
    void persistMediaSettings(musicState.tracks.filter((track) => track.id !== id));
    setMusicNotice(`"${title}" removed.`);
    setTimeout(() => setMusicNotice(''), 3000);
  };

  const handleResetPlaylist = () => {
    if (!window.confirm('Reset to default playlist?')) return;
    arenaMusic.resetToDefaults();
    void persistMediaSettings(arenaMusic.DEFAULT_TRACKS);
    setMusicNotice('Playlist reset.');
    setTimeout(() => setMusicNotice(''), 3000);
  };

  const handleCommentatorToggle = () => {
    const next = !commentatorEnabled;
    setCommentatorEnabled(next);
    void persistMediaSettings(musicState.tracks, next, commentatorConfig, commentatorPhrasesText);
  };

  const handleCommentatorConfigChange = (key, value) => {
    const next = { ...commentatorConfig, [key]: Number(value) };
    setCommentatorConfig(next);
    void persistMediaSettings(musicState.tracks, commentatorEnabled, next, commentatorPhrasesText);
  };

  const handleCommentatorPhrasesChange = (key, value) => {
    setCommentatorPhrasesText((prev) => ({ ...prev, [key]: value }));
  };

  const handleCommentatorPhrasesSave = async () => {
    try {
      await persistMediaSettings(musicState.tracks, commentatorEnabled, commentatorConfig, commentatorPhrasesText);
      showNotice('Commentary phrases updated.');
    } catch (err) {
      showNotice(err.message || 'Could not update commentary phrases.');
    }
  };

  const handleLeaderboardTierSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const tiers = Object.fromEntries(Object.entries(leaderboardTiers).map(([key, value]) => [key, Number(value)]));
    const ordered = ['bronze', 'silver', 'gold', 'diamond', 'grandmaster'];
    if (ordered.some((key, index) => index > 0 && tiers[key] <= tiers[ordered[index - 1]])) {
      showNotice('Each tier threshold must be higher than the previous tier.');
      return;
    }
    try {
      const result = await updateAdminLeaderboardSettings({ tiers });
      setLeaderboardTiers(result.tiers || tiers);
      showNotice(result.message || 'Leaderboard tiers updated.');
    } catch (err) { showNotice(err.message || 'Could not update leaderboard tiers.'); }
  };

  const entryFee = Number(formData.entryFee || 0);
  const maxParticipants = Math.max(2, Number(formData.maxParticipants || 2));
  const totalStake = entryFee * maxParticipants;
  const winnerAmount = totalStake * 0.6;
  const platformFee = totalStake * 0.4;

  // â”€â”€â”€ Metric data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const primaryMetrics = [
    { label: 'Revenue Today',       value: `KES ${Number(analytics?.revenueToday || 0).toLocaleString()}`,        accent: '#63cab7' },
    { label: 'Admin Wallet',        value: `KES ${Number(analytics?.adminWalletBalance || 0).toLocaleString()}`,  accent: '#63cab7' },
    { label: 'Total Payouts',       value: `KES ${Number(analytics?.totalPayouts || 0).toLocaleString()}`,        accent: '#e07b5a' },
    { label: 'Marketplace Revenue', value: `KES ${Number(analytics?.marketplaceRevenueTotal || 0).toLocaleString()}`, accent: '#c9a84c' },
    { label: 'Active Players',      value: analytics?.activePlayers || 0,                                          accent: '#63cab7' },
    { label: 'Tournament Entries',  value: analytics?.tournamentEntries || 0,                                      accent: '#8b8fff' },
    { label: 'M-Pesa Transactions', value: analytics?.mpesaTransactions || 0,                                      accent: '#63cab7' },
    { label: 'M-Pesa Volume',       value: `KES ${Number(analytics?.mpesaVolume || 0).toLocaleString()}`,          accent: '#63cab7' },
  ];
  const secondaryMetrics = [
    { label: 'DAU',               value: analytics?.dailyActiveUsers || 0 },
    { label: 'Retention',         value: `${Math.round(Number(analytics?.retention || 0) * 100)}%` },
    { label: 'Avg Tourney Size',  value: Number(analytics?.averageTournamentSize || 0).toFixed(1) },
    { label: 'ARPU',              value: `KES ${Number(analytics?.arpu || 0).toLocaleString()}` },
    { label: 'Payout Ratio',      value: `${Math.round(Number(analytics?.payoutRatio || 0) * 100)}%` },
    { label: 'Churn',             value: `${Math.round(Number(analytics?.churn || 0) * 100)}%` },
    { label: 'CAC',               value: `KES ${Number(analytics?.cac || 0).toLocaleString()}` },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap');

        :root {
          --ap-bg:        #080a0f;
          --ap-surface:   #0d1117;
          --ap-surface2:  #131820;
          --ap-border:    rgba(255,255,255,0.07);
          --ap-border2:   rgba(255,255,255,0.12);
          --ap-accent:    #63cab7;
          --ap-accent2:   #8b8fff;
          --ap-warn:      #e07b5a;
          --ap-gold:      #c9a84c;
          --ap-text:      #e8edf5;
          --ap-muted:     rgba(232,237,245,0.4);
          --ap-sidebar:   200px;
          --ap-font-head: 'Syne', sans-serif;
          --ap-font-mono: 'DM Mono', monospace;
        }

        .ap-root {
          display: flex;
          min-height: 100vh;
          background: var(--ap-bg);
          color: var(--ap-text);
          font-family: var(--ap-font-mono);
        }

        /* â”€â”€ Sidebar â”€â”€ */
        .ap-sidebar {
          width: var(--ap-sidebar);
          background: var(--ap-surface);
          border-right: 1px solid var(--ap-border);
          display: flex;
          flex-direction: column;
          padding: 0;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          flex-shrink: 0;
          z-index: 10;
        }
        .ap-sidebar-logo {
          padding: 28px 20px 20px;
          border-bottom: 1px solid var(--ap-border);
          margin-bottom: 8px;
        }
        .ap-sidebar-logo-text {
          font-family: var(--ap-font-head);
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--ap-accent);
          letter-spacing: -0.02em;
          line-height: 1;
        }
        .ap-sidebar-logo-sub {
          font-size: 0.62rem;
          color: var(--ap-muted);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-top: 4px;
          display: block;
        }
        .ap-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 20px;
          font-size: 0.78rem;
          color: var(--ap-muted);
          cursor: pointer;
          border-left: 2px solid transparent;
          transition: all 0.15s;
          letter-spacing: 0.03em;
          user-select: none;
        }
        .ap-nav-item:hover { color: var(--ap-text); background: rgba(255,255,255,0.03); }
        .ap-nav-item.active {
          color: var(--ap-accent);
          border-left-color: var(--ap-accent);
          background: rgba(99,202,183,0.06);
          font-weight: 500;
        }
        .ap-nav-icon {
          font-size: 1rem;
          width: 18px;
          text-align: center;
          flex-shrink: 0;
        }
        .ap-sidebar-footer {
          margin-top: auto;
          padding: 16px 20px;
          border-top: 1px solid var(--ap-border);
        }
        .ap-signout-btn {
          width: 100%;
          background: transparent;
          border: 1px solid rgba(224,123,90,0.3);
          border-radius: 6px;
          color: var(--ap-warn);
          font-family: var(--ap-font-mono);
          font-size: 0.72rem;
          padding: 8px;
          cursor: pointer;
          letter-spacing: 0.04em;
          transition: all 0.15s;
        }
        .ap-signout-btn:hover { background: rgba(224,123,90,0.1); border-color: var(--ap-warn); }

        /* â”€â”€ Main content â”€â”€ */
        .ap-main {
          flex: 1;
          min-width: 0;
          padding: 36px 40px;
          overflow-y: auto;
        }

        /* â”€â”€ Section header â”€â”€ */
        .ap-section-header {
          margin-bottom: 28px;
        }
        .ap-section-title {
          font-family: var(--ap-font-head);
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--ap-text);
          line-height: 1;
          margin: 0 0 6px;
        }
        .ap-section-sub {
          font-size: 0.75rem;
          color: var(--ap-muted);
          margin: 0;
        }

        /* â”€â”€ Notice toast â”€â”€ */
        .ap-toast {
          position: fixed;
          top: 24px;
          right: 24px;
          background: var(--ap-surface2);
          border: 1px solid var(--ap-border2);
          border-left: 3px solid var(--ap-accent);
          border-radius: 8px;
          padding: 12px 18px;
          font-size: 0.8rem;
          color: var(--ap-text);
          z-index: 9999;
          animation: apSlideIn 0.2s ease;
          max-width: 340px;
        }
        @keyframes apSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        /* â”€â”€ Metric grid â”€â”€ */
        .ap-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }
        .ap-metric-card {
          background: var(--ap-surface);
          border: 1px solid var(--ap-border);
          border-radius: 10px;
          padding: 18px 20px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .ap-metric-card:hover { border-color: var(--ap-border2); }
        .ap-metric-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: var(--card-accent, var(--ap-accent));
          opacity: 0.6;
        }
        .ap-metric-label {
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ap-muted);
          margin-bottom: 8px;
          display: block;
        }
        .ap-metric-value {
          font-family: var(--ap-font-head);
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ap-text);
          line-height: 1;
        }
        .ap-metrics-secondary {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 8px;
          margin-bottom: 28px;
        }
        .ap-metric-sm {
          background: var(--ap-surface);
          border: 1px solid var(--ap-border);
          border-radius: 8px;
          padding: 12px 14px;
        }
        .ap-metric-sm .ap-metric-label { font-size: 0.6rem; margin-bottom: 4px; }
        .ap-metric-sm .ap-metric-value { font-size: 1rem; }

        /* â”€â”€ Card â”€â”€ */
        .ap-card {
          background: var(--ap-surface);
          border: 1px solid var(--ap-border);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 16px;
        }
        .ap-card-title {
          font-family: var(--ap-font-head);
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--ap-muted);
          margin: 0 0 18px;
        }
        .ap-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ap-three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

        /* â”€â”€ Form elements â”€â”€ */
        .ap-input, .ap-select, .ap-textarea {
          width: 100%;
          background: var(--ap-bg);
          border: 1px solid var(--ap-border2);
          border-radius: 8px;
          color: var(--ap-text);
          font-family: var(--ap-font-mono);
          font-size: 0.8rem;
          padding: 10px 14px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .ap-input:focus, .ap-select:focus, .ap-textarea:focus {
          border-color: var(--ap-accent);
          box-shadow: 0 0 0 3px rgba(99,202,183,0.1);
        }
        .ap-input::placeholder { color: rgba(232,237,245,0.22); }
        .ap-select option { background: var(--ap-surface); }
        .ap-textarea { resize: vertical; min-height: 100px; }
        .ap-label {
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ap-muted);
          display: block;
          margin-bottom: 6px;
        }
        .ap-field { margin-bottom: 14px; }

        /* â”€â”€ Buttons â”€â”€ */
        .ap-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--ap-accent);
          border: none;
          border-radius: 8px;
          color: #080a0f;
          font-family: var(--ap-font-mono);
          font-size: 0.78rem;
          font-weight: 500;
          padding: 10px 18px;
          cursor: pointer;
          letter-spacing: 0.03em;
          transition: all 0.15s;
        }
        .ap-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .ap-btn:active { transform: translateY(0); }
        .ap-btn-ghost {
          background: transparent;
          border: 1px solid var(--ap-border2);
          color: var(--ap-muted);
        }
        .ap-btn-ghost:hover { border-color: var(--ap-accent); color: var(--ap-accent); filter: none; transform: none; background: rgba(99,202,183,0.06); }
        .ap-btn-danger {
          background: transparent;
          border: 1px solid rgba(224,123,90,0.35);
          color: var(--ap-warn);
        }
        .ap-btn-danger:hover { background: rgba(224,123,90,0.1); border-color: var(--ap-warn); filter: none; transform: none; }
        .ap-btn-sm { padding: 7px 12px; font-size: 0.72rem; border-radius: 6px; }
        .ap-btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; align-items: center; }

        /* â”€â”€ Wallet summary â”€â”€ */
        .ap-wallet-row {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }
        .ap-wallet-stat {
          flex: 1;
          background: var(--ap-bg);
          border: 1px solid var(--ap-border);
          border-radius: 10px;
          padding: 16px 18px;
        }
        .ap-wallet-stat-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ap-muted); margin-bottom: 6px; display: block; }
        .ap-wallet-stat-value { font-family: var(--ap-font-head); font-size: 1.2rem; font-weight: 700; }

        /* â”€â”€ Transaction list â”€â”€ */
        .ap-tx-list { display: flex; flex-direction: column; gap: 6px; }
        .ap-tx-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 14px;
          background: var(--ap-bg);
          border: 1px solid var(--ap-border);
          border-radius: 8px;
          font-size: 0.78rem;
        }
        .ap-tx-amount { font-family: var(--ap-font-head); font-weight: 700; font-size: 0.9rem; }
        .ap-tx-amount.in  { color: var(--ap-accent); }
        .ap-tx-amount.out { color: var(--ap-warn); }
        .ap-tx-type { flex: 1; color: var(--ap-muted); text-transform: capitalize; }
        .ap-tx-note { font-size: 0.68rem; color: rgba(232,237,245,0.3); }

        /* â”€â”€ Tournament list â”€â”€ */
        .ap-tourney-list { display: flex; flex-direction: column; gap: 8px; }
        .ap-tourney-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 16px;
          background: var(--ap-bg);
          border: 1px solid var(--ap-border);
          border-radius: 10px;
          transition: border-color 0.15s;
        }
        .ap-tourney-item:hover { border-color: var(--ap-border2); }
        .ap-tourney-icon {
          font-size: 1.4rem;
          width: 36px;
          text-align: center;
          flex-shrink: 0;
        }
        .ap-tourney-info { flex: 1; min-width: 0; }
        .ap-tourney-name { font-family: var(--ap-font-head); font-weight: 700; font-size: 0.9rem; }
        .ap-tourney-meta { font-size: 0.68rem; color: var(--ap-muted); margin-top: 3px; }
        .ap-status-badge {
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid;
          flex-shrink: 0;
        }
        .ap-status-badge.upcoming { color: var(--ap-accent); border-color: rgba(99,202,183,0.3); background: rgba(99,202,183,0.07); }
        .ap-status-badge.active   { color: var(--ap-gold); border-color: rgba(201,168,76,0.3); background: rgba(201,168,76,0.07); }
        .ap-status-badge.completed{ color: var(--ap-muted); border-color: var(--ap-border); }

        /* â”€â”€ Players table â”€â”€ */
        .ap-players-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .ap-players-table th {
          text-align: left;
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ap-muted);
          padding: 8px 12px;
          border-bottom: 1px solid var(--ap-border);
        }
        .ap-players-table td { padding: 10px 12px; border-bottom: 1px solid var(--ap-border); }
        .ap-players-table tr:last-child td { border-bottom: none; }
        .ap-players-table tr:hover td { background: rgba(255,255,255,0.02); }
        .ap-rank-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          font-family: var(--ap-font-head);
          font-size: 0.7rem;
          font-weight: 700;
        }
        .ap-rank-1 { background: rgba(201,168,76,0.2); color: var(--ap-gold); border: 1px solid rgba(201,168,76,0.4); }
        .ap-rank-2 { background: rgba(232,237,245,0.1); color: var(--ap-text); border: 1px solid var(--ap-border2); }
        .ap-rank-3 { background: rgba(224,123,90,0.15); color: var(--ap-warn); border: 1px solid rgba(224,123,90,0.3); }
        .ap-rank-n { background: rgba(255,255,255,0.04); color: var(--ap-muted); border: 1px solid var(--ap-border); }

        /* â”€â”€ Music section â”€â”€ */
        .ap-now-playing {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(99,202,183,0.05);
          border: 1px solid rgba(99,202,183,0.15);
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 20px;
        }
        .ap-disc {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #2a2e3e 30%, #0e1019 100%);
          border: 2px solid rgba(99,202,183,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ap-disc-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ap-accent); box-shadow: 0 0 8px var(--ap-accent); display: block; }
        .ap-disc.spinning { animation: apDiscSpin 3s linear infinite; }
        @keyframes apDiscSpin { to { transform: rotate(360deg); } }
        .ap-track-info { flex: 1; }
        .ap-track-title { font-family: var(--ap-font-head); font-weight: 700; font-size: 0.9rem; }
        .ap-track-artist { font-size: 0.72rem; color: var(--ap-muted); margin-top: 2px; }
        .ap-music-controls { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
        .ap-vol-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 0.75rem; }
        .ap-vol-label { color: var(--ap-muted); min-width: 80px; }
        .ap-vol-slider {
          -webkit-appearance: none; appearance: none;
          width: 140px; height: 3px; border-radius: 3px; outline: none; cursor: pointer;
        }
        .ap-vol-slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--ap-accent); cursor: pointer;
        }

        /* Music mode tabs */
        .ap-mode-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
        .ap-mode-tab {
          background: var(--ap-bg);
          border: 1px solid var(--ap-border2);
          border-radius: 8px;
          color: var(--ap-muted);
          cursor: pointer;
          font-family: var(--ap-font-mono);
          font-size: 0.75rem;
          padding: 7px 14px;
          transition: all 0.15s;
        }
        .ap-mode-tab:hover { border-color: var(--ap-accent); color: var(--ap-accent); }
        .ap-mode-tab.active { background: rgba(99,202,183,0.1); border-color: rgba(99,202,183,0.5); color: var(--ap-accent); font-weight: 500; }

        /* File drop */
        .ap-file-label {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 80px;
          border: 2px dashed rgba(99,202,183,0.25);
          border-radius: 10px;
          padding: 20px;
          cursor: pointer;
          font-size: 0.8rem;
          color: var(--ap-muted);
          text-align: center;
          transition: all 0.2s;
          box-sizing: border-box;
          margin-bottom: 8px;
        }
        .ap-file-label:hover { border-color: var(--ap-accent); color: var(--ap-accent); background: rgba(99,202,183,0.04); }
        .ap-file-label.has-file { border-color: rgba(99,202,183,0.5); color: var(--ap-accent); background: rgba(99,202,183,0.06); }

        /* Track playlist */
        .ap-track-list { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }
        .ap-track-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: var(--ap-bg);
          border: 1px solid var(--ap-border);
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.15s;
          border-left: 2px solid transparent;
        }
        .ap-track-row:hover { border-color: var(--ap-border2); }
        .ap-track-row.playing { border-left-color: var(--ap-accent); background: rgba(99,202,183,0.04); }
        .ap-track-num { font-size: 0.68rem; color: var(--ap-muted); min-width: 22px; text-align: right; }
        .ap-track-meta { flex: 1; min-width: 0; }
        .ap-track-row-title { font-size: 0.82rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ap-track-row.playing .ap-track-row-title { color: var(--ap-accent); }
        .ap-track-row-artist { font-size: 0.68rem; color: var(--ap-muted); margin-top: 1px; }
        .ap-track-url { font-size: 0.62rem; color: rgba(232,237,245,0.2); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* â”€â”€ Summary bar â”€â”€ */
        .ap-summary-bar {
          display: flex;
          gap: 10px;
          background: var(--ap-bg);
          border: 1px solid var(--ap-border);
          border-radius: 8px;
          padding: 12px 16px;
          margin: 14px 0;
          font-size: 0.75rem;
          flex-wrap: wrap;
        }
        .ap-summary-bar span { color: var(--ap-muted); }
        .ap-summary-bar span strong { color: var(--ap-accent); margin-left: 4px; font-family: var(--ap-font-head); }

        /* â”€â”€ Empty state â”€â”€ */
        .ap-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--ap-muted);
          font-size: 0.78rem;
          border: 1px dashed var(--ap-border);
          border-radius: 10px;
        }

        /* Lock screen */
        .ap-lock {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--ap-bg);
          flex-direction: column;
          gap: 20px;
          text-align: center;
          font-family: var(--ap-font-mono);
          padding: 40px;
        }
        .ap-lock-title {
          font-family: var(--ap-font-head);
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--ap-text);
          margin: 0;
        }
        .ap-lock-sub { font-size: 0.78rem; color: var(--ap-muted); max-width: 340px; }
        .ap-lock-link {
          display: inline-block;
          background: var(--ap-accent);
          color: #080a0f;
          font-family: var(--ap-font-mono);
          font-size: 0.8rem;
          font-weight: 500;
          padding: 11px 22px;
          border-radius: 8px;
          text-decoration: none;
          transition: filter 0.15s;
        }
        .ap-lock-link:hover { filter: brightness(1.1); }

        /* Responsive */
        @media (max-width: 768px) {
          .ap-sidebar { width: 56px; }
          .ap-nav-label { display: none; }
          .ap-sidebar-logo-text { display: none; }
          .ap-sidebar-logo-sub { display: none; }
          .ap-main { padding: 20px 16px; }
          .ap-two-col, .ap-three-col { grid-template-columns: 1fr; }
          .ap-wallet-row { flex-direction: column; }
        }
      `}</style>

      {!token ? (
        <div className="ap-lock">
          <p style={{ fontSize: '2rem', margin: 0 }}>â¬¡</p>
          <h1 className="ap-lock-title">Restricted Area</h1>
          <p className="ap-lock-sub">Admin access requires authentication. Sign in from the main profile page.</p>
          {notice ? <p className="ap-lock-sub" style={{ color: 'var(--ap-warn)' }}>{notice}</p> : null}
          <Link to="/profile" className="ap-lock-link">Go to Sign In</Link>
        </div>
      ) : !authChecked ? (
        <div className="ap-lock">
          <p style={{ fontSize: '2rem', margin: 0 }}>â—Œ</p>
          <h1 className="ap-lock-title">Verifying Access</h1>
          <p className="ap-lock-sub">Checking your admin session before opening the console.</p>
          {notice ? <p className="ap-lock-sub" style={{ color: 'var(--ap-warn)' }}>{notice}</p> : null}
        </div>
      ) : (
        <div className="ap-root">
          {/* â”€â”€ Sidebar â”€â”€ */}
          <aside className="ap-sidebar">
            <div className="ap-sidebar-logo">
              <div className="ap-sidebar-logo-text">TypeArena</div>
              <span className="ap-sidebar-logo-sub">Admin Console</span>
            </div>
            {NAV_ITEMS.map(item => (
              <div
                key={item.id}
                className={`ap-nav-item${activeSection === item.id ? ' active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="ap-nav-icon">{item.icon}</span>
                <span className="ap-nav-label">{item.label}</span>
              </div>
            ))}
            <div className="ap-sidebar-footer">
              <button className="ap-signout-btn" onClick={handleSignOut}>Sign Out</button>
            </div>
          </aside>

          {/* â”€â”€ Main â”€â”€ */}
          <main className="ap-main">
            {notice && <div className="ap-toast">{notice}</div>}

            {/* OVERVIEW */}
            {activeSection === 'overview' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Overview</h1>
                  <p className="ap-section-sub">Platform health, revenue and engagement at a glance.</p>
                </div>
                {analytics ? (
                  <>
                    <div className="ap-metrics-grid">
                      {primaryMetrics.map(m => (
                        <div className="ap-metric-card" key={m.label} style={{ '--card-accent': m.accent }}>
                          <span className="ap-metric-label">{m.label}</span>
                          <div className="ap-metric-value">{m.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="ap-metrics-secondary">
                      {secondaryMetrics.map(m => (
                        <div className="ap-metric-sm" key={m.label}>
                          <span className="ap-metric-label">{m.label}</span>
                          <div className="ap-metric-value">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="ap-empty">Loading analyticsâ€¦</div>
                )}
                <div className="ap-btn-row">
                  <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={handleClearAllTournaments} disabled={clearingTournaments || tournaments.length === 0}>
                    {clearingTournaments ? 'Clearingâ€¦' : 'Clear All Tournaments'}
                  </button>
                </div>
              </>
            )}

            {/* WALLET */}
            {activeSection === 'wallet' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Wallet</h1>
                  <p className="ap-section-sub">Admin wallet balance, top-ups, withdrawals and activity log.</p>
                </div>
                <div className="ap-wallet-row">
                  <div className="ap-wallet-stat">
                    <span className="ap-wallet-stat-label">Owner</span>
                    <div className="ap-wallet-stat-value">{adminWallet.adminUsername || 'Admin'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ap-muted)', marginTop: 4 }}>{adminWallet.adminEmail || 'No email linked'}</div>
                  </div>
                  <div className="ap-wallet-stat">
                    <span className="ap-wallet-stat-label">Balance</span>
                    <div className="ap-wallet-stat-value" style={{ color: 'var(--ap-accent)' }}>KES {Number(adminWallet.balance || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ap-muted)', marginTop: 4 }}>Live balance</div>
                  </div>
                  <div className="ap-wallet-stat">
                    <span className="ap-wallet-stat-label">Marketplace Revenue</span>
                    <div className="ap-wallet-stat-value" style={{ color: 'var(--ap-gold)' }}>KES {Number(adminWallet.marketplaceRevenueTotal || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ap-muted)', marginTop: 4 }}>Auto-recorded from sales</div>
                  </div>
                </div>

                <div className="ap-two-col">
                  <div className="ap-card">
                    <p className="ap-card-title">Add Funds</p>
                    <div className="ap-field">
                      <label className="ap-label">Amount (KES)</label>
                      <input className="ap-input" type="number" min="1" placeholder="0" value={walletForm.topupAmount} onChange={e => setWalletForm(p => ({ ...p, topupAmount: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Note</label>
                      <input className="ap-input" type="text" placeholder="Reasonâ€¦" value={walletForm.topupNote} onChange={e => setWalletForm(p => ({ ...p, topupNote: e.target.value }))} />
                    </div>
                    <button className="ap-btn" onClick={handleAdminWalletTopUp}>Add Funds</button>
                  </div>
                  <div className="ap-card">
                    <p className="ap-card-title">Withdraw</p>
                    <div className="ap-field">
                      <label className="ap-label">Amount (KES)</label>
                      <input className="ap-input" type="number" min="1" placeholder="0" value={walletForm.withdrawAmount} onChange={e => setWalletForm(p => ({ ...p, withdrawAmount: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Note</label>
                      <input className="ap-input" type="text" placeholder="Reasonâ€¦" value={walletForm.withdrawNote} onChange={e => setWalletForm(p => ({ ...p, withdrawNote: e.target.value }))} />
                    </div>
                    <button className="ap-btn ap-btn-ghost" onClick={handleAdminWalletWithdraw}>Withdraw</button>
                  </div>
                </div>

                <div className="ap-card">
                  <p className="ap-card-title">Activity Log</p>
                  {(adminWallet.history?.items || []).length ? (
                    <div className="ap-tx-list">
                      {(adminWallet.history.items).map(item => (
                        <div key={item.code} className="ap-tx-item">
                          <span className={`ap-tx-amount ${item.direction === 'out' ? 'out' : 'in'}`}>
                            {item.direction === 'out' ? 'âˆ’' : '+'}KES {Number(item.amount || 0).toLocaleString()}
                          </span>
                          <span className="ap-tx-type">{(item.type || '').replace(/_/g, ' ')}</span>
                          <span className="ap-tx-note">{(item.source || '').replace(/_/g, ' ')}{item.note ? ` Â· ${item.note}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="ap-empty">No transactions yet.</div>}
                </div>
              </>
            )}

            {/* TOURNAMENTS */}
            {activeSection === 'tournaments' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Tournaments</h1>
                  <p className="ap-section-sub">Create and manage competitive events.</p>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">Create Tournament</p>
                  <div className="ap-field">
                    <label className="ap-label">Tournament Name</label>
                    <input className="ap-input" type="text" placeholder="e.g. Weekend Blitz" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="ap-two-col">
                    <div className="ap-field">
                      <label className="ap-label">Entry Fee (KES)</label>
                      <input className="ap-input" type="number" min="0" placeholder="0" value={formData.entryFee} onChange={e => setFormData(p => ({ ...p, entryFee: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Players Required</label>
                      <input className="ap-input" type="number" min="2" placeholder="2" value={formData.maxParticipants} onChange={e => setFormData(p => ({ ...p, maxParticipants: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Icon / Emoji</label>
                      <input className="ap-input" type="text" placeholder="ðŸ†" value={formData.image} onChange={e => setFormData(p => ({ ...p, image: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Start Date</label>
                      <input className="ap-input" type="date" value={formData.startDate} onChange={e => setFormData(p => ({ ...p, startDate: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Start Time</label>
                      <input className="ap-input" type="time" value={formData.startTime} onChange={e => setFormData(p => ({ ...p, startTime: e.target.value }))} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Match Duration (minutes)</label>
                      <input className="ap-input" type="number" min="1" max="120" placeholder="10" value={formData.matchDurationMins} onChange={e => setFormData(p => ({ ...p, matchDurationMins: e.target.value }))} />
                    </div>
                    <div className="ap-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ background: 'var(--ap-bg)', border: '1px solid var(--ap-border2)', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', width: '100%', boxSizing: 'border-box' }}>
                        <span style={{ color: 'var(--ap-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Status (auto)</span>
                        <span style={{ color: computeStatus(formData.startDate, formData.startTime) === 'active' ? 'var(--ap-gold)' : 'var(--ap-accent)', fontWeight: 500 }}>
                          {computeStatus(formData.startDate, formData.startTime).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ap-summary-bar">
                    <span>Total pot <strong>KES {totalStake.toLocaleString()}</strong></span>
                    <span>Players <strong>{maxParticipants}</strong></span>
                    <span>Winner gets <strong>KES {winnerAmount.toLocaleString()}</strong></span>
                    <span>Platform fee (40%) <strong>KES {platformFee.toLocaleString()}</strong></span>
                  </div>
                  <button className="ap-btn" onClick={handleCreateTournament}>Create Tournament</button>
                </div>

                <div className="ap-card">
                  <p className="ap-card-title">Active Tournaments ({tournaments.length})</p>
                  {tournaments.length ? (
                    <div className="ap-tourney-list">
                      {tournaments.map(t => {
                        const existingStart = t.startTime ? new Date(t.startTime) : null;
                        const tStartDate = existingStart ? existingStart.toISOString().slice(0, 10) : '';
                        const tStartTime = existingStart ? existingStart.toTimeString().slice(0, 5) : '';
                        const liveStatus = computeStatus(tStartDate, tStartTime);
                        const startLabel = t.startTime ? new Date(t.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No start time set';
                        const isEditing = editingTournament?.id === t.id;
                        return (
                        <div key={t.id} className="ap-tourney-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                          {/* Row summary */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span className="ap-tourney-icon">{t.image || 'ðŸ†'}</span>
                            <div className="ap-tourney-info">
                              <div className="ap-tourney-name">{t.name}</div>
                              <div className="ap-tourney-meta">
                                KES {Number(t.entryFee || 0).toLocaleString()} entry Â· {Number(t.matchSize || t.maxParticipants || 2)} players Â· Pot KES {Number(t.totalPlayerStake || 0).toLocaleString()} Â· Winner KES {Number(t.winnerPrize || 0).toLocaleString()} Â· {Number(t.matchDurationMins || 10)} min match
                              </div>
                              <div className="ap-tourney-meta" style={{ marginTop: 3 }}>â° {startLabel}</div>
                            </div>
                            <span className={`ap-status-badge ${liveStatus}`}>{liveStatus}</span>
                            <button
                              className="ap-btn ap-btn-ghost ap-btn-sm"
                              onClick={() => isEditing ? setEditingTournament(null) : openEditTournament(t)}
                            >
                              {isEditing ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              className="ap-btn ap-btn-ghost ap-btn-sm"
                              onClick={() => handleViewParticipants(t)}
                            >
                              {viewingParticipantsId === t.id ? 'Hide Players' : 'Players'}
                            </button>
                            <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={() => handleDeleteTournament(t)} disabled={deletingTournamentId === t.id}>
                              {deletingTournamentId === t.id ? 'â€¦' : 'Delete'}
                            </button>
                          </div>

                          {/* Participants drawer */}
                          {viewingParticipantsId === t.id && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--ap-border)' }}>
                              <p className="ap-card-title" style={{ margin: '0 0 12px' }}>
                                Players ({(participants[t.id] || []).length} / {Number(t.matchSize || t.maxParticipants || 2)})
                              </p>
                              {loadingParticipantsId === t.id ? (
                                <div style={{ fontSize: '0.78rem', color: 'var(--ap-muted)' }}>Loadingâ€¦</div>
                              ) : (participants[t.id] || []).length === 0 ? (
                                <div className="ap-empty" style={{ padding: '20px' }}>No players have joined yet.</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {(participants[t.id] || []).map((p, i) => (
                                    <div key={p.id || p.userId || i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', background: 'var(--ap-bg)', border: '1px solid var(--ap-border)', borderRadius: 8 }}>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--ap-muted)', minWidth: 20, textAlign: 'right' }}>{String(i + 1).padStart(2, '0')}</span>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontFamily: 'var(--ap-font-head)', fontWeight: 700, fontSize: '0.85rem' }}>{p.username || p.name || 'Unknown'}</div>
                                        {p.email && <div style={{ fontSize: '0.68rem', color: 'var(--ap-muted)', marginTop: 2 }}>{p.email}</div>}
                                      </div>
                                      {p.wpm && <span style={{ fontSize: '0.75rem', color: 'var(--ap-accent)' }}>{p.wpm} wpm</span>}
                                      <span style={{ fontSize: '0.68rem', color: 'var(--ap-muted)' }}>
                                        {p.joinedAt ? new Date(p.joinedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline edit form */}
                          {isEditing && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--ap-border)' }}>
                              <div className="ap-two-col">
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Tournament Name</label>
                                  <input className="ap-input" type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                                </div>
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Icon / Emoji</label>
                                  <input className="ap-input" type="text" value={editForm.image} onChange={e => setEditForm(p => ({ ...p, image: e.target.value }))} />
                                </div>
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Entry Fee (KES)</label>
                                  <input className="ap-input" type="number" min="0" value={editForm.entryFee} onChange={e => setEditForm(p => ({ ...p, entryFee: e.target.value }))} />
                                </div>
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Players Required</label>
                                  <input className="ap-input" type="number" min="2" value={editForm.maxParticipants} onChange={e => setEditForm(p => ({ ...p, maxParticipants: e.target.value }))} />
                                </div>
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Start Date</label>
                                  <input className="ap-input" type="date" value={editForm.startDate} onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} />
                                </div>
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Start Time</label>
                                  <input className="ap-input" type="time" value={editForm.startTime} onChange={e => setEditForm(p => ({ ...p, startTime: e.target.value }))} />
                                </div>
                                <div className="ap-field" style={{ margin: 0 }}>
                                  <label className="ap-label">Match Duration (minutes)</label>
                                  <input className="ap-input" type="number" min="1" max="120" value={editForm.matchDurationMins} onChange={e => setEditForm(p => ({ ...p, matchDurationMins: e.target.value }))} />
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                                <button className="ap-btn ap-btn-sm" onClick={handleSaveEdit} disabled={savingEditId === t.id}>
                                  {savingEditId === t.id ? 'Savingâ€¦' : 'Save Changes'}
                                </button>
                                <span style={{ fontSize: '0.72rem', color: 'var(--ap-muted)' }}>
                                  Status will be: <strong style={{ color: computeStatus(editForm.startDate, editForm.startTime) === 'active' ? 'var(--ap-gold)' : 'var(--ap-accent)' }}>
                                    {computeStatus(editForm.startDate, editForm.startTime).toUpperCase()}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ) : <div className="ap-empty">No tournaments yet. Create one above.</div>}
                </div>
              </>
            )}

            {/* TOP PLAYERS */}
            {activeSection === 'players' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Top Players</h1>
                  <p className="ap-section-sub">Leaderboard ranked by performance.</p>
                </div>
                <div className="ap-card">
                  {(analytics?.topPlayers || []).length ? (
                    <table className="ap-players-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Username</th>
                          <th>WPM</th>
                          <th>Wins</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.topPlayers).map((p, i) => (
                          <tr key={p.id ? `player-${p.id}` : `player-${p.username}-${i}`}>
                            <td>
                              <span className={`ap-rank-badge ${i === 0 ? 'ap-rank-1' : i === 1 ? 'ap-rank-2' : i === 2 ? 'ap-rank-3' : 'ap-rank-n'}`}>
                                {i + 1}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--ap-font-head)', fontWeight: 700 }}>{p.username}</td>
                            <td style={{ color: 'var(--ap-accent)' }}>{p.wpm}</td>
                            <td>{p.wins}</td>
                            <td>
                              <button
                                type="button"
                                className="ap-btn ap-btn-ghost ap-btn-sm"
                                onClick={() => handleImpersonatePlayer(p)}
                                disabled={!p.id || impersonatingId === p.id}
                              >
                                {impersonatingId === p.id ? 'Signing inâ€¦' : 'Sign in as'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="ap-empty">No player data available.</div>}
                </div>
              </>
            )}

            {/* MUSIC */}
            {activeSection === 'music' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Background Music</h1>
                  <p className="ap-section-sub">Shared playlist for every visitor. Volume and mute remain personal.</p>
                </div>

                {musicNotice && <div className="ap-toast">{musicNotice}</div>}

                {/* Now playing */}
                <div className="ap-now-playing">
                  <div className={`ap-disc${musicState.playing ? ' spinning' : ''}`}>
                    <span className="ap-disc-dot" />
                  </div>
                  <div className="ap-track-info">
                    <div className="ap-track-title">{musicState.currentTrack?.title || 'No track loaded'}</div>
                    <div className="ap-track-artist">{musicState.currentTrack?.artist || ''}</div>
                  </div>
                  <div className="ap-music-controls">
                    <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={arenaMusic.prev}>â€¹â€¹</button>
                    <button className="ap-btn ap-btn-sm" onClick={arenaMusic.toggle}>{musicState.playing ? 'â¸' : 'â–¶'}</button>
                    <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={arenaMusic.next}>â€ºâ€º</button>
                  </div>
                </div>

                {/* Volume */}
                <div className="ap-vol-row">
                  <span className="ap-vol-label">Volume: {Math.round((musicState.muted ? 0 : musicState.volume) * 100)}%</span>
                  <input
                    type="range" className="ap-vol-slider" min="0" max="1" step="0.01"
                    value={musicState.muted ? 0 : musicState.volume}
                    style={{ background: `linear-gradient(to right, #63cab7 ${Math.round((musicState.muted ? 0 : musicState.volume) * 100)}%, rgba(255,255,255,0.1) ${Math.round((musicState.muted ? 0 : musicState.volume) * 100)}%)` }}
                    onChange={e => { arenaMusic.setMuted(false); arenaMusic.setVolume(Number(e.target.value)); }}
                  />
                  <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={arenaMusic.toggleMute}>
                    {musicState.muted ? 'ðŸ”‡ Muted' : 'ðŸ”Š Live'}
                  </button>
                </div>

                <div className="ap-card">
                  <p className="ap-card-title">Live Commentator</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ap-muted)', marginBottom: 14 }}>Controls whether the browser voice commentator is available for players. Each player can still turn it off in Profile.</p>
                  <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={handleCommentatorToggle}>
                    {commentatorEnabled ? 'Commentator enabled' : 'Commentator disabled'}
                  </button>
                  <div className="ap-two-col" style={{ marginTop: 16 }}>
                    <div className="ap-field">
                      <label className="ap-label">Speaking Speed: {Number(commentatorConfig.rate).toFixed(2)}</label>
                      <input type="range" min="0.5" max="2" step="0.05" value={commentatorConfig.rate} onChange={(e) => handleCommentatorConfigChange('rate', e.target.value)} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Voice Pitch: {Number(commentatorConfig.pitch).toFixed(2)}</label>
                      <input type="range" min="0" max="2" step="0.05" value={commentatorConfig.pitch} onChange={(e) => handleCommentatorConfigChange('pitch', e.target.value)} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Pause Between Lines: {commentatorConfig.gap}ms</label>
                      <input type="range" min="0" max="2000" step="50" value={commentatorConfig.gap} onChange={(e) => handleCommentatorConfigChange('gap', e.target.value)} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Speech Volume: {Math.round(Number(commentatorConfig.volume) * 100)}%</label>
                      <input type="range" min="0" max="1" step="0.05" value={commentatorConfig.volume} onChange={(e) => handleCommentatorConfigChange('volume', e.target.value)} />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Cooldown: {commentatorConfig.cooldown}ms</label>
                      <input type="range" min="0" max="15000" step="250" value={commentatorConfig.cooldown} onChange={(e) => handleCommentatorConfigChange('cooldown', e.target.value)} />
                    </div>
                  </div>
                  <div className="ap-two-col" style={{ marginTop: 18 }}>
                    <div className="ap-field">
                      <label className="ap-label">Race Start Phrases</label>
                      <textarea className="ap-textarea" rows={6} value={commentatorPhrasesText.raceStart} onChange={(e) => handleCommentatorPhrasesChange('raceStart', e.target.value)} placeholder="One take per line, sentences separated by |" />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Finish Phrases</label>
                      <textarea className="ap-textarea" rows={6} value={commentatorPhrasesText.finish} onChange={(e) => handleCommentatorPhrasesChange('finish', e.target.value)} placeholder="One take per line, sentences separated by |" />
                    </div>
                  </div>
                  <div className="ap-btn-row" style={{ marginTop: 12 }}>
                    <button className="ap-btn" onClick={handleCommentatorPhrasesSave}>Save Commentary Phrases</button>
                  </div>
                </div>

                {/* Add Track */}
                <div className="ap-card">
                  <p className="ap-card-title">Add Track</p>
                  <div className="ap-mode-tabs">
                    <button type="button" className={`ap-mode-tab${trackAddMode === 'file' ? ' active' : ''}`} onClick={() => handleSwitchMode('file')}>ðŸ“ From Device</button>
                    <button type="button" className={`ap-mode-tab${trackAddMode === 'url' ? ' active' : ''}`} onClick={() => handleSwitchMode('url')}>ðŸ”— From URL</button>
                  </div>

                  <div className="ap-two-col" style={{ marginBottom: 14 }}>
                    <div className="ap-field" style={{ margin: 0 }}>
                      <label className="ap-label">Track Title</label>
                      <input className="ap-input" type="text" placeholder="Auto-filled from filename" value={newTrack.title} onChange={e => setNewTrack(p => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div className="ap-field" style={{ margin: 0 }}>
                      <label className="ap-label">Artist</label>
                      <input className="ap-input" type="text" placeholder="Artist name" value={newTrack.artist} onChange={e => setNewTrack(p => ({ ...p, artist: e.target.value }))} />
                    </div>
                  </div>

                  {trackAddMode === 'file' ? (
                    <>
                      <input id="music-file-input" type="file" accept="audio/*,.mp3,.ogg,.wav,.flac,.aac,.m4a" style={{ display: 'none' }} onChange={handleFileSelected} />
                      <label htmlFor="music-file-input" className={`ap-file-label${localFileObjectUrl ? ' has-file' : ''}`}>
                        {localFileObjectUrl
                          ? `âœ” ${newTrack.title || 'File selected'} â€” click to change`
                          : 'ðŸŽµ Click to choose MP3, OGG, WAV, or FLAC from your device'}
                      </label>
                      <p style={{ fontSize: '0.68rem', color: 'var(--ap-muted)', margin: '4px 0 0' }}>
                        Plays via a temporary browser URL â€” won't survive a page refresh. Use the URL tab for permanent tracks.
                      </p>
                    </>
                  ) : (
                    <div className="ap-field">
                      <label className="ap-label">Audio URL</label>
                      <input className="ap-input" type="url" placeholder="https://example.com/track.mp3" value={newTrack.url} onChange={e => setNewTrack(p => ({ ...p, url: e.target.value }))} />
                    </div>
                  )}

                  <div className="ap-btn-row">
                    <button className="ap-btn" onClick={handleAddTrack}>Add to Playlist</button>
                    <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={handleResetPlaylist}>Reset Defaults</button>
                  </div>
                </div>

                {/* Playlist */}
                <div className="ap-card">
                  <p className="ap-card-title">Playlist ({musicState.tracks.length} tracks)</p>
                  {musicState.tracks.length ? (
                    <div className="ap-track-list">
                      {musicState.tracks.map((track, i) => (
                        <div
                          key={track.id}
                          className={`ap-track-row${i === musicState.currentIndex ? ' playing' : ''}`}
                          onClick={() => { arenaMusic.seekToTrack(i); arenaMusic.play(); }}
                        >
                          <span className="ap-track-num">{i === musicState.currentIndex ? (musicState.playing ? 'â–¶' : 'â—¼') : String(i + 1).padStart(2, '0')}</span>
                          <div className="ap-track-meta">
                            <div className="ap-track-row-title">{track.title}</div>
                            <div className="ap-track-row-artist">{track.artist}</div>
                          </div>
                          <span className="ap-track-url">{track.url}</span>
                          <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={e => { e.stopPropagation(); handleRemoveTrack(track.id, track.title); }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  ) : <div className="ap-empty">No tracks. Add one above or reset to defaults.</div>}
                </div>
              </>
            )}

            {/* CONTENT (Marquee) */}
            {activeSection === 'content' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Content</h1>
                  <p className="ap-section-sub">Manage announcements and player typing passages.</p>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">Site Marquee</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ap-muted)', marginBottom: 14 }}>One announcement per line. They scroll across the public header in real time.</p>
                  <div className="ap-field">
                    <label className="ap-label">Marquee Lines</label>
                    <textarea className="ap-textarea" rows={6} placeholder="One line per announcementâ€¦" value={siteMarqueeText} onChange={e => setSiteMarqueeText(e.target.value)} />
                  </div>
                  <button className="ap-btn" onClick={handleSiteMarqueeSave}>Save Marquee</button>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">Typing Passage Library</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ap-muted)', marginBottom: 14 }}>Published passages are selected for practice or live rooms. A passage in an active room cannot be edited or permanently deleted.</p>
                  <form onSubmit={handleContentSave}>
                    <div className="ap-two-col">
                      <div className="ap-field">
                        <label className="ap-label">Content Type</label>
                        <select className="ap-select" value={contentForm.contentType} onChange={e => setContentForm(p => ({ ...p, contentType: e.target.value }))}>
                          <option value="practice">Practice</option>
                          <option value="live">1v1 / Live</option>
                          <option value="tournament">Tournament</option>
                          <option value="daily">Daily Challenge</option>
                        </select>
                      </div>
                      <div className="ap-field">
                        <label className="ap-label">Language</label>
                        <input className="ap-input" value={contentForm.language} onChange={e => setContentForm(p => ({ ...p, language: e.target.value.toLowerCase() }))} placeholder="english" />
                      </div>
                      {contentForm.contentType === 'daily' && <>
                        <div className="ap-field">
                          <label className="ap-label">Publish time (Nairobi)</label>
                          <input className="ap-input" type="datetime-local" value={contentForm.publishAt} onChange={e => setContentForm(p => ({ ...p, publishAt: e.target.value }))} />
                          <small style={{ color: 'var(--ap-muted)' }}>Leave blank to publish immediately.</small>
                        </div>
                        <div className="ap-field">
                          <label className="ap-label">Expiry time (Nairobi)</label>
                          <input className="ap-input" type="datetime-local" value={contentForm.expiryAt} onChange={e => setContentForm(p => ({ ...p, expiryAt: e.target.value }))} />
                          <small style={{ color: 'var(--ap-muted)' }}>Leave blank for 24 hours after publishing.</small>
                        </div>
                      </>}
                      <div className="ap-field">
                        <label className="ap-label">Mode</label>
                        <select className="ap-select" value={contentForm.mode} onChange={e => setContentForm(p => ({ ...p, mode: e.target.value }))}>
                          <option value="standard">Standard</option>
                          <option value="survival">Survival</option>
                          <option value="speed_burst">Speed Burst</option>
                          <option value="code">Code</option>
                          <option value="memory">Memory</option>
                          <option value="quote">Quote</option>
                          <option value="marathon">Marathon</option>
                        </select>
                      </div>
                      <div className="ap-field" style={{ justifyContent: 'end' }}>
                        <label className="ap-label">Status</label>
                        <label style={{ color: 'var(--ap-muted)', fontSize: '0.78rem' }}><input type="checkbox" checked={contentForm.isActive} onChange={e => setContentForm(p => ({ ...p, isActive: e.target.checked }))} /> Published</label>
                      </div>
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Passage Text</label>
                      <textarea className="ap-textarea" rows={5} value={contentForm.passage} onChange={e => setContentForm(p => ({ ...p, passage: e.target.value }))} placeholder="Enter the exact text players will type..." />
                    </div>
                    <div className="ap-btn-row">
                      <button className="ap-btn" type="submit">{contentForm.id ? 'Update Passage' : 'Add Passage'}</button>
                      {contentForm.id && <button className="ap-btn ap-btn-danger ap-btn-sm" type="button" onClick={resetContentForm}>Cancel Edit</button>}
                    </div>
                  </form>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">Managed Passages ({adminContent.length})</p>
                  {adminContent.length ? adminContent.map((item) => (
                    <div key={item.id} style={{ borderTop: '1px solid var(--ap-border)', padding: '12px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                        <div>
                          <strong>{item.mode} / {item.language} / {item.content_type}</strong>
                          <div style={{ color: 'var(--ap-muted)', fontSize: '0.78rem', marginTop: 5 }}>{item.passage}</div>{item.content_type === 'daily' && <div style={{ color: item.archived_at ? 'var(--ap-muted)' : 'var(--ap-accent)', fontSize: '0.72rem', marginTop: 5 }}>{item.archived_at ? `Archived ${item.archived_at} (Nairobi)` : `Publish ${item.publish_at || 'now'} � Expire ${item.expiry_at || 'after 24 hours'} (Nairobi)`}</div>}
                        </div>
                        <span style={{ color: item.is_active ? 'var(--ap-accent)' : 'var(--ap-warn)', fontSize: '0.72rem' }}>{item.is_active ? 'Published' : 'Inactive'}</span>
                      </div>
                      <div className="ap-btn-row" style={{ marginTop: 8 }}>
                        <button className="ap-btn ap-btn-sm" onClick={() => setContentForm({ id: item.id, contentType: item.content_type, mode: item.mode, language: item.language, passage: item.passage, dailyDate: String(item.scheduled_for || '').slice(0, 10), publishAt: String(item.publish_at || ''), expiryAt: String(item.expiry_at || ''), isActive: Boolean(item.is_active) })}>Edit</button>
                        <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={() => handleContentDelete(item)}>Delete</button>
                      </div>
                    </div>
                  )) : <div className="ap-empty">No admin passages yet. Add one above.</div>}
                </div>
              </>
            )}

            {activeSection === 'marketplace' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Marketplace</h1>
                  <p className="ap-section-sub">Add items and manage the live catalog prices shown to players.</p>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">{editingMarketplaceId ? 'Edit Marketplace Item' : 'Add Marketplace Item'}</p>
                  <form onSubmit={handleMarketplaceSave}>
                    <div className="ap-two-col">
                      <div className="ap-field"><label className="ap-label">Item ID</label><input className="ap-input" value={marketplaceForm.id} disabled={Boolean(editingMarketplaceId)} onChange={e => setMarketplaceForm(p => ({ ...p, id: e.target.value }))} placeholder="neon_frame" /></div>
                      <div className="ap-field"><label className="ap-label">Name</label><input className="ap-input" value={marketplaceForm.name} onChange={e => setMarketplaceForm(p => ({ ...p, name: e.target.value }))} placeholder="Neon Frame" /></div>
                      <div className="ap-field"><label className="ap-label">Price (KES)</label><input className="ap-input" type="number" min="0" step="0.01" value={marketplaceForm.price} onChange={e => setMarketplaceForm(p => ({ ...p, price: e.target.value }))} /></div>
                      <div className="ap-field"><label className="ap-label">Category</label><select className="ap-select" value={marketplaceForm.category} onChange={e => setMarketplaceForm(p => ({ ...p, category: e.target.value }))}><option value="avatars">Avatars</option><option value="typingThemes">Typing Themes</option><option value="keyboardSkins">Keyboard Skins</option><option value="premiumBadges">Premium Badges</option><option value="animatedEffects">Animated Effects</option><option value="profileFrames">Profile Frames</option><option value="cursors">Cursors</option></select></div>
                      <div className="ap-field"><label className="ap-label">Rarity</label><select className="ap-select" value={marketplaceForm.rarity} onChange={e => setMarketplaceForm(p => ({ ...p, rarity: e.target.value }))}><option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option></select></div>
                      <div className="ap-field"><label className="ap-label">Collection</label><input className="ap-input" value={marketplaceForm.collection} onChange={e => setMarketplaceForm(p => ({ ...p, collection: e.target.value }))} /></div>
                    </div>
                    <div className="ap-field"><label className="ap-label">Description</label><input className="ap-input" value={marketplaceForm.description} onChange={e => setMarketplaceForm(p => ({ ...p, description: e.target.value }))} /></div>
                    <div className="ap-field"><label className="ap-label">Player Benefit</label><input className="ap-input" value={marketplaceForm.benefit} onChange={e => setMarketplaceForm(p => ({ ...p, benefit: e.target.value }))} placeholder="Cosmetic only" /></div>
                    <label style={{ color: 'var(--ap-muted)', fontSize: '0.78rem' }}><input type="checkbox" checked={marketplaceForm.isActive} onChange={e => setMarketplaceForm(p => ({ ...p, isActive: e.target.checked }))} /> Visible in marketplace</label>
                    <div className="ap-btn-row"><button className="ap-btn" type="submit">{editingMarketplaceId ? 'Save Item' : 'Add Item'}</button>{editingMarketplaceId && <button className="ap-btn ap-btn-danger ap-btn-sm" type="button" onClick={() => { resetMarketplaceForm(); setEditingMarketplaceId(null); }}>Cancel Edit</button>}</div>
                  </form>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">Current Items ({marketplaceItems.length})</p>
                  {marketplaceItems.length ? marketplaceItems.map((item) => (
                    <div key={item.id} style={{ borderTop: '1px solid var(--ap-border)', padding: '12px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}><div><strong>{item.name}</strong><div style={{ color: 'var(--ap-muted)', fontSize: '0.78rem', marginTop: 5 }}>{item.id} Â· {item.category} Â· {item.purchaseCount || 0} purchases</div></div><strong style={{ color: 'var(--ap-accent)' }}>KES {Number(item.price || 0).toFixed(2)}</strong></div>
                      <div className="ap-btn-row" style={{ marginTop: 8 }}><span style={{ color: item.isActive ? 'var(--ap-accent)' : 'var(--ap-warn)', fontSize: '0.72rem' }}>{item.isActive ? 'Visible' : 'Hidden'}</span><button className="ap-btn ap-btn-sm" onClick={() => openMarketplaceEdit(item)}>Edit</button></div>
                    </div>
                  )) : <div className="ap-empty">No marketplace items found.</div>}
                </div>
              </>
            )}
            {activeSection === 'leaderboard' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">Leaderboard Tiers</h1>
                  <p className="ap-section-sub">Adjust the minimum season points required for each tier.</p>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">Season Point Thresholds</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ap-muted)', marginBottom: 14 }}>Scores below Bronze are still Bronze. Thresholds must increase from Bronze through Grandmaster.</p>
                  <form onSubmit={handleLeaderboardTierSave}>
                    <div className="ap-two-col">
                      {[
                        ['bronze', 'Bronze'],
                        ['silver', 'Silver'],
                        ['gold', 'Gold'],
                        ['diamond', 'Diamond'],
                        ['grandmaster', 'Grandmaster'],
                      ].map(([key, label]) => (
                        <div className="ap-field" key={key}>
                          <label className="ap-label">{label} minimum points</label>
                          <input className="ap-input" type="number" min="0" value={leaderboardTiers[key]} onChange={(e) => setLeaderboardTiers((current) => ({ ...current, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                    <button className="ap-btn" type="submit">Save Leaderboard Tiers</button>
                  </form>
                </div>
              </>
            )}

            {/* AI SETTINGS */}
            {activeSection === 'ai' && (
              <>
                <div className="ap-section-header">
                  <h1 className="ap-section-title">AI Settings</h1>
                  <p className="ap-section-sub">Configure the AI content engine provider and model.</p>
                </div>
                <div className="ap-card">
                  <p className="ap-card-title">AI Content Engine</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ap-muted)', marginBottom: 14 }}>
                    API key configured: <span style={{ color: aiSettings.hasApiKey ? 'var(--ap-accent)' : 'var(--ap-warn)' }}>{aiSettings.hasApiKey ? 'Yes' : 'No'}</span>
                  </p>
                  <div className="ap-two-col">
                    <div className="ap-field">
                      <label className="ap-label">Provider</label>
                      <select className="ap-select" value={aiSettings.provider} onChange={e => setAiSettings(p => ({ ...p, provider: e.target.value }))}>
                        <option value="auto">Auto</option>
                        <option value="openai">OpenAI</option>
                        <option value="local">Local Fallback</option>
                      </select>
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Model</label>
                      <input className="ap-input" type="text" placeholder="Model name" value={aiSettings.model} onChange={e => setAiSettings(p => ({ ...p, model: e.target.value }))} />
                    </div>
                  </div>
                  <button className="ap-btn" onClick={handleAiSettingsSave}>Save AI Settings</button>
                </div>
              </>
            )}
          </main>
        </div>
      )}
    </>
  );
}
