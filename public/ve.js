/* Revora visitor error feed: counts page errors, failed form sends and broken pictures. No cookies, no IP, no form values. */
(function () {
  try {
    var s = document.currentScript, o = s && s.getAttribute("data-o");
    if (!o || window.top !== window.self || window.__rvE) return;
    window.__rvE = 1;
    var n = 0, seen = {}, lastSubmit = 0, E = "/api/public/visitor-errors", F = window.fetch;
    var send = function (k, m) {
      try {
        var key = k + m;
        if (n >= 8 || seen[key]) return;
        seen[key] = 1; n++;
        var b = JSON.stringify({ o: o, k: k, m: String(m).slice(0, 300), p: location.pathname });
        if (!(navigator.sendBeacon && navigator.sendBeacon(E, b)) && F) F.call(window, E, { method: "POST", body: b, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
      } catch (e) {}
    };
    var path = function (u) { try { var a = new URL(u, location.href); return a.pathname; } catch (e) { return "?"; } };
    addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG") send("image", "Picture did not load: " + path(t.currentSrc || t.src));
      else if (e.message) send("js", e.message);
    }, true);
    addEventListener("unhandledrejection", function (e) {
      var r = e.reason; send("js", "Unhandled: " + (r && r.message ? r.message : String(r)));
    });
    addEventListener("submit", function () { lastSubmit = Date.now(); }, true);
    if (F) window.fetch = function (i, init) {
      var u = path(typeof i === "string" ? i : (i && i.url) || ""), recent = Date.now() - lastSubmit < 15000;
      var p = F.apply(this, arguments);
      if (recent && u !== E) p.then(function (r) { if (!r.ok) send("form", "Form send failed (" + r.status + ") " + u); }, function () { send("form", "Form send failed (network) " + u); });
      return p;
    };
  } catch (e) {}
})();
