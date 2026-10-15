# TDK でバグを見つける

コードを読む必要はありません。これまでに見つかった TDK のバグの多くは、コマンドを実行し、その出力を TDK が約束している内容と比べることで発見されました。

**基本ルール:** TDK はヘルプ、ドキュメント、または別のコマンドの出力で何かを約束しています。実行して異なる結果になったら、実行したコマンド、期待した結果、実際に表示された結果を書き留めてください。

## 1. テスト用プロジェクトを作る

大切なプロジェクトではなく、空のディレクトリで作業してください。

```bash
mkdir /tmp/tdk-bugs && cd /tmp/tdk-bugs
tdk --version
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk resource billing-api --type backend --stack shop --yes
tdk resource storefront --type frontend --stack shop --yes
```

リリース済みバージョンではなく `main` のコードを試すには、クローンしたリポジトリから CLI を実行します: `bun /path/to/tdk-cli-core/cli/src/cli.ts <command>`。このコマンドを小さな `tdk` スクリプトにして `PATH` に追加すれば、以下のコマンドをそのまま使えます。

ほとんどのチェックに必要なのは Bun だけです。**(Docker)** と付いたチェックには Docker と Tilt の起動が必要です。

## 2. チェックを実行する

各行は TDK が約束していることを示しています。コマンドを実行し、中央の列にある内容と違っていたら、バグを見つけたことになります。右の列には、同じ種類の実例へのリンクがあります。

### コマンド間の整合性

`tdk up`、`tdk status`、`tdk doctor`、`tdk networks`、`tdk resources` は同じ `service.json` ファイルを読み取ります。結果が食い違ってはいけません。

