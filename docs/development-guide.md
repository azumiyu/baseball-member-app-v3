# 開発・保守ガイド

## 全体構成

| 場所 | 役割 |
| --- | --- |
| `app/page.tsx` / `components/team/TeamApp.tsx` | チーム画面の入口、各画面・モーダルの接続 |
| `components/team/hooks/useTeamUiState.ts` | タブ、選手選択、モーダルの開閉 |
| `components/team/hooks/useTeamData.ts` | ログイン、チームの取得・保存、定期取得、再認証 |
| `components/team/lib/team-save.ts` | 保存中に追加した編集の再適用、試合切替後のスタメンの保持 |
| `components/team/hooks/useImageExport.ts` / `components/team/lib/lineup-image.ts` | オーダー画像の生成・共有・プレビューURL管理 / PNG変換・余白描画 |
| `components/team/hooks/useAutosavedData.ts` | 道具・成績で共通の読み込み、自動保存、競合状態 |
| `components/team/hooks/useEquipmentData.ts` | 道具APIへの接続 |
| `components/team/hooks/useStatsData.ts` | 成績APIへの接続、変更した試合・削除した試合だけの送信 |
| `components/team/hooks/useScheduleData.ts` / `components/team/schedule/` | 予定・出欠の部分取得・差分保存・履歴ページング / 予定管理画面・変更案内 |
| `components/team/schedule/ScheduleGameCard.tsx` / `ScheduleGameEditor.tsx` | 試合カード / 予定編集・保存と案内文のコピー |
| `components/team/schedule/ScheduleResponseControls.tsx` / `ScheduleResponsesModal.tsx` | 出欠入力・集計 / メンバー別の出欠・コメント確認と編集 |
| `components/team/schedule/schedule-presentation.ts` / `hooks/use-unsaved-warning.ts` | 予定画面の共通型・表示項目・日付書式 / 未保存入力の離脱確認 |
| `components/team/lib/api.ts` | JSON通信、HTTPエラーの変換 |
| `components/team/lib/lineup-actions.ts` / `lib/model.ts` | オーダー・選手のデータ操作と検証 |
| `components/team/stats/StatsView.tsx` | 試合・選手の選択、入力下書き、成績登録・予定との連携 |
| `components/team/stats/StatsEntryFields.tsx` / `StatsConfirmation.tsx` | 打席・数値の入力欄 / 登録済み成績の一覧 |
| `components/team/stats/stats-actions.ts` | 成績入力の更新、選手の並べ替え、成績削除と紐付けの整理 |
| `components/team/stats/StatsValues.tsx` / `stats-summary.ts` | 確認画面の表示 / 成績集計・安打判定 |
| `components/team/common/Modal.tsx` | 共通モーダル、キーボード表示時の高さ・フォーカス調整 |
| `app/api/*/route.ts` | API入口 |
| `lib/data-route.ts` / `lib/normalized-store.ts` | 共通API処理 / 正規化DBの読み取り・差分更新 |
| `lib/schedule.ts` / `lib/schedule-order.ts` | 予定の検証、日本時間の日付・地図リンク / オーダーへの反映 |
| `lib/server.ts` / `app/api/auth/route.ts` | Cookie、認証、メンバー紐付け、パスワード処理 |
| `db/schema.ts` / `drizzle/` | Drizzleのスキーマと既存の移行SQL |
| `workers/weekly-equipment/` | 独立して動く週次LINE通知Worker |
| `workers/weekly-schedule/` | 毎週日曜0時（日本時間）に予定・出欠をオーダーへ反映するWorker |

YGミニゲームのルール、ランキング保存、ゲームを追加する際の構成とDB適用手順は [ミニゲームの開発・運用ガイド](mini-games.md) を参照してください。

剛速球の球速はサーバーで計算しますが、入力時刻はクライアント計測のため、実際の人間の操作であることまで完全には検証できません。

