/**
 * "Get the app": register the service worker (so the site works offline and
 * can be installed), and show a dialog with the install button and links to
 * the desktop downloads on GitHub Releases.
 */
import { h } from './dom';
import { icon } from './icons';

const RELEASES = 'https://github.com/Normansrule/game-of-life/releases/latest';
const SITE = 'https://normansrule.github.io/game-of-life/';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const isDesktopApp = () => navigator.userAgent.includes('Electron');
let dialogRef: HTMLDialogElement | null = null;

/** Open the Get the app dialog (used by the home page). */
export const openGetApp = () => dialogRef?.showModal();

const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || isDesktopApp();

export function setupGetApp(button: HTMLElement | null) {
  // Service workers only run on real https (or localhost) origins; anywhere else this quietly does nothing.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && !isDesktopApp() && window.isSecureContext && window.top === window) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (!button) return;
  if (isInstalled()) { button.hidden = true; return; }

  let deferred: InstallPrompt | null = null;
  const installBtn = h('button.primary', { onclick: async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') { dialog.close(); button.hidden = true; }
    deferred = null;
    installBtn.disabled = true;
  } }, 'Install in this browser');
  const installNote = h('p.small.dim', {}, 'Your browser has not offered installation here. In Chrome or Edge use the install icon in the address bar; on iPhone or iPad use Share, then Add to Home Screen; in Firefox, use the desktop app below.');
  installBtn.disabled = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    installBtn.disabled = false;
    installNote.textContent = 'Installs Life Tree as an app with its own window and icon. It works offline afterwards.';
  });
  window.addEventListener('appinstalled', () => { button.hidden = true; });

  const os = /Win/.test(navigator.platform) ? 'Windows' : /Mac/.test(navigator.platform) ? 'macOS' : /Linux/.test(navigator.platform) ? 'Linux' : '';
  const dl = (name: string, what: string) => h(`a.app-dl${name === os ? '.mine' : ''}`, { href: RELEASES, target: '_blank', rel: 'noopener' }, h('b', {}, name), h('span.small.dim', {}, what));

  const dialog = h('dialog.app-dialog', {},
    h('form', { method: 'dialog' }, h('button.app-close', { 'aria-label': 'Close' }, icon('cross'))),
    h('h2', {}, 'Get Life Tree'),
    h('section', {}, h('h3', {}, 'Web app'),
      h('p', {}, 'The whole explorer runs in your browser, nothing to install: ', h('a', { href: SITE, target: '_blank', rel: 'noopener' }, SITE.replace('https://', ''))),
      installBtn, installNote),
    h('section', {}, h('h3', {}, 'Desktop app'),
      h('p.small.dim', {}, 'A stand-alone app for your computer, built from the same code. Downloads are on GitHub Releases.'),
      h('div.app-dls', {},
        dl('Windows', 'installer (.exe) or portable'),
        dl('macOS', 'disk image (.dmg)'),
        dl('Linux', 'AppImage or .deb'))),
  );
  button.replaceChildren(icon('download'), h('span.get-app-label', {}, 'Get the app'));
  button.setAttribute('aria-label', 'Get the app');
  document.body.append(dialog);
  dialogRef = dialog;
  button.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}

/** True inside the installed web app or the desktop app, where "Get the app" makes no sense. */
export const isInstalledApp = () => isInstalled();
