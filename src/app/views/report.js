(function (root) {
  "use strict";

  var DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月〜日の表示順(添字は0=日〜6=土のcompute側インデックス)
  var WARD_NAMES_MEDS = ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"]; // 持参薬鑑別の対象病棟(うりずん南は対象外)

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function fmt1(value) {
    return value.toFixed(1);
  }

  function statGrid(report) {
    var stats = [
      [report.rx.opCnt, "外来処方箋 合計"],
      [report.rx.injCnt, "外来注射箋 合計"],
      [report.rx.winjCnt, "病棟注射箋 合計"],
      [report.rx.counsel, "服薬指導 合計"],
      [report.inquiries.total, "疑義照会 合計"],
      [report.wardMeds.totalCnt, "持参薬鑑別 合計"],
      [report.wardMeds.totalIpCnt, "持参薬1包化 合計"],
      [report.wardRx.total.total, "病棟処方箋 合計"],
      [report.dayCount, "入力日数"],
      [report.dayCount ? fmt1(report.avgTeikiPerDay) : "—", "病棟定期 平均（/日）"],
      [report.dayCount ? fmt1(report.avgWardRxPerDay) : "—", "病棟処方箋 平均（/日）"]
    ];
    return '<div class="stat-grid">' + stats.map(function (s) {
      return '<div class="stat-card"><div class="val">' + s[0] +
        '</div><div class="lbl2">' + s[1] + "</div></div>";
    }).join("") + "</div>";
  }

  function rxSection(report) {
    var r = report.rx;
    return card("処方箋受付 区分別合計", table(
      '<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td class=\"num\">" + r.opCnt + '</td><td class="num">' + r.opDose + "</td></tr>" +
      "<tr><td>外来注射箋</td><td class=\"num\">" + r.injCnt + '</td><td class="num">' + r.injDose + "</td></tr>" +
      "<tr><td>病棟注射箋</td><td class=\"num\">" + r.winjCnt + '</td><td class="num">' + r.winjDose + "</td></tr>" +
      '<tr class="total"><td>合計</td><td class="num">' + (r.opCnt + r.injCnt + r.winjCnt) +
      '</td><td class="num">' + (r.opDose + r.injDose + r.winjDose) + "</td></tr>"
    ));
  }

  function dailyBarSection(report) {
    var rows = report.dailyOp.map(function (d) {
      var label = d.date.slice(5) + "(" + window.Month.DOW_LABELS[d.dow] + ")";
      return '<div class="bar-wrap"><span class="bar-lbl">' + label + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + d.pct + '%"></div></div>' +
        '<span class="bar-val">' + d.total + "</span></div>";
    }).join("");
    return card("日別 処方箋件数（外来）", rows);
  }

  function inquiriesSection(report) {
    var inq = report.inquiries;
    var typeRows = inq.byType.map(function (t) {
      return "<tr><td>" + esc(t.type) + '</td><td class="num">' + t.count + "</td></tr>";
    }).join("");
    return card("疑義照会 区分別 ＋ 処方変更率",
      '<div class="grid2" style="gap:.75rem">' +
      table('<th>区分</th><th class="num">件数</th>',
        typeRows + '<tr class="total"><td>合計</td><td class="num">' + inq.total + "</td></tr>") +
      '<div>' +
      '<div style="font-size:13px;margin-bottom:.5rem">処方変更あり：<strong>' + inq.changed +
      '</strong>件 ／ 全体：<strong>' + inq.total + '</strong>件</div>' +
      '<div class="change-rate-wrap"><div class="change-rate-bar">' +
      '<div class="change-rate-fill" style="width:' + inq.changeRate + '%"></div></div>' +
      '<span class="change-rate-lbl">' + inq.changeRate + '%</span></div>' +
      '<div style="font-size:11px;color:#6B7280;margin-top:.5rem">処方変更率：疑義照会のうち処方変更につながった割合</div>' +
      "</div></div>");
  }

  function inquiriesByDoctorSection(report) {
    var inq = report.inquiries;
    var rows = inq.byDoctor.map(function (d) {
      return "<tr><td>" + esc(d.doctor) + '</td><td class="num">' + d.count +
        '</td><td class="num">' + d.changed + "</td></tr>";
    }).join("");
    if (inq.unassigned > 0) {
      rows += "<tr><td>未選択</td><td class=\"num\">" + inq.unassigned +
        '</td><td class="num">' + inq.unassignedChanged + "</td></tr>";
    }
    return card("疑義照会 医師別集計", table(
      '<th>医師</th><th class="num">件数</th><th class="num">処方変更</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + inq.total +
      '</td><td class="num">' + inq.changed + "</td></tr>"));
  }

  function shortagesSection(report) {
    var s = report.shortages;
    var rows = s.list.map(function (x) {
      return "<tr><td>" + esc(x.name) + '</td><td class="num">' + x.qty + "</td></tr>";
    }).join("");
    return card("欠品 薬剤別集計（計" + s.total + "件）",
      table('<th>薬品名</th><th class="num">数量</th>', rows), "card-red", "sec-title-red");
  }

  function doctorChangesSection(report) {
    var dc = report.doctorChanges;
    var rows = dc.list.map(function (x) {
      return "<tr><td>" + esc(x.doctor) + '</td><td class="num">' + x.count + "</td></tr>";
    }).join("");
    return card("処方変更 医師別集計（日次入力・計" + dc.total + "件）", table(
      '<th>医師</th><th class="num">処方変更件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + dc.total + "</td></tr>"));
  }

  function wardMedsSection(report) {
    var wm = report.wardMeds;
    var rows = wm.list.map(function (w) {
      return "<tr><td>" + esc(w.ward) + '</td><td class="num">' + w.cnt +
        '</td><td class="num">' + w.dose + '</td><td class="num">' + w.ipCnt +
        '</td><td class="num">' + w.ipDose + "</td></tr>";
    }).join("");
    return card("持参薬鑑別・1包化 病棟別", table(
      '<th>病棟</th><th class="num">持参薬件数</th><th class="num">持参薬剤数</th>' +
      '<th class="num">1包化件数</th><th class="num">1包化剤数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + wm.totalCnt +
      '</td><td class="num">' + wm.totalDose + '</td><td class="num">' + wm.totalIpCnt +
      '</td><td class="num">' + wm.totalIpDose + "</td></tr>"), "card-green", "sec-title-green");
  }

  function premixesSection(report) {
    var rows = report.premixes.list.map(function (p) {
      return "<tr><td>" + esc(p.drug) + '</td><td class="num">' + p.cnt + "</td></tr>";
    }).join("");
    return card("予製 薬剤別", table('<th>薬剤</th><th class="num">個数</th>', rows));
  }

  function wardRxSection(report) {
    var rows = report.wardRx.list.map(function (w) {
      return "<tr><td>" + esc(w.ward) + '</td><td class="num">' + w.teiki +
        '</td><td class="num">' + w.rinji + '</td><td class="num">' + w.taiin +
        '</td><td class="num">' + w.meds + '</td><td class="num">' + w.total + "</td></tr>";
    }).join("");
    var t = report.wardRx.total;
    return card("病棟処方箋 病棟別×区分別", table(
      '<th>病棟</th><th class="num">定期</th><th class="num">臨時</th>' +
      '<th class="num">退院</th><th class="num">持参薬</th><th class="num">合計</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + t.teiki +
      '</td><td class="num">' + t.rinji + '</td><td class="num">' + t.taiin +
      '</td><td class="num">' + t.meds + '</td><td class="num">' + t.total + "</td></tr>"),
      "card-green", "sec-title-green");
  }

  function dowSection(report) {
    var rows = DOW_ORDER.map(function (i) {
      var d = report.dow[i];
      var teikiAvg = d.days ? Math.round(d.teiki / d.days) : "—";
      var wardAvg = d.days ? Math.round(d.wardTotal / d.days) : "—";
      return "<tr><td>" + window.Month.DOW_LABELS[i] + '</td><td class="num">' + d.inj +
        '</td><td class="num">' + d.winj + '</td><td class="num">' + d.teiki +
        '</td><td class="num">' + d.rinji + '</td><td class="num">' + d.taiin +
        '</td><td class="num">' + d.wardTotal + '</td><td class="num">' + d.days +
        '</td><td class="num">' + teikiAvg + '</td><td class="num">' + wardAvg + "</td></tr>";
    }).join("");
    var totalTeikiAvg = report.dayCount ? Math.round(report.avgTeikiPerDay) : "—";
    var totalWardAvg = report.dayCount ? Math.round(report.avgWardRxPerDay) : "—";
    return card("曜日別 集計", '<div style="overflow-x:auto"><table class="tbl" style="min-width:680px">' +
      '<tr><th>曜日</th><th class="num">外来注射箋</th><th class="num">病棟注射箋</th>' +
      '<th class="num">病棟定期</th><th class="num">病棟臨時</th><th class="num">病棟退院</th>' +
      '<th class="num">病棟合計</th><th class="num">日数</th><th class="num">定期平均</th>' +
      '<th class="num">病棟平均</th></tr>' + rows +
      '<tr class="total"><td>合計</td><td class="num">' + report.rx.injCnt +
      '</td><td class="num">' + report.rx.winjCnt + '</td><td class="num">' + report.wardRx.total.teiki +
      '</td><td class="num">' + report.wardRx.total.rinji + '</td><td class="num">' + report.wardRx.total.taiin +
      '</td><td class="num">' + report.wardRx.total.total + '</td><td class="num">' + report.dayCount +
      '</td><td class="num">' + totalTeikiAvg + '</td><td class="num">' + totalWardAvg +
      "</td></tr></table></div>");
  }

  function weeksSection(report) {
    var body = report.weeks.map(function (week, wi) {
      if (!week || !week.length) return "";
      var rows = week.map(function (e) {
        // 持参薬鑑別はこのアプリ全体の規約どおり4病棟(うりずん南を除く)に絞って合計する。
        var wardMeds = window.DailyLog.wardMedsFrom(e.wardRx).filter(function (w) {
          return WARD_NAMES_MEDS.indexOf(w.ward) !== -1;
        });
        var wardMedsCnt = wardMeds.reduce(function (acc, w) { return acc + w.cnt; }, 0);
        var wardRxCnt = (e.wardRx || []).reduce(function (acc, w) { return acc + w.total.cnt; }, 0);
        return "<tr><td>" + e.date + "</td><td>" + window.Month.DOW_LABELS[localDow(e.date)] +
          '</td><td class="num">' + e.rxOpCnt + '</td><td class="num">' + e.rxInjCnt +
          '</td><td class="num">' + e.counsel + '</td><td class="num">' + (e.inquiries || []).length +
          '</td><td class="num">' + wardMedsCnt + '</td><td class="num">' + wardRxCnt + "</td></tr>";
      }).join("");
      return '<div style="margin-bottom:1rem"><div class="week-hdr">第' + (wi + 1) + "週（" +
        week[0].date + " 〜 " + week[week.length - 1].date + "）</div>" +
        table('<th>日付</th><th>曜日</th><th class="num">外来処方</th><th class="num">外来注射</th>' +
          '<th class="num">服薬指導</th><th class="num">疑義照会</th><th class="num">持参薬</th>' +
          '<th class="num">病棟処方</th>', rows) + "</div>";
    }).join("");
    return card("週別 詳細", body);
  }

  // src/model/monthly-report.js の localDow と同じ計算(依存を増やさないための小さな重複。
  // list.js/detail.js/main.js の esc() 重複と同じ、このプロジェクトの既存の流儀)。
  function localDow(dateStr) {
    var parts = dateStr.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
  }

  function packerSection(report) {
    var p = report.packer;
    return card("分包機メンテナンス 月間集計", table(
      '<th>項目</th><th class="num">錠剤分包機</th><th class="num">散剤分包機</th>',
      "<tr><td>分包紙</td><td class=\"num\">" + p.tab["分包紙"] + '</td><td class="num">' + p.san["分包紙"] + "</td></tr>" +
      "<tr><td>インク</td><td class=\"num\">" + p.tab["インク"] + '</td><td class="num">' + p.san["インク"] + "</td></tr>" +
      "<tr><td>清掃</td><td class=\"num\">" + p.tab["清掃"] + "回</td><td class=\"num\">" + p.san["清掃"] + "回</td></tr>"));
  }

  function meetingsSection(report) {
    if (!report.meetings.total) return "";
    var rows = report.meetings.list.map(function (m) {
      return "<tr><td>" + esc(m.type) + '</td><td class="num">' + m.dates.length + "回</td>" +
        '<td style="font-size:11px;color:#6B7280">' +
        m.dates.map(function (d) { return d.slice(5); }).join("、") + "</td></tr>";
    }).join("");
    return card("会議 種別集計（計" + report.meetings.total + "回）",
      table('<th>種別</th><th class="num">回数</th><th>開催日</th>', rows));
  }

  function mrVisitsSection(report) {
    if (!report.mrVisits.length) return "";
    var rows = report.mrVisits.map(function (m) {
      return '<tr><td style="font-weight:500">' + esc(m.company || "—") + "</td>" +
        '<td style="font-size:12px;color:#6B7280">' + esc(m.memo || "—") + "</td>" +
        '<td class="num" style="font-size:11px">' + m.date.slice(5) + "</td></tr>";
    }).join("");
    return card("MR訪問（計" + report.mrVisits.length + "件）", table(
      '<th style="width:140px">会社</th><th>内容</th><th style="width:60px" class="num">日付</th>', rows));
  }

  function contactsSection(report) {
    if (!report.contacts.total) return "";
    var rows = report.contacts.list.map(function (c) {
      return "<tr><td>" + esc(c.from) + '</td><td class="num">' + c.count + "件</td></tr>";
    }).join("");
    return card("問い合わせ 区分別集計（計" + report.contacts.total + "件）", table(
      '<th>区分</th><th class="num">件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + report.contacts.total + "件</td></tr>"));
  }

  function trainingsSection(report) {
    if (!report.trainings.totalCount) return "";
    var rows = report.trainings.list.map(function (t) {
      return '<tr><td style="font-size:11px">' + t.date + "</td><td>" + esc(t.theme || "—") +
        "</td><td>" + esc(t.lecturer || "—") + '</td><td class="num">' + (t.count || 0) + "名</td></tr>";
    }).join("");
    return card("研修会（" + report.trainings.totalCount + "回・参加合計" + report.trainings.totalPeople + "名）",
      table('<th>日付</th><th>テーマ</th><th style="width:120px">担当者</th>' +
        '<th style="width:70px" class="num">参加人数</th>', rows));
  }

  function authorsSection(report) {
    var rows = report.authors.map(function (a) {
      return "<tr><td>" + esc(a.author) + '</td><td class="num">' + a.count + "日</td>" +
        '<td style="font-size:11px;color:#6B7280">' + a.dates.join("、") + "</td></tr>";
    }).join("");
    return card("記入者別 集計", table('<th>記入者</th><th class="num">入力日数</th><th>入力日一覧</th>', rows));
  }

  function render(container, report) {
    if (!report.dayCount) {
      container.innerHTML = '<div class="no-data">この月のデータがありません<br>' +
        "<small>蓄積CSVを読み込んでからご確認ください</small></div>";
      return;
    }

    container.innerHTML =
      statGrid(report) +
      rxSection(report) +
      dailyBarSection(report) +
      inquiriesSection(report) +
      '<div class="grid2" style="gap:.75rem;margin-bottom:.75rem">' +
      inquiriesByDoctorSection(report) + shortagesSection(report) +
      "</div>" +
      doctorChangesSection(report) +
      '<div class="grid2" style="gap:.75rem;margin-bottom:.75rem">' +
      wardMedsSection(report) + premixesSection(report) +
      "</div>" +
      wardRxSection(report) +
      dowSection(report) +
      weeksSection(report) +
      packerSection(report) +
      meetingsSection(report) +
      mrVisitsSection(report) +
      contactsSection(report) +
      trainingsSection(report) +
      authorsSection(report);
  }

  root.ReportView = { render: render };
})(typeof window !== "undefined" ? window : this);
