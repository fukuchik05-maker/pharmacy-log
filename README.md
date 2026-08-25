# 薬局業務日誌

薬局業務日誌をクラウドDB (Firestore) で管理し、どの端末からでも閲覧・修正できるようにするプロジェクト。

## 設計

- [設計書](docs/superpowers/specs/2026-08-25-pharmacy-log-db-migration-design.md)
- [フェーズ1 実装計画](docs/superpowers/plans/2026-08-25-phase1-parsers.md)

## 構成

| ディレクトリ | 内容 |
|---|---|
| `src/model/` | データ構造の定義 |
| `src/parse/` | 入力ファイルのパーサー |
| `tests/` | 単体テスト |
| `scripts/` | 実行用スクリプト |

各モジュールは Node とブラウザの双方で動作する。追加の依存パッケージは使用しない。

## テスト

```bash
node tests/daily-log.test.js
```

```bash
node tests/filename.test.js
```

```bash
node tests/hospital-csv.test.js
```

```bash
node tests/accum-csv.test.js
```

## 実データによる検証

リポジトリには患者情報を含むデータを置かない。手元の実データに対しては次で検証する。

```bash
node scripts/verify-real-data.js "C:/Users/GM/Desktop/業務日誌"
```
