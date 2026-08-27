(function (root) {
  "use strict";

  var WARDS = root.DailyLog.WARDS;
  var INQ_TYPES = root.DailyLog.INQ_TYPES;
  var DRUG_TYPES = root.DailyLog.DRUG_TYPES;
  var MEETING_TYPES = root.DailyLog.MEETING_TYPES;
  var CONTACT_FROM = root.DailyLog.CONTACT_FROM;

  var DRUG_LABELS = {
    adopt: "採用", remove: "削除", expire: "期限切れ", "return": "返品", maintenance: "メンテナンス"
  };

  var WARDRX_KINDS = root.DailyLog.WARDRX_INPUT_KINDS;

  var PACKER_UNITS = [
    { key: "tab", label: "錠剤分包機" },
    { key: "san", label: "散剤分包機" }
  ];

  // 行の追加・削除ができる明細系セクションの定義。
  // 各フィールドの type が select/checkbox/number/text のいずれかで、
  // 描画(fieldInputHtml)と収集(collectListSection)の両方がこの定義だけを見て動く。
  var LIST_SECTIONS = {
    inquiries: {
      title: "疑義照会",
      fields: [
        { field: "type", type: "select", options: INQ_TYPES, label: "区分" },
        { field: "doctor", type: "text", label: "医師" },
        { field: "memo", type: "text", label: "内容" },
        { field: "changed", type: "checkbox", label: "処方変更" }
      ]
    },
    mrVisits: {
      title: "MR訪問",
      fields: [
        { field: "company", type: "text", label: "会社" },
        { field: "memo", type: "text", label: "内容" }
      ]
    },
    contacts: {
      title: "問い合わせ",
      fields: [
        { field: "from", type: "select", options: CONTACT_FROM, label: "区分" },
        { field: "memo", type: "text", label: "内容" }
      ]
    },
    drugs: {
      title: "薬剤管理",
      fields: [
        { field: "type", type: "select", options: DRUG_TYPES, optionLabels: DRUG_LABELS, label: "区分" },
        { field: "name", type: "text", label: "薬品名" }
      ]
    },
    shortages: {
      title: "欠品",
      fields: [
        { field: "name", type: "text", label: "薬品名" },
        { field: "qty", type: "number", label: "数量" }
      ]
    },
    meetings: {
      title: "会議",
      fields: [
        { field: "type", type: "select", options: MEETING_TYPES, label: "種別" }
      ]
    },
    trainings: {
      title: "研修会",
      fields: [
        { field: "theme", type: "text", label: "テーマ" },
        { field: "lecturer", type: "text", label: "担当者" },
        { field: "count", type: "number", label: "参加人数" }
      ]
    }
  };

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function numInput(field, value) {
    return '<input type="number" min="0" step="1" class="num-input" data-field="' +
      field + '" value="' + num(value) + '">';
  }

  // === 固定構造セクション(病棟・区分の集合が常に一定で、行の追加・削除が無いもの) ===

  function rxSection(log) {
    return card("処方箋受付", table(
      '<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td>" + numInput("rxOpCnt", log.rxOpCnt) +
      "</td><td>" + numInput("rxOpDose", log.rxOpDose) + "</td></tr>" +
      "<tr><td>外来注射箋</td><td>" + numInput("rxInjCnt", log.rxInjCnt) +
      "</td><td>" + numInput("rxInjDose", log.rxInjDose) + "</td></tr>"
    ) + '<div class="edit-row"><label>薬剤管理指導（件）</label>' +
      numInput("counsel", log.counsel) + "</div>");
  }

  function winjSection(log) {
    var byWard = {};
    (log.winjData || []).forEach(function (w) { byWard[w.ward] = w; });
    var rows = WARDS.map(function (ward) {
      var w = byWard[ward] || { cnt: 0, dose: 0 };
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="cnt" value="' + num(w.cnt) + '"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="dose" value="' + num(w.dose) + '"></td></tr>';
    }).join("");
    return card("病棟注射箋 病棟別", table(
      '<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows));
  }

  function wardRxKindBlock(byName, kind) {
    var rows = WARDS.map(function (ward) {
      var w = byName[ward] || {};
      var pair = w[kind.key] || { cnt: 0, dose: 0 };
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="cnt" value="' + num(pair.cnt) + '"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="dose" value="' + num(pair.dose) + '"></td></tr>';
    }).join("");
    return '<div style="margin-bottom:.75rem">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px">' + esc(kind.label) + "</div>" +
      table('<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows) + "</div>";
  }

  function wardRxSection(log) {
    var byName = {};
    (log.wardRx || []).forEach(function (w) { byName[w.name] = w; });
    var body = WARDRX_KINDS.map(function (kind) { return wardRxKindBlock(byName, kind); }).join("") +
      '<div class="hint">合計は保存時に自動計算されます。</div>';
    return card("病棟処方箋", body, "card-green", "sec-title-green");
  }

  function packerSection(log) {
    var pd = log.packerData || {};
    var blocks = PACKER_UNITS.map(function (unit) {
      var u = pd[unit.key] || {};
      return '<div><div style="font-size:12px;font-weight:600;margin-bottom:4px">' + unit.label + "</div>" +
        '<div class="edit-row"><label>分包紙</label>' +
        '<input type="number" min="0" step="1" class="num-input" data-packer-unit="' + unit.key +
        '" data-packer-item="分包紙" value="' + num(u["分包紙"]) + '"></div>' +
        '<div class="edit-row"><label>インク</label>' +
        '<input type="number" min="0" step="1" class="num-input" data-packer-unit="' + unit.key +
        '" data-packer-item="インク" value="' + num(u["インク"]) + '"></div>' +
        '<div class="edit-row"><label><input type="checkbox" data-packer-unit="' + unit.key +
        '" data-packer-item="清掃"' + (u["清掃"] ? " checked" : "") + "> 清掃</label></div></div>";
    }).join("");
    return card("分包機メンテナンス",
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">' + blocks + "</div>");
  }

  function premixSection(log) {
    var list = log.premixes || [];
    if (!list.length) return "";
    var rows = list.map(function (p, index) {
      return "<tr><td>" + esc(p.drug) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-premix-index="' + index +
        '" value="' + num(p.cnt) + '"></td></tr>';
    }).join("");
    return card("予製", table('<th>薬剤</th><th class="num">個数</th>', rows));
  }

  function doctorChangesSection(log) {
    var list = log.doctorChanges || [];
    if (!list.length) return "";
    var rows = list.map(function (x, index) {
      return "<tr><td>" + esc(x.doctor) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-doctorchange-index="' + index +
        '" value="' + num(x.cnt) + '"></td></tr>';
    }).join("");
    return card("処方変更（医師別）", table('<th>医師</th><th class="num">処方変更件数</th>', rows));
  }

  function notesSection(log) {
    return card("特記事項",
      '<textarea class="text-input textarea-input" data-field="notes" rows="3">' +
      esc(log.notes) + "</textarea>");
  }

  // === 明細系(行の追加・削除ができる)セクション ===

  function fieldInputHtml(spec, value) {
    if (spec.type === "select") {
      var opts = spec.options.map(function (opt) {
        var label = (spec.optionLabels && spec.optionLabels[opt]) || opt;
        return '<option value="' + esc(opt) + '"' + (opt === value ? " selected" : "") +
          ">" + esc(label) + "</option>";
      }).join("");
      return '<select class="text-input" data-field="' + spec.field + '">' + opts + "</select>";
    }
    if (spec.type === "checkbox") {
      return '<input type="checkbox" data-field="' + spec.field + '"' + (value ? " checked" : "") + ">";
    }
    if (spec.type === "number") {
      return '<input type="number" min="0" step="1" class="num-input" data-field="' +
        spec.field + '" value="' + num(value) + '">';
    }
    return '<input type="text" class="text-input" data-field="' + spec.field + '" value="' + esc(value) + '">';
  }

  function listRowHtml(fields, item) {
    var cells = fields.map(function (spec) {
      return "<td>" + fieldInputHtml(spec, item ? item[spec.field] : undefined) + "</td>";
    }).join("");
    return "<tr data-row>" + cells +
      '<td><button type="button" class="btn btn-row-remove" data-remove-row>削除</button></td></tr>';
  }

  function listSectionHtml(sectionKey, list) {
    var def = LIST_SECTIONS[sectionKey];
    var head = def.fields.map(function (f) { return "<th>" + f.label + "</th>"; }).join("") + "<th></th>";
    var rows = (list || []).map(function (item) { return listRowHtml(def.fields, item); }).join("");
    var body = '<div class="tbl-wrap"><table class="tbl" data-section="' + sectionKey + '">' +
      "<thead><tr>" + head + "</tr></thead><tbody data-rows>" + rows + "</tbody></table></div>" +
      '<button type="button" class="btn" data-add-row="' + sectionKey + '">+ 行追加</button>';
    return card(def.title, body);
  }

  function collectListSection(container, sectionKey) {
    var def = LIST_SECTIONS[sectionKey];
    var tableEl = container.querySelector('table[data-section="' + sectionKey + '"]');
    var rows = tableEl.querySelectorAll("[data-row]");
    var items = [];
    rows.forEach(function (tr) {
      var item = {};
      def.fields.forEach(function (spec) {
        var input = tr.querySelector('[data-field="' + spec.field + '"]');
        if (spec.type === "checkbox") item[spec.field] = input.checked;
        else if (spec.type === "number") item[spec.field] = num(input.value);
        else item[spec.field] = input.value;
      });
      items.push(item);
    });
    return items;
  }

  // 「+ 行追加」「削除」は行数が動的に変わるため、イベント委譲で処理する。
  // body には render() のたびに作り直される #editBody を渡す(詳細は render() 側のコメント参照)。
  function attachListEvents(body) {
    body.addEventListener("click", function (event) {
      var addBtn = event.target.closest("[data-add-row]");
      if (addBtn) {
        var sectionKey = addBtn.getAttribute("data-add-row");
        var def = LIST_SECTIONS[sectionKey];
        var tbody = addBtn.closest(".card").querySelector("[data-rows]");
        tbody.insertAdjacentHTML("beforeend", listRowHtml(def.fields, null));
        return;
      }
      var removeBtn = event.target.closest("[data-remove-row]");
      if (removeBtn) {
        removeBtn.closest("tr").remove();
      }
    });
  }

  // === フォーム値の収集 ===
  // wardRx は cnt のみ編集可能。dose・ippoka は詳細画面にも表示されないため、
  // 編集開始時点の値(original、normalize済み)からそのまま引き継ぐ。
  function collect(container, original) {
    return {
      date: original.date,
      author: original.author,
      rxOpCnt: num(container.querySelector('[data-field="rxOpCnt"]').value),
      rxOpDose: num(container.querySelector('[data-field="rxOpDose"]').value),
      rxInjCnt: num(container.querySelector('[data-field="rxInjCnt"]').value),
      rxInjDose: num(container.querySelector('[data-field="rxInjDose"]').value),
      counsel: num(container.querySelector('[data-field="counsel"]').value),
      notes: container.querySelector('[data-field="notes"]').value,
      winjData: WARDS.map(function (ward) {
        return {
          ward: ward,
          cnt: num(container.querySelector(
            '[data-winj-ward="' + ward + '"][data-winj-kind="cnt"]').value),
          dose: num(container.querySelector(
            '[data-winj-ward="' + ward + '"][data-winj-kind="dose"]').value)
        };
      }),
      wardRx: WARDS.map(function (ward) {
        var row = { name: ward };
        var t = { cnt: 0, dose: 0 };
        WARDRX_KINDS.forEach(function (kind) {
          var cnt = num(container.querySelector(
            '[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value);
          var dose = num(container.querySelector(
            '[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value);
          row[kind.key] = { cnt: cnt, dose: dose };
          t.cnt += cnt;
          t.dose += dose;
        });
        row.total = t;
        return row;
      }),
      packerData: {
        tab: {
          "分包紙": num(container.querySelector(
            '[data-packer-unit="tab"][data-packer-item="分包紙"]').value),
          "インク": num(container.querySelector(
            '[data-packer-unit="tab"][data-packer-item="インク"]').value),
          "清掃": container.querySelector(
            '[data-packer-unit="tab"][data-packer-item="清掃"]').checked
        },
        san: {
          "分包紙": num(container.querySelector(
            '[data-packer-unit="san"][data-packer-item="分包紙"]').value),
          "インク": num(container.querySelector(
            '[data-packer-unit="san"][data-packer-item="インク"]').value),
          "清掃": container.querySelector(
            '[data-packer-unit="san"][data-packer-item="清掃"]').checked
        }
      },
      premixes: (original.premixes || []).map(function (p, index) {
        var input = container.querySelector('[data-premix-index="' + index + '"]');
        return { drug: p.drug, cnt: num(input.value) };
      }),
      doctorChanges: (original.doctorChanges || []).map(function (x, index) {
        var input = container.querySelector('[data-doctorchange-index="' + index + '"]');
        return { doctor: x.doctor, cnt: num(input.value) };
      }),
      inquiries: collectListSection(container, "inquiries"),
      mrVisits: collectListSection(container, "mrVisits"),
      contacts: collectListSection(container, "contacts"),
      drugs: collectListSection(container, "drugs"),
      shortages: collectListSection(container, "shortages"),
      meetings: collectListSection(container, "meetings"),
      trainings: collectListSection(container, "trainings")
    };
  }

  // === 画面の組み立て ===

  function render(container, log, onSave, onCancel) {
    var normalized = root.DailyLog.normalize(log);

    container.innerHTML =
      '<div class="detail-head">' +
      '<button type="button" class="btn" id="editCancelBtn">キャンセル</button>' +
      '<span class="detail-title">' + esc(normalized.date) + "（編集中）</span>" +
      '<button type="button" class="btn btn-primary" id="editSaveBtn" style="margin-left:auto">保存</button>' +
      "</div>" +
      '<div id="editErrors"></div>' +
      '<div id="editBody">' +
      rxSection(normalized) +
      winjSection(normalized) +
      wardRxSection(normalized) +
      premixSection(normalized) +
      doctorChangesSection(normalized) +
      packerSection(normalized) +
      listSectionHtml("inquiries", normalized.inquiries) +
      listSectionHtml("mrVisits", normalized.mrVisits) +
      listSectionHtml("contacts", normalized.contacts) +
      listSectionHtml("drugs", normalized.drugs) +
      listSectionHtml("shortages", normalized.shortages) +
      listSectionHtml("meetings", normalized.meetings) +
      listSectionHtml("trainings", normalized.trainings) +
      notesSection(normalized) +
      "</div>";

    // #editBody は render() のたびに innerHTML ごと作り直されるため、ここに委譲用の
    // クリックリスナーを付ける。container(= 詳細画面の器)自体は編集を開くたびに
    // 使い回されるので、container に直接付けると開くたびにリスナーが積み重なってしまう。
    attachListEvents(container.querySelector("#editBody"));

    container.querySelector("#editCancelBtn").addEventListener("click", onCancel);
    container.querySelector("#editSaveBtn").addEventListener("click", function () {
      onSave(collect(container, normalized));
    });
  }

  root.EditView = { render: render };
})(typeof window !== "undefined" ? window : this);