| 実行すること | 期待される結果 | 実際にあった例 |
|---|---|---|
| `grep '"port"' services/shop/*/service.json` | 各リソースにそれぞれのポートが割り当てられる (この例では 4000、4001、3000)。 | [#713](https://github.com/tdk-landscape/tdk-cli-core/issues/713): すべてのバックエンドが 4000 になった |
| `tdk up shop --dry-run` の後に `tdk networks` | `networks` に `up --dry-run` が表示したものと同じ URL が並ぶ。 | [#719](https://github.com/tdk-landscape/tdk-cli-core/issues/719): `networks` が "No services with basePath found" と表示した |
| `tdk resources --ports` | 各リソースについて `service.json` と一致する `Port:` 行が表示される。 | [#715](https://github.com/tdk-landscape/tdk-cli-core/issues/715): ポートが表示されなかった |
| `tdk status --json` | 各リソースに実際の `type` (`frontend`、`backend`) が入り、`"unknown"` にならない。 | [#715](https://github.com/tdk-landscape/tdk-cli-core/issues/715) |
| 新しく `tdk resource` で作り、編集していないプロジェクトで `tdk doctor --no-ping` | `--type` に何を指定しても成功する。そこでの ✗ は scaffold または doctor のバグ。 | [#599](https://github.com/tdk-landscape/tdk-cli-core/issues/599): 持ち込みリソースで doctor が失敗した |

### ドキュメントと実際の動作

| 実行すること | 期待される結果 | 実際にあった例 |
|---|---|---|
| [README](../../../README.md) のクイックスタートからコマンドをコピーして実行する | すべてのコマンドが動作し、すべての URL が応答する。 | [#718](https://github.com/tdk-landscape/tdk-cli-core/issues/718): クイックスタートの `curl` が 404 を返した |
| `tdk --help` | `cli/src/commands/` とドキュメントにあるコマンドがすべて一覧に表示される。 | [#721](https://github.com/tdk-landscape/tdk-cli-core/issues/721): `logs`、`eject`、`import`、`mcp` がなかった |
| `docs/` に記載された `tdk <command>` | コマンドが存在する。`tdk <name> --help` が `unknown command` を表示しない。 | [#723](https://github.com/tdk-landscape/tdk-cli-core/issues/723): ドキュメントに `tdk smoke` が記載されていた |
| ドキュメントに記載されたフラグ | `tdk <command> --help` に表示され、使用すると出力が変わる。 | |

### エラーが問題解決に役立つ

| 実行すること | 期待される結果 | 実際にあった例 |
|---|---|---|
| 空のディレクトリで `tdk status`、`tdk down`、`tdk logs`、`tdk eject --yes` | どのコマンドも同じエラーを出す: "Could not find project root" と `tdk project --yes` の実行を促す案内。終了コードは 1。 | [#722](https://github.com/tdk-landscape/tdk-cli-core/issues/722): `down`、`eject`、`logs` のエラーが表示されないか、誤解を招くものだった |
| エラーメッセージに書かれた案内に従う | その案内で問題が解決する。失敗したばかりのコマンドをもう一度実行するよう促すエラーはバグ。 | [#724](https://github.com/tdk-landscape/tdk-cli-core/issues/724): 空の `JWT_SECRET=` が `tdk up` を再実行するよう案内した |
| `tdk resource --help` にあるすべての `--type` | どの種類でもリソースを作成できる。JavaScript のスタックトレース (`TypeError`、`Object.entries…`) は常にバグ。 | [#714](https://github.com/tdk-landscape/tdk-cli-core/issues/714): `--type sdk` でクラッシュした |
| コマンド失敗後に `echo $?` | `0` 以外。失敗を 0 として返すコマンドはスクリプトや CI を壊す。 | |

### 機械向け出力の安定性

| 実行すること | 期待される結果 | 実際にあった例 |
|---|---|---|
| `--json` に対応する各コマンドで `tdk <command> --json` | stdout には `{"schemaVersion":1,"data":…,"errors":[]}` の形をした JSON だけが出力される。`jq .` に渡して構文を確認する。 | [#707](https://github.com/tdk-landscape/tdk-cli-core/issues/707) |
| 同じ `--json` コマンドが失敗した場合 (例: プロジェクト外で実行) | それでも同じ形式になり、問題は `errors` に入る。プレーンテキストのエラーにならない。 | [#722](https://github.com/tdk-landscape/tdk-cli-core/issues/722) |

### サービスの実行 **(Docker)**

| 実行すること | 期待される結果 | 実際にあった例 |
|---|---|---|
| `tdk up shop` の後、表示されたすべての URL に `curl` する | 各 `/health` URL が 200 を返す。 | [#718](https://github.com/tdk-landscape/tdk-cli-core/issues/718) |
| `tdk down` の後に `docker ps` と `docker network ls` | このプロジェクトのコンテナーもネットワークも残っていない。 | [#583](https://github.com/tdk-landscape/tdk-cli-core/issues/583) |
| `.env` を手動で編集する (値を空にする、コメントを追加する、値を引用符で囲む) その後 `tdk up` | TDK が Docker Compose と同じ方法で `.env` を読み込むか、修正してその旨を表示する。 | [#724](https://github.com/tdk-landscape/tdk-cli-core/issues/724)、[#725](https://github.com/tdk-landscape/tdk-cli-core/issues/725) |
| `cd services/shop/orders-api && bun run build` | scaffold されたリソースがホスト上でビルドできる。 | [#581](https://github.com/tdk-landscape/tdk-cli-core/issues/581)、[#592](https://github.com/tdk-landscape/tdk-cli-core/issues/592) |

### リポジトリ自体

| 実行すること | 期待される結果 | 実際にあった例 |
|---|---|---|
| クリーンな clone で `bun run typecheck && bun run lint && bun run test` | すべて成功する。クリーンなチェックアウトで失敗したら、セットアップの問題ではなくプロジェクトのバグ。 | |
| workflow で実行されないテストスイート (例: `pytest tests/tilt-engine`) | こちらも成功する。 | [#700](https://github.com/tdk-landscape/tdk-cli-core/issues/700): workflow が実行していなかった 29 件のテストが失敗した |

## 3. バグが潜みやすいところ

以下のパターンから、これまでに多くのバグが見つかりました。記載したものに限らず、どのコマンドにも試せます。

- **同じ事実を示す 2 つのコマンド。** ポート、URL、ステータスなどを 2 つのコマンドが表示するなら、結果を比べてください。違っていたら、どちらかが間違っています。
- **doctor の指摘とコマンドの動作が食い違う。** `tdk doctor` が問題を指摘する一方で `tdk up` は無視する場合、またはその逆。
- **ドキュメントの例。** README と `docs/` のコマンドを正確にコピーして実行してください。コマンド名やルートが変わると、ドキュメントが古くなります。
- **入力の端のケース。** 空の値、`-api` で終わる名前、同じ種類の 2 つ目のリソース、使う人の少ない種類、プロジェクト外での実行。
- **テスト内でデータを組み立てるテスト。** 実際のコードでは設定されないフィールドをテストが設定しているために、テストが通る場合があります ([#713](https://github.com/tdk-landscape/tdk-cli-core/issues/713))。ユニットテストは通るのにコマンドが失敗したら、テストの入力と実際のコマンドが作る入力を比べてください。
- **何もしていないのに成功する。** 出力に ✓ や "Added …" と表示されても、ファイル、コンテナー、URL が変わっていないことがあります。

## 4. 報告する前に

1. 新しいスクラッチプロジェクトで再度実行し、手順が最後まで完了することを確認する。
2. `main` を確認する: 手順 1 のようにソースから CLI を実行する。バグは修正済みでも、まだリリースされていない可能性があります。
3. [未解決・解決済み issue](https://github.com/tdk-landscape/tdk-cli-core/issues?q=is%3Aissue) でエラー文やコマンド名を検索する。一致する issue があれば、そこに実行結果を追加する。
4. 問題を示せる範囲で、手順をできるだけ短くする。

## 5. 報告を書く

[バグ報告フォーム](https://github.com/tdk-landscape/tdk-cli-core/issues/new?template=bug_report.yml)を開いてください。よい報告は同じ形式で書かれています。[#713](https://github.com/tdk-landscape/tdk-cli-core/issues/713) は参考になる例です。

````markdown
<TDK が約束したことと実際の動作を一文で書く>

## 再現手順 (TDK <tdk --version> / main の <短い commit hash>)
```bash
mkdir demo && cd demo && tdk project --yes
<問題を示す最短のコマンド列>
```
```text
<書き直さずにコピーした実際の出力>
```

## 原因 (任意)
<ファイル:行番号と、分かった場合は原因>

## 修正 (任意)
<変更内容と、それを検出するテスト>
````

確認したことと、確認していないことを明記してください。"Docker がここで起動していないため `tdk up` は実行できませんでした。URL は `--dry-run` で確認しました" のような説明は役に立ちます。推測を事実のように書かないでください。

原因や修正が分からなくても報告できます。自分で修正する場合は、issue に `I'll take this` とコメントし、[CLI の手順](../02-feature-recipes.md#change-a-cli-command)に従ってください。セキュリティ上の問題は公開 issue ではなく [SECURITY.md](../../../SECURITY.md) に報告してください。

---

このページは英語版の [Finding bugs in TDK](../finding-bugs.md) の翻訳です。内容が異なる場合は英語版を優先してください。