`components/ui/`、`vendor/`、`build/sites-vite-plugin.ts` は提供元の共通部品です。通常の機能改修は各機能のコンポーネントで行います。設定やビルドから参照されるスキーマ、認証補助、スクリプトは、画面から直接呼ばれていなくても削除しません。

## 保存と通信

- 待ち時間は `components/team/lib/sync-config.ts`。自動保存650ms、チームの条件付き取得60秒を維持しています。
- 道具・成績のデータソースは各フックのモジュール直下に定義します。レンダー中に作り直すと、共通フックの読み込みが再実行されます。
- 共通フックは編集時に複製したデータを渡します。保存中の追加入力は次の保存対象に残し、409の競合は明示的な読み直しまで保持します。
- チーム保存中の追加入力は `mergeSavedTeamData` でサーバーの保存結果に重ねます。週次更新で別の試合が選ばれた場合は、名簿・チーム設定・名前候補だけを再適用し、前の試合の配置は引き継ぎません。
- オーダー画像のPNG変換と余白描画は `lineup-image.ts` にまとめています。プレビューの差し替え・閉じる操作・画面破棄でURLを解放し、ログアウト後に生成結果が届いても表示しません。
- 成績は試合単位の差分送信です。全件PUTへ置き換えないでください。登録済み予定のIDは `stats_games.schedule_id` に保存し、成績の既存キー `game_date` / `game_number` は変更しません。予定情報は同じ成績GETに含め、試合切り替えの追加取得を避けます。公開前の `0011_stats_schedules.sql` 適用、既存成績の連携条件と確認項目は [成績と予定の連携](stats-schedules.md) を参照してください。
- 認証・データ保存は既存のCookieとD1を使います。チーム・後藤ページ・パチンコで新たなlocalStorage/sessionStorage保存は行っていません。
- `TabNav.tsx` のモジュール変数は、画面切り替えによる再マウント後にもタブの横スクロール位置を戻すために残しています。
- スケジュール画面はログイン後に常時マウントし、他のタブでは非表示にします。未回答案内の取得と、タブ移動後の保存完了のためです。予定のrevisionが更新された場合だけ、未保存の入力がない状態で再取得します。
- 道具のLINE通知設定は `equipment_items.notify_line` に保存します。既存の取得・差分保存の列に含め、設定のためのSQLは追加しません。移行は [道具のLINE通知設定の適用手順](equipment-line-notifications.md) を参照してください。
- 予定と出欠は `schedule_games` / `schedule_responses` に保存します。予定からオーダーへの反映は `projectScheduleOrder` にまとめ、予定・チームの両revisionを照合して同じbatchで保存します。週次Workerの入口は `syncScheduledOrder`、チーム情報取得時と共通の更新処理は `synchronizeTeamSnapshot` です。移行と動作は [スケジュール・出欠管理](schedule-management.md) を参照してください。
- 予定APIの初回取得は今日以降に限定します。過去は日付・IDのカーソルで20件ずつ取得し、単一試合の取得にも対応します。PUTは `partial: true`、変更した `data.games` と削除した `removedGames` だけを送ります。未取得の予定を削除扱いにしないでください。
- 予定の `details_revision` は開始時刻・終了時刻・場所が変わったときだけ増やします。変更者の回答は同時に確認済みにし、他の回答済みメンバーには直前の変更前後と再確認を案内します。「変更なし」は出欠・コメントを保ち、`confirmed_revision` だけを更新します。大会名・日付・相手・確定状況の変更では再確認を求めません。
- 終了時刻には `0012_schedule_end_time.sql` が必要です。`lib/schedule-format.ts` で2時間後の提案・LINE向け文章を生成します。コピーは操作直後に開始し、`useScheduleData.saveNow` で差分だけを即時保存します。コピー結果と保存結果を混同しないでください。
- 審判手配状況は `0013_schedule_umpire.sql` の `schedule_games.umpire_arranged` に保存します。予定の差分に含め、編集権限は `can_edit_lineup` で確認します。審判フラグの変更では `details_revision` を増やしません。審判依頼文は `lib/schedule-format.ts` の `umpireRequestText` で生成し、コピーボタンは保存・送信を行いません。
- 試合別のスタメンは `schedule_lineups` / `schedule_lineup_slots` に保存します。対象はオーダー形式・打順・守備位置・選手・DH投手で、名簿やベンチ一覧は複製しません。選択試合の切り替え時に復元し、過去分は直近5試合・登録成績の確認対象5件・現在の選択試合だけを保持します。それ以外は週次更新や関連する保存処理で削除します。
- 大会名・相手・場所の候補は `name_options` に保存し、場所は `kind = 'location'` です。候補検索は取得済みデータで行い、Google / Appleマップの検索はユーザーがリンクを開いた場合だけ実行します。
- オーダーの試合情報はスケジュールの選択から反映します。チーム名・監督名は管理者のチーム設定で変更し、APIも `is_admin` を検証します。公開前に `0009_schedule_lineups.sql` まで適用し、アプリと週次スケジュールWorkerを更新してください。

