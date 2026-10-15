# TDK へのコントリビュート

[English](../../../CONTRIBUTING.md) | [简体中文](CONTRIBUTING-zh_cn.md) | [繁體中文](CONTRIBUTING-zh_tw.md) | 日本語 | [한국어](CONTRIBUTING-ko.md)

> このページは [CONTRIBUTING.md](../../../CONTRIBUTING.md) の翻訳です。内容が異なる場合は英語版が優先されます。ガイドの日本語訳も利用できます。

ようこそ！小さな修正も大きな機能もどちらも役に立ちます。まずは短い[コントリビューターガイド](../README.md)から始めてください。変更を見つけ、実装し、確認し、pull request を作成するまでを順に案内します。

## ここから始める

1. [変更を選んでリポジトリを準備する](../01-first-change.md)。
2. [変更の種類に合った手順に従う](../02-feature-recipes.md)。
3. [作業を確認して pull request を作成する](../03-open-a-pr.md)。
4. [ほかの人の pull request をレビューする](../04-review-a-pr.md)。ワンクリックの AI レビューボタンが使えます。

[フロントエンド provider ガイド](../../frontend-framework-providers.md)には、Vue のような別の Vite フレームワークを追加する具体的な手順があります。[バックエンド provider ガイド](../../backend-language-providers.md)では、Python のようなバックエンド言語の追加方法を説明しています。

## クイックセットアップ

