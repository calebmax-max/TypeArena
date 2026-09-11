/**
 * TypeProfile.js  ?fÃ¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½ Advanced Profile UI
 *
 * Key additions over the original:
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ AvatarBadge  : the circular "TA" badge now accepts a custom uploaded image.
 *                   Image is stored in localStorage as a base64 data-URL so it
 *                   persists across sessions without any backend change.
 *                   Click the badge ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½?,??"? hidden <input type="file"> fires ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½?,??"? FileReader
 *                   encodes to base64 ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½?,??"? saved to localStorage & state.
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Full-page dark glassmorphism layout replacing the plain card grid.
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Sidebar identity panel (avatar + stats + equipped items).
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Tabbed main panel: Wallet ?f??s?,Ã¯Â¿Â½ Race History ?f??s?,Ã¯Â¿Â½ Settings.
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Stat bars (WPM, accuracy, wins) with animated fill.
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Wallet split into clear Top-up / Withdraw accordion sections.
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Race history with mode/language chips, place medal colours, and earnings.
 *  ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ All original logic (auth, M-Pesa polling, Stripe redirect, sign-out,
 *    redirect-after-login) is preserved exactly.
 */

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addFundsToWallet,
  fetchCurrentUser,
  fetchRaceHistory,
  fetchWalletConfig,
  fetchWalletHistory,
  fetchWalletTopupStatus,
  fetchWalletWithdrawStatus,
  getStoredUserSnapshot,
  loginUser,
  signupUser,
  updateUserProfile,
  verifyWalletTopupSession,
  withdrawFundsToWallet,
} from '../utils/typingApi';
import '../styles/TypeProfile.css';

// ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Constants ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
const USER_CHANGE_EVENT                  = 'typearena-user-changed';
const TOPUP_STATUS_POLL_INTERVAL_MS      = 4000;
const TOPUP_STATUS_POLL_MAX_ATTEMPTS     = 20;
const WITHDRAW_STATUS_POLL_INTERVAL_MS   = 4000;
const WITHDRAW_STATUS_POLL_MAX_ATTEMPTS  = 20;
const BADGE_IMAGE_KEY                    = 'typearena_badge_image';

const formatMethodLabel = (m) => m.replace(/_/g, ' ');

const EQUIPPED_LABELS = {
  avatar:  'Avatar',
  theme:   'Theme',
  skin:    'Keyboard Skin',
  badge:   'Badge',
  effect:  'Effect',
  frame:   'Profile Frame',
};

// ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Helpers ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
const loadBadgeImage = () => {
  try { return localStorage.getItem(BADGE_IMAGE_KEY) || null; }
  catch { return null; }
};

const saveBadgeImage = (dataUrl) => {
  try { localStorage.setItem(BADGE_IMAGE_KEY, dataUrl); }
  catch { /* storage full ?fÃ¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½ silently skip */ }
};

const removeBadgeImage = () => {
  try { localStorage.removeItem(BADGE_IMAGE_KEY); }
  catch {}
};

const medalColour = (place) => {
  if (place === 1) return '#FFD700';
  if (place === 2) return '#C0C0C0';
  if (place === 3) return '#CD7F32';
  return 'rgba(255,255,255,0.35)';
};

// ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Sub-components ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½

/**
 * AvatarBadge
 * The circular badge that shows the user's initials (e.g. "TA").
 * Clicking it opens a file-picker; choosing an image replaces the initials
 * with the uploaded photo. A small "?f?'Ã¯Â¿Â½?,????" button removes the custom image.
 *
 * Props:
 *   initials  {string}  ?fÃ¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½Ã¯Â¿Â½?,??" fallback text (e.g. "JD")
 *   size      {number}  ?fÃ¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½Ã¯Â¿Â½?,??" diameter in px (default 96)
 */
