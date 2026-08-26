import * as Storage from "./storage.js";

// 純粋コアは UMD モジュール。index.html の <script> で window に公開される。
var Core = window.HospitalImportCore;

async function inspect(file) {
  var bytes = new Uint8Array(await file.arrayBuffer());
  var core = Core.buildInspection(file.name, bytes);
  var existing = await Storage.getLog(core.date);
  return {
    date: core.date,
    wardRx: core.wardRx,
    errors: core.errors,
    exists: existing !== null,
    existingWardRx: existing ? existing.wardRx : null
  };
}

async function run(parsed) {
  if (parsed.errors.length) {
    throw new Error("検証に通らない項目があるため取り込めません");
  }
  await Storage.saveWardRx(parsed.date, parsed.wardRx);
  return { date: parsed.date };
}

export { inspect, run };
