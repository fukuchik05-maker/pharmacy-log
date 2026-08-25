(function (root) {
  "use strict";

  var NAME_RE = /^(\d{2})(\d{2})\.(csv|xlsx)$/i;

  function pad2(value) {
    return value < 10 ? "0" + value : "" + value;
  }

  function isRealDate(year, month, day) {
    var d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  }

  function parse(name, today) {
    if (typeof name !== "string") return null;

    var base = name.split("/").pop().split("\\").pop();
    var match = NAME_RE.exec(base);
    if (!match) return null;

    var month = parseInt(match[1], 10);
    var day = parseInt(match[2], 10);
    var kind = match[3].toLowerCase();
    var reference = today || new Date();

    var candidates = [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1];
    var best = null;
    var bestDistance = Infinity;

    candidates.forEach(function (year) {
      if (!isRealDate(year, month, day)) return;
      var distance = Math.abs(new Date(year, month - 1, day).getTime() - reference.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        best = year;
      }
    });

    if (best === null) return null;
    return { date: best + "-" + pad2(month) + "-" + pad2(day), kind: kind };
  }

  var api = { parse: parse };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Filename = api;
  }
})(typeof window !== "undefined" ? window : this);
