import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "チーム紹介 | YGファイヤーズ",
  description: "YGファイヤーズの活動場所・参加大会・戦歴・会費をご紹介します。",
};

const photos = [2, 3, 4, 5, 6, 7, 1];

export default function AboutPage() {
  return <main className="home-page">
    <header className="home-header">
      <Link className="home-logo" href="/home" aria-label="YG FIRES ホーム">
        <span className="home-logo-mark">Y</span><span><strong>YG FIRES</strong><small>BASEBALL CLUB</small></span>
      </Link>
      <Link className={styles.back} href="/home"><ArrowLeft size={17} aria-hidden="true" />ホームへ戻る</Link>
    </header>

    <div className={styles.content}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heading}><p className="home-eyebrow">ABOUT YG FIRES</p><h1 id="about-title">チーム紹介</h1><p>YGファイヤーズ</p></div>
        <div className={styles.heroPhoto}><Image src="/homepage/introduce/8.JPEG" alt="打席でバットを振り抜く選手と、後方で構える捕手" fill priority sizes="(max-width: 800px) 100vw, 1100px" /></div>
        <div className={styles.heroCaption}><span>城東区をメインに活動</span><span>毎週土曜日</span></div>
      </section>

      <section className={styles.section} aria-labelledby="profile-title">
        <p className="home-eyebrow">TEAM PROFILE</p><h2 id="profile-title">私たちのチーム</h2>
        <dl className={styles.profile}>
          <div><dt>チーム名称</dt><dd>YGファイヤーズ</dd></div>
          <div><dt>活動場所</dt><dd><p>城東区をメインに活動</p><ul><li>東部スポーツパーク（松戸）</li><li>都立篠崎公園</li><li>夢の島公園野球場</li><li>サンケイスポーツセンター</li><li>ほか</li></ul><p className={styles.note}>※稀に遠征もあります。過去実績では、大宮健保・板橋区等が最長になります。</p></dd></div>
          <div><dt>活動期間</dt><dd>毎週土曜日<br /><span className={styles.note}>通常1試合、稀にダブルヘッダー</span></dd></div>
          <div><dt>直近参加大会</dt><dd className={styles.leagues}><a href="http://www.gbn-sports.com/" target="_blank" rel="noreferrer">GBN全国草野球大会<ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a><a href="https://diamond-baseball.com/" target="_blank" rel="noreferrer">ダイヤモンドリーグ<ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a></dd></div>
          <div><dt>人数・メンバー募集</dt><dd><p>現状、安定して参加しているメンバーは12人程度です。</p><p>随時メンバーを募集しております。</p></dd></div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="history-title">
        <p className="home-eyebrow">TEAM HISTORY</p><h2 id="history-title">戦歴</h2>
        <div className={styles.history}>
          <div><h3>2024</h3><p>関東草野球リーグ 土曜2部 <strong>優勝</strong></p></div>
          <div><h3>2025</h3><p>ダイヤモンド 秋2部 <strong>準優勝</strong></p><p>GBN 秋2部 <strong>優勝</strong></p></div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="fees-title">
        <p className="home-eyebrow">MEMBERSHIP</p><h2 id="fees-title">会費・参加について</h2>
        <dl className={styles.profile}>
          <div><dt>年会費</dt><dd><p className={styles.fee}>基本 15,000 円</p><p className={styles.note}>常時参加しないメンバーは、時期によって要相談。</p><p className={styles.note}>※場合によっては年内に追加徴収をすることがあります。別途お声掛けします。</p></dd></div>
          <div><dt>参加費</dt><dd>グラウンド代・審判代は変動が大きいため、毎試合の参加メンバーで割ります。</dd></div>
          <div><dt>出欠・集合時間</dt><dd><p>出欠は、活動日の1週間前までにスケジュールへ入力してください。</p><p className={styles.note}>※基本、前日に集合時間を伝達します。</p></dd></div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="photos-title">
        <p className="home-eyebrow">ON THE FIELD</p><h2 id="photos-title">チームの風景</h2>
        <div className={styles.gallery}>{photos.map((number) => <a key={number} href={`/homepage/introduce/${number}.JPEG`} target="_blank" rel="noreferrer" aria-label={`チームの活動写真 ${number}を大きく見る（新しいタブで開く）`}><Image src={`/homepage/introduce/${number}.JPEG`} alt={number === 1 ? "グラウンドで腰を落とし、守備に備える選手" : `YGファイヤーズの活動写真 ${number}`} fill sizes="(max-width: 600px) 50vw, (max-width: 900px) 45vw, 360px" /></a>)}</div>
      </section>
      <div className={styles.join}><p className="home-eyebrow">JOIN YG FIRES</p><h2>メンバー募集中</h2><p>興味のある方は、InstagramのDMからご連絡ください。</p><a href="https://www.instagram.com/yg_fires?stkn=bWo3MHYzcm01MzZ3" target="_blank" rel="noreferrer">Instagramでチームを見る<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a></div>
    </div>
    <footer className="home-footer"><Link className={styles.back} href="/home"><ArrowLeft size={17} aria-hidden="true" />ホームへ戻る</Link><small>YG FIRES</small></footer>
  </main>;
}
