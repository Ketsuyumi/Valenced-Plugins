import { hostOf, type Settings } from './store'

/**
 * The "extensions": scripts put into every page the window loads. Before the page's own scripts
 * run: the pop-up blocker. After it loads (and on every page change): the ad hider, dark pages,
 * video focus and your own user scripts. Each one is wrapped so a failing script can't stop the rest.
 */

const wrap = (name: string, code: string) =>
	`try{${code}\n}catch(e){console.warn('[Floating Browser] ${name.replace(/'/g, '')}',e)}`

const POPUPS = `
window.open=function(){return null};
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[target=_blank]');if(a&&a.href&&a.host!==location.host){a.removeAttribute('target')}},true);
`

const ADS = `
var s=document.getElementById('__fb_ads')||document.createElement('style');s.id='__fb_ads';
s.textContent='ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[src*="adservice"],iframe[id^="aswift"],[class*="ad-banner"],[class*="banner-ad"],[class*="sponsored-ad"],[id*="ad-container"],[class*="ad-container"],[aria-label="advertisement"],[data-ad-slot]{display:none!important;height:0!important}';
(document.head||document.documentElement).appendChild(s);
`

const DARK = `
var d=document.getElementById('__fb_dark')||document.createElement('style');d.id='__fb_dark';
d.textContent='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}img,video,picture,canvas,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
(document.head||document.documentElement).appendChild(d);
`
const UNDARK = `var d=document.getElementById('__fb_dark');if(d)d.remove();`

/** Makes the biggest video (or player frame) fill the window; checks again as pages change. */
const FOCUS = `
if(!window.__fbFocus){window.__fbFocus=1;
var pick=function(){var best=null,area=0;document.querySelectorAll('video,iframe').forEach(function(v){var r=v.getBoundingClientRect();var a=r.width*r.height;if(v.tagName==='IFRAME'&&!/player|embed|video|stream/i.test(v.src+v.id+v.className))return;if(a>area){area=a;best=v}});return best};
var apply=function(){var v=pick();if(!v)return;if(window.__fbFocused&&window.__fbFocused!==v){window.__fbFocused.style.cssText=window.__fbFocusedCss||''}if(window.__fbFocused!==v){window.__fbFocusedCss=v.style.cssText}window.__fbFocused=v;
v.style.cssText+=';position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483647!important;background:#000!important;object-fit:contain!important;margin:0!important;border:0!important';
document.documentElement.style.overflow='hidden'};
apply();window.__fbFocusTimer=setInterval(apply,1500)}
`
const UNFOCUS = `
if(window.__fbFocus){clearInterval(window.__fbFocusTimer);window.__fbFocus=0;var v=window.__fbFocused;if(v)v.style.cssText=window.__fbFocusedCss||'';window.__fbFocused=null;document.documentElement.style.overflow=''}
`

export function matches(match: string, url: string): boolean {
	const host = hostOf(url)
	return match
		.split(',')
		.map(m => m.trim().toLowerCase())
		.filter(Boolean)
		.some(m => m === '*' || url.toLowerCase().includes(m) || host.endsWith(m))
}

export function beforeLoad(s: Settings): string {
	return `(function(){${s.popupBlock ? wrap('pop-ups', POPUPS) : ''}})();true;`
}

/** Everything that runs once a page has loaded (also re-run when a setting changes). */
export function afterLoad(s: Settings, url: string): string {
	const parts: string[] = []
	if (s.adHide) parts.push(wrap('ads', ADS))
	parts.push(wrap('dark', s.dark ? DARK : UNDARK))
	parts.push(wrap('video', s.videoFocus ? FOCUS : UNFOCUS))
	for (const sc of s.scripts)
		if (sc.on && sc.code.trim() && matches(sc.match || '*', url))
			// Compiled on its own, so a typo in one script can't break the others (a syntax error
			// can't be caught where it's written).
			parts.push(
				wrap(
					sc.name || 'script',
					`(new Function(${JSON.stringify(sc.code)}))()`,
				),
			)
	return `(function(){${parts.join('\n')}})();true;`
}

export const DESKTOP_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** Navigations the pop-up blocker stops: app-store and intent jumps that ads use. */
export function blockedNav(url: string): boolean {
	return /^(intent|market|itms-apps|itms-appss|fb|twitter|snssdk\d*):/i.test(
		url,
	)
}
