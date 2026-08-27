(function (root) {
  "use strict";

  var DL = root.DailyLog;
  var ES = root.EntrySections;
  var WARDS = DL.WARDS;

  var DRUG_LABELS = {
    adopt: "採用", remove: "削除", expire: "期限切れ", "return": "返品", maintenance: "メンテナンス"
  };
  var WARDRX_KINDS = DL.WARDRX_INPUT_KINDS;
  var PACKER_UNITS = [
    { key: "tab", label: "錠剤分包機" }, { key: "san", label: "散剤分包機" }
  ];
  var LIST_SECTIONS = {
    inquiries: { title: "疑義照会", fields: [
      { field: "type", type: "select", options: DL.INQ_TYPES, label: "区分" },
      { field: "doctor", type: "text", label: "医師" },
      { field: "memo", type: "text", label: "内容" },
      { field: "changed", type: "checkbox", label: "処方変更" }
    ] },
    mrVisits: { title: "MR訪問", fields: [
      { field: "company", type: "text", label: "会社" },
      { field: "memo", type: "text", label: "内容" }
    ] },
    contacts: { title: "問い合わせ", fields: [
      { field: "from", type: "select", options: DL.CONTACT_FROM, label: "区分" },
      { field: "memo", type: "text", label: "内容" }
    ] },
    drugs: { title: "薬剤管理", fields: [
      { field: "type", type: "select", options: DL.DRUG_TYPES, optionLabels: DRUG_LABELS, label: "区分" },
      { field: "name", type: "text", label: "薬品名" }
    ] },
    shortages: { title: "欠品", fields: [
      { field: "name", type: "text", label: "薬品名" },
      { field: "qty", type: "number", label: "数量" }
    ] },
    meetings: { title: "会議", fields: [
      { field: "type", type: "select", options: DL.MEETING_TYPES, label: "種別" }
    ] },
    trainings: { title: "研修会", fields: [
      { field: "theme", type: "text", label: "テーマ" },
      { field: "lecturer", type: "text", label: "担当者" },
      { field: "count", type: "number", label: "参加人数" }
    ] }
  };
  var MEISAI_KEYS = ["inquiries", "mrVisits", "contacts", "drugs", "shortages", "meetings", "trainings"];

  function esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function numInput(field) {
    return '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-field="' +
      field + '" placeholder="0">';
  }
  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  // --- 固定構造セクションの body ---
  function gairaiBody() {
    return table('<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td>" + numInput("rxOpCnt") + "</td><td>" + numInput("rxOpDose") + "</td></tr>" +
      "<tr><td>外来注射箋</td><td>" + numInput("rxInjCnt") + "</td><td>" + numInput("rxInjDose") + "</td></tr>"
    ) + '<div class="edit-row"><label>薬剤管理指導（件）</label>' + numInput("counsel") + "</div>";
  }
  function winjBody() {
    var rows = WARDS.map(function (ward) {
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="cnt" placeholder="0"></td><td>' +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="dose" placeholder="0"></td></tr>';
    }).join("");
    return table('<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows);
  }
  function wardRxKindBlock(kind) {
    var rows = WARDS.map(function (ward) {
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="cnt" placeholder="0"></td><td>' +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="dose" placeholder="0"></td></tr>';
    }).join("");
    return '<div style="margin-bottom:.75rem">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px">' + esc(kind.label) + "</div>" +
      table('<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows) + "</div>";
  }

  function wardRxTotalBlock() {
    var rows = WARDS.map(function (ward) {
      return "<tr><td>" + esc(ward) + '</td><td class="num">' +
        '<span data-wardrx-total-cnt="' + esc(ward) + '">0</span> / ' +
        '<span data-wardrx-total-dose="' + esc(ward) + '">0</span></td></tr>';
    }).join("");
    return '<div style="margin-bottom:.25rem">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px">合計（枚 / 件）</div>' +
      table('<th>病棟</th><th class="num">合計</th>', rows) + "</div>";
  }

  function wardRxBody() {
    return WARDRX_KINDS.map(wardRxKindBlock).join("") + wardRxTotalBlock() +
      '<div class="hint">合計は自動計算です。</div>';
  }
  function doctorChangesBody(masters) {
    var list = masters.doctors || [];
    if (!list.length) return '<div class="hint">医師マスタが空です。</div>';
    var rows = list.map(function (doctor, i) {
      return "<tr><td>" + esc(doctor) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-doctor="' + esc(doctor) +
        '" data-doctor-index="' + i + '" placeholder="0"></td></tr>';
    }).join("");
    return table('<th>医師</th><th class="num">処方変更件数</th>', rows);
  }
  function premixesBody(masters) {
    var list = masters.premixes || [];
    if (!list.length) return '<div class="hint">予製マスタが空です。</div>';
    var rows = list.map(function (drug, i) {
      return "<tr><td>" + esc(drug) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-premix="' + esc(drug) +
        '" data-premix-index="' + i + '" placeholder="0"></td></tr>';
    }).join("");
    return table('<th>薬剤</th><th class="num">個数</th>', rows);
  }
  function packerBody() {
    var blocks = PACKER_UNITS.map(function (unit) {
      return '<div><div style="font-size:12px;font-weight:600;margin-bottom:4px">' + unit.label + "</div>" +
        '<div class="edit-row"><label>分包紙</label><input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="分包紙" placeholder="0"></div>' +
        '<div class="edit-row"><label>インク</label><input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="インク" placeholder="0"></div>' +
        '<div class="edit-row"><label><input type="checkbox" data-packer-unit="' + unit.key +
        '" data-packer-item="清掃"> 清掃</label></div></div>';
    }).join("");
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">' + blocks + "</div>";
  }
  function checklistBody(masters, author) {
    var items = (masters.checklist && masters.checklist[author]) || [];
    if (!author) return '<div class="hint">先に記入者を選んでください。</div>';
    if (!items.length) return '<div class="hint">この記入者のチェック項目はありません。</div>';
    return items.map(function (item) {
      return '<div class="edit-row"><label><input type="checkbox" data-checklist-item="' + esc(item) +
        '"> ' + esc(item) + "</label></div>";
    }).join("");
  }
  function notesBody() {
    return '<textarea class="text-input textarea-input" data-field="notes" rows="3"></textarea>';
  }

  // --- 明細系(行の追加・削除) ---
  function fieldInputHtml(spec, value) {
    if (spec.type === "select") {
      var opts = spec.options.map(function (opt) {
        var label = (spec.optionLabels && spec.optionLabels[opt]) || opt;
        return '<option value="' + esc(opt) + '"' + (opt === value ? " selected" : "") + ">" + esc(label) + "</option>";
      }).join("");
      return '<select class="text-input" data-field="' + spec.field + '">' + opts + "</select>";
    }
    if (spec.type === "checkbox") {
      return '<input type="checkbox" data-field="' + spec.field + '"' + (value ? " checked" : "") + ">";
    }
    if (spec.type === "number") {
      return '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-field="' + spec.field + '" placeholder="0">';
    }
    return '<input type="text" class="text-input" data-field="' + spec.field + '" value="' + esc(value) + '">';
  }
  function listRowHtml(fields) {
    var cells = fields.map(function (spec) { return "<td>" + fieldInputHtml(spec, undefined) + "</td>"; }).join("");
    return "<tr data-row>" + cells + '<td><button type="button" class="btn" data-remove-row>削除</button></td></tr>';
  }
  function meisaiBody() {
    return MEISAI_KEYS.map(function (key) {
      var def = LIST_SECTIONS[key];
      var head = def.fields.map(function (f) { return "<th>" + f.label + "</th>"; }).join("") + "<th></th>";
      return '<div style="margin-bottom:.75rem"><div style="font-size:12px;font-weight:600;margin-bottom:4px">' +
        def.title + "</div>" +
        '<div class="tbl-wrap"><table class="tbl" data-section="' + key + '"><thead><tr>' + head +
        "</tr></thead><tbody data-rows></tbody></table></div>" +
        '<button type="button" class="btn" data-add-row="' + key + '">+ 行追加</button></div>';
    }).join("");
  }

  var SECTION_BODY = {
    gairai: function () { return gairaiBody(); },
    winj: function () { return winjBody(); },
    wardRx: function () { return wardRxBody(); },
    doctorChanges: function (m) { return doctorChangesBody(m); },
    premixes: function (m) { return premixesBody(m); },
    packer: function () { return packerBody(); },
    checklist: function (m, author) { return checklistBody(m, author); },
    meisai: function () { return meisaiBody(); },
    notes: function () { return notesBody(); }
  };
  var SECTION_ORDER = ["gairai", "winj", "wardRx", "doctorChanges", "premixes", "packer", "checklist", "meisai", "notes"];

  function todayStr() {
    var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function sectionCardHtml(key, masters, author) {
    var on = ES.DEFAULT_ON.indexOf(key) >= 0;
    return '<div class="card" data-section-card="' + key + '">' +
      '<div class="sec-title"><label><input type="checkbox" data-section-toggle="' + key + '"' +
      (on ? " checked" : "") + "> " + ES.SECTION_TITLES[key] + "</label></div>" +
      '<div data-section-body="' + key + '"' + (on ? "" : ' style="opacity:.4;pointer-events:none"') + ">" +
      SECTION_BODY[key](masters, author) + "</div></div>";
  }

  function render(container, masters) {
    var members = masters.members || [];
    var authorOpts = ['<option value="">（選択）</option>'].concat(members.map(function (m) {
      return '<option value="' + esc(m) + '">' + esc(m) + "</option>";
    })).join("");

    container.innerHTML =
      '<div class="card"><div class="edit-row"><label>日付</label>' +
      '<input type="date" class="text-input" id="entryDate" value="' + todayStr() + '"></div>' +
      '<div class="edit-row"><label>記入者</label>' +
      '<select class="text-input" id="entryAuthor">' + authorOpts + "</select></div></div>" +
      SECTION_ORDER.map(function (key) { return sectionCardHtml(key, masters, ""); }).join("");

    // セクションの有効/無効トグル
    container.addEventListener("change", function (e) {
      var t = e.target.closest("[data-section-toggle]");
      if (!t) return;
      var body = container.querySelector('[data-section-body="' + t.getAttribute("data-section-toggle") + '"]');
      if (t.checked) { body.style.opacity = ""; body.style.pointerEvents = ""; }
      else { body.style.opacity = ".4"; body.style.pointerEvents = "none"; }
    });

    // 記入者変更 → checklist セクションを再描画
    container.querySelector("#entryAuthor").addEventListener("change", function (e) {
      var body = container.querySelector('[data-section-body="checklist"]');
      body.innerHTML = checklistBody(masters, e.target.value);
    });

    // wardRx 合計(枚・件)の自動計算
    container.addEventListener("input", function (e) {
      if (!e.target.closest("[data-wardrx-ward]")) return;
      var ward = e.target.getAttribute("data-wardrx-ward");
      var cnt = 0, dose = 0;
      WARDRX_KINDS.forEach(function (kind) {
        cnt += num(container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value);
        dose += num(container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value);
      });
      container.querySelector('[data-wardrx-total-cnt="' + ward + '"]').textContent = cnt;
      container.querySelector('[data-wardrx-total-dose="' + ward + '"]').textContent = dose;
    });

    // 明細の行追加・削除
    container.addEventListener("click", function (e) {
      var add = e.target.closest("[data-add-row]");
      if (add) {
        var key = add.getAttribute("data-add-row");
        add.closest(".card").querySelector('table[data-section="' + key + '"] [data-rows]')
          .insertAdjacentHTML("beforeend", listRowHtml(LIST_SECTIONS[key].fields));
        return;
      }
      var rm = e.target.closest("[data-remove-row]");
      if (rm) rm.closest("tr").remove();
    });
  }

  function collectList(container, key) {
    var def = LIST_SECTIONS[key];
    var tableEl = container.querySelector('table[data-section="' + key + '"]');
    var items = [];
    tableEl.querySelectorAll("[data-row]").forEach(function (tr) {
      var item = {};
      def.fields.forEach(function (spec) {
        var inp = tr.querySelector('[data-field="' + spec.field + '"]');
        if (spec.type === "checkbox") item[spec.field] = inp.checked;
        else if (spec.type === "number") item[spec.field] = num(inp.value);
        else item[spec.field] = inp.value;
      });
      items.push(item);
    });
    return items;
  }

  function packerUnit(container, unit) {
    var g = function (item) {
      return container.querySelector('[data-packer-unit="' + unit + '"][data-packer-item="' + item + '"]');
    };
    return { "分包紙": num(g("分包紙").value), "インク": num(g("インク").value), "清掃": g("清掃").checked };
  }

  function collect(container) {
    var q = function (sel) { return container.querySelector(sel); };
    var author = q("#entryAuthor").value;

    var wardRxRows = WARDS.map(function (ward) {
      var row = { name: ward };
      WARDRX_KINDS.forEach(function (kind) {
        row[kind.key] = {
          cnt: num(q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value),
          dose: num(q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value)
        };
      });
      return row;
    });

    var raw = {
      rxOpCnt: num(q('[data-field="rxOpCnt"]').value),
      rxOpDose: num(q('[data-field="rxOpDose"]').value),
      rxInjCnt: num(q('[data-field="rxInjCnt"]').value),
      rxInjDose: num(q('[data-field="rxInjDose"]').value),
      counsel: num(q('[data-field="counsel"]').value),
      winjData: WARDS.map(function (ward) {
        return {
          ward: ward,
          cnt: num(q('[data-winj-ward="' + ward + '"][data-winj-kind="cnt"]').value),
          dose: num(q('[data-winj-ward="' + ward + '"][data-winj-kind="dose"]').value)
        };
      }),
      wardRx: ES.wardRxTotals(wardRxRows),
      doctorChanges: [].slice.call(container.querySelectorAll("[data-doctor]")).map(function (inp) {
        return { doctor: inp.getAttribute("data-doctor"), cnt: num(inp.value) };
      }),
      premixes: [].slice.call(container.querySelectorAll("[data-premix]")).map(function (inp) {
        return { drug: inp.getAttribute("data-premix"), cnt: num(inp.value) };
      }),
      packerData: {
        tab: packerUnit(container, "tab"),
        san: packerUnit(container, "san")
      },
      checklist: [].slice.call(container.querySelectorAll("[data-checklist-item]"))
        .filter(function (c) { return c.checked; })
        .map(function (c) { return c.getAttribute("data-checklist-item"); }),
      notes: q('[data-field="notes"]').value
    };
    MEISAI_KEYS.forEach(function (key) { raw[key] = collectList(container, key); });

    var checked = SECTION_ORDER.filter(function (key) {
      return container.querySelector('[data-section-toggle="' + key + '"]').checked;
    });

    return {
      date: q("#entryDate").value,
      author: author,
      payload: ES.payloadFromSections(raw, checked)
    };
  }

  root.EntryForm = { render: render, collect: collect };
})(typeof window !== "undefined" ? window : this);
