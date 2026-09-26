/* Apply before CSS loads to avoid flashing the wrong palette. */
(() => {
  'use strict';
  const root = document.documentElement;
  const storageKey = 'miniran-geomap-theme';
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let preference;
  try { preference = localStorage.getItem(storageKey); } catch (_) { /* Storage is optional. */ }
  if (!['light', 'dark'].includes(preference)) preference = null;

  function apply(theme) {
    root.dataset.theme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = theme === 'light' ? '☾ Dark mode' : '☀ Light mode';
      button.setAttribute('aria-pressed', String(theme === 'light'));
    }
  }
  apply(preference || (system.matches ? 'light' : 'dark'));
  system.addEventListener('change', () => {
    if (!preference) apply(system.matches ? 'light' : 'dark');
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = root.dataset.theme === 'light' ? 'dark' : 'light';
      apply(preference);
      try { localStorage.setItem(storageKey, preference); } catch (_) { /* Keep working without persistence. */ }
    });
  });
})();
