/**
 * Runs at the start of every frame of an activity's web view (Watch Together puts YouTube's player
 * in a youtube.com frame inside the activity page), and only does anything in YouTube's frames:
 *
 * 1. Ad data out of the player's data: adPlacements / adSlots / playerAds are deleted from every
 *    JSON YouTube parses (JSON.parse, fetch's .json()) and from ytInitialPlayerResponse, so the
 *    player has no ads to schedule.
 * 2. Ad overlays hidden with CSS.
 * 3. Backup: while the player is in its ad state (.ad-showing), the ad is muted, sped up, jumped
 *    to its end and its Skip button pressed; sound comes back after.
 */
export const AD_SCRIPT = `(function () {
	try {
		if (window.__wtAdBlock) return;
		window.__wtAdBlock = true;
		if (!/(^|\\.)(youtube|youtube-nocookie)\\.com$/.test(location.hostname)) return;
		var KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
		var prune = function (o, depth) {
			if (!o || typeof o !== 'object' || depth > 4) return o;
			for (var i = 0; i < KEYS.length; i++) if (KEYS[i] in o) delete o[KEYS[i]];
			if (o.playerResponse) prune(o.playerResponse, depth + 1);
			if (o.response) prune(o.response, depth + 1);
			if (Array.isArray(o)) for (var j = 0; j < o.length && j < 8; j++) prune(o[j], depth + 1);
			return o;
		};
		var parse = JSON.parse;
		JSON.parse = function () {
			var r = parse.apply(this, arguments);
			try { prune(r, 0); } catch (e) {}
			return r;
		};
		if (window.Response && Response.prototype.json) {
			var json = Response.prototype.json;
			Response.prototype.json = function () {
				return json.apply(this, arguments).then(function (r) {
					try { prune(r, 0); } catch (e) {}
					return r;
				});
			};
		}
		var initial;
		try {
			Object.defineProperty(window, 'ytInitialPlayerResponse', {
				configurable: true,
				get: function () { return initial; },
				set: function (v) { initial = prune(v, 0); }
			});
		} catch (e) {}

		var css = '.video-ads,.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-overlay-slot,' +
			'.ytp-ad-image-overlay,.ytp-ad-text-overlay,.ytp-ad-player-overlay,' +
			'.ytp-ad-player-overlay-layout,.ytp-ad-action-interstitial{display:none!important}';
		var addStyle = function () {
			if (document.getElementById('wt-adblock')) return;
			var root = document.head || document.documentElement;
			if (!root) return setTimeout(addStyle, 10);
			var s = document.createElement('style');
			s.id = 'wt-adblock';
			s.textContent = css;
			root.appendChild(s);
		};
		addStyle();
		document.addEventListener('DOMContentLoaded', addStyle);

		var inAd = false, wasMuted = false;
		setInterval(function () {
			var ad = document.querySelector('.ad-showing, .ad-interrupting');
			var v = document.querySelector('video');
			if (ad && v) {
				if (!inAd) { inAd = true; wasMuted = v.muted; }
				v.muted = true;
				try { v.playbackRate = 16; } catch (e) {}
				if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2)
					v.currentTime = v.duration - 0.1;
				var skip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, [id^="skip-button"] button');
				if (skip) skip.click();
			} else if (inAd) {
				inAd = false;
				if (v) {
					v.muted = wasMuted;
					try { v.playbackRate = 1; } catch (e) {}
				}
			}
		}, 250);
	} catch (e) {}
})();
true;`
