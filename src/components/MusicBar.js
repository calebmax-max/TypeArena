// =============================================================================
// MusicBar.jsx — Floating persistent music player
// Render this ONCE at the app root (e.g. App.jsx) so it stays alive across
// all page navigations.
//
//   import MusicBar from './components/MusicBar';
//   // inside App return:
//   <MusicBar />
//   <RouterOutlet />
// =============================================================================
import React, { useState } from 'react';
import { arenaMusic, useMusicState } from '../utils/arenaMusic';

export default function MusicBar() {
  const { currentTrack, playing, volume, muted, tracks, currentIndex } = useMusicState();
  const [expanded, setExpanded] = useState(false);

  if (!currentTrack) return null;

  const vol = Math.round(volume * 100);

  return (
    <>
      <style>{`
        /* ── MusicBar — floating bottom-right player ── */
        .music-bar {
          position: fixed;
          bottom: 22px;
          right: 22px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          font-family: 'Segoe UI', system-ui, sans-serif;
          user-select: none;
        }

        /* Playlist panel — slides up when expanded */
        .music-bar__playlist {
          background: rgba(10, 12, 20, 0.97);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 10px 0;
          width: 260px;
          max-height: 240px;
          overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          backdrop-filter: blur(12px);
          animation: musicSlideUp 0.22s ease;
        }
        @keyframes musicSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .music-bar__playlist-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          cursor: pointer;
          border-radius: 6px;
          margin: 0 6px;
          transition: background 0.15s;
        }
        .music-bar__playlist-item:hover {
          background: rgba(255,255,255,0.07);
        }
        .music-bar__playlist-item.active {
          background: rgba(99, 202, 183, 0.15);
        }
        .music-bar__playlist-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255,255,255,0.25);
          flex-shrink: 0;
        }
        .music-bar__playlist-item.active .music-bar__playlist-dot {
          background: #63cab7;
          box-shadow: 0 0 6px #63cab7;
        }
        .music-bar__playlist-name {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .music-bar__playlist-item.active .music-bar__playlist-name {
          color: #63cab7;
          font-weight: 600;
        }

        /* Main bar pill */
        .music-bar__pill {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(10, 12, 20, 0.95);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 40px;
          padding: 8px 16px 8px 12px;
          box-shadow: 0 6px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,202,183,0.08);
          backdrop-filter: blur(14px);
          min-width: 220px;
          cursor: default;
        }

        /* Animated vinyl disc */
        .music-bar__disc {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%,
            #2a2e3e 30%, #1a1d28 50%, #0e1019 100%);
          border: 2px solid rgba(99,202,183,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          cursor: pointer;
          transition: border-color 0.3s;
        }
        .music-bar__disc:hover { border-color: #63cab7; }
        .music-bar__disc::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #63cab7;
          box-shadow: 0 0 8px #63cab7;
          opacity: 0.85;
        }
        .music-bar__disc--spinning {
          animation: discSpin 3s linear infinite;
        }
        @keyframes discSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* Track info */
        .music-bar__info {
          flex: 1;
          overflow: hidden;
          cursor: pointer;
        }
        .music-bar__title {
          font-size: 0.78rem;
          font-weight: 700;
          color: #f0f4f8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        .music-bar__artist {
          font-size: 0.68rem;
          color: rgba(255,255,255,0.42);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }

        /* Controls */
        .music-bar__controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .music-bar__btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.55);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          line-height: 1;
          transition: color 0.15s, background 0.15s;
        }
        .music-bar__btn:hover {
          color: #63cab7;
          background: rgba(99,202,183,0.1);
        }
        .music-bar__btn--play {
          width: 28px;
          height: 28px;
          background: rgba(99,202,183,0.15);
          color: #63cab7;
          font-size: 13px;
        }
        .music-bar__btn--play:hover {
          background: rgba(99,202,183,0.28);
          color: #7fdbca;
        }

        /* Volume slider — compact */
        .music-bar__vol {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .music-bar__vol-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 52px;
          height: 3px;
          border-radius: 3px;
          background: linear-gradient(to right,
            #63cab7 0%,
            #63cab7 calc(${vol}% ),
            rgba(255,255,255,0.15) calc(${vol}%)
          );
          outline: none;
          cursor: pointer;
        }
        .music-bar__vol-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #63cab7;
          cursor: pointer;
          box-shadow: 0 0 4px rgba(99,202,183,0.5);
        }
        .music-bar__vol-slider::-moz-range-thumb {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #63cab7;
          cursor: pointer;
          border: none;
        }

        /* Equaliser bars animation — shows when playing */
        .music-bar__eq {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 14px;
          flex-shrink: 0;
        }
        .music-bar__eq span {
          display: block;
          width: 3px;
          border-radius: 2px;
          background: #63cab7;
          animation: eqBounce 0.6s ease-in-out infinite alternate;
        }
        .music-bar__eq span:nth-child(1) { height: 6px;  animation-delay: 0s;    }
        .music-bar__eq span:nth-child(2) { height: 12px; animation-delay: 0.12s; }
        .music-bar__eq span:nth-child(3) { height: 8px;  animation-delay: 0.24s; }
        .music-bar__eq span:nth-child(4) { height: 14px; animation-delay: 0.08s; }
        @keyframes eqBounce {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
        .music-bar__eq--paused span {
          animation: none;
          height: 4px !important;
          opacity: 0.35;
        }
      `}</style>

      <div className="music-bar">
        {/* Playlist panel */}
        {expanded && (
          <div className="music-bar__playlist">
            {tracks.map((track, i) => (
              <div
                key={track.id}
                className={`music-bar__playlist-item ${i === currentIndex ? 'active' : ''}`}
                onClick={() => arenaMusic.seekToTrack(i)}
              >
                <span className="music-bar__playlist-dot" />
                <span className="music-bar__playlist-name">{track.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Main pill */}
        <div className="music-bar__pill">
          {/* Spinning disc — click to play/pause */}
          <div
            className={`music-bar__disc ${playing ? 'music-bar__disc--spinning' : ''}`}
            onClick={arenaMusic.toggle}
            title={playing ? 'Pause' : 'Play'}
          />

          {/* Track info — click to expand playlist */}
          <div className="music-bar__info" onClick={() => setExpanded((e) => !e)} title="Show playlist">
            <div className="music-bar__title">{currentTrack.title}</div>
            <div className="music-bar__artist">{currentTrack.artist}</div>
          </div>

          {/* EQ animation */}
          <div className={`music-bar__eq ${playing ? '' : 'music-bar__eq--paused'}`}>
            <span /><span /><span /><span />
          </div>

          {/* Controls */}
          <div className="music-bar__controls">
            <button className="music-bar__btn" onClick={arenaMusic.prev} title="Previous">‹‹</button>
            <button className="music-bar__btn music-bar__btn--play" onClick={arenaMusic.toggle} title={playing ? 'Pause' : 'Play'}>
              {playing ? '⏸' : '▶'}
            </button>
            <button className="music-bar__btn" onClick={arenaMusic.next} title="Next">››</button>
          </div>

          {/* Volume */}
          <div className="music-bar__vol">
            <button
              className="music-bar__btn"
              onClick={arenaMusic.toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              style={{ fontSize: '11px' }}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              className="music-bar__vol-slider"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              style={{
                background: `linear-gradient(to right, #63cab7 ${vol}%, rgba(255,255,255,0.15) ${vol}%)`
              }}
              onChange={(e) => {
                arenaMusic.setMuted(false);
                arenaMusic.setVolume(Number(e.target.value));
              }}
              title={`Volume: ${vol}%`}
            />
          </div>
        </div>
      </div>
    </>
  );
}