function AvatarBadge({ initials = 'TA', size = 96, image = '', onImageChange }) {
  const [imgSrc, setImgSrc] = useState(() => image || loadBadgeImage());
  const [hovered, setHovered] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setImgSrc(image || loadBadgeImage());
  }, [image]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Resize to max 512x512 and compress at higher quality before storing.\r\n      // This keeps profile photos sharp when opened in the chat viewer.
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        let dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        for (let quality = 0.86; dataUrl.length > 245 * 1024 && quality >= 0.5; quality -= 0.06) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        setImgSrc(dataUrl);
        saveBadgeImage(dataUrl);
        onImageChange?.(dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    // Reset input so re-selecting the same file still fires onChange
    e.target.value = '';
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setImgSrc(null);
    removeBadgeImage();
    onImageChange?.('');
  };

  return (
    <div
      className="avatar-badge-wrap"
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="avatar-badge-input"
        onChange={handleFileChange}
        aria-label="Upload badge image"
      />

      {/* Badge circle */}
      <button
        className="avatar-badge"
        style={{ width: size, height: size, fontSize: size * 0.28 }}
        onClick={() => fileRef.current?.click()}
        title={imgSrc ? 'Replace badge image' : 'Upload badge image'}
        aria-label={imgSrc ? 'Replace badge image' : 'Upload badge image'}
      >
        {imgSrc ? (
          <img src={imgSrc} alt="Badge" className="avatar-badge-img" />
        ) : (
          <span className="avatar-badge-initials">{initials}</span>
        )}

        {/* Hover overlay */}
        <span className={`avatar-badge-overlay ${hovered ? 'is-visible' : ''}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span style={{ fontSize: '0.6rem', letterSpacing: '0.08em' }}>UPLOAD</span>
        </span>
      </button>

      {/* Remove button ?fÃ¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½ only when image exists */}
      {imgSrc && (
        <button
          className="avatar-badge-remove"
          onClick={handleRemove}
          title="Remove custom image"
          aria-label="Remove custom badge image"
        >
          Remove
        </button>
      )}
    </div>
  );
}

/** StatBar ?fÃ¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½ animated horizontal fill bar */
function StatBar({ value, max, color = 'var(--tp-accent)' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="stat-bar-track">
      <div
        className="stat-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Tab button */
function Tab({ id, active, onClick, children }) {
  return (
    <button
      className={`tp-tab ${active ? 'tp-tab--active' : ''}`}
      onClick={() => onClick(id)}
      role="tab"
      aria-selected={active}
    >
      {children}
    </button>
  );
}

/** Notice banner */
function Notice({ message, type = 'info' }) {
  if (!message) return null;
  return (
    <div className={`tp-notice tp-notice--${type}`} role="status">
      <span className="tp-notice__icon">
        {type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Info'}
      </span>
      <span>{message}</span>
    </div>
  );
}

// ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Main component ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
export default function TypeProfile() {
  const navigate = useNavigate();

  const [currentUser,   setCurrentUser]   = useState(() => getStoredUserSnapshot());
  const [showAuthForm,  setShowAuthForm]   = useState(false);
  const [authMode,      setAuthMode]       = useState('login');
  const [formData,      setFormData]       = useState({ email: '', password: '', username: '', phoneNumber: '' });
  const [raceHistory,   setRaceHistory]    = useState([]);
  const [walletHistory, setWalletHistory]  = useState([]);
  const [walletConfig,  setWalletConfig]   = useState({ topUpMethods: [], withdrawMethods: [] });
  const [loading,       setLoading]        = useState(() => !getStoredUserSnapshot());
  const [topUpAmount,   setTopUpAmount]    = useState('');
  const [topUpAccount,  setTopUpAccount]   = useState('');
  const [topUpMethod,   setTopUpMethod]    = useState('stripe_checkout');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawMethod,  setWithdrawMethod]  = useState('paypal');
  const [walletNotice,  setWalletNotice]   = useState('');
  const [authNotice,    setAuthNotice]     = useState('');
  const [authLoading,   setAuthLoading]   = useState(false);
  const [showPassword,  setShowPassword]   = useState(false);
  const [profileName,   setProfileName]    = useState('');
  const [profileSaving, setProfileSaving]  = useState(false);
  const [activeTab,     setActiveTab]      = useState('wallet');
  const [walletSection, setWalletSection]  = useState('topup'); // 'topup' | 'withdraw'
  const [topUpLoading,     setTopUpLoading]     = useState(false);
  const [withdrawLoading,  setWithdrawLoading]  = useState(false);
  const profileRequestRef = useRef(0);

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Audio / experience settings (persisted in localStorage, read by Play) ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  const [soundEnabled,       setSoundEnabled]       = useState(() => localStorage.getItem('typearena_sound')       !== 'false');
  const [musicEnabled,       setMusicEnabled]       = useState(() => localStorage.getItem('typearena_music')       !== 'false');
  const [commentatorEnabled, setCommentatorEnabled] = useState(() => localStorage.getItem('typearena_commentator') !== 'false');

  const toggleSetting = (key, setter) => {
    setter((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, String(next));
        // Dispatch a StorageEvent so same-tab listeners (Play) react immediately.
        // The native 'storage' event only fires in other tabs.
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: String(next) }));
      } catch {}
      return next;
    });
  };

  const simulatedPaymentsEnabled = Boolean(walletConfig.simulatedPaymentsEnabled);

  const applyFreshUserState = useCallback((user) => {
    setCurrentUser(user);
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
  }, []);

  const handleProfileImageChange = useCallback(async (profileImage) => {
    if (!currentUser?.id) return;
    try {
      const updatedUser = await updateUserProfile(currentUser.id, { profileImage });
      applyFreshUserState(updatedUser);
    } catch (error) {
      setAuthNotice(error.message || 'Could not save your profile picture.');
    }
  }, [applyFreshUserState, currentUser?.id]);

  useEffect(() => {
    const legacyImage = loadBadgeImage();
    if (!currentUser?.id || currentUser.profileImage || !legacyImage) return;
    let cancelled = false;
    updateUserProfile(currentUser.id, { profileImage: legacyImage })
      .then((updatedUser) => {
        if (!cancelled) applyFreshUserState(updatedUser);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [applyFreshUserState, currentUser?.id, currentUser?.profileImage]);

  const loadProfile = useCallback(async () => {
    const requestId = profileRequestRef.current + 1;
    profileRequestRef.current = requestId;
    try {
      const user = await fetchCurrentUser();
      // An older session request must not overwrite a newer login result.
      if (requestId !== profileRequestRef.current) return;
      setCurrentUser(user);
      setLoading(false);
      if (user?.id) {
        const [cfg, history, wallet] = await Promise.all([
          fetchWalletConfig(),
          fetchRaceHistory(user.id),
          fetchWalletHistory(),
        ]);
        if (requestId !== profileRequestRef.current) return;
        setWalletConfig(cfg || { topUpMethods: [], withdrawMethods: [] });
        setRaceHistory(history || []);
        setWalletHistory(wallet?.items || []);
      } else {
        setWalletConfig({ topUpMethods: [], withdrawMethods: [] });
        setRaceHistory([]);
        setWalletHistory([]);
      }
    } catch (err) {
      if (requestId !== profileRequestRef.current) return;
      console.error('Failed to load profile:', err);
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect   = params.get('redirect');
    const needsTopUp = params.get('topup') === '1';
    if (redirect && !currentUser) {
      setShowAuthForm(true);
      setAuthMode('login');
      setAuthNotice('Sign in to continue joining your private room.');
    }
    if (needsTopUp) {
      setWalletNotice('Add enough funds to your wallet, then return to your private room invite.');
    }
  }, [currentUser]);

  useEffect(() => {
    const params        = new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout');
    const sessionId     = params.get('session_id');
    if (checkoutState === 'cancel') {
      setWalletNotice('Hosted checkout was canceled before payment completed.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (checkoutState === 'success' && sessionId && currentUser?.id) {
      verifyWalletTopupSession(sessionId)
        .then(async (result) => {
          setWalletNotice(result.message || 'Wallet top-up verified.');
          await loadProfile();
        })
        .catch((err) => { setWalletNotice(err.message || 'Could not verify the hosted checkout yet.'); })
        .finally(() => { window.history.replaceState({}, document.title, window.location.pathname); });
    }
  }, [currentUser?.id, loadProfile]);

  useEffect(() => {
    if (currentUser?.phoneNumber) {
      setTopUpAccount(currentUser.phoneNumber);
      setWithdrawAccount(currentUser.phoneNumber);
    } else if (currentUser?.email) {
      setTopUpAccount(currentUser.email);
      setWithdrawAccount(currentUser.email);
    }
  }, [currentUser]);

  useEffect(() => {
    if (walletConfig.topUpMethods?.length) {
      setTopUpMethod((c) => walletConfig.topUpMethods.includes(c) ? c : walletConfig.topUpMethods[0]);
    }
    if (walletConfig.withdrawMethods?.length) {
      setWithdrawMethod((c) => walletConfig.withdrawMethods.includes(c) ? c : walletConfig.withdrawMethods[0]);
    }
  }, [walletConfig]);

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Auth ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  useEffect(() => {
    setProfileName(currentUser?.username || '');
  }, [currentUser?.id, currentUser?.username]);

  const saveProfileName = async (event) => {
    event.preventDefault();
    if (!currentUser?.id || profileSaving) return;
    const username = profileName.trim();
    if (!username) {
      setAuthNotice('Enter a profile name.');
      return;
    }
    setProfileSaving(true);
    setAuthNotice('');
    try {
      const updatedUser = await updateUserProfile(currentUser.id, { username });
      applyFreshUserState(updatedUser);
    } catch (error) {
      setAuthNotice(error.message || 'Could not update your profile name.');
    } finally {
      setProfileSaving(false);
    }
  };
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (authLoading) return;
    setAuthLoading(true);
    setAuthNotice('');
    try {
      const user = authMode === 'login'
        ? await loginUser(formData.email, formData.password)
        : await signupUser(formData.username, formData.email, formData.password, formData.phoneNumber);

      applyFreshUserState(user);

      if (authMode === 'login' && user?.isAdmin) {
        setFormData({ email: '', password: '', username: '', phoneNumber: '' });
        navigate('/admin');
        return;
      }

      setShowAuthForm(false);
      setFormData({ email: '', password: '', username: '', phoneNumber: '' });
      void loadProfile();
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      if (redirect) navigate(redirect);
    } catch (err) {
      setAuthNotice(err.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };
  // Cancellation flag: flipped to true when the component unmounts so any
  // in-flight M-Pesa or withdrawal polling loop stops updating state.
  const pollCancelledRef = useRef(false);
  useEffect(() => () => { pollCancelledRef.current = true; }, []);

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ M-Pesa polling ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  const watchMpesaTopupStatus = useCallback(async (checkoutRequestId) => {
    for (let i = 0; i < TOPUP_STATUS_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => window.setTimeout(r, TOPUP_STATUS_POLL_INTERVAL_MS));
      if (pollCancelledRef.current) return false;
      const status = await fetchWalletTopupStatus(checkoutRequestId);
      if (pollCancelledRef.current) return false;
      if (status?.status === 'completed' && status?.user) {
        applyFreshUserState(status.user);
        setWalletNotice(status.resultDescription || 'Payment confirmed and funds added to your wallet.');
        await loadProfile();
        return true;
      }
      if (status?.status === 'failed') {
        setWalletNotice(status.resultDescription || 'The payment did not complete successfully.');
        await loadProfile();
        return false;
      }
    }
    setWalletNotice('Payment request was sent. Your wallet will update automatically once M-Pesa confirms.');
    return false;
  }, [applyFreshUserState, loadProfile]);

  const watchWithdrawalStatus = useCallback(async (payoutCode) => {
    for (let i = 0; i < WITHDRAW_STATUS_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => window.setTimeout(r, WITHDRAW_STATUS_POLL_INTERVAL_MS));
      if (pollCancelledRef.current) return false;
      const status = await fetchWalletWithdrawStatus(payoutCode);
      if (pollCancelledRef.current) return false;
      if (status?.status === 'completed' && status?.user) {
        applyFreshUserState(status.user);
        setWalletNotice(status.resultDescription || 'Withdrawal confirmed successfully.');
        await loadProfile();
        return true;
      }
      if (status?.status === 'failed') {
        if (status?.user) applyFreshUserState(status.user);
        setWalletNotice(status.resultDescription || 'Withdrawal failed and your wallet has been refunded.');
        await loadProfile();
        return false;
      }
    }
    setWalletNotice('Withdrawal request was sent. We will update this wallet as soon as M-Pesa confirms.');
    return false;
  }, [applyFreshUserState, loadProfile]);

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Wallet actions ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  const handleAddFunds = async (e) => {
    e.preventDefault();
    if (topUpLoading) return;
    setTopUpLoading(true);
    try {
      const result = await addFundsToWallet(topUpAmount, topUpAccount, topUpMethod, topUpMethod === 'mpesa' ? 'KES' : 'USD');
      if (result?.checkoutUrl) {
        setWalletNotice(result.message || 'Redirecting to secure checkout...');
        window.location.href = result.checkoutUrl;
        return;
      }
      if (result?.status === 'pending' && result?.paymentMethod === 'mpesa' && result?.mpesa?.CheckoutRequestID) {
        setWalletNotice(result.message || 'M-Pesa prompt sent. Waiting for payment confirmation...');
        setTopUpAmount('');
        await watchMpesaTopupStatus(result.mpesa.CheckoutRequestID);
        return;
      }
      setWalletNotice(result.message || 'Top-up completed.');
      setTopUpAmount('');
      if (result?.user) applyFreshUserState(result.user);
      await loadProfile();
    } catch (err) {
      setWalletNotice(err.message || 'Top-up failed.');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (withdrawLoading) return;
    setWithdrawLoading(true);
    try {
      const cfg = await fetchWalletConfig();
      setWalletConfig(cfg || { topUpMethods: [], withdrawMethods: [] });
      if (!cfg.withdrawMethods?.length) { setWalletNotice('Withdrawal is not enabled yet.'); return; }
      const activeMethod = cfg.withdrawMethods.includes(withdrawMethod) ? withdrawMethod : cfg.withdrawMethods[0];
      setWithdrawMethod(activeMethod);
      const result = await withdrawFundsToWallet(withdrawAmount, withdrawAccount, activeMethod, activeMethod === 'mpesa' ? 'KES' : 'USD');
      setWalletNotice(result.message || 'Withdrawal completed.');
      setWithdrawAmount('');
      if (result?.user) applyFreshUserState(result.user);
      if (result?.status === 'pending' && result?.payoutMethod === 'mpesa' && result?.payoutCode) {
        await watchWithdrawalStatus(result.payoutCode);
        return;
      }
      await loadProfile();
    } catch (err) {
      setWalletNotice(err.message || 'Withdrawal failed.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('typearena_user');
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
    setCurrentUser(null);
  };

  const openAuthForm = (mode) => {
    setAuthMode(mode);
    setAuthNotice('');
    setShowAuthForm(true);
    setAuthNotice('');
  };

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Derived values ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  const initials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : 'TA';

  const winRate = useMemo(
    () => currentUser?.totalRaces
      ? Math.round((currentUser.wins / currentUser.totalRaces) * 100)
      : 0,
    [currentUser?.wins, currentUser?.totalRaces]
  );

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Loading state ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  if (loading) {
    return (
      <div className="tp-root tp-root--loading">
          <div className="tp-spinner" />
          <p>Loading profile...</p>
        </div>
    );
  }

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Logged-out state ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  if (!currentUser) {
    return (
      <div className="tp-root tp-root--auth">
          <div className="tp-auth-card">
            <div className="tp-auth-logo">
              <AvatarBadge initials="TA" size={80} />
              <h1 className="tp-auth-title">TypeArena</h1>
              <p className="tp-auth-sub">Compete. Earn. Dominate the keyboard.</p>
            </div>

            {!showAuthForm ? (
              <div className="tp-auth-actions">
                <button className="tp-btn tp-btn--primary tp-btn--lg" onClick={() => openAuthForm('login')}>
                  Sign In
                </button>
                <button className="tp-btn tp-btn--outline tp-btn--lg" onClick={() => openAuthForm('signup')}>
                  Create Account
                </button>
              </div>
            ) : (
              <form className="tp-form" onSubmit={handleAuthSubmit}>
                <h2 className="tp-form__title">{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>

                {authMode === 'signup' && (
                  <div className="tp-field">
                    <label className="tp-field__label">Username</label>
                    <input className="tp-input" type="text" placeholder="typist_pro" value={formData.username}
                      onChange={(e) => setFormData((c) => ({ ...c, username: e.target.value }))} required />
                  </div>
                )}

                <div className="tp-field">
                  <label className="tp-field__label">Email</label>
                  <input className="tp-input" type="email" placeholder="you@example.com" value={formData.email}
                    onChange={(e) => setFormData((c) => ({ ...c, email: e.target.value }))} required />
                </div>

                <div className="tp-field">
                  <label className="tp-field__label">Password</label>
                  <div className="tp-input-row">
                    <input className="tp-input" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={formData.password}
                      onChange={(e) => setFormData((c) => ({ ...c, password: e.target.value }))} required />
                    <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => setShowPassword((s) => !s)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {authMode === 'signup' && (
                  <div className="tp-field">
                    <label className="tp-field__label">Phone number</label>
                    <input className="tp-input" type="tel" placeholder="+254 7XX XXX XXX" value={formData.phoneNumber}
                      onChange={(e) => setFormData((c) => ({ ...c, phoneNumber: e.target.value }))} />
                  </div>
                )}

                <Notice message={authNotice} type="error" />

                <button type="submit" className="tp-btn tp-btn--primary" disabled={authLoading}>
                  {authLoading ? 'Signing in...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                </button>
                <button type="button" className="tp-btn tp-btn--ghost" onClick={() => openAuthForm(authMode === 'login' ? 'signup' : 'login')}>
                  {authMode === 'login' ? 'Create an account' : 'I already have an account'}
                </button>
                <button type="button" className="tp-btn tp-btn--ghost" onClick={() => setShowAuthForm(false)}>
                  Back
                </button>
              </form>
            )}
          </div>
        </div>
    );
  }

  // ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Logged-in state ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½
  return (
      <div className="tp-root">

        {/* ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Sidebar ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ */}
        <aside className="tp-sidebar">

          {/* Identity */}
          <div className="tp-identity">
            <AvatarBadge initials={initials} size={92} image={currentUser.profileImage} onImageChange={handleProfileImageChange} />
            <div className="tp-identity__info">
              <h1 className="tp-identity__name">{currentUser.username}</h1>
              <span className="tp-identity__tier">{currentUser.tier || 'Standard'} Tier</span>
              {currentUser.premium && (
                <span className="tp-identity__premium">Premium</span>
              )}
            </div>
          </div>

          <p className="tp-sidebar__email">{currentUser.email}</p>

          {/* Balance pill */}
          <div className="tp-balance">
            <span className="tp-balance__label">Wallet</span>
            <span className="tp-balance__value">KES {Number(currentUser.balance || 0).toFixed(2)}</span>
          </div>

          {/* Stat bars */}
          <div className="tp-stats">
            <div className="tp-stat-row">
              <div className="tp-stat-row__head">
                <span>Best WPM</span>
                <strong>{Number(currentUser.wpm || 0).toFixed(1)}</strong>
              </div>
              <StatBar value={Number(currentUser.wpm || 0)} max={200} color="var(--tp-accent)" />
            </div>

            <div className="tp-stat-row">
              <div className="tp-stat-row__head">
                <span>Accuracy</span>
                <strong>{Number(currentUser.accuracy || 0).toFixed(1)}%</strong>
              </div>
              <StatBar value={Number(currentUser.accuracy || 0)} max={100} color="var(--tp-green)" />
            </div>

            <div className="tp-stat-row">
              <div className="tp-stat-row__head">
                <span>Win Rate</span>
                <strong>{winRate}%</strong>
              </div>
              <StatBar value={winRate} max={100} color="var(--tp-gold)" />
            </div>
          </div>

          {/* Quick counts */}
          <div className="tp-counts">
            <div className="tp-count">
              <span className="tp-count__n">{currentUser.totalRaces || 0}</span>
              <span className="tp-count__l">Races</span>
            </div>
            <div className="tp-count">
              <span className="tp-count__n">{currentUser.wins || 0}</span>
              <span className="tp-count__l">Wins</span>
            </div>
            <div className="tp-count">
              <span className="tp-count__n">{currentUser.phoneNumber ? 'Set' : 'Not set'}</span>
              <span className="tp-count__l">Phone</span>
            </div>
          </div>

          {/* Equipped items */}
          <div className="tp-equipped">
            <h3 className="tp-equipped__title">Equipped</h3>
            {Object.entries(EQUIPPED_LABELS).map(([key, label]) => (
              <div key={key} className="tp-equipped__row">
                <span className="tp-equipped__label">{label}</span>
                <span className="tp-equipped__value">{currentUser.equippedItems?.[key] || 'None'}</span>
              </div>
            ))}
          </div>

          {/* Sign out */}
          <button className="tp-btn tp-btn--danger tp-sidebar__signout" onClick={handleSignOut}>
            Sign Out
          </button>
        </aside>

        {/* ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Main panel ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ */}
        <main className="tp-main">

          {/* Tab bar */}
          <div className="tp-tabs" role="tablist">
            <Tab id="wallet" active={activeTab === 'wallet'} onClick={setActiveTab}>Wallet</Tab>
            <Tab id="history" active={activeTab === 'history'} onClick={setActiveTab}>Race History</Tab>
            <Tab id="account" active={activeTab === 'account'} onClick={setActiveTab}>Account</Tab>
          </div>

          {/* ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ WALLET TAB ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ */}
          {activeTab === 'wallet' && (
            <div className="tp-panel">
              <p className="tp-panel__help">
                {simulatedPaymentsEnabled
                  ? 'Test payments enabled - sandbox top-up and withdrawal are available.'
                  : 'Top up your account, withdraw winnings, and keep your tournament wallet ready.'}
              </p>

              {/* Section switcher */}
              <div className="tp-segment">
                <button
                  className={`tp-segment__btn ${walletSection === 'topup' ? 'active' : ''}`}
                  onClick={() => setWalletSection('topup')}
                >Add Funds</button>
                <button
                  className={`tp-segment__btn ${walletSection === 'withdraw' ? 'active' : ''}`}
                  onClick={() => setWalletSection('withdraw')}
                >Withdraw</button>
              </div>

              {walletSection === 'topup' && (
                <form className="tp-wallet-form" onSubmit={handleAddFunds}>
                  <div className="tp-fields-row">
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Amount (KES)</label>
                      <input className="tp-input" type="number" min="1" step="0.01" value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)} placeholder="100" required />
                    </div>
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Method</label>
                      <select className="tp-input" value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value)}>
                        {(walletConfig.topUpMethods || []).map((m) => (
                          <option key={m} value={m}>{formatMethodLabel(m)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="tp-field tp-field--grow">
                      <label className="tp-field__label">
                        {topUpMethod === 'mpesa' ? 'M-Pesa number' : 'Account / email'}
                      </label>
                      <input className="tp-input" type="text" value={topUpAccount}
                        onChange={(e) => setTopUpAccount(e.target.value)}
                        placeholder={topUpMethod === 'mpesa' ? '07XX XXX XXX' : 'email@example.com'} required />
                    </div>
                  </div>
                  {/* <button type="submit" className="tp-btn tp-btn--primary">Add Funds</button> */}
                  {/* <button type="submit" className="tp-btn tp-btn--primary" disabled={topUpLoading}>
                    {topUpLoading ? 'Processing...' : 'Add Funds'}
                  </button> */}
                </form>
              )}

              {walletSection === 'withdraw' && (
                <form className="tp-wallet-form" onSubmit={handleWithdraw}>
                  <div className="tp-fields-row">
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Amount (KES)</label>
                      <input className="tp-input" type="number" min="1" step="0.01" value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="100" required />
                    </div>
                    <div className="tp-field tp-field--sm">
                      <label className="tp-field__label">Method</label>
                      <select className="tp-input" value={withdrawMethod} onChange={(e) => setWithdrawMethod(e.target.value)}>
                        {(walletConfig.withdrawMethods || []).map((m) => (
                          <option key={m} value={m}>{formatMethodLabel(m)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="tp-field tp-field--grow">
                      <label className="tp-field__label">
                        {withdrawMethod === 'mpesa' ? 'M-Pesa number' : 'Payout email'}
                      </label>
                      <input className="tp-input" type="text" value={withdrawAccount}
                        onChange={(e) => setWithdrawAccount(e.target.value)}
                        placeholder={withdrawMethod === 'mpesa' ? '07XX XXX XXX' : 'email@example.com'} required />
                    </div>
                  </div>
                  {/* <button type="submit" className="tp-btn tp-btn--outline">Withdraw</button> */}
                  {/* <button type="submit" className="tp-btn tp-btn--outline" disabled={withdrawLoading}>
                    {withdrawLoading ? 'Processing...' : 'Withdraw'}
                  </button> */}
                </form>
              )}

              <Notice message={walletNotice} type="info" />

              {/* Wallet history */}
              <div className="tp-section-head">
                <h3>Transaction History</h3>
              </div>
              <div className="tp-wallet-list">
                {walletHistory.length ? walletHistory.slice(0, 8).map((item, i) => (
                  <div key={item.code || item.createdAt || i} className="tp-wallet-row">
                    <span className="tp-wallet-row__type">{item.mode || item.type || 'transaction'}</span>
                    <span className={`tp-wallet-row__amount ${Number(item.amount) >= 0 ? 'positive' : 'negative'}`}>
                      {Number(item.amount) >= 0 ? '+' : ''}KES {Number(item.amount || 0).toFixed(2)}
                    </span>
                  </div>
                )) : (
                  <div className="tp-wallet-row">
                    <span className="tp-wallet-row__type">No wallet activity yet.</span>
                    <span className="tp-wallet-row__amount">Ready</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ RACE HISTORY TAB ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ */}
          {activeTab === 'history' && (
            <div className="tp-panel">
              <div className="tp-section-head">
                <h3>Recent Races</h3>
                <span className="tp-section-head__sub">{raceHistory.length} recorded</span>
              </div>
              <div className="tp-race-list">
                {raceHistory.length ? raceHistory.slice(0, 12).map((race, i) => {
                  const place = race.place || race.placePosition || 0;
                  return (
                    <div key={race.raceCode || race.createdAt || i} className="tp-race-row">
                      <div className="tp-race-row__medal" style={{ color: medalColour(place) }}>
                        #{place || '-'}
                      </div>
                      <div className="tp-race-row__main">
                        <span className="tp-race-row__wpm">{Number(race.wpm || 0).toFixed(1)} WPM</span>
                        <span className="tp-race-row__acc">{Number(race.accuracy || 0).toFixed(1)}% acc</span>
                        {race.mode && <span className="tp-chip">{race.mode}</span>}
                        {race.language && <span className="tp-chip tp-chip--muted">{race.language}</span>}
                      </div>
                      <div className="tp-race-row__earn">
                        {Number(race.earnings || 0) > 0 ? (
                          <span className="tp-earn-pill">+KES {Number(race.earnings).toFixed(2)}</span>
                        ) : (
                          <span className="tp-earn-pill tp-earn-pill--zero">KES 0</span>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="tp-empty">
                    <span>No races yet - enter the arena to build your history.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ ACCOUNT TAB ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ */}
          {activeTab === 'account' && (
            <div className="tp-panel">
              <div className="tp-section-head"><h3>Account Details</h3></div>
              <form className="tp-field" onSubmit={saveProfileName} style={{ marginBottom: '1rem' }}>
                <label className="tp-field__label" htmlFor="profile-name">Profile name</label>
                <div className="tp-input-row">
                  <input id="profile-name" className="tp-input" type="text" maxLength="50" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                  <button className="tp-btn tp-btn--primary tp-btn--sm" type="submit" disabled={profileSaving}>
                    {profileSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
              <div className="tp-account-rows">
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Username</span>
                  <span className="tp-account-row__value">{currentUser.username}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Email</span>
                  <span className="tp-account-row__value">{currentUser.email}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Phone</span>
                  <span className="tp-account-row__value">{currentUser.phoneNumber || 'Not set'}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Tier</span>
                  <span className="tp-account-row__value">{currentUser.tier || 'Standard'}</span>
                </div>
                <div className="tp-account-row">
                  <span className="tp-account-row__label">Premium</span>
                  <span className="tp-account-row__value">{currentUser.premium ? 'Active' : 'Not active'}</span>
                </div>
              </div>

              <div className="tp-section-head" style={{ marginTop: '2rem' }}>
                <h3>Badge Image</h3>
                <span className="tp-section-head__sub">Your profile badge is visible in races and standings</span>
              </div>
              <div className="tp-badge-editor">
                <AvatarBadge initials={initials} size={110} image={currentUser.profileImage} onImageChange={handleProfileImageChange} />
                <div className="tp-badge-editor__hint">
                  <p>Click the badge to upload a custom photo.<br />Supports JPG, PNG, WebP. Saved to your TypeArena profile and visible in races and chat.</p>
                </div>
              </div>

              <div className="tp-section-head" style={{ marginTop: '2rem' }}>
                <h3>Arena Experience</h3>
                <span className="tp-section-head__sub">These settings apply every time you enter the arena</span>
              </div>
              <div className="tp-audio-settings">
                <div className="tp-audio-row">
                  <div className="tp-audio-row__info">
                    <span className="tp-audio-row__label">Typing Sounds</span>
                    <span className="tp-audio-row__desc">Key click and error sounds while you type</span>
                  </div>
                  <button
                    className={`tp-toggle ${soundEnabled ? 'tp-toggle--on' : ''}`}
                    onClick={() => toggleSetting('typearena_sound', setSoundEnabled)}
                    aria-pressed={soundEnabled}
                  >
                    <span className="tp-toggle__knob" />
                  </button>
                </div>
                <div className="tp-audio-row">
                  <div className="tp-audio-row__info">
                    <span className="tp-audio-row__label">Background Music</span>
                    <span className="tp-audio-row__desc">Orchestral arena music during lobby and races</span>
                  </div>
                  <button
                    className={`tp-toggle ${musicEnabled ? 'tp-toggle--on' : ''}`}
                    onClick={() => toggleSetting('typearena_music', setMusicEnabled)}
                    aria-pressed={musicEnabled}
                  >
                    <span className="tp-toggle__knob" />
                  </button>
                </div>
                <div className="tp-audio-row">
                  <div className="tp-audio-row__info">
                    <span className="tp-audio-row__label">Live Commentator</span>
                    <span className="tp-audio-row__desc">Spoken commentary on milestones, streaks and finish</span>
                  </div>
                  <button
                    className={`tp-toggle ${commentatorEnabled ? 'tp-toggle--on' : ''}`}
                    onClick={() => toggleSetting('typearena_commentator', setCommentatorEnabled)}
                    aria-pressed={commentatorEnabled}
                  >
                    <span className="tp-toggle__knob" />
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
  );
}

// ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½ Styles ?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½?fÃ¯Â¿Â½Ã¯Â¿Â½?,?Ã¯Â¿Â½Ã¯Â¿Â½??sÃ¯Â¿Â½