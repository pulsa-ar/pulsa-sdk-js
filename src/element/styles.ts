/** The component's look, from pulsa's design system (design.md). Scoped by the shadow root. */

export const STYLES = /* css */ `
  :host {
    --pulsa-mint: #76d3c4;
    --pulsa-mint-light: #ceefe9;
    --pulsa-forest: #10241f;
    --pulsa-jade: #297768;
    --pulsa-font-heading: "Outfit", system-ui, sans-serif;
    --pulsa-font-body: "Google Sans Flex", "Google Sans", system-ui, sans-serif;

    display: block;
    position: relative;
    overflow: hidden;
    aspect-ratio: 4 / 3;
    border-radius: 16px;
    background: var(--pulsa-forest);
    color: #fff;
    font-family: var(--pulsa-font-body);
  }

  :host([hidden]) { display: none; }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Mirrors what the signer sees, never what MediaPipe sees: a flipped input would swap
     left and right hands, and with them every handed sign. */
  :host(:not([mirrored="false"])) video { transform: scaleX(-1); }

  .screen {
    position: absolute;
    inset: 0;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    background: var(--pulsa-forest);
    text-align: center;
  }
  .screen[data-visible] { display: flex; }
  .screen img { width: min(40%, 160px); height: auto; }
  .screen .title {
    font-family: var(--pulsa-font-heading);
    font-size: 1.15rem;
    font-weight: 600;
    max-width: 32ch;
  }
  .screen .detail { font-size: 0.9rem; opacity: 0.8; max-width: 40ch; }
  .screen .spinner {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 4px solid var(--pulsa-mint-light);
    border-top-color: var(--pulsa-mint);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .badge {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: none;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pulsa-forest) 85%, transparent);
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .badge[data-visible] { display: flex; }
  .badge img { width: 22px; height: 22px; }

  .glosses {
    position: absolute;
    left: 12px;
    right: 64px;
    bottom: 12px;
    display: none;
    flex-wrap: wrap;
    gap: 6px;
  }
  :host([show-glosses]:not([show-glosses="false"])) .glosses[data-visible] { display: flex; }
  .gloss {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--pulsa-mint);
    color: var(--pulsa-forest);
    font-family: var(--pulsa-font-heading);
    font-weight: 600;
    font-size: 1rem;
  }
  .gloss.pending { background: var(--pulsa-mint-light); opacity: 0.75; }

  .brand {
    position: absolute;
    right: 12px;
    bottom: 12px;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
  }
  .brand .icon { width: 36px; height: 36px; display: block; }
  /* 38px tall is ~92px wide: the full logo's 90px minimum. */
  .brand .logo { height: 38px; width: auto; display: none; }
  :host([data-wide]) .brand .icon { display: none; }
  :host([data-wide]) .brand .logo { display: block; }
`;
