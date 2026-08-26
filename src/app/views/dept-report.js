(function (root) {
  "use strict";

  var MO_LABELS = {
    4: "４月", 5: "５月", 6: "６月", 7: "７月", 8: "８月", 9: "９月",
    10: "１０月", 11: "１１月", 12: "１２月", 1: "１月", 2: "２月", 3: "３月"
  };

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function numFmt(v) {
    return v === 0 ? "0" : v.toLocaleString();
  }

  function fmtAvg(v) {
    return v === null || v === undefined ? "—" : v.toFixed(2);
  }

  function todayLabel() {
    var now = new Date();
    return now.getFullYear() + "年" + (now.getMonth() + 1) + "月" + now.getDate() + "日";
  }

  function wardRow(r) {
    return "<td>" + numFmt(r.teikiCnt) + "</td><td>" + numFmt(r.teikiDose) + "</td>" +
      "<td>" + numFmt(r.rinjiCnt) + "</td><td>" + numFmt(r.rinjiDose) + "</td>" +
      "<td>" + numFmt(r.taiinCnt) + "</td><td>" + numFmt(r.taiinDose) + "</td>" +
      "<td>" + numFmt(r.totalCnt) + "</td><td>" + numFmt(r.totalDose) + "</td>" +
      "<td>" + numFmt(r.winjCnt) + "</td><td>" + numFmt(r.winjDose) + "</td><td>" + numFmt(r.days) + "</td>";
  }

  function wardAvgRow(r) {
    return '<td class="avg">' + fmtAvg(r.teikiCnt) + '</td><td class="avg">' + fmtAvg(r.teikiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.rinjiCnt) + '</td><td class="avg">' + fmtAvg(r.rinjiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.taiinCnt) + '</td><td class="avg">' + fmtAvg(r.taiinDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.totalCnt) + '</td><td class="avg">' + fmtAvg(r.totalDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.winjCnt) + '</td><td class="avg">' + fmtAvg(r.winjDose) + "</td><td></td>";
  }

  function wardHead() {
    return '<tr><th class="left" rowspan="2">月</th><th colspan="2">定期処方箋</th><th colspan="2">臨時処方箋</th>' +
      '<th colspan="2">退院処方箋</th><th colspan="2">処方箋（合計）</th><th colspan="2">注射処方箋</th>' +
      '<th rowspan="2">実日数</th></tr>' +
      "<tr><th>枚数</th><th>調剤件数</th><th>枚数</th><th>調剤件数</th><th>枚数</th><th>調剤件数</th>" +
      "<th>枚数</th><th>調剤件数</th><th>枚数</th><th>調剤件数</th></tr>";
  }

  function wardSection(report) {
    var rows = report.months.map(function (r) {
      return '<tr><td class="lft">' + MO_LABELS[r.month] + "</td>" + wardRow(r) + "</tr>";
    }).join("");
    var t = report.totals;
    return '<div class="report-section"><div class="report-section-title">●病棟集計</div>' +
      '<div class="tbl-wrap"><table class="report-tbl"><thead>' + wardHead() + "</thead><tbody>" + rows +
      '<tr class="grandtotal"><td class="lft">累計</td>' +
      "<td>" + numFmt(t.teikiCnt) + "</td><td>" + numFmt(t.teikiDose) + "</td>" +
      "<td>" + numFmt(t.rinjiCnt) + "</td><td>" + numFmt(t.rinjiDose) + "</td>" +
      "<td>" + numFmt(t.taiinCnt) + "</td><td>" + numFmt(t.taiinDose) + "</td>" +
      "<td>" + numFmt(t.totalCnt) + "</td><td>" + numFmt(t.totalDose) + "</td>" +
      "<td>" + numFmt(t.winjCnt) + "</td><td>" + numFmt(t.winjDose) + "</td>" +
      "<td>" + numFmt(t.days) + "</td></tr>" +
      "</tbody></table></div></div>";
  }

  function wardAvgSection(report) {
    var rows = report.monthAverages.map(function (r) {
      return '<tr><td class="lft">' + MO_LABELS[r.month] + "</td>" + wardAvgRow(r) + "</tr>";
    }).join("");
    var a = report.averages;
    return '<div class="report-section"><div class="report-section-title">●病棟１日平均</div>' +
      '<div class="tbl-wrap"><table class="report-tbl"><thead>' + wardHead() + "</thead><tbody>" + rows +
      '<tr class="grandtotal"><td class="lft">平均</td>' +
      '<td class="avg">' + fmtAvg(a.teikiCnt) + '</td><td class="avg">' + fmtAvg(a.teikiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.rinjiCnt) + '</td><td class="avg">' + fmtAvg(a.rinjiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.taiinCnt) + '</td><td class="avg">' + fmtAvg(a.taiinDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.totalCnt) + '</td><td class="avg">' + fmtAvg(a.totalDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.winjCnt) + '</td><td class="avg">' + fmtAvg(a.winjDose) + "</td><td></td></tr>" +
      "</tbody></table></div></div>";
  }

  function outpatientSection(report) {
    var rows = report.months.map(function (r, i) {
      var avg = report.monthAverages[i];
      return '<tr><td class="lft" style="white-space:nowrap">' + MO_LABELS[r.month] + "</td>" +
        "<td>" + numFmt(r.injCnt) + '</td><td class="avg">' + fmtAvg(avg.injCnt) + "</td>" +
        "<td>" + numFmt(r.injDose) + '</td><td class="avg">' + fmtAvg(avg.injDose) + "</td>" +
        "<td>" + numFmt(r.opCnt) + '</td><td class="avg">' + fmtAvg(avg.opCnt) + "</td>" +
        "<td>" + numFmt(r.opDose) + '</td><td class="avg">' + fmtAvg(avg.opDose) + "</td></tr>";
    }).join("");
    var t = report.totals, a = report.averages;
    return '<div class="report-section" style="margin-bottom:0"><div class="report-section-title">●外来集計</div>' +
      '<div class="tbl-wrap"><table class="report-tbl" style="font-size:11px"><thead>' +
      '<tr><th class="left" rowspan="2" style="width:30px;white-space:nowrap">月</th>' +
      '<th colspan="4">外来注射処方箋</th><th colspan="4">外来処方箋（臨時）</th></tr>' +
      "<tr><th>枚数</th><th>枚数平均</th><th>件数</th><th>件数平均</th>" +
      "<th>枚数</th><th>枚数平均</th><th>件数</th><th>件数平均</th></tr></thead>" +
      "<tbody>" + rows +
      '<tr class="grandtotal"><td class="lft" style="white-space:nowrap">累計</td>' +
      "<td>" + numFmt(t.injCnt) + '</td><td class="avg">' + fmtAvg(a.injCnt) + "</td>" +
      "<td>" + numFmt(t.injDose) + '</td><td class="avg">' + fmtAvg(a.injDose) + "</td>" +
      "<td>" + numFmt(t.opCnt) + '</td><td class="avg">' + fmtAvg(a.opCnt) + "</td>" +
      "<td>" + numFmt(t.opDose) + '</td><td class="avg">' + fmtAvg(a.opDose) + "</td></tr>" +
      "</tbody></table></div></div>";
  }

  function otherSection(report) {
    var rows = report.months.map(function (r) {
      return '<tr><td class="lft" style="white-space:nowrap">' + MO_LABELS[r.month] + "</td>" +
        "<td>" + numFmt(r.wardMedsCnt) + "</td><td>" + numFmt(r.ippokaCnt) + "</td>" +
        "<td>" + numFmt(r.counsel) + "</td></tr>";
    }).join("");
    var t = report.totals;
    return '<div class="report-section" style="margin-bottom:0"><div class="report-section-title">●その他集計</div>' +
      '<div class="tbl-wrap"><table class="report-tbl" style="font-size:11px"><thead>' +
      '<tr><th class="left" style="white-space:nowrap">月</th><th>持参薬<br>鑑別件数</th>' +
      "<th>持参薬<br>１包化</th><th>薬剤管理<br>指導件数</th></tr></thead>" +
      "<tbody>" + rows +
      '<tr class="grandtotal"><td class="lft" style="white-space:nowrap">累計</td>' +
      "<td>" + numFmt(t.wardMedsCnt) + "</td><td>" + numFmt(t.ippokaCnt) + "</td>" +
      "<td>" + numFmt(t.counsel) + "</td></tr>" +
      "</tbody></table></div></div>";
  }

  function render(container, report, meta) {
    container.innerHTML =
      '<div class="report-wrap" id="print-area">' +
      '<div class="report-title">部門長会議報告書</div>' +
      '<div class="report-subtitle">' + report.fiscalYear + "年度　薬剤課</div>" +
      '<div class="report-meta"><span>部署名：薬剤課</span><span>報告者：' + esc(meta.author) +
      "</span><span>報告日：" + todayLabel() + "</span></div>" +
      wardSection(report) +
      wardAvgSection(report) +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:1.5rem;margin-top:1rem;align-items:start">' +
      outpatientSection(report) + otherSection(report) +
      "</div></div>";
  }

  root.DeptReportView = { render: render };
})(typeof window !== "undefined" ? window : this);
