(function (root) {
  "use strict";

  function esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function summarize(payload) {
    var parts = [];
    if (payload.rxOpDose !== undefined) parts.push("外来処方 " + payload.rxOpDose + "件");
    if (payload.counsel !== undefined) parts.push("薬管指導 " + payload.counsel + "件");
    ["inquiries", "mrVisits", "contacts", "drugs", "shortages", "meetings", "trainings"].forEach(function (k) {
      if (Array.isArray(payload[k]) && payload[k].length) {
        parts.push(k + " " + payload[k].length + "件");
      }
    });
    if (Array.isArray(payload.wardRx)) parts.push("病棟別処方");
    if (Array.isArray(payload.checklist) && payload.checklist.length) {
      parts.push("チェック " + payload.checklist.length + "件");
    }
    if (typeof payload.notes === "string" && payload.notes) parts.push("特記あり");
    return parts.length ? parts.join(" / ") : "(数値のみ)";
  }

  function rowHtml(d) {
    var labels = root.EntrySections.sectionLabelsOf(d.payload || {});
    var t = (d.createdAt || "").slice(11, 16);
    return '<div class="card" data-draft="' + esc(d.id) + '">' +
      '<div class="hint">' + esc(d.date) + " ・ 記入者:" + esc(d.author) + " ・ 送信 " + esc(t) +
      " ・ " + labels.map(function (x) { return "[" + esc(x) + "]"; }).join("") + "</div>" +
      '<button type="button" class="btn" data-draft-confirm>確認</button>' +
      '<div data-draft-detail hidden>' +
      '<div class="hint">' + esc(summarize(d.payload || {})) + "</div>" +
      '<button type="button" class="btn btn-success" data-draft-approve>承認して反映</button> ' +
      '<button type="button" class="btn" data-draft-reject>却下</button>' +
      "</div>" +
      '<div class="hint" data-draft-msg></div></div>';
  }

  function render(container, drafts, handlers) {
    if (!drafts.length) {
      container.innerHTML = '<div class="card"><div class="sec-title">モバイル下書きの承認</div>' +
        '<div class="empty">未承認の下書きはありません</div></div>';
      return;
    }
    container.innerHTML =
      '<div class="sec-title">モバイル下書きの承認</div>' +
      drafts.map(rowHtml).join("");

    container.onclick = function (event) {
      var card = event.target.closest("[data-draft]");
      if (!card) return;
      var id = card.getAttribute("data-draft");

      if (event.target.closest("[data-draft-confirm]")) {
        var box = card.querySelector("[data-draft-detail]");
        box.hidden = !box.hidden;
        return;
      }
      if (event.target.closest("[data-draft-approve]")) {
        card.querySelector("[data-draft-msg]").textContent = "反映中…";
        handlers.onApprove(id);
        return;
      }
      if (event.target.closest("[data-draft-reject]")) {
        if (window.confirm("この下書きを却下(削除)しますか？")) handlers.onReject(id);
      }
    };
  }

  root.DraftsView = { render: render };
})(typeof window !== "undefined" ? window : this);
