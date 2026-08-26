(function (root) {
  "use strict";

  // 記入者・予製・医師は「文字列の配列」という同じ形なので、共通の定義で描画・削除を扱う。
  var SIMPLE_LISTS = {
    members: { title: "記入者管理", label: "氏名", placeholder: "氏名を入力", minCount: 1 },
    premixes: { title: "予製マスタ", label: "薬剤名", placeholder: "薬剤名を入力", minCount: 0 },
    doctors: { title: "医師マスタ", label: "医師名", placeholder: "医師名を入力", minCount: 0 }
  };

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function cloneChecklist(src) {
    var out = {};
    Object.keys(src || {}).forEach(function (member) {
      out[member] = (src[member] || []).slice();
    });
    return out;
  }

  function simpleListSectionHtml(key, list) {
    var def = SIMPLE_LISTS[key];
    var rows = list.map(function (name, index) {
      return "<tr><td>" + esc(name) + "</td><td>" +
        '<button type="button" class="btn btn-row-remove" data-remove-list="' + key +
        '" data-index="' + index + '">削除</button></td></tr>';
    }).join("");
    var body = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + def.label +
      "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="edit-row">' +
      '<input type="text" class="text-input" data-new-input="' + key + '" placeholder="' + def.placeholder + '">' +
      '<button type="button" class="btn btn-primary" data-add-list="' + key + '">追加</button>' +
      "</div>";
    return card(def.title, body);
  }

  function render(container, masters, onSave) {
    var state = {
      members: (masters.members || []).slice(),
      checklist: cloneChecklist(masters.checklist),
      premixes: (masters.premixes || []).slice(),
      doctors: (masters.doctors || []).slice()
    };
    var selectedMember = state.members[0] || "";

    function checklistSectionHtml() {
      if (!state.members.length) {
        return card("チェックリスト編集", '<p class="hint">記入者を追加してください。</p>');
      }
      if (state.members.indexOf(selectedMember) === -1) selectedMember = state.members[0];
      var items = state.checklist[selectedMember] || [];
      var options = state.members.map(function (m) {
        return '<option value="' + esc(m) + '"' + (m === selectedMember ? " selected" : "") +
          ">" + esc(m) + "</option>";
      }).join("");
      var rows = items.map(function (item, index) {
        return "<tr><td>" + esc(item) + "</td><td>" +
          '<button type="button" class="btn btn-row-remove" data-remove-check data-index="' +
          index + '">削除</button></td></tr>';
      }).join("");
      var body =
        '<div class="edit-row"><label>記入者を選択</label>' +
        '<select class="text-input" id="checklistMemberSel">' + options + "</select></div>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>チェック項目</th><th></th></tr></thead>' +
        "<tbody>" + rows + "</tbody></table></div>" +
        '<div class="edit-row">' +
        '<input type="text" class="text-input" id="newCheckItemInput" placeholder="チェック項目を入力">' +
        '<button type="button" class="btn btn-primary" id="addCheckItemBtn">追加</button>' +
        "</div>";
      return card("チェックリスト編集", body);
    }

    function showMessage(html) {
      var box = container.querySelector("#mastersMessage");
      if (box) box.innerHTML = html;
    }

    function attachEvents() {
      container.querySelectorAll("[data-remove-list]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-remove-list");
          var index = Number(btn.getAttribute("data-index"));
          var def = SIMPLE_LISTS[key];
          if (state[key].length <= def.minCount) {
            showMessage('<div class="notice notice-err">最低' + def.minCount + '名は必要です。</div>');
            return;
          }
          state[key].splice(index, 1);
          renderAll();
        });
      });

      container.querySelectorAll("[data-add-list]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-add-list");
          var input = container.querySelector('[data-new-input="' + key + '"]');
          var value = input.value.trim();
          if (!value) return;
          state[key].push(value);
          if (key === "members" && !state.checklist[value]) state.checklist[value] = [];
          renderAll();
        });
      });

      var memberSel = container.querySelector("#checklistMemberSel");
      if (memberSel) {
        memberSel.addEventListener("change", function () {
          selectedMember = memberSel.value;
          renderAll();
        });
      }

      var addCheckBtn = container.querySelector("#addCheckItemBtn");
      if (addCheckBtn) {
        addCheckBtn.addEventListener("click", function () {
          var input = container.querySelector("#newCheckItemInput");
          var value = input.value.trim();
          if (!value) return;
          if (!state.checklist[selectedMember]) state.checklist[selectedMember] = [];
          state.checklist[selectedMember].push(value);
          renderAll();
        });
      }

      container.querySelectorAll("[data-remove-check]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var index = Number(btn.getAttribute("data-index"));
          state.checklist[selectedMember].splice(index, 1);
          renderAll();
        });
      });

      container.querySelector("#mastersSaveBtn").addEventListener("click", function () {
        onSave({
          members: state.members,
          checklist: state.checklist,
          premixes: state.premixes,
          doctors: state.doctors
        });
      });
    }

    function renderAll() {
      container.innerHTML =
        simpleListSectionHtml("members", state.members) +
        checklistSectionHtml() +
        simpleListSectionHtml("premixes", state.premixes) +
        simpleListSectionHtml("doctors", state.doctors) +
        '<div id="mastersMessage"></div>' +
        '<div class="edit-row"><button type="button" class="btn btn-primary" id="mastersSaveBtn">保存</button></div>';
      attachEvents();
    }

    renderAll();
  }

  root.MastersView = { render: render };
})(typeof window !== "undefined" ? window : this);
