(function (root) {
  "use strict";

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sumWardRx(log) {
    return (log.wardRx || []).reduce(function (acc, w) {
      return acc + ((w.total && w.total.cnt) || 0);
    }, 0);
  }

  function sumWinj(log) {
    return (log.winjData || []).reduce(function (acc, w) {
      return acc + (w.cnt || 0);
    }, 0);
  }

  function dowClass(day) {
    if (day.holiday) return "dow-sun";
    if (day.dow === 0) return "dow-sun";
    if (day.dow === 6) return "dow-sat";
    return "";
  }

  function todayDateStr() {
    var now = new Date();
    var pad2 = function (v) { return v < 10 ? "0" + v : "" + v; };
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  }

  function rowClass(day, log, until) {
    if (log) return "row-link";
    if (day.isWeekend || day.holiday) return "row-off";
    if (until && day.date > until) return "row-off";
    return "row-missing";
  }

  function render(container, ym, logs, onSelect) {
    var days = root.Month.daysOf(ym.y, ym.m);
    var until = todayDateStr();
    var byDate = {};
    logs.forEach(function (log) { byDate[log.date] = log; });

    var rows = days.map(function (day) {
      var log = byDate[day.date];
      var cells;

      if (log) {
        cells =
          '<td class="num">' + (log.rxOpCnt || 0) + "</td>" +
          '<td class="num">' + sumWardRx(log) + "</td>" +
          '<td class="num">' + sumWinj(log) + "</td>" +
          '<td class="num">' + ((log.inquiries || []).length) + "</td>" +
          "<td>" + esc(log.author) + "</td>";
      } else {
        var note = (day.isWeekend || day.holiday) ? "" : "記録なし";
        cells = '<td colspan="5" style="color:#92400E;font-size:12px">' + note + "</td>";
      }

      return '<tr class="' + rowClass(day, log, until) + '" data-date="' + day.date + '">' +
        '<td class="' + dowClass(day) + '">' + day.day + "日（" + day.dowLabel + "）" +
        (day.holiday ? '<span class="holiday-name">' + esc(day.holiday) + "</span>" : "") +
        "</td>" + cells + "</tr>";
    }).join("");

    container.innerHTML =
      '<div class="card"><div class="tbl-wrap"><table class="tbl">' +
      "<thead><tr><th>日付</th><th class=\"num\">外来処方箋</th><th class=\"num\">病棟処方箋</th>" +
      "<th class=\"num\">病棟注射箋</th><th class=\"num\">疑義照会</th><th>記入者</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div></div>";

    container.querySelectorAll("tr.row-link").forEach(function (tr) {
      tr.addEventListener("click", function () {
        onSelect(tr.getAttribute("data-date"));
      });
    });
  }

  root.ListView = { render: render };
})(typeof window !== "undefined" ? window : this);