## パチンコ

入口は `app/pachi/page.tsx`、YGチームメニューから遷移します。

| 調整したい内容 | 変更場所 |
| --- | --- |
| 確率、期待度、演出時間、図柄・保留・ラウンド数 | `components/pachi/pachinko-game.ts` |
| 玉の入賞、保留消化、停止順、PUSH、復活・大当たり進行 | `components/pachi/pachinko-controller.ts` |
| Reactの状態との接続・破棄 | `components/pachi/usePachinkoGame.ts` |
| 画面枠、操作ボタン、音を鳴らすタイミング | `components/pachi/PachinkoPage.tsx` |
| 盤面、玉の軌道、釘、液晶の配置 | `components/pachi/PachinkoBoard.tsx` |
| 図柄変動の表示 | `components/pachi/SymbolDisplay.tsx` と同名CSS Module |
| 投球・スイング、777のポーズ、BONUS演出 | `components/pachi/BaseballShow.tsx` と同名CSS Module |
| 音色、音量、777の読み上げ | `components/pachi/usePachinkoAudio.ts` |
| 画像の同時読み込み数・タイムアウト | `components/pachi/usePachinkoAssets.ts` |

図柄は `public/pachi/1.png`〜`9.png` を使用します。`SYMBOL_IDS` と画像パスは `pachinko-game.ts` に集約しています。図柄番号は1から連続する前提です。増減時は実際の画像も揃え、隣の図柄への移動や「7」の特別演出も確認してください。

`JACKPOT_RATE` は通常保留の確率で、`HEAT_SETTINGS` の倍率を掛けます。`REACH_RATE` は外れ抽選のリーチ確率です。`SUPER_REACH_RATE` はリーチからの発展確率で期待度の加算があります。`REVIVAL_RATE` は当たりを一度外れに見せる演出の割合で、追加の当たり抽選ではありません。PUSHを押す時刻で結果は変わらず、8秒後には同じ結果を自動表示します。

コントローラーがタイマーを所有し、非表示時の残り時間の保存・再開と、離脱時の破棄を担当します。単純な `await delay()` への置き換えで、この停止・破棄処理を失わないようにしてください。音は初期OFF、ブラウザーの音声APIで生成し、外部音声ファイルは使いません。ゲーム状態はメモリー内のみです。

## 後藤ページ・動きを減らす設定

`components/goto/goto-quotes.ts` が言葉と写真のデータ、`useWisdomScene.ts` が順序と時間です。間隔は同ファイルの `SCENE_TIMINGS` にまとめています。写真は `public/goto/` を参照します。

OSの「視差効果を減らす」設定は `hooks/use-reduced-motion.ts` で共通購読し、解除も同じフックが行います。名言の途中で設定が変わっても、表示済みの言葉を最初から再生しません。

## CSS

`app/globals.css` は読み込み順を管理します。`app/styles/` を順番に読み込む構成で、既存ルールとメディアクエリの順序を保っています。

