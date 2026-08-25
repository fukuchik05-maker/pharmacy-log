(function (root) {
  "use strict";

  var WARD_NAMES_MEDS = ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"];

  var DRUG_LABELS = {
    adopt: { label: "採用", badge: "b-blue" },
    remove: { label: "削除", badge: "b-red" },
    expire: { label: "期限切れ", badge: "b-amber" },
    "return": { label: "返品", badge: "b-amber" },
    maintenance: { label: "メンテナンス", badge: "b-teal" }
  };

  var PACKER_NUM_ITEMS = ["分包紙", "インク"];
  var PACKER_CHK_ITEMS = ["清掃"];

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sum(list, pick) {
    return (list || []).reduce(function (acc, item) { return acc + (pick(item) || 0); }, 0);
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function statGrid(log, meds) {
    var stats = [
      [log.rxOpCnt || 0, "外来処方箋（枚）"],
      [log.rxInjCnt || 0, "外来注射箋（枚）"],
      [sum(log.winjData, function (w) { return w.cnt; }), "病棟注射箋（枚）"],
      [log.counsel || 0, "服薬指導"],
      [(log.inquiries || []).length, "疑義照会"],
      [sum(meds, function (w) { return w.cnt; }), "持参薬鑑別"],
      [sum(meds, function (w) { return w.ipCnt; }), "持参薬1包化"],
      [sum(log.wardRx, function (w) { return w.total.cnt; }), "病棟処方箋（件）"]
    ];
    return '<div class="stat-grid">' + stats.map(function (s) {
      return '<div class="stat-card"><div class="val">' + s[0] +
        '</div><div class="lbl2">' + s[1] + "</div></div>";
    }).join("") + "</div>";
  }

  function rxSection(log) {
    return card("処方箋受付", table(
      '<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      '<tr><td>外来処方箋</td><td class="num">' + (log.rxOpCnt || 0) +
      '</td><td class="num">' + (log.rxOpDose || 0) + "</td></tr>" +
      '<tr><td>外来注射箋</td><td class="num">' + (log.rxInjCnt || 0) +
      '</td><td class="num">' + (log.rxInjDose || 0) + "</td></tr>" +
      '<tr class="total"><td>外来合計</td><td class="num">' +
      ((log.rxOpCnt || 0) + (log.rxInjCnt || 0)) + '</td><td class="num">' +
      ((log.rxOpDose || 0) + (log.rxInjDose || 0)) + "</td></tr>"
    ));
  }

  function winjSection(log) {
    var rows = (log.winjData || []).map(function (w) {
      return "<tr><td>" + esc(w.ward) + '</td><td class="num">' + (w.cnt || 0) +
        '</td><td class="num">' + (w.dose || 0) + "</td></tr>";
    }).join("");
    var totalCnt = sum(log.winjData, function (w) { return w.cnt; });
    var totalDose = sum(log.winjData, function (w) { return w.dose; });
    return card("病棟注射箋 病棟別", table(
      '<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + totalCnt +
      '</td><td class="num">' + totalDose + "</td></tr>"
    ));
  }

  function inquiriesSection(log) {
    var list = log.inquiries || [];
    if (!list.length) return "";
    var changed = list.filter(function (q) { return q.changed; }).length;
    var rows = list.map(function (q) {
      return '<tr><td><span class="badge b-purple">' + esc(q.type) + "</span></td>" +
        '<td style="font-size:12px">' + esc(q.doctor || "—") + "</td>" +
        '<td style="font-size:12px;color:#6B7280;white-space:pre-wrap">' + esc(q.memo || "—") + "</td>" +
        '<td style="text-align:center">' + (q.changed
          ? '<span class="badge b-red">あり</span>'
          : '<span class="badge b-gray">なし</span>') + "</td></tr>";
    }).join("");
    return card("疑義照会（" + list.length + "件・処方変更" + changed + "件）", table(
      '<th style="width:90px">区分</th><th style="width:100px">医師</th><th>内容</th>' +
      '<th style="width:70px;text-align:center">処方変更</th>', rows));
  }

  function doctorChangesSection(log) {
    var list = (log.doctorChanges || []).filter(function (x) { return x.cnt > 0; });
    if (!list.length) return "";
    var total = sum(list, function (x) { return x.cnt; });
    var rows = list.map(function (x) {
      return "<tr><td>" + esc(x.doctor) + '</td><td class="num">' + x.cnt + "</td></tr>";
    }).join("");
    return card("処方変更（医師別・合計" + total + "件）", table(
      '<th>医師</th><th class="num">処方変更件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + total + "</td></tr>"));
  }

  function medsSection(meds) {
    var byWard = {};
    meds.forEach(function (m) { byWard[m.ward] = m; });
    var rows = WARD_NAMES_MEDS.map(function (name) {
      var w = byWard[name] || { cnt: 0, dose: 0, ipCnt: 0, ipDose: 0 };
      return "<tr><td>" + esc(name) + '</td><td class="num">' + w.cnt +
        '</td><td class="num">' + w.dose + '</td><td class="num">' + w.ipCnt +
        '</td><td class="num">' + w.ipDose + "</td></tr>";
    }).join("");
    var shown = WARD_NAMES_MEDS.map(function (n) { return byWard[n] || {}; });
    return card("持参薬鑑別 病棟別", table(
      '<th>病棟</th><th class="num">持参薬件数</th><th class="num">持参薬剤数</th>' +
      '<th class="num">1包化件数</th><th class="num">1包化剤数</th>',
      rows + '<tr class="total"><td>合計</td>' +
      '<td class="num">' + sum(shown, function (w) { return w.cnt; }) + "</td>" +
      '<td class="num">' + sum(shown, function (w) { return w.dose; }) + "</td>" +
      '<td class="num">' + sum(shown, function (w) { return w.ipCnt; }) + "</td>" +
      '<td class="num">' + sum(shown, function (w) { return w.ipDose; }) + "</td></tr>"
    ), "card-green", "sec-title-green");
  }

  function wardRxSection(log) {
    if (!log.wardRx || !log.wardRx.length) return "";
    var rows = log.wardRx.map(function (w) {
      return "<tr><td>" + esc(w.name) + '</td><td class="num">' + w.teiki.cnt +
        '</td><td class="num">' + w.rinji.cnt + '</td><td class="num">' + w.taiin.cnt +
        '</td><td class="num">' + w.meds.cnt + '</td><td class="num">' + w.total.cnt + "</td></tr>";
    }).join("");
    return card("病棟処方箋", table(
      '<th>病棟</th><th class="num">定期</th><th class="num">臨時</th>' +
      '<th class="num">退院</th><th class="num">持参薬</th><th class="num">合計</th>', rows),
      "card-green", "sec-title-green");
  }

  function premixSection(log) {
    var list = (log.premixes || []).filter(function (p) { return p.cnt > 0; });
    if (!list.length) return "";
    return card("予製", table('<th>薬剤</th><th class="num">個数</th>',
      list.map(function (p) {
        return "<tr><td>" + esc(p.drug) + '</td><td class="num">' + p.cnt + "</td></tr>";
      }).join("")));
  }

  function drugsSection(log) {
    if (!log.drugs || !log.drugs.length) return "";
    return card("薬剤管理", table('<th style="width:90px">区分</th><th>薬品名</th>',
      log.drugs.map(function (g) {
        var t = DRUG_LABELS[g.type] || { label: g.type, badge: "b-gray" };
        return '<tr><td><span class="badge ' + t.badge + '">' + esc(t.label) +
          "</span></td><td>" + esc(g.name || "—") + "</td></tr>";
      }).join("")));
  }

  function shortagesSection(log) {
    if (!log.shortages || !log.shortages.length) return "";
    return card("欠品", table('<th>薬品名</th><th class="num">数量</th>',
      log.shortages.map(function (s) {
        return "<tr><td>" + esc(s.name || "—") + '</td><td class="num">' + (s.qty || 0) + "</td></tr>";
      }).join("")), "card-red", "sec-title-red");
  }

  function packerSection(log) {
    var pd = log.packerData || {};
    var blocks = ["tab", "san"].map(function (type) {
      var unit = pd[type] || {};
      var lines = [];
      PACKER_NUM_ITEMS.forEach(function (item) {
        if ((unit[item] || 0) > 0) {
          lines.push('<div style="font-size:12px;color:#185FA5">● ' + item + "：" + unit[item] + "</div>");
        }
      });
      PACKER_CHK_ITEMS.forEach(function (item) {
        if (unit[item]) {
          lines.push('<div style="font-size:12px;color:#059669">✓ ' + item + "</div>");
        }
      });
      if (!lines.length) return "";
      var label = type === "tab" ? "錠剤分包機" : "散剤分包機";
      return '<div><div style="font-size:12px;font-weight:600;margin-bottom:4px">' +
        label + "</div>" + lines.join("") + "</div>";
    }).filter(Boolean);

    if (!blocks.length) return "";
    return card("分包機メンテナンス",
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">' + blocks.join("") + "</div>");
  }

  function meetingsSection(log) {
    if (!log.meetings || !log.meetings.length) return "";
    return card("会議", '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      log.meetings.map(function (m) {
        return '<span class="badge b-blue">' + esc(m.type) + "</span>";
      }).join("") + "</div>");
  }

  function mrVisitsSection(log) {
    if (!log.mrVisits || !log.mrVisits.length) return "";
    return card("MR訪問", table('<th style="width:140px">会社</th><th>内容</th>',
      log.mrVisits.map(function (m) {
        return '<tr><td style="font-weight:500">' + esc(m.company || "—") + "</td>" +
          '<td style="font-size:12px;color:#6B7280;white-space:pre-wrap">' + esc(m.memo || "—") + "</td></tr>";
      }).join("")));
  }

  function contactsSection(log) {
    if (!log.contacts || !log.contacts.length) return "";
    return card("問い合わせ（" + log.contacts.length + "件）",
      table('<th style="width:80px">区分</th><th>内容</th>',
        log.contacts.map(function (c) {
          return '<tr><td><span class="badge b-amber">' + esc(c.from) + "</span></td>" +
            '<td style="font-size:12px;color:#6B7280;white-space:pre-wrap">' + esc(c.memo || "—") + "</td></tr>";
        }).join("")));
  }

  function trainingsSection(log) {
    if (!log.trainings || !log.trainings.length) return "";
    return card("研修会（" + log.trainings.length + "件）", table(
      '<th>テーマ</th><th style="width:120px">担当者</th><th style="width:70px" class="num">参加人数</th>',
      log.trainings.map(function (t) {
        return "<tr><td>" + esc(t.theme || "—") + "</td><td>" + esc(t.lecturer || "—") +
          '</td><td class="num">' + (t.count || 0) + "名</td></tr>";
      }).join("")));
  }

  function notesSection(log) {
    if (!log.notes) return "";
    return card("特記事項",
      '<div style="font-size:13px;white-space:pre-wrap;color:#4B5563">' + esc(log.notes) + "</div>");
  }

  function render(container, log, onBack) {
    var meds = root.DailyLog.wardMedsFrom(log.wardRx);

    container.innerHTML =
      '<div class="detail-head">' +
      '<button class="btn" id="detailBackBtn">◀ 一覧へ戻る</button>' +
      '<span class="detail-title">' + esc(log.date) + "</span></div>" +
      statGrid(log, meds) +
      rxSection(log) +
      winjSection(log) +
      inquiriesSection(log) +
      doctorChangesSection(log) +
      medsSection(meds) +
      wardRxSection(log) +
      premixSection(log) +
      drugsSection(log) +
      shortagesSection(log) +
      packerSection(log) +
      meetingsSection(log) +
      mrVisitsSection(log) +
      contactsSection(log) +
      trainingsSection(log) +
      notesSection(log) +
      '<div class="author-line">記入者：' + esc(log.author) + "</div>";

    container.querySelector("#detailBackBtn").addEventListener("click", onBack);
  }

  root.DetailView = { render: render };
})(typeof window !== "undefined" ? window : this);
