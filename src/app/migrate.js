import * as Storage from "./storage.js";

function readAsText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    // 蓄積CSVはBOM付きUTF-8。AccumCsv側でBOMを除去する
    reader.readAsText(file, "utf-8");
  });
}

async function inspect(file) {
  var text = await readAsText(file);
  var parsed = window.AccumCsv.parse(text);

  var invalid = [];
  parsed.logs.forEach(function (log) {
    var errors = window.DailyLog.validate(log);
    if (errors.length) {
      invalid.push({ date: log.date, errors: errors });
    }
  });

  return { logs: parsed.logs, masters: parsed.masters, invalid: invalid };
}

async function run(parsed, onProgress) {
  if (parsed.invalid.length) {
    throw new Error("検証に通らないレコードがあるため取り込めません");
  }
  var written = await Storage.saveLogs(parsed.logs, onProgress);
  await Storage.saveMasters(parsed.masters);
  return { logs: written };
}

export { inspect, run };
