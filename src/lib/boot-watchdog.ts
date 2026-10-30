/**
 * Inline <head> script. The app's stale-build guard (in the root route) only
 * runs once the app has started, so a page whose code bundle failed to load —
 * a cached or half-downloaded script — stayed blank until a hard reload. This
 * reloads the page once (at most once a minute per tab) when a bundle script
 * fails to load, or when the app still has not started 15s after the page
 * loaded. The root route sets window.__rvBooted when it mounts.
 */
export const BOOT_WATCHDOG =
  "(function(){var K='rv-boot-reload';function again(){try{var l=Number(sessionStorage.getItem(K)||0);if(l&&Date.now()-l<60000)return;sessionStorage.setItem(K,String(Date.now()))}catch(e){return}location.reload()}" +
  "window.addEventListener('error',function(e){var t=e&&e.target;if(t&&t.tagName==='SCRIPT'&&!window.__rvBooted&&String(t.src||'').indexOf(location.origin+'/assets/')===0)again()},true);" +
  "window.addEventListener('load',function(){setTimeout(function(){if(!window.__rvBooted)again()},15000)})})();";
