(function (root) {
  "use strict";

  var Holidays = (typeof require !== "undefined")
    ? require("./holidays.js")
    : root.Holidays;

  var DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  function pad2(value) {
    return value < 10 ? "0" + value : "" + value;
  }

  function dateKey(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function lastDayOf(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function daysOf(year, month) {
    var days = [];
    var last = lastDayOf(year, month);
    for (var day = 1; day <= last; day++) {
      var key = dateKey(year, month, day);
      var dow = new Date(year, month - 1, day).getDay();
      days.push({
        date: key,
        day: day,
        dow: dow,
        dowLabel: DOW_LABELS[dow],
        isWeekend: dow === 0 || dow === 6,
        holiday: Holidays.isHoliday(key)
      });
    }
    return days;
  }

  function shift(ym, delta) {
    var index = ym.y * 12 + (ym.m - 1) + delta;
    return { y: Math.floor(index / 12), m: (index % 12) + 1 };
  }

  function label(ym) {
    return ym.y + "年" + ym.m + "月";
  }

  function key(ym) {
    return {
      from: dateKey(ym.y, ym.m, 1),
      to: dateKey(ym.y, ym.m, lastDayOf(ym.y, ym.m))
    };
  }

  function missingDays(days, logsByDate) {
    return days.filter(function (d) {
      if (d.isWeekend || d.holiday) return false;
      return !logsByDate[d.date];
    }).map(function (d) {
      return d.date;
    });
  }

  var api = {
    DOW_LABELS: DOW_LABELS,
    daysOf: daysOf,
    shift: shift,
    label: label,
    key: key,
    missingDays: missingDays
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Month = api;
  }
})(typeof window !== "undefined" ? window : this);