- `base.css`: 色、フォント、共通要素
- `team-layout.css`: チーム画面、オーダー、登録情報、レスポンシブ配置
- `team-dialogs.css`: 共通モーダル、メニュー
- `stats.css`: 成績入力・確認
- `team-dialogs-mobile.css`: 既存の位置を保つため独立させたモバイル用上書き
- `equipment.css`: 道具管理
- `feedback.css`: 読み込み表示、登録メッセージ

後藤・パチンコ・後藤の移動確認はCSS Modulesです。動的な座標・進捗・アニメーション用CSS変数はinline styleを維持しています。画像、音、アニメーションのデザインは今回の整理では変更していません。

共通の `Modal` は、スマホでは開いた時の位置と画面高の88%を維持します。フォーカス時の強制スクロールと `visualViewport.scroll` への位置追従は行いません。説明文も本文と一緒に手動でスクロールできます。キーボード用に追加した末尾余白はモーダルを閉じる・端末を回転するまで保持し、キーボードの確定時にスクロール位置が跳ねるのを防ぎます。短い画面用のヘッダーも保存した高さで判定し、キーボードの開閉だけでは切り替えません。端末回転時は基準を取り直し、ピンチズーム中は自動調整を止めます。パスワード・監督名・未定コメント・選手・道具・検索などに共通で適用します。

実機確認では、iPhone/Androidで入力欄を順に移動してもモーダルが縮まず、下の保存ボタンまでスクロールできること、キーボードを閉じたり回転しても入力が残ることを確認してください。長い通知、横向き、小さい画面、検索候補の選択も対象です。

## 残した既存実装と確認事項

週次LINE Workerは、アプリと同じD1の `equipment_items` と `players` を1回のSELECTで結合して読みます。`notify_line = 1` かつ担当者のある道具を登録順に通知し、名簿から外れた選手や参照先のない担当者は従来どおり「不明な選手」と表示します。通知対象が0件ならLINEへ送信しません。旧JSONテーブルは参照しません。通知文面・送信先・毎週金曜の実行設定は従来どおりです。反映には `0005` の後に `0006_equipment_line_notifications.sql` を適用してから、アプリと週次Workerを再デプロイします。詳しくは [適用手順](equipment-line-notifications.md) を参照してください。

成績の得点圏集計は、現行の「未入力を除外した打席の添字」で判定する計算を維持しています。途中の未入力打席をどう扱うかの仕様変更は、集計整理と分けて確認してください。

見た目と実機での確認では、タブの位置、道具・成績の保存中の追加入力と競合、名言の途中スキップ、パチンコの保留・PUSH・777・非表示からの復帰を確認します。`scripts/verify-app.mjs` はDB書き込みを伴うため、本番や既存データのある環境で不用意に実行しないでください。

## 前回のリファクタリング時の確認結果

- TypeScript: `tsc --noEmit --incremental false` 成功。
- パチンコ: 仮想タイマーと同じ乱数で変更前後100ケースを比較し、時刻を含む状態遷移が一致。通常・動きを減らす設定、手動PUSH・自動決着、777、復活、保留の消化、非表示からの復帰、タイマー・リスナーの破棄を含みます。
- CSS: 未使用の13クラスに関係する41セレクターを除外後、残るルールの順序が分割前と一致。13 CSSファイルの構文と27画像パスを確認。
- ESLint: 今回変更したソースの指摘は解消。全体では既存のモーダル3件（`EquipmentEditorModal`・`NamePickerModal`・`ReauthModal` の状態リセットEffect）と、`MatchInfoPanel` のARIA警告2件が残っています。モーダルの開閉・再認証の動作を伴うため、その構造は今回維持しました。
- ブラウザーでの描画・操作、ビルド、DB接続、LINE実送信は実施していません。

`.wrangler/` や `dist/` は生成物としてLint対象から除外しています。既にGitで追跡されている生成物は、監視プロセスによってソース変更時に差分が生じるため、ソースの差分と区別して確認してください。

## 自動チェック

Node.js 22.13以降で次を実行します。

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

画像の共有・保存は実機ブラウザーで確認してください。