Git、[Bun](https://bun.sh)、Node.js 22.12+ が必要です。ほとんどの変更では Docker と Tilt は不要です。

```bash
git clone https://github.com/tdk-landscape/tdk-cli-core.git
cd tdk-cli-core
bun install
bun run typecheck && bun run lint && bun run test   # 約1分。何かを変更する前に、すべて成功するはずです
```

クリーンなチェックアウトでどれかが失敗した場合、それはあなたの環境ではなくプロジェクトのバグです。[issue を作成](https://github.com/tdk-landscape/tdk-cli-core/issues/new/choose)してください。

## バグを探す

コードを書かなくても手伝えます。コマンドを実行し、その出力を TDK が約束していること（`--help`、ドキュメント、または別のコマンド）と比べ、違いがあれば報告してください。それがバグです。

日本語訳の[TDK でバグを見つける](finding-bugs-ja.md)ガイドには具体的な手順があります。テスト用のスクラッチプロジェクト、期待される出力付きのコマンドチェックリスト、過去にバグを見つけたパターン、そしてメンテナーがすぐ対応できる報告フォーマットです。たとえば `tdk networks` が URL を一つも表示しないのに `tdk up --dry-run` が表示する場合、2つのコマンドが食い違っているので、どちらかが間違っています。

## pull request をレビューする

開いている [pull request](https://github.com/tdk-landscape/tdk-cli-core/pulls) をレビューすることで、コードを書かずに貢献できます。すべての PR の末尾には **Grok**、**Claude**、**Codex** のボタンがあり、その PR のレビューを依頼済みの AI チャットが開きます。AI はあなたのアシスタントです。言っている内容を diff と照らし合わせて確認し、GitHub で **Comment**、**Approve**、**Request changes** のいずれかとして自分のレビューを送信してください。

最初のレビューの前に、[必読ドキュメント](../04-review-a-pr.md#before-your-first-review-required-reading)を読んでください（約1時間、一度だけ）。そのあと [pull request をレビューする](../04-review-a-pr.md)で、ボタンの使い方を順に説明し、承認と修正依頼のコメント例を紹介しています。

## 取り組むことを探す

- 🗺️ [TDK ジャーニー](../../journey/README.md)：島を選び、クエストをクリアして、ランクを上げましょう（8 kyu → 1 dan）
- [Good first issues](https://github.com/tdk-landscape/tdk-cli-core/labels/good%20first%20issue)
- [Help wanted](https://github.com/tdk-landscape/tdk-cli-core/labels/help%20wanted)
- ステップごとのチェックリストで[バグを探す](finding-bugs-ja.md)
- [バグを報告する、または質問する](https://github.com/tdk-landscape/tdk-cli-core/issues/new/choose)

issue を選んだら、`I'll take this`（または `I would like this one`、`I'd like to work on this`、`Can I take this?`）とコメントしてください。ボットがあなたをアサインし、`claimed` ラベルを付けるので、2人が同じ作業をすることを防げます。pull request のないまま 14 日経つとリマインドされ、21 日で解放されます。ドラフト PR も進捗として扱われます。バグ報告では、できれば `tdk doctor` の出力を添えてください。

## スペルチェック

`cargo install typos-cli --version 1.50.3` でバージョン固定のチェッカーをインストールし、リポジトリのルートで `typos` を実行してスペルをチェックします。

## ラベル

ラベルを使って、自分の興味や経験に合った作業を見つけてください。メンテナーはトリアージ時にラベルを付けます。issue フォームと PR labeler も一部のラベルを自動で付けます。最新の[ラベル一覧](https://github.com/tdk-landscape/tdk-cli-core/labels)には各ラベルの説明があります。

| ラベル | 意味 | 付けられるタイミング |
| --- | --- | --- |
| `bug` | 期待どおりに動かないもの。 | バグ報告フォームと確認済みの不具合。 |
| `enhancement` | 機能追加や改善。 | 機能リクエストフォームと採用された改善。 |
| `documentation` | 不足、誤り、またはわかりにくいドキュメント。 | ドキュメントフォームとドキュメント作業。 |
| `good first issue` | リポジトリの知識がほとんど不要な、小さく独立したタスク。 | メンテナーが最初の貢献に向いていると判断したもの。 |
| `help wanted` | コミュニティの助けが必要なタスク。first issue より大きいことが多い。 | メンテナーが引き受けてくれる人を歓迎するもの。 |
| `difficulty: easy`、`difficulty: medium`、`difficulty: hard` | 数時間、1〜2日、またはリポジトリの深い知識や設計が必要な作業。 | メンテナーが難易度を見積もったもの。コントリビューター向けラベルを補います。 |
| `question` | 説明を求めるもの。 | メンテナーが実装タスクではなく質問としてトリアージしたもの。 |
| `duplicate` | 別の issue や PR がすでに扱っている作業。 | メンテナーが元の議論へリンクします。 |
| `invalid`、`wontfix` | 無効な報告、またはプロジェクトが取り組まない作業。 | メンテナーが進めない理由を説明します。 |
| `premium` | Premium ライセンスの依頼と有料機能。 | premium issue フォームまたはメンテナーのトリアージ。 |
| `tracking` | 関連タスクをまとめる issue。 | メンテナーが複数の issue にまたがる作業をまとめるとき。 |
| `community`、`examples`、`growth` | コミュニティ活動、サンプルプロジェクト、普及のための改善。 | メンテナーが普及・導入に関するタスクを特定したもの。 |
| `dx`、`design`、`guide` | 開発者体験、見た目や UX の改善、ガイド文書。 | メンテナーが改善の種類を特定したもの。 |
| `testing`、`ci`、`packaging` | テスト、GitHub Actions、インストーラーやパッケージ。 | メンテナーが検証や配布の作業を特定したもの。 |
| `agents` | AI コーディングエージェント向けのドキュメントやファイル。 | メンテナーがエージェント向けの作業を特定したもの。 |
| `rfc` | 実装前の設計議論。 | メンテナーが提案の範囲について合意を求めるとき。 |
| `windows` | Windows と WSL2 のサポート。 | メンテナーがプラットフォーム固有の作業を特定したもの。 |
| `performance`、`benchmark` | 速度やメモリの改善、または計測ツール。 | メンテナーが最適化や計測の作業を特定したもの。 |
| `hacktoberfest` | Hacktoberfest に参加する作業。 | メンテナーがイベント対象の貢献を選んだもの。 |
| `area:*` | 影響を受ける部分。例：`area: tui`、`area: doctor`、`area: cli`。 | メンテナーが issue に付けます。PR labeler は変更されたパスから area を判定します。 |
| `tech:*` | 関連する技術。例：TypeScript、Docker、Tilt。 | メンテナーがタスクに関わるツールを特定したもの。 |
| `rank:*`、`island:*` | TDK ジャーニー上でのタスクの規模とテーマ。 | メンテナーがクエストをコントリビューターマップに配置したもの。 |
| `event:*` | GitHub Universe など、特定のイベント向けの作業。 | メンテナーがイベントごとの作業を整理したもの。 |

## コミットに署名する

すべてのコミットに [Developer Certificate of Origin](../../../DCO) の署名が必要です。`git commit -s` で追加でき、`Signed-off-by: Your Name <you@example.com>` が付きます。既存のコミットを直すには、`git rebase --signoff origin/main` を実行してブランチを force-push してください。この行がないコミットがあると、pull request のチェックが失敗します。

## 採用者リストにチームを追加する

自分のリポジトリで TDK を使っていますか？[ADOPTERS.md](../../../ADOPTERS.md) には2つの方法で掲載できます。[We use TDK](https://github.com/tdk-landscape/tdk-cli-core/issues/new?template=we-use-tdk.yml) issue フォームを開くか、pull request で表に行を追加してください。[What counts](../../../ADOPTERS.md#what-counts) では、何をリンクすべきか、何が対象外かを説明しています。

## ガバナンス

意思決定とメンテナー追加の方法は [GOVERNANCE.md](../../../GOVERNANCE.md)、マージできる人は [MAINTAINERS.md](../../../MAINTAINERS.md)、TDK を使っているチームは [ADOPTERS.md](../../../ADOPTERS.md) を参照してください。

## 思いやりを持って

参加することで、[行動規範](../../../CODE_OF_CONDUCT.md)に従うことに同意したものとみなされます。セキュリティ上の問題は公開 issue ではなく、[SECURITY.md](../../../SECURITY.md) の手順で非公開に報告してください。
