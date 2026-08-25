(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("../model/daily-log.js")
    : root.DailyLog;

  var NUMBER_COLUMNS = ["rxOpCnt", "rxOpDose", "rxInjCnt", "rxInjDose", "counsel"];
  var JSON_COLUMNS = [
    "inquiries", "doctorChanges", "premixes", "drugs", "shortages",
    "meetings", "mrVisits", "contacts", "trainings",
    "packerData", "wardMeds", "wardRx", "winjData"
  ];

  var MASTER_KEYS = {
    "MEMBERS": "members",
    "CHECKLIST": "checklist",
    "PREMIX_MASTER": "premixes",
    "DOCTOR_MASTER": "doctors"
  };

  function splitCsvLine(line) {
    var cells = [];
    var current = "";
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  }

  function toNumber(raw) {
    var value = parseInt(raw, 10);
    return isNaN(value) ? 0 : value;
  }

  function parseJsonCell(raw, fallback) {
    if (raw === "" || raw === undefined) return fallback;
    try {
      var value = JSON.parse(raw);
      return (value === null) ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function parse(text) {
    var clean = text.replace(/^﻿/, "");
    var lines = clean.split(/\r?\n/);

    var header = null;
    var logs = [];
    var masters = { members: [], checklist: {}, premixes: [], doctors: [] };

    lines.forEach(function (line) {
      if (line.trim() === "") return;

      if (line.charAt(0) === "#") {
        var separator = line.indexOf(":");
        if (separator < 0) return;
        var name = line.slice(1, separator);
        var key = MASTER_KEYS[name];
        if (!key) return;
        var fallback = (key === "checklist") ? {} : [];
        masters[key] = parseJsonCell(line.slice(separator + 1), fallback);
        return;
      }

      var cells = splitCsvLine(line);
      if (!header) {
        header = cells;
        return;
      }

      var raw = {};
      header.forEach(function (column, index) {
        raw[column] = cells[index];
      });

      var record = {
        date: raw.date,
        author: raw.author || "",
        notes: raw.notes || ""
      };

      NUMBER_COLUMNS.forEach(function (column) {
        record[column] = toNumber(raw[column]);
      });

      JSON_COLUMNS.forEach(function (column) {
        var fallback = (column === "packerData") ? {} : [];
        record[column] = parseJsonCell(raw[column], fallback);
      });

      // wardMeds は wardRx から算出できるため保存しない
      delete record.wardMeds;

      logs.push(DailyLog.normalize(record));
    });

    logs.sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });

    return { logs: logs, masters: masters };
  }

  var api = { parse: parse, splitCsvLine: splitCsvLine };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AccumCsv = api;
  }
})(typeof window !== "undefined" ? window : this);
