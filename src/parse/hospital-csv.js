(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("../model/daily-log.js")
    : root.DailyLog;

  var HEADING_TO_KEY = {
    "入院定期": "teiki",
    "入院臨時": "rinji",
    "退院": "taiin",
    "持参薬": "meds",
    "1包化　持参薬": "ippoka",
    "■合計■": "total"
  };

  var TOTAL_ROW_LABEL = "■合計■";

  function decode(buffer) {
    var bytes = (typeof Buffer !== "undefined" && Buffer.isBuffer(buffer))
      ? new Uint8Array(buffer)
      : buffer;

    // UTF-8 は不正なバイト列を確実に検出できるため先に試す。
    // 逆順にすると、UTF-8 の内容が Shift-JIS として文字化けしたまま通ってしまう。
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
    } catch (e) {
      return new TextDecoder("shift_jis").decode(bytes);
    }
  }

  function splitLine(line) {
    return line.split(",").map(function (cell) {
      return cell.replace(/^"|"$/g, "").trim();
    });
  }

  function normalizeHeading(value) {
    return value.replace(/\s+/g, " ").replace(/ /g, "　").trim();
  }

  function buildColumnMap(headingRow) {
    var map = {};
    for (var i = 1; i < headingRow.length; i++) {
      var raw = headingRow[i];
      if (!raw) continue;
      var key = HEADING_TO_KEY[normalizeHeading(raw)] || HEADING_TO_KEY[raw.trim()] || null;
      if (key) map[key] = { cnt: i, dose: i + 1 };
    }
    return map;
  }

  function toCount(raw) {
    if (raw === "" || raw === undefined) return 0;
    if (!/^-?\d+$/.test(raw)) return null;
    return parseInt(raw, 10);
  }

  function parse(buffer) {
    var errors = [];
    var text = decode(buffer);
    var lines = text.split(/\r?\n/).filter(function (line) {
      return line.trim() !== "";
    });

    if (lines.length < 3) {
      return { wardRx: [], errors: [{ field: "(file)", message: "行数が足りません" }] };
    }

    var columns = buildColumnMap(splitLine(lines[0]));
    var byWard = {};

    for (var i = 2; i < lines.length; i++) {
      var cells = splitLine(lines[i]);
      var wardName = cells[0];
      if (!wardName || wardName === TOTAL_ROW_LABEL) continue;

      byWard[wardName] = buildRow(wardName, cells, columns, errors);
    }

    var wardRx = DailyLog.WARDS.map(function (name) {
      if (byWard[name]) return byWard[name];
      errors.push({ field: name, message: "病棟の行が見つかりません: " + name });
      var blank = { name: name };
      DailyLog.RX_KINDS.forEach(function (kind) {
        blank[kind] = { cnt: 0, dose: 0 };
      });
      return blank;
    });

    return { wardRx: wardRx, errors: errors };
  }

  function buildRow(wardName, cells, columns, errors) {
    var row = { name: wardName };
    DailyLog.RX_KINDS.forEach(function (kind) {
      var position = columns[kind];
      if (!position) {
        row[kind] = { cnt: 0, dose: 0 };
        return;
      }
      var cnt = toCount(cells[position.cnt]);
      var dose = toCount(cells[position.dose]);
      if (cnt === null || dose === null) {
        errors.push({
          field: wardName + "." + kind,
          message: "数値として読み取れません: " + cells[position.cnt] + " / " + cells[position.dose]
        });
      }
      row[kind] = { cnt: cnt === null ? 0 : cnt, dose: dose === null ? 0 : dose };
    });
    return row;
  }

  var api = { decode: decode, parse: parse };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HospitalCsv = api;
  }
})(typeof window !== "undefined" ? window : this);
